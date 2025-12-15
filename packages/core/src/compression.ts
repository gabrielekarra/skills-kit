import { gunzip as gunzipCb, gzip as gzipCb, brotliCompress as brotliCompressCb, brotliDecompress as brotliDecompressCb, constants } from "node:zlib";
import { promisify } from "node:util";

const gunzip = promisify(gunzipCb);
const gzip = promisify(gzipCb);
const brotliCompress = promisify(brotliCompressCb);
const brotliDecompress = promisify(brotliDecompressCb);

export interface CompressionConfig {
  mode: "auto" | "none" | "gzip" | "brotli";
  threshold: number; // Min size to compress (bytes)
  level: number; // Compression level 1-9
}

export interface CompressionResult {
  data: Buffer;
  algorithm: "none" | "gzip" | "brotli";
  originalSize: number;
  compressedSize: number;
  ratio: number; // e.g., 0.45 = 45% of original
}

export const DEFAULT_COMPRESSION: CompressionConfig = {
  mode: "auto",
  threshold: 1024, // 1KB
  level: 6
};

// MIME types that are already compressed
const ALREADY_COMPRESSED_MIMES = [
  "application/zip",
  "application/gzip",
  "application/x-gzip",
  "application/x-bzip2",
  "application/x-7z-compressed",
  "application/x-rar-compressed",
  "application/x-xz",
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
  "video/",
  "audio/"
];

// Text-heavy MIME types that benefit more from brotli
const TEXT_HEAVY_MIMES = [
  "application/json",
  "application/xml",
  "text/",
  "application/javascript",
  "application/csv",
  "text/csv",
  "application/ld+json",
  "application/x-ndjson"
];

/**
 * Check if a MIME type is already compressed
 */
export function isCompressedMimeType(mimeType: string): boolean {
  return ALREADY_COMPRESSED_MIMES.some((pattern) => {
    if (pattern.endsWith("/")) {
      return mimeType.startsWith(pattern);
    }
    return mimeType === pattern || mimeType.startsWith(pattern + ";");
  });
}

/**
 * Check if a MIME type is text-heavy (benefits from brotli)
 */
function isTextHeavyMimeType(mimeType: string): boolean {
  return TEXT_HEAVY_MIMES.some((pattern) => {
    if (pattern.endsWith("/")) {
      return mimeType.startsWith(pattern);
    }
    return mimeType === pattern || mimeType.startsWith(pattern + ";");
  });
}

/**
 * Compress data with gzip
 */
export async function compressGzip(data: Buffer, level: number = 6): Promise<Buffer> {
  return gzip(data, {
    level: Math.max(1, Math.min(9, level))
  });
}

/**
 * Compress data with brotli
 */
export async function compressBrotli(data: Buffer, level: number = 6): Promise<Buffer> {
  return brotliCompress(data, {
    params: {
      [constants.BROTLI_PARAM_QUALITY]: Math.max(1, Math.min(11, level))
    }
  });
}

/**
 * Decompress gzip data
 */
export async function decompressGzip(data: Buffer): Promise<Buffer> {
  return gunzip(data);
}

/**
 * Decompress brotli data
 */
export async function decompressBrotli(data: Buffer): Promise<Buffer> {
  return brotliDecompress(data);
}

/**
 * Decompress data with known algorithm
 */
export async function decompress(data: Buffer, algorithm: "gzip" | "brotli"): Promise<Buffer> {
  if (algorithm === "gzip") {
    return decompressGzip(data);
  } else if (algorithm === "brotli") {
    return decompressBrotli(data);
  }
  throw new Error(`Unsupported compression algorithm: ${algorithm}`);
}

/**
 * Auto-detect compression from buffer header and decompress
 */
