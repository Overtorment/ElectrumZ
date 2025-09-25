import { openSync, readSync, closeSync, statSync } from "fs";

export class StreamingBinaryReader {
  private blob: Blob | null = null;
  private fd: number | null = null;
  private fileSize: number = 0;
  private position: number = 0;
  private buffer: Buffer = Buffer.alloc(0);
  private bufferStart: number = 0;
  private readonly bufferSize: number;

  constructor(source: Blob | string, options?: { bufferSize?: number }) {
    this.bufferSize = options?.bufferSize ?? 4 * 1024 * 1024; // 4 MiB default for large files
    if (typeof source === "string") {
      this.fd = openSync(source, "r");
      this.fileSize = statSync(source).size;
    } else {
      this.blob = source;
      this.fileSize = (source as any).size;
    }
  }

  private async ensureBuffer(minBytes: number): Promise<void> {
    const relPos = this.position - this.bufferStart;
    const available = this.buffer.length - relPos;
    if (available >= minBytes) return;

    const readStart = this.position;
    const readSize = Math.max(this.bufferSize, minBytes);

    if (this.fd !== null) {
      // Allocate a fresh buffer to preserve previously returned subarrays
      const buf = Buffer.allocUnsafe(readSize);
      const bytesRead = readSync(this.fd, buf, 0, readSize, readStart);
      this.buffer = bytesRead === buf.length ? buf : buf.subarray(0, bytesRead);
      this.bufferStart = readStart;
      return;
    }

    // Fallback: Blob-based read (may incur extra copy via ArrayBuffer)
    const slice = (this.blob as any).slice(readStart, readStart + readSize);
    const ab = await slice.arrayBuffer();
    this.buffer = Buffer.from(ab);
    this.bufferStart = readStart;
  }

  async read(length: number): Promise<Buffer> {
    await this.ensureBuffer(length);
    const relPos = this.position - this.bufferStart;
    if (relPos + length > this.buffer.length) throw new Error("Unexpected end of file");
    const out = this.buffer.subarray(relPos, relPos + length);
    this.position += length;
    return out;
  }

  async readUInt8(): Promise<number> {
    await this.ensureBuffer(1);
    const relPos = this.position - this.bufferStart;
    const value = this.buffer[relPos];
    this.position += 1;
    return value;
  }

  async readUInt16LE(): Promise<number> {
    await this.ensureBuffer(2);
    const relPos = this.position - this.bufferStart;
    const value = this.buffer.readUInt16LE(relPos);
    this.position += 2;
    return value;
  }

  async readUInt32LE(): Promise<number> {
    await this.ensureBuffer(4);
    const relPos = this.position - this.bufferStart;
    const value = this.buffer.readUInt32LE(relPos);
    this.position += 4;
    return value;
  }

  async readBigUInt64LE(): Promise<bigint> {
    await this.ensureBuffer(8);
    const relPos = this.position - this.bufferStart;
    const value = this.buffer.readBigUInt64LE(relPos);
    this.position += 8;
    return value;
  }

  async isAtEnd(): Promise<boolean> {
    return this.position >= this.fileSize;
  }

  close(): void {
    if (this.fd !== null) {
      closeSync(this.fd);
      this.fd = null;
    }
  }
}


