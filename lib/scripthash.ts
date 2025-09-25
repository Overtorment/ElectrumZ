import { createHash } from "node:crypto";

export function computeScripthash(script: Buffer): Buffer {
	return createHash("sha256").update(script).digest().reverse();
}


