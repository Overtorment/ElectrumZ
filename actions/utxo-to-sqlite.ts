#!/usr/bin/env bun
import { openDatabase, type UtxoRow } from "../lib/db";
import { existsSync, writeFileSync } from "fs";
import { computeOutpointBuf, computeScripthash } from "../lib/scripthash";
import { StreamingBinaryReader } from "../lib/StreamingBinaryReader";
import { DEFAULT_SQLITE_DB_PATH, DEFAULT_UTXO_DUMP_FILE, LAST_PROCESSED_BLOCK_FILE } from "../constants";

const UTXO_DUMP_MAGIC = Buffer.from([0x75, 0x74, 0x78, 0x6f, 0xff]); // 'utxo\xff'
const UTXO_DUMP_VERSION = 2;
const NET_MAGIC_BYTES: Record<string, string> = {
  "f9beb4d9": "Mainnet",
  "0a03cf40": "Signet",
  "0b110907": "Testnet3",
  "1c163f28": "Testnet4",
  "fabfb5da": "Regtest",
};


function readVarInt(reader: StreamingBinaryReader): number {
  let n = 0;
  while (true) {
    const dat = reader.readUInt8();        // 0..255
    n = n * 128 + (dat & 0x7f);                  // avoid n << 7
    if ((dat & 0x80) !== 0) n += 1; else return n;
  }
}

function readCompactSize(reader: StreamingBinaryReader): number {
  let n = reader.readUInt8();
  if (n === 253) {
    n = reader.readUInt16LE();
  } else if (n === 254) {
    n = reader.readUInt32LE();
  } else if (n === 255) {
    n = Number(reader.readBigUInt64LE());
  }
  return n;
}

function decompressAmount(x: number): number {
  if (x === 0) return 0;
  x -= 1;
  const e = x % 10;
  x = Math.floor(x / 10);
  let n = 0;
  if (e < 9) {
    const d = (x % 9) + 1;
    x = Math.floor(x / 9);
    n = x * 10 + d;
  } else {
    n = x + 1;
  }
  for (let i = 0; i < e; i++) n *= 10;
  return n;
}

function modPow(base: bigint, exponent: bigint, modulus: bigint): bigint {
  if (modulus === 1n) return 0n;
  let result = 1n;
  base = base % modulus;
  while (exponent > 0n) {
    if (exponent % 2n === 1n) result = (result * base) % modulus;
    exponent >>= 1n;
    base = (base * base) % modulus;
  }
  return result;
}

function decompressPubkey(compressedPubkey: Buffer): Buffer {
  const P = 2n ** 256n - 2n ** 32n - 977n;
  if (compressedPubkey.length !== 33 || (compressedPubkey[0] !== 2 && compressedPubkey[0] !== 3)) {
    throw new Error(`Invalid compressed pubkey: ${compressedPubkey.toString("hex")}`);
  }
  const x = BigInt("0x" + compressedPubkey.subarray(1).toString("hex"));
  const rhs = (x ** 3n + 7n) % P;
  let y = modPow(rhs, (P + 1n) / 4n, P);
  if (modPow(y, 2n, P) !== rhs) throw new Error(`Pubkey is not on curve (${compressedPubkey.toString("hex")})`);
  const tagIsOdd = compressedPubkey[0] === 3;
  const yIsOdd = (y & 1n) === 1n;
  if (tagIsOdd !== yIsOdd) y = P - y;
  const xBytes = Buffer.from(x.toString(16).padStart(64, "0"), "hex");
  const yBytes = Buffer.from(y.toString(16).padStart(64, "0"), "hex");
  return Buffer.concat([Buffer.from([4]), xBytes, yBytes]);
}

function decompressScript(reader: StreamingBinaryReader): Buffer {
  const size = readVarInt(reader);
  if (size === 0) {
    return Buffer.concat([Buffer.from([0x76, 0xa9, 20]), reader.read(20), Buffer.from([0x88, 0xac])]);
  } else if (size === 1) {
    return Buffer.concat([Buffer.from([0xa9, 20]), reader.read(20), Buffer.from([0x87])]);
  } else if (size === 2 || size === 3) {
    return Buffer.concat([Buffer.from([33, size]), reader.read(32), Buffer.from([0xac])]);
  } else if (size === 4 || size === 5) {
    const compressed = Buffer.concat([Buffer.from([size - 2]), reader.read(32)]);
    return Buffer.concat([Buffer.from([65]), decompressPubkey(compressed), Buffer.from([0xac])]);
  } else {
    const scriptSize = size - 6;
    if (scriptSize > 10000) throw new Error(`too long script with size ${scriptSize}`);
    return reader.read(scriptSize);
  }
}

