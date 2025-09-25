// bun add jayson
import { Server } from "jayson/promise";
import { openDatabase } from "./lib/db";

// Open database once for all requests
const dbPath = process.env.UTXOS_DB_PATH ?? "./utxos_v2.sqlite";
const dbHandle = openDatabase(dbPath, { pragmasProfile: "readonly" });
const sumByScripthash = dbHandle.db.prepare("SELECT COALESCE(SUM(value), 0) AS total FROM utxos WHERE scripthash = ?");
const listUnspentByScripthash = dbHandle.db.prepare("SELECT outpoint, value, height FROM utxos WHERE scripthash = ?");
const listHistoryByScripthash = dbHandle.db.prepare("SELECT outpoint, height FROM utxos WHERE scripthash = ?");
console.log(`[serve] Using database at: ${dbPath}`);

const server = new Server({
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
server.tcp().listen(tcpPort); // TCP on :4000
console.log("jayson TCP listening on " + tcpPort);