export async function decompressAuto(data: Buffer): Promise<Buffer> {
  // Check for gzip magic bytes (1f 8b)
  if (data.length >= 2 && data[0] === 0x1f && data[1] === 0x8b) {
    return decompressGzip(data);
  }

  // Check for brotli magic bytes (ce b2 cf 81)
  if (data.length >= 4 && data[0] === 0xce && data[1] === 0xb2 && data[2] === 0xcf && data[3] === 0x81) {
    return decompressBrotli(data);
  }

  // If no compression detected, return as-is
  return data;
}

/**
 * Estimate compression ratio without full compression (uses sampling)
 */
export async function estimateCompressionRatio(data: Buffer, sampleSize: number = 8192): Promise<number> {
  if (data.length <= sampleSize) {
    // Compress small data fully
    const compressed = await compressGzip(data, 1); // Fast compression for estimation
    return compressed.length / data.length;
  }

  // Sample from beginning, middle, and end
  const chunkSize = Math.floor(sampleSize / 3);
  const start = data.subarray(0, chunkSize);
  const middle = data.subarray(Math.floor(data.length / 2) - Math.floor(chunkSize / 2), Math.floor(data.length / 2) + Math.floor(chunkSize / 2));
  const end = data.subarray(data.length - chunkSize);

  const sample = Buffer.concat([start, middle, end]);
  const compressed = await compressGzip(sample, 1);

  return compressed.length / sample.length;
}

/**
 * Compress data with automatic algorithm selection
 *
 * Auto mode logic:
 * 1. Skip if file < threshold
 * 2. Skip if already compressed format
 * 3. Use brotli for text-heavy files
 * 4. Use gzip for others
 * 5. Only compress if savings > 10%
 */
export async function compressAuto(
  data: Buffer,
  mimeType: string,
  config?: Partial<CompressionConfig>
): Promise<CompressionResult> {
  const cfg = { ...DEFAULT_COMPRESSION, ...config };
  const originalSize = data.length;

  // Skip if below threshold
  if (originalSize < cfg.threshold) {
    return {
      data,
      algorithm: "none",
      originalSize,
      compressedSize: originalSize,
      ratio: 1.0
    };
  }

  // Skip if already compressed
  if (isCompressedMimeType(mimeType)) {
    return {
      data,
      algorithm: "none",
      originalSize,
      compressedSize: originalSize,
      ratio: 1.0
    };
  }

  // Choose algorithm based on MIME type
  const usesBrotli = isTextHeavyMimeType(mimeType);
  const algorithm = usesBrotli ? "brotli" : "gzip";

  // Compress
  const compressed = usesBrotli ? await compressBrotli(data, cfg.level) : await compressGzip(data, cfg.level);

  const compressedSize = compressed.length;
  const ratio = compressedSize / originalSize;

  // Only use compression if we save at least 10%
  if (ratio > 0.9) {
    return {
      data,
      algorithm: "none",
      originalSize,
      compressedSize: originalSize,
      ratio: 1.0
    };
  }

  return {
    data: compressed,
    algorithm,
    originalSize,
    compressedSize,
    ratio
  };
}

/**
 * Compress with specific mode
 */
export async function compress(
  data: Buffer,
  mimeType: string,
  config?: Partial<CompressionConfig>
): Promise<CompressionResult> {
  const cfg = { ...DEFAULT_COMPRESSION, ...config };
  const originalSize = data.length;

  if (cfg.mode === "none") {
    return {
      data,
      algorithm: "none",
      originalSize,
      compressedSize: originalSize,
      ratio: 1.0
    };
  }

  if (cfg.mode === "auto") {
    return compressAuto(data, mimeType, cfg);
  }

  // Specific algorithm requested
  const compressed = cfg.mode === "brotli" ? await compressBrotli(data, cfg.level) : await compressGzip(data, cfg.level);

  const compressedSize = compressed.length;
  const ratio = compressedSize / originalSize;

  return {
    data: compressed,
    algorithm: cfg.mode,
    originalSize,
    compressedSize,
    ratio
  };
}
