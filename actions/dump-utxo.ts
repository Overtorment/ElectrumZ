import * as fs from "fs";
const url = require("url");
const path = require('path');

import {DEFAULT_SQLITE_DB_PATH, DEFAULT_UTXO_DUMP_FILE} from "../constants";

export async function dumpUtxo(): Promise<void> {
    if (!process.env.BITCOIN_RPC) {
        console.log("not all env variables set");
        process.exit();
    }

    const start = Date.now();

    let jayson = require("jayson/promise");
    let rpc = url.parse(process.env.BITCOIN_RPC);
    let client = jayson.client.http(rpc);

    const getblockchaininfo = await client.request("getblockchaininfo", []);
    if (getblockchaininfo?.result?.chain !== 'main') {
        process.exit('cant reach bitcoind');
    }

    const absolutePath = path.resolve(DEFAULT_UTXO_DUMP_FILE);
    console.log(`dumping utxo to ${absolutePath}`);

    if (fs.existsSync(`${absolutePath}`)) {
        console.log(`dumping skipped, file ${absolutePath} exists`);
        return;
    }

    if (fs.existsSync(`${absolutePath}.incomplete`)) {
        console.log('dumping aborted, incomplete file ${absolutePath}.incomplete exists');
        process.exit(1);
    }

    await client.request("dumptxoutset", [absolutePath, 'latest']);

    const elapsed = ((Date.now() - start) / 1000).toFixed(3);
    console.log(`dumped UTXO in ${elapsed}s.`);
}



if (import.meta.main) {
    dumpUtxo().catch((e) => {
        console.error("Error:", (e as Error).message);
        process.exit(1);
    });
}
