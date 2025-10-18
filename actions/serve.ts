import { Server } from "jayson/promise";
import { readFileSync, existsSync } from 'node:fs';
import { openDatabase } from "../lib/db";
import { DEFAULT_SQLITE_DB_PATH } from "../constants";
const pckg = require("../package.json");


export async function serve(): Promise<void> {
// Open database once for all requests
  const dbHandle = openDatabase(DEFAULT_SQLITE_DB_PATH, {pragmasProfile: "readonly"});
  const sumByScripthash = dbHandle.db.prepare("SELECT COALESCE(SUM(value), 0) AS total FROM utxos WHERE scripthash = ?");
  const listUnspentByScripthash = dbHandle.db.prepare("SELECT outpoint, value, height FROM utxos WHERE scripthash = ?");
  const listHistoryByScripthash = dbHandle.db.prepare("SELECT outpoint, height FROM utxos WHERE scripthash = ?");
  console.log(`Serving database at: ${DEFAULT_SQLITE_DB_PATH}`);

  const server = new Server({
    "server.version": async (params: unknown) => [`${pckg.name} ${pckg.version}`, '1.1'], // we should close the connection if protocol ver mismatch
    "server.ping": async (params: unknown) => null,
    "server.peers.subscribe": async (params: unknown) => [],
    "server.features": async (params: unknown) => ({
      "genesis_hash": "000000000019d6689c085ae165831e934ff763ae46a2a6c172b3f1b60a8ce26f",
      "hosts": {},
      "protocol_max": "1.4.3",
      "protocol_min": "1.2",
      "pruning": null, // TODO: can we detect pruning bitcoind?
      "server_version": `${pckg.name} ${pckg.version}`,
      "services": [],
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
    "blockchain.scripthash.subscribe": async () => null,
    "blockchain.scripthash.unsubscribe": async () => false,
    "blockchain.scripthash.get_mempool": async () => [],
    "blockchain.relayfee": async () => 0,
    "blockchain.block.header": async () => false,
    "blockchain.block.headers": async () => ({
      // TODO
      // dummy data:
      "count": 2,
      "hex": "0100000000000000000000000000000000000000000000000000000000000000000000003ba3edfd7a7b12b27ac72c3e67768f617fc81bc3888a51323a9fb8aa4b1e5e4a29ab5f49ffff001d1dac2b7c010000006fe28c0ab6f1b372c1a6a246ae63f74f931e8365e15a089c68d6190000000000982051fd1e4ba744bbbe680e1fee14677ba1a3c3540bf7b1cdb606e857233e0e61bc6649ffff001d01e36299",
      "max": 2016
    }),
    "blockchain.headers.subscribe": async () => ({
      // TODO: max height & block header
      // dummy data:
      "height": 520481,
      "hex": "00000020890208a0ae3a3892aa047c5468725846577cfcd9b512b50000000000000000005dc2b02f2d297a9064ee103036c14d678f9afc7e3d9409cf53fd58b82e938e8ecbeca05a2d2103188ce804c4"
    }),
    "blockchain.estimatefee": async () => 0,
    ping: async () => "pong",
    add: async ([a, b]: [number, number]) => a + b,
    "blockchain.scripthash.get_balance": async (params: unknown) => {
      try {
        const key = Buffer.from(params[0], "hex");
        const row = sumByScripthash.get(key) as { total: number } | null;
        const confirmed = row?.total ?? 0;
        return {confirmed, unconfirmed: 0};
      } catch (e) {
        console.error(`[get_balance] error:`, e);
        throw server.error(501, `[get_balance] error: ` + e.message);
      }
    },
    "blockchain.scripthash.get_history": async (params: unknown) => {
      try {
        const key = Buffer.from(params[0], "hex");
        const rows = listHistoryByScripthash.all(key) as Array<{ outpoint: any; height: number }>;
        const result = rows.map((r, idx) => {
          const outBuf = Buffer.isBuffer(r.outpoint) ? (r.outpoint as Buffer) : Buffer.from(r.outpoint);
          const txHashHex = outBuf.subarray(0, 32).toString("hex");
          return {height: r.height, tx_hash: txHashHex};
        });
        return result;
      } catch (e) {
        console.error(`[get_history] error:`, e);
        throw server.error(501, `[get_history] error: ` + e.message);
      }
    },
    "blockchain.scripthash.listunspent": async (params: unknown) => {
      try {
        const key = Buffer.from(params[0], "hex");
        const rows = listUnspentByScripthash.all(key) as Array<{ outpoint: any; value: number; height: number }>;
        const result = rows.map((r, idx) => {
          const outBuf = Buffer.isBuffer(r.outpoint) ? (r.outpoint as Buffer) : Buffer.from(r.outpoint);
          const txHashHex = outBuf.subarray(0, 32).toString("hex");
          const txPos = outBuf.length >= 36 ? outBuf.readUInt32LE(32) : 0;
          return {height: r.height, tx_pos: txPos, tx_hash: txHashHex, value: r.value};
        });
        return result;
      } catch (e) {
        console.error(`[listunspent] error:`, e);
        throw server.error(501, `[listunspent] error: ` + e.message);
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

      if (typeof (value as any).method === "string") {
        // logging:
        console.log(`---> ${(value as any).method} params=${JSON.stringify((value as any).params)}`);
      }


      return value as any;
    },
  });

  const tcpPort = process.env.TCP_PORT ?? 50011;
  const tlsPort = process.env.TLS_PORT ?? 50012;
  
  // Wrap socket methods to append newline to all writes
  const wrapSocket = (socket: any) => {
    const originalWrite = socket.write.bind(socket);
    const originalEnd = socket.end.bind(socket);
    
    socket.write = function(data: any, ...args: any[]) {
      if (typeof data === 'string' && data.trim().startsWith('{')) {
        return originalWrite(data + '\n', ...args);
      }
      return originalWrite(data, ...args);
    };
    
    socket.end = function(data: any, ...args: any[]) {
      if (data && typeof data === 'string' && data.trim().startsWith('{')) {
        return originalEnd(data + '\n', ...args);
      }
      return originalEnd(data, ...args);
    };
  };
  
  // Start TCP server with socket wrapping
  const tcpServer = server.tcp();
  tcpServer.on('connection', wrapSocket);
  tcpServer.listen(tcpPort);
  console.log("ElectrumZ TCP listening on " + tcpPort);

 
  // Start TLS server only if env vars are set and files exist
  const certExists = existsSync(String(process.env.TLS_CERT_PATH));
  const keyExists = existsSync(String(process.env.TLS_KEY_PATH));
  
  if (certExists && keyExists) {
    try {
      const tlsOptions = {
        cert: readFileSync(String(process.env.TLS_CERT_PATH)),
        key: readFileSync(String(process.env.TLS_KEY_PATH))
      };
      
      const tlsServer = server.tls(tlsOptions);
      tlsServer.on('secureConnection', wrapSocket);
      tlsServer.listen(tlsPort);
      console.log("ElectrumZ TLS listening on " + tlsPort);
      console.log(`Using TLS certificate: ${process.env.TLS_CERT_PATH}`);
      console.log(`Using TLS private key: ${process.env.TLS_KEY_PATH}`);
    } catch (error) {
      console.error("Failed to start TLS server:", error);
      console.error("Please check that the certificate and key files are valid.");
    }
  }
}


if (import.meta.main) {
  serve().catch((e) => {
    console.error("Error:", (e as Error).message);
    process.exit(1);
  });
}



