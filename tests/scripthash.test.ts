import { expect, test, describe } from "bun:test";
import { computeOutpoint, computeOutpointBuf, computeScripthash } from "../lib/scripthash";

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


describe('computeOutpoint', () => {
  test('should compute outpoint correctly', () => {
    const outpoint = computeOutpoint("f1373cfda16afb180c9f0c7c8783bb61febc98e3de3a82c9b77234b33a997b5d", 1);
    expect(outpoint.toString("hex")).toBe("f1373cfda16afb180c9f0c7c8783bb61febc98e3de3a82c9b77234b33a997b5d01000000");
  });
  test('should compute outpoint correctly', () => {
    const outpoint = computeOutpoint("a0a65298bd173cb6973dbbe883aaa7665daac8ca394efe5ea424d89f3732abaf", 4);
    expect(outpoint.toString("hex")).toBe("a0a65298bd173cb6973dbbe883aaa7665daac8ca394efe5ea424d89f3732abaf04000000");
  });
});



describe('computeOutpointBuf', () => {

  test('should compute outpoint correctly', () => {
    const outpoint = computeOutpointBuf(Buffer.from("f1373cfda16afb180c9f0c7c8783bb61febc98e3de3a82c9b77234b33a997b5d", "hex"), 1);
    expect(outpoint.toString("hex")).toBe("f1373cfda16afb180c9f0c7c8783bb61febc98e3de3a82c9b77234b33a997b5d01000000");
  });

  test('should compute outpoint correctly', () => {
    const outpoint = computeOutpointBuf(Buffer.from("a0a65298bd173cb6973dbbe883aaa7665daac8ca394efe5ea424d89f3732abaf", "hex"), 4);
    expect(outpoint.toString("hex")).toBe("a0a65298bd173cb6973dbbe883aaa7665daac8ca394efe5ea424d89f3732abaf04000000");
  });
});


