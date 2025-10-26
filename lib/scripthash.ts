import { createHash } from "node:crypto";

export function computeScripthash(script: Buffer): Buffer {
	return createHash("sha256").update(script).digest().reverse();
}

export function computeOutpoint(txid: string, n: number): Buffer {
	const indexBuf = Buffer.allocUnsafe(4);
	indexBuf.writeUInt32LE(n, 0);
	return Buffer.concat([Buffer.from(txid, "hex"), indexBuf]);
}

export function computeOutpointBuf(
	prevoutHashBuf: Buffer,
	prevoutIndex: number,
): Buffer {
	const indexBuf = Buffer.allocUnsafe(4);
	indexBuf.writeUInt32LE(prevoutIndex, 0);
	return Buffer.concat([prevoutHashBuf, indexBuf]);
}
