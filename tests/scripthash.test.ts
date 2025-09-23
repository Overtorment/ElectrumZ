import { expect, test, describe } from "bun:test";
import { computeScripthash } from "../scripthash";

function hex(hexString: string): Buffer {
  return Buffer.from(hexString.replace(/^0x/, ""), "hex");
}

describe("computeScripthash", () => {
  test("P2PKH script", () => {
    // OP_DUP OP_HASH160 <20-byte pubkeyhash> OP_EQUALVERIFY OP_CHECKSIG
    const script = Buffer.concat([
      hex("76a9"),
      Buffer.from([20]),
      hex("0102030405060708090a0b0c0d0e0f1011121314"),
      hex("88ac"),
    ]);
    const scripthash = computeScripthash(script);
    expect(Buffer.isBuffer(scripthash)).toBe(true);
    expect(scripthash.length).toBe(32);
    expect(scripthash.toString("hex")).toBe("5546fc69d399ef99854c132abb060381cc159dbec67c496a6f0e0dbf12e83ae8");
  });

  test("P2SH script", () => {
    // OP_HASH160 <20-byte scripthash> OP_EQUAL
    const script = Buffer.concat([
      hex("a9"),
      Buffer.from([20]),
      hex("00112233445566778899aabbccddeeff00112233"),
      hex("87"),
    ]);
    const scripthash = computeScripthash(script);
    expect(Buffer.isBuffer(scripthash)).toBe(true);
    expect(scripthash.length).toBe(32);
    expect(scripthash.toString("hex")).toBe("7914236249d96d4931978817b2fe3c9071e8b4daf4decd3087dbba955fd7f66f");
  });

  test("P2PK compressed pubkey", () => {
    // <33-byte pubkey> OP_CHECKSIG
    const script = Buffer.concat([
      Buffer.from([33]),
      hex("02" + "11".repeat(32)),
      hex("ac"),
    ]);
    const scripthash = computeScripthash(script);
    expect(Buffer.isBuffer(scripthash)).toBe(true);
    expect(scripthash.length).toBe(32);
    expect(scripthash.toString("hex")).toBe("3babce0e0ce27d2dea6a599bef2aed2a2b25c0f1aa0998afa948a353a1713b1d");
  });
});


