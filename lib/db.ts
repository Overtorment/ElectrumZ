import { Database, Statement } from "bun:sqlite";

export type UtxoRow = [Buffer, number, number, Buffer];

export interface DbHandle {
	readonly db: Database;
	close(): void;
	beginImmediate(): void;
	commit(): void;
	prepareInsert(): Statement<UtxoRow>;
	insertMany(rows: UtxoRow[], stmt?: Statement<UtxoRow>): void;
	createSchema(): void;
	ensureScripthashIndex(): void;
}

export function openDatabase(path: string, opts?: { createSchema?: boolean; pragmasProfile?: "bulkload" | "default" }): DbHandle {
	const db = new Database(path);
	const profile = opts?.pragmasProfile ?? "default";
	applyPragmas(db, profile);
	if (opts?.createSchema) {
		createSchema(db);
	}
	return wrap(db);
}

function applyPragmas(db: Database, profile: "bulkload" | "default"): void {
	if (profile === "bulkload") {
		db.exec(`
PRAGMA journal_mode=OFF;
PRAGMA synchronous=OFF;
PRAGMA locking_mode=EXCLUSIVE;
PRAGMA temp_store=MEMORY;
PRAGMA cache_size=-1048576;
PRAGMA page_size=32768;
PRAGMA mmap_size=1073741824;
PRAGMA foreign_keys=OFF;
`);
	} else {
		db.exec(`
PRAGMA journal_mode=WAL;
PRAGMA synchronous=NORMAL;
PRAGMA foreign_keys=ON;
`);
	}
}

function createSchema(db: Database): void {
	db.exec("CREATE TABLE utxos(outpoint BLOB, value INT, height INT, scripthash BLOB)");
}

function wrap(db: Database): DbHandle {
	return {
		 db,
		 close() { db.close(); },
		 beginImmediate() { db.exec("BEGIN IMMEDIATE"); },
		 commit() { db.exec("COMMIT"); },
		 prepareInsert() { return db.prepare("INSERT INTO utxos VALUES(?, ?, ?, ?)"); },
		 insertMany(rows: UtxoRow[], stmt?: Statement<UtxoRow>) {
			const local = stmt ?? db.prepare("INSERT INTO utxos VALUES(?, ?, ?, ?)");
			for (const r of rows) local.run(...r);
			if (!stmt) local.finalize?.();
		 },
		 createSchema() { createSchema(db); },
		 ensureScripthashIndex() { db.exec("CREATE INDEX IF NOT EXISTS idx_utxos_scripthash ON utxos(scripthash)"); },
	};
}


