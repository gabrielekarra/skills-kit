import fs from "node:fs/promises";
import path from "node:path";
import { createReadStream, createWriteStream } from "node:fs";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { Transform } from "node:stream";
import { randomBytes } from "node:crypto";
import os from "node:os";
import { compress, decompress, decompressAuto, type CompressionConfig } from "./compression.js";
import { streamManager, type StreamHandle } from "./stream-manager.js";

export interface FileInput {
  filename: string;
  mimeType: string;
  data?: string; // base64 (not present in streaming mode)
  size: number;
  originalSize: number;
  compression: "none" | "gzip" | "brotli";
  streaming?: boolean;
  streamPath?: string;
  streamId?: string;
}

export interface FileInputConfig {
  accept?: string[];
  maxSize?: string; // e.g., "10MB"
  compression?: "auto" | "none" | "gzip" | "brotli";
  streaming?: boolean;
  required?: boolean;
}

export interface FileOutput {
  filename: string;
  mimeType: string;
  data: string; // base64
  size: number;
  originalSize: number;
  compression: "none" | "gzip" | "brotli";
}

// ============ SIZE PARSING ============

const SIZE_UNITS: Record<string, number> = {
  B: 1,
  KB: 1024,
  MB: 1024 * 1024,
  GB: 1024 * 1024 * 1024,
  TB: 1024 * 1024 * 1024 * 1024
};

/**
 * Parse size string to bytes ("10MB" -> 10485760)
 */
export function parseSize(size: string): number {
  const match = /^(\d+(?:\.\d+)?)\s*([KMGT]?B)$/i.exec(size.trim());
  if (!match) {
    throw new Error(`Invalid size format: ${size}. Expected format like "10MB" or "1.5GB"`);
  }

  const value = parseFloat(match[1]);
  const unit = match[2].toUpperCase();
  const multiplier = SIZE_UNITS[unit];

  if (!multiplier) {
    throw new Error(`Unknown size unit: ${unit}`);
  }

  return Math.floor(value * multiplier);
}

/**
 * Format bytes to human readable
 */
export function formatSize(bytes: number): string {
  if (bytes === 0) return "0 B";

  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  return `${size.toFixed(unitIndex === 0 ? 0 : 2)} ${units[unitIndex]}`;
}

// ============ MIME TYPE VALIDATION ============

/**
 * Check if MIME type matches pattern (supports wildcards)
 */
export function matchesMimeType(mimeType: string, patterns: string[]): boolean {
  // Remove charset and other parameters
  const cleanMime = mimeType.split(";")[0].trim().toLowerCase();

  return patterns.some((pattern) => {
    const cleanPattern = pattern.trim().toLowerCase();

    // Exact match
    if (cleanPattern === cleanMime) {
      return true;
    }

    // Wildcard match (e.g., "image/*")
    if (cleanPattern.includes("*")) {
      const regex = new RegExp("^" + cleanPattern.replace(/\*/g, ".*") + "$");
      return regex.test(cleanMime);
    }

    return false;
  });
}

/**
 * Validate file against config
 */
