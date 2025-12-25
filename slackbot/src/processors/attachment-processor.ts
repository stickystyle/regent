// ABOUTME: Attachment processor for handling Slack file attachments in brainstorming sessions.
// ABOUTME: Supports image processing for Claude vision API and text extraction from markdown/code/PDF files.

import { encodeBase64 } from "@std/encoding/base64";
import { ValidationError } from "../errors/types.ts";
import { RetryHandler } from "../errors/retry.ts";
import type { ProcessedAttachment } from "../types/message.ts";

/**
 * SlackFile represents a file from the Slack event payload.
 *
 * Contains metadata and download URL for files shared in Slack messages.
 */
export interface SlackFile {
  /** Unique file identifier (e.g., "F1234567890") */
  id: string;

  /** Original filename (e.g., "screenshot.png") */
  name: string;

  /** MIME type of the file (e.g., "image/png", "text/markdown") */
  mimetype: string;

  /** Private download URL (requires authentication) */
  url_private_download: string;

  /** File size in bytes */
  size: number;
}

/**
 * VisionContent represents the format required by Claude's vision API.
 *
 * Images are encoded as base64 data for inclusion in API requests.
 */
export interface VisionContent {
  /** Content type, always "image" for vision content */
  type: "image";

  /** Image source information */
  source: {
    /** Encoding type, always "base64" */
    type: "base64";

    /** MIME type of the image (e.g., "image/png") */
    media_type: string;

    /** Base64-encoded image data */
    data: string;
  };
}

/**
 * Download function type for fetching files from Slack.
 *
 * @param url - The URL to download from
 * @param token - Slack API token for authentication
 * @returns ArrayBuffer containing the file content
 */
export type DownloadFunction = (url: string, token: string) => Promise<ArrayBuffer>;

/**
 * TokenProvider function type for retrieving the Slack API token.
 *
 * This pattern avoids storing tokens as instance variables in memory.
 *
 * @returns Slack API token string
 */
export type TokenProvider = () => string;

/**
 * Allowed Slack file URL domains for security validation.
 */
const ALLOWED_SLACK_DOMAINS = [
  "https://files.slack.com/",
  "https://files-pri.slack.com/",
];

/**
 * Validates that a URL points to an allowed Slack file domain.
 *
 * @param url - The URL to validate
 * @returns true if the URL is from an allowed Slack domain
 * @throws ValidationError if the URL is not from an allowed Slack domain
 */
export function validateSlackFileUrl(url: string): boolean {
  const isValid = ALLOWED_SLACK_DOMAINS.some((domain) => url.startsWith(domain));
  if (!isValid) {
    throw new ValidationError(
      "Invalid file URL",
      `URL must start with an allowed Slack domain: ${ALLOWED_SLACK_DOMAINS.join(", ")}`,
      "Ensure the file URL is from Slack",
    );
  }
  return true;
}

/**
 * Size limits for different file types.
 */
const SIZE_LIMITS = {
  /** Maximum image size: 100 MB */
  IMAGE_MAX_BYTES: 100 * 1024 * 1024,

  /** Maximum text file size: 10 MB */
  TEXT_MAX_BYTES: 10 * 1024 * 1024,

  /** Maximum PDF size: 20 MB */
  PDF_MAX_BYTES: 20 * 1024 * 1024,
};

/**
 * Supported image MIME types for Claude vision API.
 */
const IMAGE_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
]);

/**
 * Supported text MIME types for text extraction.
 */
const TEXT_MIME_TYPES = new Set([
  "text/plain",
  "text/markdown",
  "text/x-markdown",
  "text/typescript",
  "text/javascript",
  "text/x-python",
  "text/x-java",
  "text/x-c",
  "text/x-cpp",
  "text/x-go",
  "text/x-rust",
  "text/html",
  "text/css",
  "text/xml",
  "text/yaml",
  "text/x-yaml",
  "application/json",
  "application/javascript",
  "application/typescript",
  "application/x-yaml",
]);

/**
 * Check if a file is an image based on MIME type.
 *
 * @param file - SlackFile to check
 * @returns true if the file is a supported image type
 */
export function isImageFile(file: SlackFile): boolean {
  return IMAGE_MIME_TYPES.has(file.mimetype);
}

/**
 * Check if a file is a text-based file.
 *
 * @param file - SlackFile to check
 * @returns true if the file is a supported text type
 */
export function isTextFile(file: SlackFile): boolean {
  return TEXT_MIME_TYPES.has(file.mimetype) || file.mimetype.startsWith("text/");
}

/**
 * Check if a file is a PDF.
 *
 * @param file - SlackFile to check
 * @returns true if the file is a PDF
 */
export function isPdfFile(file: SlackFile): boolean {
  return file.mimetype === "application/pdf";
}

/**
 * Check if a file type is supported for processing.
 *
 * @param file - SlackFile to check
 * @returns true if the file type is supported
 */
