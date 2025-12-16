import {
  type FileInput,
  type FileInputConfig,
  type FileOutput,
  streamManager,
  STREAMING_CONFIG,
  validateFile,
  compress
} from "@skills-kit/core";

export interface FileUploadConfig {
  maxFileSize: number;
  maxTotalSize: number;
  allowedMimeTypes: string[];
  compressionEnabled: boolean;
  streamingThreshold: number;
  tempDir: string;
}

const DEFAULT_FILE_UPLOAD_CONFIG: FileUploadConfig = {
  maxFileSize: 100 * 1024 * 1024, // 100MB
  maxTotalSize: 1024 * 1024 * 1024, // 1GB
  allowedMimeTypes: ["*/*"],
  compressionEnabled: true,
  streamingThreshold: STREAMING_CONFIG.forceStreamingThreshold,
  tempDir: ""
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export class MCPFileHandler {
  private config: FileUploadConfig;
  private requestFileSizes: Map<string, number> = new Map();

  constructor(config?: Partial<FileUploadConfig>) {
    this.config = { ...DEFAULT_FILE_UPLOAD_CONFIG, ...config };
  }

  /**
   * Process incoming file from MCP request
   */
  async processIncomingFile(fileData: unknown, inputConfig: FileInputConfig): Promise<FileInput> {
    if (!isRecord(fileData)) {
      throw new Error("File data must be an object");
    }

    // Validate required fields
    if (!fileData.filename || typeof fileData.filename !== "string") {
      throw new Error("File missing filename");
    }

    if (!fileData.mimeType || typeof fileData.mimeType !== "string") {
      throw new Error("File missing mimeType");
    }

    if (typeof fileData.size !== "number") {
      throw new Error("File missing size");
    }

    if (typeof fileData.originalSize !== "number") {
      throw new Error("File missing originalSize");
    }

    // Check if streaming or has data
    const hasData = typeof fileData.data === "string";
    const isStreaming = fileData.streaming === true;

    if (!hasData && !isStreaming) {
      throw new Error("File must have either data or streaming enabled");
    }

    if (isStreaming && (!fileData.streamPath || !fileData.streamId)) {
      throw new Error("Streaming file must have streamPath and streamId");
    }

    // Create FileInput object
    const fileInput: FileInput = {
      filename: fileData.filename,
      mimeType: fileData.mimeType,
      size: fileData.size,
      originalSize: fileData.originalSize,
      compression: (fileData.compression as "none" | "gzip" | "brotli") || "none",
      streaming: isStreaming
    };

    if (hasData) {
      fileInput.data = fileData.data as string;
    }

    if (isStreaming) {
      fileInput.streamPath = fileData.streamPath as string;
      fileInput.streamId = fileData.streamId as string;
    }

    // Validate file against config
    const validation = validateFile(fileInput, inputConfig);
    if (!validation.valid) {
      throw new Error(`File validation failed: ${validation.errors.join(", ")}`);
    }

    // Check server-wide size limits
    if (fileInput.originalSize > this.config.maxFileSize) {
      throw new Error(
        `File size ${fileInput.originalSize} exceeds server maximum ${this.config.maxFileSize}`
      );
    }

    // If file is large and not streaming, convert to streaming
    if (!fileInput.streaming && fileInput.originalSize >= this.config.streamingThreshold) {
      if (fileInput.data) {
        // Create stream from base64 data
        const handle = await streamManager.createStream({
          filename: fileInput.filename,
          mimeType: fileInput.mimeType,
          data: fileInput.data,
          size: fileInput.size,
          originalSize: fileInput.originalSize,
          compression: fileInput.compression
        });

        fileInput.streaming = true;
        fileInput.streamPath = handle.path;
        fileInput.streamId = handle.id;
        delete fileInput.data;
      }
    }

    return fileInput;
  }

  /**
   * Prepare file output for MCP response
   */
  async prepareOutgoingFile(file: FileOutput, compressOutput?: boolean): Promise<FileOutput> {
    // File is already in the correct format
    // Optionally re-compress if requested
    if (compressOutput && this.config.compressionEnabled && file.compression === "none") {
      const buffer = Buffer.from(file.data, "base64");
      const compressed = await compress(buffer, file.mimeType, { mode: "auto" });

      return {
        ...file,
        data: compressed.data.toString("base64"),
        size: compressed.compressedSize,
        compression: compressed.algorithm
      };
    }

    return file;
  }

  /**
   * Clean up all temp files from a request
   */
  cleanupRequest(requestId: string): void {
    // Cleanup tracked request
    this.requestFileSizes.delete(requestId);

    // Stream manager handles its own cleanup
  }

  /**
   * Track total file size for a request
   */
  trackRequestFileSize(requestId: string, fileSize: number): void {
    const current = this.requestFileSizes.get(requestId) || 0;
    const newTotal = current + fileSize;

    if (newTotal > this.config.maxTotalSize) {
      throw new Error(
        `Total request file size ${newTotal} exceeds maximum ${this.config.maxTotalSize}`
      );
    }

    this.requestFileSizes.set(requestId, newTotal);
  }
}