export function validateFile(file: FileInput, config: FileInputConfig): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Check MIME type
  if (config.accept && config.accept.length > 0) {
    if (!matchesMimeType(file.mimeType, config.accept)) {
      errors.push(`File type "${file.mimeType}" not allowed. Accepted types: ${config.accept.join(", ")}`);
    }
  }

  // Check size
  if (config.maxSize) {
    const maxBytes = parseSize(config.maxSize);
    if (file.originalSize > maxBytes) {
      errors.push(`File size ${formatSize(file.originalSize)} exceeds maximum ${config.maxSize}`);
    }
  }

  // Validate streaming consistency
  if (file.streaming) {
    if (!file.streamPath || !file.streamId) {
      errors.push("Streaming file must have streamPath and streamId");
    }
    if (file.data) {
      errors.push("Streaming file should not have data field");
    }
  } else {
    if (!file.data) {
      errors.push("Non-streaming file must have data field");
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

// ============ STREAMING THRESHOLDS ============

export const STREAMING_CONFIG = {
  // Files above this size MUST use streaming
  forceStreamingThreshold: 50 * 1024 * 1024, // 50MB

  // Files above this size SHOULD use streaming (warning if not)
  recommendStreamingThreshold: 10 * 1024 * 1024, // 10MB

  // Maximum file size for non-streaming mode
  maxNonStreamingSize: 100 * 1024 * 1024, // 100MB

  // Chunk size for streaming reads
  defaultChunkSize: 64 * 1024 // 64KB
};

/**
 * Check if file should be processed as stream
 */
export function shouldStream(file: FileInput): boolean {
  return file.streaming === true || file.originalSize >= STREAMING_CONFIG.forceStreamingThreshold;
}

// ============ DECODING ============

/**
 * Decode base64 file to Buffer (handles compression automatically)
 */
export async function decodeFile(file: FileInput): Promise<Buffer> {
  if (file.streaming) {
    throw new Error("Cannot decode streaming file directly. Use getFileStream() or stream utilities.");
  }

  if (!file.data) {
    throw new Error("File has no data field");
  }

  // Decode base64
  const buffer = Buffer.from(file.data, "base64");

  // Decompress if needed
  if (file.compression !== "none") {
    return decompress(buffer, file.compression);
  }

  return buffer;
}

/**
 * Get readable stream for file (works for both modes)
 */
export function getFileStream(file: FileInput): Readable {
  if (file.streaming) {
    if (!file.streamId) {
      throw new Error("Streaming file missing streamId");
    }

    const handle = streamManager.getStreamHandle(file.streamId);
    if (!handle) {
      throw new Error(`Stream not found: ${file.streamId}`);
    }

    return streamManager.getDecompressedStream(handle);
  } else {
    // Create stream from base64 data
    if (!file.data) {
      throw new Error("File has no data field");
    }

    const buffer = Buffer.from(file.data, "base64");
    const stream = Readable.from([buffer]);

    // Add decompression if needed
    if (file.compression !== "none") {
      return Readable.from(
        (async function* () {
          const decompressed = await decompress(buffer, file.compression as "gzip" | "brotli");
          yield decompressed;
        })()
      );
    }

    return stream;
  }
}

/**
 * Read file as text (with encoding detection)
 */
export async function readFileAsText(file: FileInput, encoding: BufferEncoding = "utf-8"): Promise<string> {
  if (file.streaming) {
    // Read from stream
    const chunks: Buffer[] = [];
    const stream = getFileStream(file);

    for await (const chunk of stream) {
      chunks.push(chunk as Buffer);
    }

    return Buffer.concat(chunks).toString(encoding);
  } else {
    const buffer = await decodeFile(file);
    return buffer.toString(encoding);
  }
}

/**
 * Read file as JSON
 */
export async function readFileAsJson<T = unknown>(file: FileInput): Promise<T> {
  const text = await readFileAsText(file);
  return JSON.parse(text) as T;
}

// ============ ENCODING ============

/**
 * Create FileInput from local path
 */
export async function createFileInput(
  filePath: string,
  options?: {
    compression?: "auto" | "none" | "gzip" | "brotli";
    streaming?: boolean;
    mimeType?: string;
  }
): Promise<FileInput> {
  const stats = await fs.stat(filePath);
  const filename = path.basename(filePath);
  const mimeType = options?.mimeType || "application/octet-stream";

  // Determine if we should stream
  const useStreaming = options?.streaming === true || stats.size >= STREAMING_CONFIG.forceStreamingThreshold;

  if (useStreaming) {
    // Create stream handle
    const readStream = createReadStream(filePath);
    const handle = await streamManager.createStreamFromReadable(readStream, {
      filename,
      mimeType,
      compression: "none"
    });

    return {
      filename,
      mimeType,
      size: stats.size,
      originalSize: stats.size,
      compression: "none",
      streaming: true,
      streamPath: handle.path,
      streamId: handle.id
    };
  }

  // Read and optionally compress
  const buffer = await fs.readFile(filePath);

  const compressionMode = options?.compression || "auto";
  const compressionConfig: Partial<CompressionConfig> = {
    mode: compressionMode as any
  };

  const compressed = await compress(buffer, mimeType, compressionConfig);

  return {
    filename,
    mimeType,
    data: compressed.data.toString("base64"),
    size: compressed.compressedSize,
    originalSize: compressed.originalSize,
    compression: compressed.algorithm
  };
}

/**
 * Create FileInput from Buffer
 */
export async function createFileInputFromBuffer(
  buffer: Buffer,
  metadata: { filename: string; mimeType: string },
  options?: { compression?: "auto" | "none" | "gzip" | "brotli"; streaming?: boolean }
): Promise<FileInput> {
  const useStreaming = options?.streaming === true || buffer.length >= STREAMING_CONFIG.forceStreamingThreshold;

  if (useStreaming) {
    // Write to temp file and create stream
    const tempPath = path.join(os.tmpdir(), `skills-kit-${randomBytes(8).toString("hex")}-${metadata.filename}`);
    await fs.writeFile(tempPath, buffer);

    const readStream = createReadStream(tempPath);
    const handle = await streamManager.createStreamFromReadable(readStream, {
      filename: metadata.filename,
      mimeType: metadata.mimeType,
      compression: "none"
    });

    // Clean up temp file
    await fs.unlink(tempPath);

    return {
      filename: metadata.filename,
      mimeType: metadata.mimeType,
      size: buffer.length,
      originalSize: buffer.length,
      compression: "none",
      streaming: true,
      streamPath: handle.path,
      streamId: handle.id
    };
  }

  // Compress buffer
  const compressionMode = options?.compression || "auto";
  const compressed = await compress(buffer, metadata.mimeType, {
    mode: compressionMode as any
  });

  return {
    filename: metadata.filename,
    mimeType: metadata.mimeType,
    data: compressed.data.toString("base64"),
    size: compressed.compressedSize,
    originalSize: compressed.originalSize,
    compression: compressed.algorithm
  };
}

/**
 * Create FileOutput for skill response
 */
export async function createFileOutput(
  data: Buffer | string | Readable,
  metadata: { filename: string; mimeType: string },
  options?: { compression?: "auto" | "none" | "gzip" | "brotli" }
): Promise<FileOutput> {
  let buffer: Buffer;

  if (data instanceof Readable) {
    // Read stream into buffer
    const chunks: Buffer[] = [];
    for await (const chunk of data) {
      chunks.push(chunk as Buffer);
    }
    buffer = Buffer.concat(chunks);
  } else if (typeof data === "string") {
    buffer = Buffer.from(data, "utf-8");
  } else {
    buffer = data;
  }

  const compressionMode = options?.compression || "auto";
  const compressed = await compress(buffer, metadata.mimeType, {
    mode: compressionMode as any
  });

  return {
    filename: metadata.filename,
    mimeType: metadata.mimeType,
    data: compressed.data.toString("base64"),
    size: compressed.compressedSize,
    originalSize: compressed.originalSize,
    compression: compressed.algorithm
  };
}

// ============ STREAMING HELPERS ============

/**
 * Create line-by-line reader for text files
 */
export async function* createLineReader(file: FileInput, options?: { encoding?: BufferEncoding }): AsyncIterable<string> {
  const stream = getFileStream(file);
  const encoding = options?.encoding || "utf-8";

  let buffer = "";

  for await (const chunk of stream) {
    buffer += (chunk as Buffer).toString(encoding);

    let lineEnd = buffer.indexOf("\n");
    while (lineEnd !== -1) {
      const line = buffer.slice(0, lineEnd);
      yield line.replace(/\r$/, ""); // Remove \r if present

      buffer = buffer.slice(lineEnd + 1);
      lineEnd = buffer.indexOf("\n");
    }
  }

  // Yield remaining buffer if any
  if (buffer.length > 0) {
    yield buffer.replace(/\r$/, "");
  }
}

/**
 * Create JSON lines reader
 */
export async function* createJsonLinesReader<T = unknown>(file: FileInput): AsyncIterable<T> {
  for await (const line of createLineReader(file)) {
    if (line.trim().length > 0) {
      yield JSON.parse(line) as T;
    }
  }
}

/**
 * Create CSV reader (simple implementation - returns objects)
 */
export async function* createCsvReader<T = Record<string, string>>(
  file: FileInput,
  options?: { headers?: boolean; delimiter?: string }
): AsyncIterable<T> {
  const hasHeaders = options?.headers !== false;
  const delimiter = options?.delimiter || ",";

  const lineReader = createLineReader(file);
  let headers: string[] = [];
  let firstLine = true;

  for await (const line of lineReader) {
    if (firstLine) {
      firstLine = false;

      if (hasHeaders) {
        headers = line.split(delimiter).map((h) => h.trim());
        continue;
      } else {
        // Generate numeric headers
        const values = line.split(delimiter);
        headers = values.map((_, i) => String(i));
      }
    }

    const values = line.split(delimiter);
    const row: Record<string, string> = {};

    for (let i = 0; i < headers.length; i++) {
      row[headers[i]] = values[i]?.trim() || "";
    }

    yield row as T;
  }
}

// ============ TEMP FILES ============

/**
 * Save file to temp directory, return path
 */
export async function saveToTemp(file: FileInput, prefix?: string): Promise<string> {
  const tempDir = os.tmpdir();
  const filename = prefix ? `${prefix}-${file.filename}` : file.filename;
  const tempPath = path.join(tempDir, filename);

  if (file.streaming && file.streamPath) {
    // Copy stream file
    await fs.copyFile(file.streamPath, tempPath);
  } else if (file.data) {
    // Decode and save
    const buffer = await decodeFile(file);
    await fs.writeFile(tempPath, buffer);
  } else {
    throw new Error("File has neither streamPath nor data");
  }

  return tempPath;
}

/**
 * Clean up temp files
 */
export async function cleanupTempFiles(paths: string[]): Promise<void> {
  await Promise.allSettled(paths.map((p) => fs.unlink(p)));
}
