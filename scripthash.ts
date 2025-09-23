import { createHash } from "node:crypto";

export function computeScripthash(script: Buffer): string {
  const hash = createHash("sha256").update(script).digest();
  const reversedHash = Buffer.from(hash).reverse();
  return reversedHash.toString("hex");
}


