#!/usr/bin/env bun
import { openDatabase } from "./lib/db";
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
  const handle = openDatabase(dbfile, { pragmasProfile: "indexbuild" });
  handle.beginImmediate();
  handle.ensureScripthashIndex();
  handle.commit();
  handle.close();
  const elapsed = ((Date.now() - start) / 1000).toFixed(3);
  console.log(`Index 'idx_utxos_scripthash' created on '${dbfile}' in ${elapsed}s.`);
}

if (import.meta.main) {
  main().catch((e) => {
    console.error("Error:", (e as Error).message);
    process.exit(1);
  });
}