export function isSupportedFile(file: SlackFile): boolean {
  return isImageFile(file) || isTextFile(file) || isPdfFile(file);
}

/**
 * AttachmentProcessor interface for handling file attachments.
 *
 * Processes Slack files and prepares them for inclusion in Claude API requests.
 */
export interface AttachmentProcessor {
  /**
   * Download and process all attachments in a message.
   *
   * @param files - Array of SlackFile objects to process
   * @returns Array of processed attachments ready for Claude API
   */
  processFiles(files: SlackFile[]): Promise<ProcessedAttachment[]>;

  /**
   * Prepare an image for Claude vision API.
   *
   * Converts the image to base64-encoded format suitable for vision requests.
   *
   * @param file - SlackFile representing an image
   * @returns VisionContent object for Claude API
   */
  processImage(file: SlackFile): Promise<VisionContent>;

  /**
   * Extract text from PDF, markdown, or code files.
   *
   * @param file - SlackFile representing a text-based file
   * @returns Extracted text content
   */
  extractText(file: SlackFile): Promise<string>;

  /**
   * Verify file doesn't exceed Claude input limits.
   *
   * @param file - SlackFile to check
   * @returns true if file is within limits, false otherwise
   */
  checkSizeLimits(file: SlackFile): boolean;
}

/**
 * Real implementation of AttachmentProcessor.
 *
 * Downloads files from Slack and processes them for Claude API requests.
 * Uses TokenProvider pattern to avoid storing tokens in memory and
 * RetryHandler for resilient file downloads.
 */
export class AttachmentProcessorImpl implements AttachmentProcessor {
  private readonly download: DownloadFunction;
  private readonly getToken: TokenProvider;
  private readonly retryHandler: RetryHandler;

  /**
   * Create a new AttachmentProcessor.
   *
   * @param download - Function to download files from Slack
   * @param tokenProvider - Function that returns the Slack API token
   * @param retryHandler - Optional retry handler for downloads (defaults to standard config)
   */
  constructor(
    download: DownloadFunction,
    tokenProvider: TokenProvider,
    retryHandler?: RetryHandler,
  ) {
    this.download = download;
    this.getToken = tokenProvider;
    this.retryHandler = retryHandler ?? new RetryHandler();
  }

  async processFiles(files: SlackFile[]): Promise<ProcessedAttachment[]> {
    // Process files in parallel for efficiency
    const promises = files.map((file) => this.processFile(file));
    return await Promise.all(promises);
  }

  /**
   * Process a single file based on its type.
   */
  private async processFile(file: SlackFile): Promise<ProcessedAttachment> {
    // Check size limits first
    if (!this.checkSizeLimits(file)) {
      return {
        file_id: file.id,
        filename: file.name,
        mimetype: file.mimetype,
        content: `[File "${file.name}" exceeds size limit and could not be fully processed]`,
      };
    }

    // Process based on file type
    if (isImageFile(file)) {
      const vision = await this.processImage(file);
      return {
        file_id: file.id,
        filename: file.name,
        mimetype: file.mimetype,
        content: vision.source.data,
      };
    }

    if (isTextFile(file) || isPdfFile(file)) {
      const text = await this.extractText(file);
      return {
        file_id: file.id,
        filename: file.name,
        mimetype: file.mimetype,
        content: text,
      };
    }

    // Unsupported file type
    return {
      file_id: file.id,
      filename: file.name,
      mimetype: file.mimetype,
      content:
        `[File "${file.name}" has unsupported type "${file.mimetype}" and could not be fully processed]`,
    };
  }

  async processImage(file: SlackFile): Promise<VisionContent> {
    // Validate URL before downloading
    validateSlackFileUrl(file.url_private_download);

    const buffer = await this.downloadWithRetry(file.url_private_download);
    const base64 = encodeBase64(new Uint8Array(buffer));

    return {
      type: "image",
      source: {
        type: "base64",
        media_type: file.mimetype,
        data: base64,
      },
    };
  }

  async extractText(file: SlackFile): Promise<string> {
    // Validate URL before downloading
    validateSlackFileUrl(file.url_private_download);

    // For PDF files, return a user-friendly placeholder
    // Real PDF text extraction would require a PDF parsing library
    if (isPdfFile(file)) {
      return `[PDF attached: ${file.name} - text extraction pending enhanced PDF parser]`;
    }

    // For text files, download and decode as UTF-8
    const buffer = await this.downloadWithRetry(file.url_private_download);
    const decoder = new TextDecoder("utf-8");
    return decoder.decode(buffer);
  }

  checkSizeLimits(file: SlackFile): boolean {
    if (isImageFile(file)) {
      return file.size <= SIZE_LIMITS.IMAGE_MAX_BYTES;
    }

    if (isPdfFile(file)) {
      return file.size <= SIZE_LIMITS.PDF_MAX_BYTES;
    }

    if (isTextFile(file)) {
      return file.size <= SIZE_LIMITS.TEXT_MAX_BYTES;
    }

    // Unknown file types have a general limit
    return file.size <= SIZE_LIMITS.TEXT_MAX_BYTES;
  }

