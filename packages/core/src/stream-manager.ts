import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { randomBytes } from "node:crypto";
import { pipeline } from "node:stream/promises";
import { createReadStream, createWriteStream } from "node:fs";
import { createGunzip, createBrotliDecompress } from "node:zlib";
import type { Readable } from "node:stream";

export interface StreamConfig {
  tempDir?: string; // Default: os.tmpdir()
  chunkSize: number; // Default: 64KB
  maxConcurrentStreams: number; // Default: 10
  streamTimeout: number; // Default: 5 minutes
  cleanupOnExit: boolean; // Default: true
}

export interface StreamHandle {
  id: string;
  path: string;
  filename: string;
  mimeType: string;
  size: number;
  originalSize?: number;
  compression: "none" | "gzip" | "brotli";
  createdAt: Date;
}

interface StreamMetadata {
  handle: StreamHandle;
  timer: NodeJS.Timeout | null;
}

const DEFAULT_CONFIG: Required<StreamConfig> = {
  tempDir: path.join(os.tmpdir(), "skills-kit-streams"),
  chunkSize: 64 * 1024, // 64KB
  maxConcurrentStreams: 10,
  streamTimeout: 5 * 60 * 1000, // 5 minutes
  cleanupOnExit: true
};

export class StreamManager {
  private config: Required<StreamConfig>;
  private streams: Map<string, StreamMetadata> = new Map();
  private cleanupHandlersInstalled = false;

  constructor(config?: Partial<StreamConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };

    // Ensure temp directory exists
    if (!fs.existsSync(this.config.tempDir)) {
      fs.mkdirSync(this.config.tempDir, { recursive: true });
    }

    if (this.config.cleanupOnExit && !this.cleanupHandlersInstalled) {
      this.installCleanupHandlers();
      this.cleanupHandlersInstalled = true;
    }
  }

  private installCleanupHandlers() {
    const cleanup = () => {
      this.cleanupAll().catch(() => {
        // Ignore errors during cleanup
      });
    };

    process.on("exit", cleanup);
    process.on("SIGINT", cleanup);
    process.on("SIGTERM", cleanup);
    process.on("uncaughtException", cleanup);
  }

  private generateStreamId(): string {
    return randomBytes(16).toString("hex");
  }

  private getStreamPath(id: string): string {
    return path.join(this.config.tempDir, id);
  }

  /**
   * Create a stream from base64 data (writes to temp file)
   */
  async createStream(file: {
    filename: string;
    mimeType: string;
    data: string;
    size: number;
    originalSize?: number;
    compression?: "none" | "gzip" | "brotli";
  }): Promise<StreamHandle> {
    if (this.streams.size >= this.config.maxConcurrentStreams) {
      throw new Error(`Maximum concurrent streams (${this.config.maxConcurrentStreams}) exceeded`);
    }

    const id = this.generateStreamId();
    const streamPath = this.getStreamPath(id);

    // Decode base64 and write to file
    const buffer = Buffer.from(file.data, "base64");
    await fs.promises.writeFile(streamPath, buffer);

    const handle: StreamHandle = {
      id,
      path: streamPath,
      filename: file.filename,
      mimeType: file.mimeType,
      size: file.size,
      originalSize: file.originalSize,
      compression: file.compression || "none",
      createdAt: new Date()
    };

    // Set timeout to auto-cleanup
    const timer = setTimeout(() => {
      this.cleanup(id).catch(() => {
        // Ignore cleanup errors
      });
    }, this.config.streamTimeout);

    this.streams.set(id, { handle, timer });

    return handle;
  }

  /**
   * Create a stream from a readable stream
   */
  async createStreamFromReadable(
    readable: Readable,
    metadata: { filename: string; mimeType: string; compression?: "none" | "gzip" | "brotli" }
  ): Promise<StreamHandle> {
    if (this.streams.size >= this.config.maxConcurrentStreams) {
      throw new Error(`Maximum concurrent streams (${this.config.maxConcurrentStreams}) exceeded`);
    }

    const id = this.generateStreamId();
    const streamPath = this.getStreamPath(id);

    // Pipe readable stream to temp file
    const writeStream = createWriteStream(streamPath);
    await pipeline(readable, writeStream);

    const stats = await fs.promises.stat(streamPath);

    const handle: StreamHandle = {
      id,
      path: streamPath,
      filename: metadata.filename,
      mimeType: metadata.mimeType,
      size: stats.size,
      compression: metadata.compression || "none",
      createdAt: new Date()
    };

    // Set timeout
    const timer = setTimeout(() => {
      this.cleanup(id).catch(() => {
        // Ignore cleanup errors
      });
    }, this.config.streamTimeout);

    this.streams.set(id, { handle, timer });

    return handle;
  }

  /**
   * Get readable stream for a handle
   */
  getReadStream(handle: StreamHandle): Readable {
    if (!fs.existsSync(handle.path)) {
      throw new Error(`Stream file not found: ${handle.id}`);
    }

    return createReadStream(handle.path, {
      highWaterMark: this.config.chunkSize
    });
  }

  /**
   * Get readable stream with automatic decompression
   */
  getDecompressedStream(handle: StreamHandle): Readable {
    const readStream = this.getReadStream(handle);

    if (handle.compression === "gzip") {
      return readStream.pipe(createGunzip());
    } else if (handle.compression === "brotli") {
      return readStream.pipe(createBrotliDecompress());
    }

    return readStream;
  }

  /**
   * Read stream in chunks (async generator)
   */
  async *readChunks(handle: StreamHandle, chunkSize?: number): AsyncGenerator<Buffer> {
    const stream = this.getReadStream(handle);
    const size = chunkSize || this.config.chunkSize;

    // Override highWaterMark if custom chunk size
    if (chunkSize) {
      stream.setMaxListeners(size);
    }

    for await (const chunk of stream) {
      yield chunk as Buffer;
    }
  }

  /**
   * Clean up a specific stream
   */
  async cleanup(streamId: string): Promise<void> {
    const metadata = this.streams.get(streamId);
    if (!metadata) {
      return;
    }

    // Clear timeout
    if (metadata.timer) {
      clearTimeout(metadata.timer);
    }

    // Delete file
    try {
      await fs.promises.unlink(metadata.handle.path);
    } catch {
      // File might already be deleted
    }

    this.streams.delete(streamId);
  }

  /**
   * Clean up all streams
   */
  async cleanupAll(): Promise<void> {
    const promises = Array.from(this.streams.keys()).map((id) => this.cleanup(id));
    await Promise.allSettled(promises);

    // Try to remove temp directory if empty
    try {
      const files = await fs.promises.readdir(this.config.tempDir);
      if (files.length === 0) {
        await fs.promises.rmdir(this.config.tempDir);
      }
    } catch {
      // Ignore errors
    }
  }

  /**
   * Get active streams info
   */
  getActiveStreams(): StreamHandle[] {
    return Array.from(this.streams.values()).map((m) => m.handle);
  }

  /**
   * Get stream handle by ID
   */
  getStreamHandle(streamId: string): StreamHandle | undefined {
    return this.streams.get(streamId)?.handle;
  }

  /**
   * Refresh stream timeout
   */
  refreshTimeout(streamId: string): void {
    const metadata = this.streams.get(streamId);
    if (!metadata) {
      return;
    }

    // Clear old timeout
    if (metadata.timer) {
      clearTimeout(metadata.timer);
    }

    // Set new timeout
    metadata.timer = setTimeout(() => {
      this.cleanup(streamId).catch(() => {
        // Ignore cleanup errors
      });
    }, this.config.streamTimeout);
  }
}

// Global singleton instance
export const streamManager = new StreamManager();
