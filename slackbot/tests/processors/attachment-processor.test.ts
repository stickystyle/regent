// ABOUTME: Tests for attachment processing with image, text, and PDF file handling.
// ABOUTME: Validates Property 7 - attachment inclusion in Claude requests for vision API and text extraction.

import { assertEquals, assertRejects } from "@std/assert";
import { afterEach, beforeEach, describe, it } from "@std/testing/bdd";
import {
  AttachmentProcessorImpl,
  isImageFile,
  isPdfFile,
  isTextFile,
  MockAttachmentProcessor,
  SlackFile,
  validateSlackFileUrl,
} from "../../src/processors/attachment-processor.ts";
import { NetworkTimeoutError, ValidationError } from "../../src/errors/types.ts";

describe("AttachmentProcessor", () => {
  describe("MockAttachmentProcessor", () => {
    let processor: MockAttachmentProcessor;

    beforeEach(() => {
      processor = new MockAttachmentProcessor();
    });

    afterEach(() => {
      processor.clear();
    });

    describe("processFiles", () => {
      it("should process multiple files and return processed attachments", async () => {
        const files: SlackFile[] = [
          {
            id: "F1234567890",
            name: "image.png",
            mimetype: "image/png",
            url_private_download: "https://files.slack.com/image.png",
            size: 1024,
          },
          {
            id: "F0987654321",
            name: "notes.md",
            mimetype: "text/markdown",
            url_private_download: "https://files.slack.com/notes.md",
            size: 512,
          },
        ];

        const result = await processor.processFiles(files);

        assertEquals(result.length, 2);
        assertEquals(result[0].file_id, "F1234567890");
        assertEquals(result[0].filename, "image.png");
        assertEquals(result[1].file_id, "F0987654321");
        assertEquals(result[1].filename, "notes.md");
      });

      it("should return empty array for empty input", async () => {
        const result = await processor.processFiles([]);

        assertEquals(result, []);
      });

      it("should throw configured error", async () => {
        const error = new NetworkTimeoutError(
          "Download timeout",
          "Failed to download file",
          "Try again later",
        );
        processor.setError(error);

        await assertRejects(
          () =>
            processor.processFiles([
              {
                id: "F123",
                name: "test.txt",
                mimetype: "text/plain",
                url_private_download: "https://files.slack.com/test.txt",
                size: 100,
              },
            ]),
          NetworkTimeoutError,
        );
      });
    });

    describe("processImage", () => {
      it("should return vision content for PNG image", async () => {
        const file: SlackFile = {
          id: "F1234567890",
          name: "screenshot.png",
          mimetype: "image/png",
          url_private_download: "https://files.slack.com/screenshot.png",
          size: 2048,
        };

        const result = await processor.processImage(file);

        assertEquals(result.type, "image");
        assertEquals(result.source.type, "base64");
        assertEquals(result.source.media_type, "image/png");
        assertEquals(typeof result.source.data, "string");
      });

      it("should return vision content for JPEG image", async () => {
        const file: SlackFile = {
          id: "F1234567890",
          name: "photo.jpg",
          mimetype: "image/jpeg",
          url_private_download: "https://files.slack.com/photo.jpg",
          size: 4096,
        };

        const result = await processor.processImage(file);

        assertEquals(result.type, "image");
        assertEquals(result.source.media_type, "image/jpeg");
      });

      it("should return vision content for GIF image", async () => {
        const file: SlackFile = {
          id: "F1234567890",
          name: "animation.gif",
          mimetype: "image/gif",
          url_private_download: "https://files.slack.com/animation.gif",
          size: 3072,
        };

        const result = await processor.processImage(file);

        assertEquals(result.type, "image");
        assertEquals(result.source.media_type, "image/gif");
      });

      it("should return vision content for WebP image", async () => {
        const file: SlackFile = {
          id: "F1234567890",
          name: "modern.webp",
          mimetype: "image/webp",
          url_private_download: "https://files.slack.com/modern.webp",
          size: 1536,
        };

        const result = await processor.processImage(file);

        assertEquals(result.type, "image");
        assertEquals(result.source.media_type, "image/webp");
      });
    });

    describe("extractText", () => {
      it("should extract text from markdown files", async () => {
        const file: SlackFile = {
          id: "F1234567890",
          name: "readme.md",
          mimetype: "text/markdown",
          url_private_download: "https://files.slack.com/readme.md",
          size: 256,
        };

        const result = await processor.extractText(file);

        assertEquals(typeof result, "string");
        assertEquals(result.length > 0, true);
      });

      it("should extract text from plain text files", async () => {
        const file: SlackFile = {
          id: "F1234567890",
          name: "notes.txt",
          mimetype: "text/plain",
          url_private_download: "https://files.slack.com/notes.txt",
          size: 128,
        };

        const result = await processor.extractText(file);

        assertEquals(typeof result, "string");
      });

      it("should extract text from TypeScript code files", async () => {
        const file: SlackFile = {
          id: "F1234567890",
          name: "component.ts",
          mimetype: "text/typescript",
          url_private_download: "https://files.slack.com/component.ts",
          size: 512,
        };

        const result = await processor.extractText(file);

        assertEquals(typeof result, "string");
      });

      it("should extract text from JavaScript code files", async () => {
        const file: SlackFile = {
          id: "F1234567890",
          name: "script.js",
          mimetype: "text/javascript",
          url_private_download: "https://files.slack.com/script.js",
          size: 384,
        };

        const result = await processor.extractText(file);

        assertEquals(typeof result, "string");
      });

      it("should extract text from Python code files", async () => {
        const file: SlackFile = {
          id: "F1234567890",
          name: "main.py",
          mimetype: "text/x-python",
          url_private_download: "https://files.slack.com/main.py",
          size: 256,
        };

        const result = await processor.extractText(file);

        assertEquals(typeof result, "string");
      });

      it("should extract text from PDF files", async () => {
        const file: SlackFile = {
          id: "F1234567890",
          name: "document.pdf",
          mimetype: "application/pdf",
          url_private_download: "https://files.slack.com/document.pdf",
          size: 10240,
        };

        const result = await processor.extractText(file);

        assertEquals(typeof result, "string");
      });
    });

    describe("checkSizeLimits", () => {
      it("should return true for files within size limits", () => {
        const file: SlackFile = {
          id: "F1234567890",
          name: "small.png",
          mimetype: "image/png",
          url_private_download: "https://files.slack.com/small.png",
          size: 1024 * 1024, // 1 MB
        };

        const result = processor.checkSizeLimits(file);

        assertEquals(result, true);
      });

      it("should return false for images exceeding 100MB limit", () => {
        const file: SlackFile = {
          id: "F1234567890",
          name: "huge.png",
          mimetype: "image/png",
          url_private_download: "https://files.slack.com/huge.png",
          size: 150 * 1024 * 1024, // 150 MB
        };

        const result = processor.checkSizeLimits(file);

        assertEquals(result, false);
      });

      it("should return false for text files exceeding 10MB limit", () => {
        const file: SlackFile = {
          id: "F1234567890",
          name: "massive.txt",
          mimetype: "text/plain",
          url_private_download: "https://files.slack.com/massive.txt",
          size: 15 * 1024 * 1024, // 15 MB
        };

        const result = processor.checkSizeLimits(file);

        assertEquals(result, false);
      });
    });

    describe("Mock state management", () => {
      it("should clear configured errors", async () => {
        const error = new NetworkTimeoutError("Test", "Test", "Test");
        processor.setError(error);
        processor.clear();

        // Should succeed after clear (no error configured)
        const result = await processor.processFiles([]);
        assertEquals(result, []);
      });

      it("should record processed files", async () => {
        const files: SlackFile[] = [
          {
            id: "F123",
            name: "test.txt",
            mimetype: "text/plain",
            url_private_download: "https://files.slack.com/test.txt",
            size: 100,
          },
        ];

        await processor.processFiles(files);

        const processed = processor.getProcessedFiles();
        assertEquals(processed.length, 1);
        assertEquals(processed[0].id, "F123");
      });

      it("should allow setting custom file content", async () => {
        const customContent = "# Custom Content\n\nThis is custom test content.";
        processor.setFileContent("F123", customContent);

        const file: SlackFile = {
          id: "F123",
          name: "custom.md",
          mimetype: "text/markdown",
          url_private_download: "https://files.slack.com/custom.md",
          size: 100,
        };

        const result = await processor.extractText(file);

        assertEquals(result, customContent);
      });
    });
  });

  describe("File type detection (standalone functions)", () => {
    it("should detect image files by MIME type", () => {
      const imageTypes = ["image/png", "image/jpeg", "image/gif", "image/webp"];

      for (const mimetype of imageTypes) {
        const file: SlackFile = {
          id: "F123",
          name: `file.${mimetype.split("/")[1]}`,
          mimetype,
          url_private_download: "https://files.slack.com/file",
          size: 1024,
        };

        const result = isImageFile(file);
        assertEquals(result, true, `${mimetype} should be detected as image`);
      }
    });

    it("should detect text files by MIME type", () => {
      const textTypes = [
        "text/plain",
        "text/markdown",
        "text/typescript",
        "text/javascript",
        "text/x-python",
        "application/javascript",
      ];

      for (const mimetype of textTypes) {
        const file: SlackFile = {
          id: "F123",
          name: "file.txt",
          mimetype,
          url_private_download: "https://files.slack.com/file",
          size: 1024,
        };

        const result = isTextFile(file);
        assertEquals(result, true, `${mimetype} should be detected as text`);
      }
    });

    it("should detect PDF files by MIME type", () => {
      const file: SlackFile = {
        id: "F123",
        name: "document.pdf",
        mimetype: "application/pdf",
        url_private_download: "https://files.slack.com/document.pdf",
        size: 1024,
      };

      const result = isPdfFile(file);
      assertEquals(result, true);
    });

    it("should return false for unsupported file types", () => {
      const file: SlackFile = {
        id: "F123",
        name: "archive.zip",
        mimetype: "application/zip",
        url_private_download: "https://files.slack.com/archive.zip",
        size: 1024,
      };

      assertEquals(isImageFile(file), false);
      assertEquals(isTextFile(file), false);
      assertEquals(isPdfFile(file), false);
    });
  });

  describe("Error handling", () => {
    let processor: MockAttachmentProcessor;

    beforeEach(() => {
      processor = new MockAttachmentProcessor();
    });

    afterEach(() => {
      processor.clear();
    });

    it("should throw NetworkTimeoutError on download timeout", async () => {
      const error = new NetworkTimeoutError(
        "Download timeout",
        "Connection timed out while downloading file",
        "Check network connection and try again",
      );
      processor.setError(error);

      const file: SlackFile = {
        id: "F123",
        name: "test.txt",
        mimetype: "text/plain",
        url_private_download: "https://files.slack.com/test.txt",
        size: 100,
      };

      await assertRejects(
        () => processor.processFiles([file]),
        NetworkTimeoutError,
        "Download timeout",
      );
    });

    it("should throw ValidationError for unsupported file types", async () => {
      processor.setValidationErrorForUnsupported(true);

      const file: SlackFile = {
        id: "F123",
        name: "archive.zip",
        mimetype: "application/zip",
        url_private_download: "https://files.slack.com/archive.zip",
        size: 1024,
      };

      await assertRejects(
        () => processor.processFiles([file]),
        ValidationError,
        "Unsupported file type",
      );
    });

    it("should handle oversized files gracefully", async () => {
      const file: SlackFile = {
        id: "F123",
        name: "huge.png",
        mimetype: "image/png",
        url_private_download: "https://files.slack.com/huge.png",
        size: 150 * 1024 * 1024, // 150 MB - exceeds limit
      };

      // Mock should return a processed attachment with a note about size
      const result = await processor.processFiles([file]);

      assertEquals(result.length, 1);
      assertEquals(
        result[0].content.includes("exceeds size limit") ||
          result[0].content.includes("could not be fully processed"),
        true,
      );
    });
  });
});

