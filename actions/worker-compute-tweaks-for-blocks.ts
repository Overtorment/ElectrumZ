#!/usr/bin/env bun
const url = require("node:url");
const fs = require("node:fs");
import { openDatabase, DbHandle } from "../lib/db";
import {
	DEFAULT_SQLITE_DB_PATH,
	LAST_PROCESSED_TWEAKS_BLOCK_FILE,
} from "../constants";
import { requestWithTimeout } from "../lib/rpc-timeout";
import { Cache } from "../lib/cache";
import * as bitcoin from "bitcoinjs-lib";
import { SilentPayment } from "silent-payments";
import { Client } from "jayson";
const jayson = require("jayson/promise");

const byteToHexLookupTable = Array.from({ length: 256 }, (_, index) =>
	index.toString(16).padStart(2, "0"),
);

const txCache = new Cache<string, string>(33_000);

export async function workerComputeTweaksForBlocks(): Promise<void> {
	if (!process.env.BITCOIN_RPC) {
		console.log("not all env variables set");
		process.exit();
	}

	const rpc = url.parse(process.env.BITCOIN_RPC);
	const rpcClient = jayson.client.http(rpc);

	console.log("Opening database...");
	const dbHandle = openDatabase(DEFAULT_SQLITE_DB_PATH, {
		pragmasProfile: "blockchain",
	});

	let lastProcessedBlock = 0;
	try {
		lastProcessedBlock = parseInt(
			fs.readFileSync(LAST_PROCESSED_TWEAKS_BLOCK_FILE).toString("ascii"),
			10,
		);
	} catch {}

	if (!(lastProcessedBlock > 0)) {
		lastProcessedBlock = 900_000;
		console.log(
			`No last processed tweaks block found, starting from ${lastProcessedBlock}`,
		);
		fs.writeFileSync(
			LAST_PROCESSED_TWEAKS_BLOCK_FILE,
			lastProcessedBlock.toString(),
		);
	}

	console.log("Last processed tweaks block:", lastProcessedBlock);

	while (true) {
		let nextBlockToProcess: number = lastProcessedBlock + 1;
		const start = Date.now();
		try {
			await processRecord(dbHandle, rpcClient, nextBlockToProcess);
		} catch (error) {
			console.warn(
				"exception when processing tweaks for block: " +
					error.message +
					"; continuing as usual",
			);
			await new Promise((r) => setTimeout(r, 15_000)); // sleep
			if (error.message.includes("socket hang up")) {
				// issue fetching block from bitcoind
				console.warn("retrying block number", nextBlockToProcess);
			}
			nextBlockToProcess--;
			continue; // skip overwriting LAST_PROCESSED_TWEAKS_BLOCK_FILE
		}

		const end = Date.now();
		console.log("tweaks took", (end - start) / 1000, "sec");
		console.log("================================");

		lastProcessedBlock = nextBlockToProcess;
		fs.writeFileSync(
			LAST_PROCESSED_TWEAKS_BLOCK_FILE,
			lastProcessedBlock.toString(),
		);
	}
}

