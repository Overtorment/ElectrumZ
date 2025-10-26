import { openSync, readSync, closeSync, statSync } from "node:fs";

export class StreamingBinaryReader {
	private fd: number | null = null;
	private fileSize: number = 0;
	private position: number = 0;
	private buffer: Buffer = Buffer.alloc(0);
	private bufferStart: number = 0;
	private readonly bufferSize: number;

	constructor(source: string, options?: { bufferSize?: number }) {
		this.bufferSize = options?.bufferSize ?? 4 * 1024 * 1024; // 4 MiB default for large files

		this.fd = openSync(source, "r");
		this.fileSize = statSync(source).size;
	}

	private ensureBuffer(minBytes: number): void {
		if (this.fd === null) throw new Error("File descriptor is null");

		const relPos = this.position - this.bufferStart;
		const available = this.buffer.length - relPos;
		if (available >= minBytes) return;

		const readStart = this.position;
		const readSize = Math.max(this.bufferSize, minBytes);

		// Allocate a fresh buffer to preserve previously returned subarrays
		const buf = Buffer.allocUnsafe(readSize);
		const bytesRead = readSync(this.fd, buf, 0, readSize, readStart);
		this.buffer = bytesRead === buf.length ? buf : buf.subarray(0, bytesRead);
		this.bufferStart = readStart;
		return;
	}

	read(length: number): Buffer {
		this.ensureBuffer(length);
		const relPos = this.position - this.bufferStart;
		if (relPos + length > this.buffer.length)
			throw new Error("Unexpected end of file");
		const out = this.buffer.subarray(relPos, relPos + length);
		this.position += length;
		return out;
	}

	readUInt8(): number {
		this.ensureBuffer(1);
		const relPos = this.position - this.bufferStart;
		const value = this.buffer[relPos];
		this.position += 1;
		return value;
	}

	readUInt16LE(): number {
		this.ensureBuffer(2);
		const relPos = this.position - this.bufferStart;
		const value = this.buffer.readUInt16LE(relPos);
		this.position += 2;
		return value;
	}

	readUInt32LE(): number {
		this.ensureBuffer(4);
		const relPos = this.position - this.bufferStart;
		const value = this.buffer.readUInt32LE(relPos);
		this.position += 4;
		return value;
	}

	readBigUInt64LE(): bigint {
		this.ensureBuffer(8);
		const relPos = this.position - this.bufferStart;
		const value = this.buffer.readBigUInt64LE(relPos);
		this.position += 8;
		return value;
	}

	isAtEnd(): boolean {
		return this.position >= this.fileSize;
	}

	close(): void {
		if (this.fd === null) throw new Error("File descriptor is null");
		closeSync(this.fd);
		this.fd = null;
	}
}
