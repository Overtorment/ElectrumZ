// bun add jayson
import { Server } from "jayson/promise";

// Define async methods; jayson handles JSON-RPC framing & TCP.
const server = new Server({
  ping: async () => "pong",
  add: async ([a, b]: [number, number]) => a + b,
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

server.tcp().listen(4000); // TCP on :4000
console.log("jayson TCP listening on 4000");
