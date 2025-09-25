export class StreamingBinaryReader {
  private file: Blob;
  private position: number = 0;
  private buffer: Buffer = Buffer.alloc(0);
  private bufferStart: number = 0;
  private readonly bufferSize: number = 64 * 1024;

  constructor(file: Blob) {
    this.file = file;
  }

  private async ensureBuffer(minBytes: number): Promise<void> {
    const relPos = this.position - this.bufferStart;
    const available = this.buffer.length - relPos;
    if (available >= minBytes) return;

    const readStart = this.position;
    const readSize = Math.max(this.bufferSize, minBytes);
    const slice = (this.file as any).slice(readStart, readStart + readSize);
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
    const b = await this.read(1);
    return b[0];
  }

  async readUInt16LE(): Promise<number> {
    const b = await this.read(2);
    return b.readUInt16LE(0);
  }

  async readUInt32LE(): Promise<number> {
    const b = await this.read(4);
    return b.readUInt32LE(0);
  }

  async readBigUInt64LE(): Promise<bigint> {
    const b = await this.read(8);
    return b.readBigUInt64LE(0);
  }

  async isAtEnd(): Promise<boolean> {
    return this.position >= (this.file as any).size;
  }
}


