#!/usr/bin/env bun
import { type DbHandle, openDatabase } from "../lib/db";
import { existsSync } from "node:fs";
import { DEFAULT_SQLITE_DB_PATH } from "../constants";

export async function addIndexes(): Promise<void> {
	if (!existsSync(DEFAULT_SQLITE_DB_PATH)) {
		console.error(
			`Error: database file '${DEFAULT_SQLITE_DB_PATH}' does not exist.`,
		);
		process.exit(1);
	}

	const start = Date.now();
	let handle: DbHandle;
	let c = 2;
	while (true) {
		try {
			handle = openDatabase(DEFAULT_SQLITE_DB_PATH, {
				pragmasProfile: "indexbuild",
			});
			break;
		} catch (e: any) {
			console.log("error opening db:", e.message);
			console.log("retrying...");
			await new Promise((r) => setTimeout(r, c * 1_000)); // sleep
			if (c++ > 10) {
				console.log("giving up");
				process.exit(1);
			}
		}
	}
	handle.beginImmediate();
	console.log("adding index...");
	handle.ensureCompositeIndex();
	handle.commit();
	handle.close();
	const elapsed = ((Date.now() - start) / 1000).toFixed(3);
	console.log(
		`Composite index 'idx_utxos_scripthash_outpoint' created on '${DEFAULT_SQLITE_DB_PATH}' in ${elapsed}s.`,
	);
}

if (import.meta.main) {
	addIndexes().catch((e) => {
		console.error("Error:", (e as Error).message);
		process.exit(1);
	});
}
