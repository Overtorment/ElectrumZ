#!/usr/bin/env bun
import { openDatabase } from "./lib/db";
import { existsSync } from "fs";
import { DEFAULT_SQLITE_DB_PATH } from "./constants";

async function main(): Promise<void> {
  if (!existsSync(DEFAULT_SQLITE_DB_PATH)) {
    console.error(`Error: database file '${DEFAULT_SQLITE_DB_PATH}' does not exist.`);
    process.exit(1);
  }

  const start = Date.now();
  const handle = openDatabase(DEFAULT_SQLITE_DB_PATH, { pragmasProfile: "indexbuild" });
  handle.beginImmediate();
  console.log('adding index...');
  handle.ensureCompositeIndex();
  handle.commit();
  handle.close();
  const elapsed = ((Date.now() - start) / 1000).toFixed(3);
  console.log(`Composite index 'idx_utxos_scripthash_outpoint' created on '${DEFAULT_SQLITE_DB_PATH}' in ${elapsed}s.`);
}

if (import.meta.main) {
  main().catch((e) => {
    console.error("Error:", (e as Error).message);
    process.exit(1);
  });
}


