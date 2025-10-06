import { Database, Statement } from "bun:sqlite";
import { availableParallelism } from "os";

export type UtxoRow = [Buffer, number, number, Buffer];

export interface DbHandle {
	readonly db: Database;
	close(): void;
	beginImmediate(): void;
	commit(): void;
	rollback(): void;
	prepareInsert(): Statement<UtxoRow>;
	insertMany(rows: UtxoRow[], stmt?: Statement<UtxoRow>): void;
	createSchema(): void;
	ensureCompositeIndex(): void;
}

export function openDatabase(path: string, opts?: { createSchema?: boolean; pragmasProfile?: "bulkload" | "default" | "readonly" | "indexbuild" | "blockchain" }): DbHandle {
	const db = new Database(path);
	const profile = opts?.pragmasProfile ?? "default";
	applyPragmas(db, profile);
	if (opts?.createSchema) {
		createSchema(db);
	}
	return wrap(db);
}

function applyPragmas(db: Database, profile: "bulkload" | "default" | "readonly" | "indexbuild" | "blockchain"): void {
	console.log(`Applying SQLite PRAGMA profile: ${profile}`);
	const threads = availableParallelism();
	if (profile === "bulkload") {
		db.exec(`
PRAGMA journal_mode=OFF;
PRAGMA synchronous=OFF;
PRAGMA locking_mode=EXCLUSIVE;
PRAGMA temp_store=MEMORY;
PRAGMA cache_size=-1048576;
PRAGMA page_size=32768;
PRAGMA mmap_size=1073741824;
PRAGMA threads=${threads};
PRAGMA foreign_keys=OFF;
`);
		console.log(`SQLite PRAGMA threads set to ${threads}`);
	} else if (profile === "readonly") {
		db.exec(`
PRAGMA query_only=ON;
PRAGMA locking_mode=NORMAL;
PRAGMA temp_store=MEMORY;
PRAGMA cache_size=-262144;
PRAGMA mmap_size=1073741824;
PRAGMA threads=${threads};
PRAGMA automatic_index=ON;
PRAGMA foreign_keys=OFF;
PRAGMA busy_timeout=1000;
`);
		console.log(`SQLite PRAGMA threads set to ${threads} (readonly)`);
	} else if (profile === "indexbuild") {
		db.exec(`
PRAGMA journal_mode=WAL;
PRAGMA synchronous=NORMAL;
PRAGMA locking_mode=NORMAL;
PRAGMA temp_store=MEMORY;
PRAGMA cache_size=-524288;
PRAGMA mmap_size=1073741824;
PRAGMA threads=${threads};
PRAGMA foreign_keys=OFF;
PRAGMA busy_timeout=10000;
`);
		console.log(`SQLite PRAGMA threads set to ${threads} (indexbuild)`);
	} else if (profile === "blockchain") {
		db.exec(`
PRAGMA journal_mode=WAL;
PRAGMA synchronous=NORMAL;
PRAGMA locking_mode=NORMAL;
PRAGMA temp_store=MEMORY;
PRAGMA cache_size=-524288;
PRAGMA page_size=32768;
PRAGMA mmap_size=1073741824;
PRAGMA threads=${threads};
PRAGMA foreign_keys=OFF;
PRAGMA busy_timeout=5000;
PRAGMA optimize;
`);
		console.log(`SQLite PRAGMA threads set to ${threads} (blockchain)`);
	} else {
		db.exec(`
PRAGMA journal_mode=WAL;
PRAGMA synchronous=NORMAL;
PRAGMA foreign_keys=ON;
`);
	}
}

function createSchema(db: Database): void {
	db.exec("CREATE TABLE IF NOT EXISTS utxos(outpoint BLOB, value INT, height INT, scripthash BLOB)");
}

function wrap(db: Database): DbHandle {
	return {
		 db,
		 close() { db.close(); },
		 beginImmediate() { db.exec("BEGIN IMMEDIATE"); },
		 commit() { db.exec("COMMIT"); },
		 rollback() { db.exec("ROLLBACK"); },
		 prepareInsert() { return db.prepare("INSERT INTO utxos VALUES(?, ?, ?, ?)"); },
		 insertMany(rows: UtxoRow[], stmt?: Statement<UtxoRow>) {
			const local = stmt ?? db.prepare("INSERT INTO utxos VALUES(?, ?, ?, ?)");
			for (const r of rows) local.run(...r);
			if (!stmt) local.finalize?.();
		 },
		 createSchema() { createSchema(db); },
		 ensureCompositeIndex() {
			 db.exec("CREATE INDEX IF NOT EXISTS idx_utxos_scripthash_outpoint ON utxos(scripthash, outpoint)"); 
		 },
	};
}