describe("Property 7: Attachment Processing", () => {
  /**
   * Property 7: For any supported file type attached to an official answer,
   * the system should include the file content in the next Claude request.
   *
   * Validates: Requirements 4.1, 4.2, 4.3, 4.5
   */

  let processor: MockAttachmentProcessor;

  beforeEach(() => {
    processor = new MockAttachmentProcessor();
  });

  afterEach(() => {
    processor.clear();
  });

  it("should include image content as vision API format for PNG files", async () => {
    const file: SlackFile = {
      id: "F1234567890",
      name: "diagram.png",
      mimetype: "image/png",
      url_private_download: "https://files.slack.com/diagram.png",
      size: 2048,
    };

    const result = await processor.processFiles([file]);

    assertEquals(result.length, 1);
    assertEquals(result[0].file_id, "F1234567890");
    assertEquals(result[0].filename, "diagram.png");
    assertEquals(result[0].mimetype, "image/png");
    // Content should be base64 encoded for vision API
    assertEquals(result[0].content.length > 0, true);
  });

  it("should include image content as vision API format for JPEG files", async () => {
    const file: SlackFile = {
      id: "F1234567890",
      name: "photo.jpg",
      mimetype: "image/jpeg",
      url_private_download: "https://files.slack.com/photo.jpg",
      size: 4096,
    };

    const result = await processor.processFiles([file]);

    assertEquals(result.length, 1);
    assertEquals(result[0].mimetype, "image/jpeg");
    assertEquals(result[0].content.length > 0, true);
  });

  it("should include text content for markdown files", async () => {
    const markdownContent = "# Requirements\n\n- Feature 1\n- Feature 2";
    processor.setFileContent("F1234567890", markdownContent);

    const file: SlackFile = {
      id: "F1234567890",
      name: "requirements.md",
      mimetype: "text/markdown",
      url_private_download: "https://files.slack.com/requirements.md",
      size: 256,
    };

    const result = await processor.processFiles([file]);

    assertEquals(result.length, 1);
    assertEquals(result[0].mimetype, "text/markdown");
    assertEquals(result[0].content, markdownContent);
  });

  it("should include text content for code files", async () => {
    const codeContent = 'function greet() {\n  console.log("Hello");\n}';
    processor.setFileContent("F1234567890", codeContent);

    const file: SlackFile = {
      id: "F1234567890",
      name: "script.js",
      mimetype: "text/javascript",
      url_private_download: "https://files.slack.com/script.js",
      size: 128,
    };

    const result = await processor.processFiles([file]);

    assertEquals(result.length, 1);
    assertEquals(result[0].content, codeContent);
  });

  it("should include extracted text content for PDF files", async () => {
    const pdfTextContent = "Extracted text from PDF document...";
    processor.setFileContent("F1234567890", pdfTextContent);

    const file: SlackFile = {
      id: "F1234567890",
      name: "document.pdf",
      mimetype: "application/pdf",
      url_private_download: "https://files.slack.com/document.pdf",
      size: 10240,
    };

    const result = await processor.processFiles([file]);

    assertEquals(result.length, 1);
    assertEquals(result[0].mimetype, "application/pdf");
    assertEquals(result[0].content, pdfTextContent);
  });

  it("should process multiple files of different types together", async () => {
    processor.setFileContent("F001", "Markdown content");
    processor.setFileContent("F002", "Python code content");

    const files: SlackFile[] = [
      {
        id: "F001",
        name: "spec.md",
        mimetype: "text/markdown",
        url_private_download: "https://files.slack.com/spec.md",
        size: 256,
      },
      {
        id: "F002",
        name: "app.py",
        mimetype: "text/x-python",
        url_private_download: "https://files.slack.com/app.py",
        size: 512,
      },
      {
        id: "F003",
        name: "screenshot.png",
        mimetype: "image/png",
        url_private_download: "https://files.slack.com/screenshot.png",
        size: 2048,
      },
    ];

    const result = await processor.processFiles(files);

    assertEquals(result.length, 3);
    assertEquals(result[0].filename, "spec.md");
    assertEquals(result[0].content, "Markdown content");
    assertEquals(result[1].filename, "app.py");
    assertEquals(result[1].content, "Python code content");
    assertEquals(result[2].filename, "screenshot.png");
    assertEquals(result[2].mimetype, "image/png");
  });

  it("should acknowledge but note files that exceed size limits", async () => {
    const file: SlackFile = {
      id: "F1234567890",
      name: "huge-video.mp4",
      mimetype: "video/mp4",
      url_private_download: "https://files.slack.com/huge-video.mp4",
      size: 500 * 1024 * 1024, // 500 MB
    };

    const result = await processor.processFiles([file]);

    assertEquals(result.length, 1);
    assertEquals(result[0].file_id, "F1234567890");
    // Content should indicate the file couldn't be fully processed
    assertEquals(
      result[0].content.includes("could not be fully processed") ||
        result[0].content.includes("exceeds size limit") ||
        result[0].content.includes("unsupported"),
      true,
    );
  });
});