export async function utxoToSqlite(): Promise<void> {
  if (!existsSync(DEFAULT_UTXO_DUMP_FILE)) {
    console.error(`Error: UTXO dump file '${DEFAULT_UTXO_DUMP_FILE}' doesn't exist.`);
    process.exit(1);
  }

  const handle = openDatabase(DEFAULT_SQLITE_DB_PATH, { createSchema: true, pragmasProfile: "bulkload" });
  handle.beginImmediate();

  const reader = new StreamingBinaryReader(DEFAULT_UTXO_DUMP_FILE, { bufferSize: 32 * 1024 * 1024 });

  const magicBytes = reader.read(5);
  const version = reader.readUInt16LE();
  const networkMagic = reader.read(4);
  const blockHash = reader.read(32);
  const numUtxos = Number(reader.readBigUInt64LE());

  if (!magicBytes.equals(UTXO_DUMP_MAGIC)) {
    console.error(`Error: provided input file '${DEFAULT_UTXO_DUMP_FILE}' is not an UTXO dump.`);
    process.exit(1);
  }
  if (version !== UTXO_DUMP_VERSION) {
    console.error(
      `Error: provided input file '${DEFAULT_UTXO_DUMP_FILE}' has unknown UTXO dump version ${version} (only version ${UTXO_DUMP_VERSION} supported)`
    );
    process.exit(1);
  }

  console.log('parsing UTXO dump into SQLite database...');
  const networkString = NET_MAGIC_BYTES[networkMagic.toString("hex")] ?? `unknown network (${networkMagic.toString("hex")})`;
  console.log(
    `UTXO Snapshot for ${networkString} at block hash ${Buffer.from(blockHash).reverse().toString("hex")}, contains ${numUtxos} utxos`
  );
  console.log('dust limit:', process.env.DUST_LIMIT ?? 1);

  const startTime = Date.now();
  const writeBatch: UtxoRow[] = [];
  let coinsPerHashLeft = 0;
  let prevoutHashBuf: Buffer = Buffer.alloc(0);
  let maxHeight = 0;

  const insertStmt = handle.prepareInsert();
  const insertMany = (rows: UtxoRow[]) => {
    handle.insertMany(rows, insertStmt);
  };

  for (let coinIdx = 1; coinIdx <= numUtxos; coinIdx++) {
    if (coinsPerHashLeft === 0) {
      const hashBuf = reader.read(32);
      prevoutHashBuf = Buffer.from(hashBuf).reverse();
      coinsPerHashLeft = readCompactSize(reader);
    }
    const prevoutIndex = readCompactSize(reader);

    const code = readVarInt(reader);
    const height = code >> 1;
    const amount = decompressAmount(readVarInt(reader));
    const script = decompressScript(reader);
    const scripthash = computeScripthash(script);

    const indexBuf = Buffer.allocUnsafe(4);
    indexBuf.writeUInt32LE(prevoutIndex, 0);
    const outpointBuf = Buffer.concat([prevoutHashBuf, indexBuf]);
    (amount >= +(process.env.DUST_LIMIT ?? 1)) && writeBatch.push([outpointBuf, amount, height, scripthash]);
    if (height > maxHeight) maxHeight = height;
    coinsPerHashLeft -= 1;

    if (process.env.VERBOSE) {
      console.log(`UTXO ${coinIdx}/${numUtxos}:`);
      console.log(`    prevout = ${prevoutHashBuf.toString("hex")}:${prevoutIndex}`);
      console.log(`    amount = ${amount}, height = ${height}`);
      console.log(`    script = ${script.toString("hex")}\n`);
      console.log(`    scripthash = ${scripthash.toString("hex")}\n`);
    }

    if (coinIdx % (64 * 1024) === 0 || coinIdx === numUtxos) {
      insertMany(writeBatch);
      writeBatch.length = 0;
    }

    if (coinIdx % (10 *1024 * 1024) === 0) {
      const elapsed = (Date.now() - startTime) / 1000;
      const progress = coinIdx / numUtxos;
      const etaMinutes = progress > 0 ? (elapsed * (1 - progress) / progress) / 60 : 0;
      console.log(
        `${coinIdx} UTXOs converted [${(progress * 100).toFixed(2)}%], ${elapsed.toFixed(3)}s passed since start, ETA ${etaMinutes.toFixed(2)} min`
      );
    }
  }
  handle.commit();
  handle.close();
  reader.close();
  console.log(`TOTAL: ${numUtxos} UTXOs written to ${DEFAULT_SQLITE_DB_PATH}, snapshot height is ${maxHeight}.`);
  writeFileSync(LAST_PROCESSED_BLOCK_FILE, maxHeight.toString());

  if (!(reader.isAtEnd())) {
    console.log(`WARNING: input file ${DEFAULT_UTXO_DUMP_FILE} has not reached EOF yet!`);
    process.exit(1);
  }

  if (writeBatch.length !== 0) {
    console.log("WARNING: writeBatch is not empty");
    process.exit(1);
  }
}

if (import.meta.main) {
  utxoToSqlite().catch((e) => {
    console.error("Error:", (e as Error).message);
    process.exit(1);
  });
}


