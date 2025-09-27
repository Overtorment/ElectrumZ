const url = require("url");
const fs = require("fs");

import { openDatabase, UtxoRow } from "./lib/db";
import { computeOutpoint, computeScripthash } from "./lib/scripthash";

if (!process.env.BITCOIN_RPC) {
  console.error("not all env variables set");
  process.exit();
}

let jayson = require("jayson/promise");
let rpc = url.parse(process.env.BITCOIN_RPC);
let client = jayson.client.http(rpc);
const dbPath = process.env.UTXOS_DB_PATH ?? "./utxos_v2.sqlite";
const dbHandle = openDatabase(dbPath, { pragmasProfile: "bulkload" });

const LAST_PROCESSED_BLOCK = "LAST_PROCESSED_BLOCK";
let lastProcessedBlock = 0;
try {
  lastProcessedBlock = parseInt(fs.readFileSync("LAST_PROCESSED_BLOCK").toString("ascii"));
} catch  {}

if (!(lastProcessedBlock > 0)) {
  console.log("No last processed block found, getting from database");
  const getMaxHeight = dbHandle.db.prepare("select MAX(height) as maxHeight from utxos;");
  const row = getMaxHeight.get() as { maxHeight: number } | null;
  lastProcessedBlock = row?.maxHeight ?? 0;
  fs.writeFileSync(LAST_PROCESSED_BLOCK, lastProcessedBlock.toString());
}

console.log("Last processed block:", lastProcessedBlock);


while (1) {
  let nextBlockToProcess: number = lastProcessedBlock + 1;
  const start = +new Date();
  try {
    await processBlock(nextBlockToProcess);
  } catch (error) {
    console.warn("exception when processing block:", error, "continuing as usuall");
    if (error.message.includes("socket hang up")) {
      // issue fetching block from bitcoind
      console.warn("retrying block number", nextBlockToProcess);
      continue; // skip overwriting `LAST_PROCESSED_BLOCK` in `KeyValue` table
    }
  }

  const end = +new Date();
  console.log("took", (end - start) / 1000, "sec");
  lastProcessedBlock = nextBlockToProcess;
  fs.writeFileSync(LAST_PROCESSED_BLOCK, lastProcessedBlock.toString());
  process.exit(0);
}



async function processBlock(blockNum) {
  console.log("processing new block", +blockNum);
  
  dbHandle.beginImmediate();
  const insertStmt = dbHandle.prepareInsert();
  const insertMany = (rows: UtxoRow[]) => {
    dbHandle.insertMany(rows, insertStmt);
  };
  const writeBatch: UtxoRow[] = [];


  const responseGetblockhash = await client.request("getblockhash", [blockNum]);
  // "If verbosity is 2, returns an Object with information about block <hash> and information about each transaction.
  // If verbosity is 3, returns an Object with information about block <hash> and information about each transaction, including
  // prevout information for inputs (only for unpruned blocks in the current best chain)"
  const responseGetblock = await client.request("getblock", [responseGetblockhash.result, 3]);
  
  let k = 0;
  for (const tx of responseGetblock.result.tx) {

    // finding what utxos are spent and need deletion:
    for (const vin of tx.vin) {
      if (vin.coinbase) {
        // no utxos spent here, only created
        continue;
      }

      const outpointBuf = computeOutpoint(vin.txid, vin.vout);

      if (vin?.prevout?.scriptPubKey?.hex) {
        // ok we have script so the query will use index
        const scripthash = computeScripthash(Buffer.from(vin.prevout.scriptPubKey.hex, "hex"));
        dbHandle.db.prepare("DELETE FROM utxos WHERE outpoint = ? AND scripthash = ?").run(outpointBuf, scripthash);
        const result = dbHandle.db.prepare("DELETE FROM utxos WHERE outpoint = ? AND scripthash = ?").run(outpointBuf, scripthash);
        // if (result) {
        //   console.log('spent utxo', result);
        // }
      } else {
        const result = dbHandle.db.prepare("DELETE FROM utxos WHERE outpoint = ?").run(outpointBuf);
        // if (result) {
        //   console.log(`SELECT * FROM utxos WHERE outpoint = x'${outpointBuf.toString("hex")}'`)
        //   console.log('spent utxo', result);
        // }
      }
    }
  
    // finding what utxos are new and need insertion:
    for (const vout of tx.vout) {
      if (vout.scriptPubKey) {
        const scripthash = computeScripthash(Buffer.from(vout.scriptPubKey.hex, "hex"));
        const amount = vout.value * 100_000_000;
        const outpointBuf = computeOutpoint(tx.txid, vout.n);
        writeBatch.push([outpointBuf, amount, blockNum, scripthash]);
      }
    }
    
    // if (k++ === 1000) { console.log('tx', JSON.stringify(tx, null, 2)); process.exit(0); }
  }

  console.log('inserting', writeBatch.length, 'utxos');
  writeBatch.length > 0 && insertMany(writeBatch);
  console.log('commiting to database...');
  dbHandle.commit();
}