async function processRecord(
	dbHandle: DbHandle,
	rpcClient: Client,
	height: number,
) {
	console.log("building tweaks for block", height);
	const startTime = Date.now();
	dbHandle.beginImmediate();
	const insertTweakStmt = dbHandle.db.prepare(
		"INSERT OR REPLACE INTO tweaks (txid, tweak) VALUES (?, ?)",
	);

	try {
		const responseGetblockhash = await requestWithTimeout(
			rpcClient,
			"getblockhash",
			[height],
		);

		const responseGetblock = await requestWithTimeout(rpcClient, "getblock", [
			responseGetblockhash.result,
			0,
		]);

		const block = bitcoin.Block.fromHex(responseGetblock.result);
		block.transactions?.forEach((txFromBlock) => {
			txCache.set(txFromBlock.getId(), txFromBlock.toHex()); // txid -> txhex
		});

		const selectStmt = dbHandle.db.prepare(
			`SELECT outpoint FROM utxos WHERE height = ${height}`,
		);

		let debugOnlyOnce = true;
		for (const record of selectStmt.iterate() as IterableIterator<{
			outpoint: Uint8Array;
		}>) {
			let txid = uint8ArrayToHex(record.outpoint.subarray(0, 32));
			if (debugOnlyOnce) {
				// txid = '511e007f9c96b6d713a72b730506198f61dd96046edee72f0dc636bfe1f3a9cf'; // DEBUG FIXME!!!!!!!!!!!!!!!!!!!!!!
				// txid = '511e007f9c96b6d713a72b730506198f61dd96046edee72f0dc636bfe1f3a9cf'; // DEBUG FIXME!!!!!!!!!!!!!!!!!!!!!!  height 894578
				// debugOnlyOnce = false;
			}
			const txhex = txCache.get(txid);
			if (txhex) {
				let needPrevouts = false;
				let tweak;
				try {
					tweak = SilentPayment.computeTweakForTx(
						bitcoin.Transaction.fromHex(txhex),
					);
				} catch (error) {
					if (
						error.message.startsWith("No pubkeys found in transaction inputs")
					) {
						needPrevouts = true;
					}
				}

				if (needPrevouts) {
					continue; // FIXME!!!!!!!!!!!!!!!!!!!!!!
					const cleanTx = bitcoin.Transaction.fromHex(txhex);

					for (const input of cleanTx.ins) {
						const prevoutTxid = uint8ArrayToHex(
							new Uint8Array(input.hash).reverse(),
						);
						const prevoutVout = input.index;
						// console.log('need output of tx', prevoutTxid, prevoutVout, '...');
						const responseGetrawtransaction = await requestWithTimeout(
							rpcClient,
							"getrawtransaction",
							[prevoutTxid, false],
						);

						const txPrevout = bitcoin.Transaction.fromHex(
							responseGetrawtransaction.result,
						);

						// console.log('responseGetrawtransaction.result=', responseGetrawtransaction.result);
						// console.log('index=', index);
						// console.log('prevoutVout=', prevoutVout);

						// cleanTx.ins[index].script = txPrevout.outs[prevoutVout].script;
						input.script = txPrevout.outs[prevoutVout].script;
					}

					try {
						tweak = SilentPayment.computeTweakForTx(cleanTx);
						// console.log('tweak =', uint8ArrayToHex(tweak));
						// process.exit(0);
					} catch (error) {
						console.log("error computing tweak for tx", error.message);
					}
				}

				if (tweak) {
					insertTweakStmt.run(Buffer.from(txid, "hex"), Buffer.from(tweak));
				}
				// console.log(txid, 'tweak =', tweak ? uint8ArrayToHex(tweak) : '-');
			} else {
				console.log("tx not found in cache");
			}
		}

		console.log("commiting to database...");
		dbHandle.commit();

		// Checkpoint WAL after commit to prevent unbounded WAL growth
		dbHandle.checkpoint("TRUNCATE");
	} catch (error) {
		console.error("Error processing block:", error.message);
		try {
			console.log("rolling back");
			dbHandle.rollback();
		} catch (rollbackError) {
			console.error("Error during rollback:", rollbackError);
		}
		throw error; // Re-throw to be handled by caller
	}
}

if (import.meta.main) {
	workerComputeTweaksForBlocks()
		.catch((e) => {
			console.error("Error:", (e as Error).message);
			process.exit(1);
		})
		.then(() => {
			process.exit(0);
		});
}

export function uint8ArrayToHex(array: Uint8Array) {
	// Concatenating a string is faster than using an array.
	let hexString = "";

	// eslint-disable-next-line unicorn/no-for-loop -- Max performance is critical.
	for (let index = 0; index < array.length; index++) {
		hexString += byteToHexLookupTable[array[index]];
	}

	return hexString;
}