  /**
   * Download a file with retry logic for transient errors.
   *
   * @param url - The URL to download from
   * @returns ArrayBuffer containing the file content
   */
  private async downloadWithRetry(url: string): Promise<ArrayBuffer> {
    return await this.retryHandler.execute(async () => {
      const token = this.getToken();
      return await this.download(url, token);
    });
  }
}

/**
 * Mock AttachmentProcessor for testing.
 *
 * Provides configurable responses and error injection for tests.
 * Uses the same standalone type detection functions as the real implementation.
 */
export class MockAttachmentProcessor implements AttachmentProcessor {
  private error: Error | null = null;
  private validationErrorForUnsupported = false;
  private processedFiles: SlackFile[] = [];
  private fileContents: Map<string, string> = new Map();

  /**
   * Configure an error to be thrown by all operations.
   *
   * @param error - Error to throw
   */
  setError(error: Error): void {
    this.error = error;
  }

  /**
   * Configure whether to throw ValidationError for unsupported file types.
   *
   * @param value - Whether to throw ValidationError
   */
  setValidationErrorForUnsupported(value: boolean): void {
    this.validationErrorForUnsupported = value;
  }

  /**
   * Set custom content for a specific file.
   *
   * @param fileId - File ID
   * @param content - Content to return for this file
   */
  setFileContent(fileId: string, content: string): void {
    this.fileContents.set(fileId, content);
  }

  /**
   * Get all files that were processed.
   */
  getProcessedFiles(): SlackFile[] {
    return [...this.processedFiles];
  }

  /**
   * Clear all configured state.
   */
  clear(): void {
    this.error = null;
    this.validationErrorForUnsupported = false;
    this.processedFiles = [];
    this.fileContents.clear();
  }

  processFiles(files: SlackFile[]): Promise<ProcessedAttachment[]> {
    if (this.error !== null) {
      return Promise.reject(this.error);
    }

    const results: ProcessedAttachment[] = [];

    for (const file of files) {
      this.processedFiles.push(file);

      // Check for unsupported types if configured
      if (this.validationErrorForUnsupported && !isSupportedFile(file)) {
        return Promise.reject(
          new ValidationError(
            "Unsupported file type",
            `File "${file.name}" has unsupported MIME type "${file.mimetype}"`,
            "Upload a supported file type (image, text, or PDF)",
          ),
        );
      }

      // Check size limits
      if (!this.checkSizeLimits(file)) {
        results.push({
          file_id: file.id,
          filename: file.name,
          mimetype: file.mimetype,
          content: `[File "${file.name}" exceeds size limit and could not be fully processed]`,
        });
        continue;
      }

      // Check for unsupported file types
      if (!isSupportedFile(file)) {
        results.push({
          file_id: file.id,
          filename: file.name,
          mimetype: file.mimetype,
          content: `[File "${file.name}" has unsupported type and could not be fully processed]`,
        });
        continue;
      }

      // Return configured content or generate mock content
      const content = this.fileContents.get(file.id) ?? this.generateMockContent(file);

      results.push({
        file_id: file.id,
        filename: file.name,
        mimetype: file.mimetype,
        content,
      });
    }

    return Promise.resolve(results);
  }

  processImage(file: SlackFile): Promise<VisionContent> {
    if (this.error !== null) {
      return Promise.reject(this.error);
    }

    // Return mock vision content using Deno's encodeBase64
    const encoder = new TextEncoder();
    const mockBase64 = encodeBase64(encoder.encode(`mock-image-data-for-${file.id}`));

    return Promise.resolve({
      type: "image",
      source: {
        type: "base64",
        media_type: file.mimetype,
        data: mockBase64,
      },
    });
  }

  extractText(file: SlackFile): Promise<string> {
    if (this.error !== null) {
      return Promise.reject(this.error);
    }

    // Return configured content or generate mock content
    return Promise.resolve(this.fileContents.get(file.id) ?? this.generateMockContent(file));
  }

  checkSizeLimits(file: SlackFile): boolean {
    if (isImageFile(file)) {
      return file.size <= SIZE_LIMITS.IMAGE_MAX_BYTES;
    }

    if (isPdfFile(file)) {
      return file.size <= SIZE_LIMITS.PDF_MAX_BYTES;
    }

    if (isTextFile(file)) {
      return file.size <= SIZE_LIMITS.TEXT_MAX_BYTES;
    }

    // Unknown file types have a general limit
    return file.size <= SIZE_LIMITS.TEXT_MAX_BYTES;
  }

  /**
   * Generate mock content for a file.
   */
  private generateMockContent(file: SlackFile): string {
    if (isImageFile(file)) {
      const encoder = new TextEncoder();
      return encodeBase64(encoder.encode(`mock-image-data-for-${file.id}`));
    }
    return `Mock content for ${file.name}`;
  }
}
