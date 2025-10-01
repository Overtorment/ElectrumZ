import { Server } from "jayson/promise";
import { openDatabase } from "./lib/db";
import { DEFAULT_SQLITE_DB_PATH } from "./constants";
const pckg = require("./package.json");

// Open database once for all requests
const dbHandle = openDatabase(DEFAULT_SQLITE_DB_PATH, { pragmasProfile: "readonly" });
const sumByScripthash = dbHandle.db.prepare("SELECT COALESCE(SUM(value), 0) AS total FROM utxos WHERE scripthash = ?");
const listUnspentByScripthash = dbHandle.db.prepare("SELECT outpoint, value, height FROM utxos WHERE scripthash = ?");
const listHistoryByScripthash = dbHandle.db.prepare("SELECT outpoint, height FROM utxos WHERE scripthash = ?");
console.log(`[serve] Using database at: ${DEFAULT_SQLITE_DB_PATH}`);

const server = new Server({
  "server.version": async (params: unknown) => [`${pckg.name} ${pckg.version}`, '1.1'], // we should close the connection if protocol ver mismatch
  "server.ping": async (params: unknown) => null,
  "server.peers.subscribe": async (params: unknown) => [],
  "server.features": async (params: unknown) => ({
         "genesis_hash": "000000000933ea01ad0ee984209779baaec3ced90fa3f408719526f8d77f4943",
        "hosts": {},
        "protocol_max": "1.0",
        "protocol_min": "1.0",
        "pruning": null,
        "server_version": `${pckg.name} ${pckg.version}`,
        "hash_function": "sha256"
  }),
  "server.donation_address": async () => '13HaCAB4jf7FYSZexJxoczyDDnutzZigjS',
  "server.banner": async () => 'Воруй! Убивай! Еби гусей!',
  "server.add_peer": async () => false,
  "mempool.get_fee_histogram": async () => [],
  "blockchain.transaction.id_from_pos": async () => false, // kurwa
  "blockchain.transaction.get_merkle": async () => false, // kurwa
  "blockchain.transaction.get": async (params: [string, boolean]) => {
    // TODO: proxy to bitcoind
    if (params[1]) {
      return {"helo": "world"};
    } else {
      return "ffffffff";
    }
  },
  "blockchain.transaction.broadcast": async (params: [string]) => {
    // TODO: proxy to bitcoind
    return "a76242fce5753b4212f903ff33ac6fe66f2780f34bdb4b33b175a7815a11a98e";
  },
  "blockchain.scripthash.subscribe": async () => false, // nop; TODO: lookup correct response signature
  "blockchain.scripthash.unsubscribe": async () => false,
  "blockchain.scripthash.get_mempool": async () => [],
  "blockchain.relayfee": async () => 0,
  "blockchain.block.header": async () => false,
  "blockchain.block.headers": async () => ({
    // TODO
    "count": 2,
    "hex": "0100000000000000000000000000000000000000000000000000000000000000000000003ba3edfd7a7b12b27ac72c3e67768f617fc81bc3888a51323a9fb8aa4b1e5e4a29ab5f49ffff001d1dac2b7c010000006fe28c0ab6f1b372c1a6a246ae63f74f931e8365e15a089c68d6190000000000982051fd1e4ba744bbbe680e1fee14677ba1a3c3540bf7b1cdb606e857233e0e61bc6649ffff001d01e36299",
    "max": 2016
  }),
  "blockchain.headers.subscribe": async () => ({
    // TODO: max height & block header
    "height": 520481,
    "hex": "00000020890208a0ae3a3892aa047c5468725846577cfcd9b512b50000000000000000005dc2b02f2d297a9064ee103036c14d678f9afc7e3d9409cf53fd58b82e938e8ecbeca05a2d2103188ce804c4"
  }),
  "blockchain.estimatefee": async () => 0,
  ping: async () => "pong",
  add: async ([a, b]: [number, number]) => a + b,
  "blockchain.scripthash.get_balance": async (params: unknown) => {
    try {
      let hex: string | undefined;
      if (typeof params === "string") hex = params;
      else if (Array.isArray(params) && typeof params[0] === "string") hex = params[0] as string;
      console.log(`[get_balance] params=`, params);

      if (!hex || typeof hex !== "string" || hex.length % 2 !== 0 || !/^[0-9a-fA-F]+$/.test(hex)) {
        console.warn(`[get_balance] invalid hex param:`, hex);
        return { confirmed: 0, unconfirmed: 0 };
      }

      const key = Buffer.from(hex, "hex");
      const row = sumByScripthash.get(key) as { total: number } | null;
      const confirmed = row?.total ?? 0;
      console.log(`[get_balance] scripthash=${hex}, confirmed=${confirmed}`);
      return { confirmed, unconfirmed: 0 };
    } catch (e) {
      console.error(`[get_balance] error:`, e);
      throw server.error(501, `[get_balance] error: ` +  e.message);
    }
  },
  "blockchain.scripthash.get_history": async (params: unknown) => {
    try {
      let hex: string | undefined;
      if (typeof params === "string") hex = params;
      else if (Array.isArray(params) && typeof params[0] === "string") hex = params[0] as string;
      console.log(`[get_history] params=`, params);

      if (!hex || typeof hex !== "string" || hex.length % 2 !== 0 || !/^[0-9a-fA-F]+$/.test(hex)) {
        console.warn(`[get_history] invalid hex param:`, hex);
        return [] as Array<{ height: number; tx_hash: string }>;
      }

      const key = Buffer.from(hex, "hex");
      const rows = listHistoryByScripthash.all(key) as Array<{ outpoint: any; height: number }>;
      const result = rows.map((r, idx) => {
        const outBuf = Buffer.isBuffer(r.outpoint) ? (r.outpoint as Buffer) : Buffer.from(r.outpoint);
        if (outBuf.length !== 36) {
          console.warn(`[get_history] unexpected outpoint length at row ${idx}:`, outBuf.length);
        }
        const txHashHex = outBuf.subarray(0, 32).toString("hex");
        return { height: r.height, tx_hash: txHashHex };
      });
      console.log(`[get_history] scripthash=${hex}, items=${result.length}`);
      return result;
    } catch (e) {
      console.error(`[get_history] error:`, e);
      throw server.error(501, `[get_history] error: ` +  e.message);
    }
  },
  "blockchain.scripthash.listunspent": async (params: unknown) => {
    try {
      let hex: string | undefined;
      if (typeof params === "string") hex = params;
      else if (Array.isArray(params) && typeof params[0] === "string") hex = params[0] as string;
      console.log(`[listunspent] params=`, params);

      if (!hex || typeof hex !== "string" || hex.length % 2 !== 0 || !/^[0-9a-fA-F]+$/.test(hex)) {
        console.warn(`[listunspent] invalid hex param:`, hex);
        return [] as Array<{ height: number; tx_pos: number; tx_hash: string; value: number }>;
      }

      const key = Buffer.from(hex, "hex");
      const rows = listUnspentByScripthash.all(key) as Array<{ outpoint: any; value: number; height: number }>;
      const result = rows.map((r, idx) => {
        const outBuf = Buffer.isBuffer(r.outpoint) ? (r.outpoint as Buffer) : Buffer.from(r.outpoint);
        if (outBuf.length !== 36) {
          console.warn(`[listunspent] unexpected outpoint length at row ${idx}:`, outBuf.length);
        }
        const txHashHex = outBuf.subarray(0, 32).toString("hex");
        const txPos = outBuf.length >= 36 ? outBuf.readUInt32LE(32) : 0;
        return { height: r.height, tx_pos: txPos, tx_hash: txHashHex, value: r.value };
      });
      console.log(`[listunspent] scripthash=${hex}, items=${result.length}`);
      return result;
    } catch (e) {
      console.error(`[listunspent] error:`, e);
      throw server.error(501, `[listunspent] error: ` +  e.message);
    }
  },
}, {
  // Accept requests missing jsonrpc by injecting "2.0"
  reviver: (key: string, value: unknown) => {
    if (
      value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      // @ts-ignore - runtime check for JSON-RPC shape
      typeof (value as any).method === "string" &&
      // @ts-ignore - if jsonrpc is absent, add it
      (value as any).jsonrpc === undefined
    ) {
      // @ts-ignore
      (value as any).jsonrpc = "2.0";
    }
    return value as any;
  },
});

const tcpPort = process.env.TCP_PORT ?? 50011;
server.tcp().listen(tcpPort);
console.log("ElectrumZ TCP listening on " + tcpPort);
