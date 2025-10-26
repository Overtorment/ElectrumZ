import { type DbHandle, openDatabase } from "./lib/db";
import { DEFAULT_SQLITE_DB_PATH, DEFAULT_UTXO_DUMP_FILE } from "./constants";
import * as fs from "node:fs";
import { addIndexes } from "./actions/add-index";
import { serve } from "./actions/serve";
import { workerBlockprocessor } from "./actions/worker-blockprocessor";
import { utxoToSqlite } from "./actions/utxo-to-sqlite";
import { dumpUtxo } from "./actions/dump-utxo";

enum EAppState {
	CLEAN_SLATE,
	GOT_UTXO_DUMP,
	CONVERTED_DUMP_TO_SQLITE,
	ADDED_INDEX,
	STARTED_SERVING,
}

let appState: EAppState = EAppState.CLEAN_SLATE;

// checking if we have SQLITE database and data in it:
let dbHandleReadonly: DbHandle;
try {
	dbHandleReadonly = openDatabase(DEFAULT_SQLITE_DB_PATH, {
		createSchema: false,
		pragmasProfile: "readonly",
	});
	const getOneRow = dbHandleReadonly.db.prepare("select * from utxos LIMIT 1;");
	const rows = getOneRow.all() as any;
	if (rows && rows.length > 0) {
		// got database and data
		console.log("got database and data");
		appState = EAppState.CONVERTED_DUMP_TO_SQLITE;
	} else {
		// maybe theres a database, but its empty
		console.log("empty sqlite database");
		appState = EAppState.CLEAN_SLATE;
	}
} catch {
	// failure. no sqlite database, its a fresh install
	console.log("no sqlite database");
	appState = EAppState.CLEAN_SLATE;
} finally {
	dbHandleReadonly.close();
}

if (
	appState === EAppState.CLEAN_SLATE &&
	!fs.existsSync(DEFAULT_UTXO_DUMP_FILE)
) {
	await dumpUtxo();
	appState = EAppState.GOT_UTXO_DUMP;
}

if (
	appState === EAppState.CLEAN_SLATE &&
	fs.existsSync(DEFAULT_UTXO_DUMP_FILE)
) {
	appState = EAppState.GOT_UTXO_DUMP;
}

if (appState === EAppState.GOT_UTXO_DUMP) {
	// parse dump into sqlite
	await utxoToSqlite();
	appState = EAppState.CONVERTED_DUMP_TO_SQLITE;
}

if (appState === EAppState.CONVERTED_DUMP_TO_SQLITE) {
	// add indexes, start serving, launch block processing worker
	await addIndexes();
	appState = EAppState.ADDED_INDEX;
	if (fs.existsSync(DEFAULT_UTXO_DUMP_FILE)) {
		fs.unlinkSync(DEFAULT_UTXO_DUMP_FILE);
		console.log(`Deleted ${DEFAULT_UTXO_DUMP_FILE}`);
	}
	await Promise.all([serve(), workerBlockprocessor()]);
}
