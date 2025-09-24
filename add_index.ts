#!/usr/bin/env bun
import { Database } from "bun:sqlite";
import { existsSync } from "fs";
import { parseArgs } from "util";

async function main(): Promise<void> {
  const args = parseArgs({ args: Bun.argv.slice(2), allowPositionals: true });
  if (args.positionals.length !== 1) {
    console.error("Usage: bun run add_index.ts <dbfile>");
    process.exit(1);
  }

  const [dbfile] = args.positionals as [string];
  if (!existsSync(dbfile)) {
    console.error(`Error: database file '${dbfile}' does not exist.`);
    process.exit(1);
  }

  const start = Date.now();
  const db = new Database(dbfile);
  db.exec(`
PRAGMA journal_mode=OFF;
PRAGMA synchronous=OFF;
PRAGMA locking_mode=EXCLUSIVE;
PRAGMA temp_store=MEMORY;
PRAGMA cache_size=-1048576;
`);

  db.exec("BEGIN IMMEDIATE");
  db.exec("CREATE INDEX IF NOT EXISTS idx_utxos_scripthash ON utxos(scripthash)");
  db.exec("COMMIT");

  // Optionally gather statistics for query planner
  // db.exec("ANALYZE");

  db.close();
  const elapsed = ((Date.now() - start) / 1000).toFixed(3);
  console.log(`Index 'idx_utxos_scripthash' created on '${dbfile}' in ${elapsed}s.`);
}

if (import.meta.main) {
  main().catch((e) => {
    console.error("Error:", (e as Error).message);
    process.exit(1);
  });
}