describe("AttachmentProcessorImpl", () => {
  describe("Slack file download integration", () => {
    it("should create processor with download function and token provider", () => {
      const mockDownload = (_url: string, _token: string): Promise<ArrayBuffer> => {
        return Promise.resolve(new ArrayBuffer(0));
      };
      const tokenProvider = () => "xoxb-test-token";

      const processor = new AttachmentProcessorImpl(mockDownload, tokenProvider);

      assertEquals(processor instanceof AttachmentProcessorImpl, true);
    });

    it("should use token provider for authentication", async () => {
      let capturedUrl = "";
      let capturedToken = "";

      const mockDownload = (url: string, token: string): Promise<ArrayBuffer> => {
        capturedUrl = url;
        capturedToken = token;
        const encoder = new TextEncoder();
        return Promise.resolve(encoder.encode("test content").buffer);
      };

      const tokenProvider = () => "xoxb-my-token";
      const processor = new AttachmentProcessorImpl(mockDownload, tokenProvider);

      const file: SlackFile = {
        id: "F123",
        name: "test.txt",
        mimetype: "text/plain",
        url_private_download: "https://files.slack.com/test.txt",
        size: 100,
      };

      await processor.extractText(file);

      assertEquals(capturedUrl, "https://files.slack.com/test.txt");
      assertEquals(capturedToken, "xoxb-my-token");
    });

    it("should call token provider for each request (not cached)", async () => {
      let tokenCallCount = 0;
      const tokens = ["token-1", "token-2"];

      const mockDownload = (_url: string, _token: string): Promise<ArrayBuffer> => {
        const encoder = new TextEncoder();
        return Promise.resolve(encoder.encode("content").buffer);
      };

      const tokenProvider = () => {
        const token = tokens[tokenCallCount] || "fallback-token";
        tokenCallCount++;
        return token;
      };
      const processor = new AttachmentProcessorImpl(mockDownload, tokenProvider);

      const file: SlackFile = {
        id: "F123",
        name: "test.txt",
        mimetype: "text/plain",
        url_private_download: "https://files.slack.com/test.txt",
        size: 100,
      };

      await processor.extractText(file);
      await processor.extractText(file);

      assertEquals(tokenCallCount, 2, "Token provider should be called for each request");
    });
  });

  describe("URL validation", () => {
    it("should accept valid Slack file URLs", () => {
      assertEquals(validateSlackFileUrl("https://files.slack.com/test.txt"), true);
      assertEquals(validateSlackFileUrl("https://files-pri.slack.com/test.txt"), true);
    });

    it("should throw ValidationError for invalid URLs", () => {
      let threw = false;
      try {
        validateSlackFileUrl("https://evil.com/test.txt");
      } catch (error) {
        threw = true;
        assertEquals(error instanceof ValidationError, true);
        assertEquals((error as ValidationError).message, "Invalid file URL");
      }
      assertEquals(threw, true, "Should have thrown ValidationError");
    });

    it("should reject URLs from non-Slack domains in extractText", async () => {
      const mockDownload = (_url: string, _token: string): Promise<ArrayBuffer> => {
        return Promise.resolve(new ArrayBuffer(0));
      };
      const tokenProvider = () => "xoxb-test";
      const processor = new AttachmentProcessorImpl(mockDownload, tokenProvider);

      const file: SlackFile = {
        id: "F123",
        name: "test.txt",
        mimetype: "text/plain",
        url_private_download: "https://malicious-site.com/test.txt",
        size: 100,
      };

      await assertRejects(
        () => processor.extractText(file),
        ValidationError,
        "Invalid file URL",
      );
    });

    it("should reject URLs from non-Slack domains in processImage", async () => {
      const mockDownload = (_url: string, _token: string): Promise<ArrayBuffer> => {
        return Promise.resolve(new ArrayBuffer(0));
      };
      const tokenProvider = () => "xoxb-test";
      const processor = new AttachmentProcessorImpl(mockDownload, tokenProvider);

      const file: SlackFile = {
        id: "F123",
        name: "evil.png",
        mimetype: "image/png",
        url_private_download: "https://malicious-site.com/evil.png",
        size: 100,
      };

      await assertRejects(
        () => processor.processImage(file),
        ValidationError,
        "Invalid file URL",
      );
    });
  });

  describe("Image processing for vision API", () => {
    it("should convert image to base64 vision content", async () => {
      // Create mock image data (small PNG header)
      const pngHeader = new Uint8Array([
        0x89,
        0x50,
        0x4e,
        0x47,
        0x0d,
        0x0a,
        0x1a,
        0x0a,
      ]);

      const mockDownload = (_url: string, _token: string): Promise<ArrayBuffer> => {
        return Promise.resolve(pngHeader.buffer);
      };
      const tokenProvider = () => "xoxb-test";

      const processor = new AttachmentProcessorImpl(mockDownload, tokenProvider);

      const file: SlackFile = {
        id: "F123",
        name: "test.png",
        mimetype: "image/png",
        url_private_download: "https://files.slack.com/test.png",
        size: 8,
      };

      const result = await processor.processImage(file);

      assertEquals(result.type, "image");
      assertEquals(result.source.type, "base64");
      assertEquals(result.source.media_type, "image/png");
      assertEquals(typeof result.source.data, "string");
      // Base64 of PNG header
      assertEquals(result.source.data.length > 0, true);
    });
  });

  describe("Text extraction", () => {
    it("should extract text from text files", async () => {
      const testContent = "Hello, this is test content";
      const encoder = new TextEncoder();

      const mockDownload = (_url: string, _token: string): Promise<ArrayBuffer> => {
        return Promise.resolve(encoder.encode(testContent).buffer);
      };
      const tokenProvider = () => "xoxb-test";

      const processor = new AttachmentProcessorImpl(mockDownload, tokenProvider);

      const file: SlackFile = {
        id: "F123",
        name: "test.txt",
        mimetype: "text/plain",
        url_private_download: "https://files.slack.com/test.txt",
        size: testContent.length,
      };

      const result = await processor.extractText(file);

      assertEquals(result, testContent);
    });

    it("should handle UTF-8 text content", async () => {
      const testContent = "Hello, world! \u2764 \u{1F600}";
      const encoder = new TextEncoder();

      const mockDownload = (_url: string, _token: string): Promise<ArrayBuffer> => {
        return Promise.resolve(encoder.encode(testContent).buffer);
      };
      const tokenProvider = () => "xoxb-test";

      const processor = new AttachmentProcessorImpl(mockDownload, tokenProvider);

      const file: SlackFile = {
        id: "F123",
        name: "test.txt",
        mimetype: "text/plain",
        url_private_download: "https://files.slack.com/test.txt",
        size: 100,
      };

      const result = await processor.extractText(file);

      assertEquals(result, testContent);
    });

    it("should return placeholder for PDF files instead of corrupted binary", async () => {
      // Simulate binary PDF content that would produce garbage if decoded as UTF-8
      const pdfBinary = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e]); // %PDF-1.

      const mockDownload = (_url: string, _token: string): Promise<ArrayBuffer> => {
        return Promise.resolve(pdfBinary.buffer);
      };
      const tokenProvider = () => "xoxb-test";

      const processor = new AttachmentProcessorImpl(mockDownload, tokenProvider);

      const file: SlackFile = {
        id: "F123",
        name: "document.pdf",
        mimetype: "application/pdf",
        url_private_download: "https://files.slack.com/document.pdf",
        size: 1024,
      };

      const result = await processor.extractText(file);

      // Should return a user-friendly placeholder, not corrupted binary
      assertEquals(
        result,
        "[PDF attached: document.pdf - text extraction pending enhanced PDF parser]",
      );
    });
  });

  describe("Size limit validation", () => {
    it("should accept files within limits", () => {
      const mockDownload = (_url: string, _token: string): Promise<ArrayBuffer> => {
        return Promise.resolve(new ArrayBuffer(0));
      };
      const tokenProvider = () => "xoxb-test";

      const processor = new AttachmentProcessorImpl(mockDownload, tokenProvider);

      const file: SlackFile = {
        id: "F123",
        name: "small.png",
        mimetype: "image/png",
        url_private_download: "https://files.slack.com/small.png",
        size: 5 * 1024 * 1024, // 5 MB
      };

      assertEquals(processor.checkSizeLimits(file), true);
    });

    it("should reject images over 100MB", () => {
      const mockDownload = (_url: string, _token: string): Promise<ArrayBuffer> => {
        return Promise.resolve(new ArrayBuffer(0));
      };
      const tokenProvider = () => "xoxb-test";

      const processor = new AttachmentProcessorImpl(mockDownload, tokenProvider);

      const file: SlackFile = {
        id: "F123",
        name: "huge.png",
        mimetype: "image/png",
        url_private_download: "https://files.slack.com/huge.png",
        size: 150 * 1024 * 1024, // 150 MB
      };

      assertEquals(processor.checkSizeLimits(file), false);
    });

    it("should reject text files over 10MB", () => {
      const mockDownload = (_url: string, _token: string): Promise<ArrayBuffer> => {
        return Promise.resolve(new ArrayBuffer(0));
      };
      const tokenProvider = () => "xoxb-test";

      const processor = new AttachmentProcessorImpl(mockDownload, tokenProvider);

      const file: SlackFile = {
        id: "F123",
        name: "massive.txt",
        mimetype: "text/plain",
        url_private_download: "https://files.slack.com/massive.txt",
        size: 15 * 1024 * 1024, // 15 MB
      };

      assertEquals(processor.checkSizeLimits(file), false);
    });
  });

  describe("Parallel file processing", () => {
    it("should process multiple files in parallel", async () => {
      const processOrder: string[] = [];
      let concurrentCalls = 0;
      let maxConcurrentCalls = 0;

      const mockDownload = async (_url: string, _token: string): Promise<ArrayBuffer> => {
        concurrentCalls++;
        maxConcurrentCalls = Math.max(maxConcurrentCalls, concurrentCalls);

        // Simulate async work
        await new Promise((resolve) => setTimeout(resolve, 10));

        concurrentCalls--;
        processOrder.push(_url);
        const encoder = new TextEncoder();
        return encoder.encode("content").buffer;
      };
      const tokenProvider = () => "xoxb-test";

      const processor = new AttachmentProcessorImpl(mockDownload, tokenProvider);

      const files: SlackFile[] = [
        {
          id: "F1",
          name: "file1.txt",
          mimetype: "text/plain",
          url_private_download: "https://files.slack.com/file1.txt",
          size: 100,
        },
        {
          id: "F2",
          name: "file2.txt",
          mimetype: "text/plain",
          url_private_download: "https://files.slack.com/file2.txt",
          size: 100,
        },
        {
          id: "F3",
          name: "file3.txt",
          mimetype: "text/plain",
          url_private_download: "https://files.slack.com/file3.txt",
          size: 100,
        },
      ];

      const results = await processor.processFiles(files);

      assertEquals(results.length, 3);
      // All files should have been processed concurrently (max concurrent > 1)
      assertEquals(maxConcurrentCalls > 1, true, "Files should be processed in parallel");
    });
  });

  describe("Retry logic", () => {
    it("should retry downloads on transient errors", async () => {
      let attemptCount = 0;

      const mockDownload = (_url: string, _token: string): Promise<ArrayBuffer> => {
        attemptCount++;
        if (attemptCount < 3) {
          return Promise.reject(
            new NetworkTimeoutError(
              "Download failed",
              "Connection timeout",
              "Retry later",
            ),
          );
        }
        const encoder = new TextEncoder();
        return Promise.resolve(encoder.encode("success").buffer);
      };
      const tokenProvider = () => "xoxb-test";

      // Use a retry handler with no delay for faster tests
      const { RetryHandler } = await import("../../src/errors/retry.ts");
      const fastRetryHandler = new RetryHandler({
        maxAttempts: 3,
        baseDelayMs: 0,
        multiplier: 1,
      });

      const processor = new AttachmentProcessorImpl(
        mockDownload,
        tokenProvider,
        fastRetryHandler,
      );

      const file: SlackFile = {
        id: "F123",
        name: "test.txt",
        mimetype: "text/plain",
        url_private_download: "https://files.slack.com/test.txt",
        size: 100,
      };

      const result = await processor.extractText(file);

      assertEquals(result, "success");
      assertEquals(attemptCount, 3, "Should have retried 3 times");
    });
  });
});
