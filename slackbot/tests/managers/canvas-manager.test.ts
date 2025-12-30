// ABOUTME: Tests for Canvas manager with create, update, and fallback operations.
// ABOUTME: Validates Property 13 (Canvas Fallback) and ensures integration with messaging client.

import { assertEquals, assertRejects } from "@std/assert";
import { afterEach, beforeEach, describe, it } from "@std/testing/bdd";
import { CanvasManagerImpl, MockCanvasManager } from "../../src/managers/canvas-manager.ts";
import type { SpecDocument } from "../../src/types/spec-document.ts";
import { SlackCanvasError } from "../../src/errors/types.ts";
import { MockSlackMessagingClient } from "../../src/clients/messaging-client.ts";

/**
 * Helper to create a test SpecDocument with all fields populated.
 */
function createTestSpec(): SpecDocument {
  return {
    title: "Test Specification",
    overview: "This is a test spec for Canvas management.",
    problem_statement: "We need to test Canvas creation and updates.",
    goals: ["Test Canvas creation", "Test Canvas updates", "Test fallback"],
    non_goals: ["Test unrelated features"],
    personas: [
      {
        name: "Developer",
        description: "A developer testing the Canvas manager.",
      },
    ],
    use_cases: [
      {
        id: "UC1",
        title: "Create Canvas",
        description: "Developer creates a Canvas from a spec.",
      },
    ],
    technical_details: "Uses Slack Canvas API with fallback to file upload.",
    open_questions: ["How to handle very large specs?"],
  };
}

/**
 * Helper to create a minimal test SpecDocument.
 */
function createMinimalSpec(): SpecDocument {
  return {
    title: "Minimal Spec",
    overview: "A minimal specification.",
    problem_statement: "Testing minimal content.",
    goals: [],
    non_goals: [],
    personas: [],
    use_cases: [],
    technical_details: "",
    open_questions: [],
  };
}

describe("CanvasManager", () => {
  describe("MockCanvasManager", () => {
    let canvas: MockCanvasManager;

    beforeEach(() => {
      canvas = new MockCanvasManager();
    });

    afterEach(() => {
      canvas.clear();
    });

    describe("createCanvas", () => {
      it("should create canvas with spec content and return canvas ID", async () => {
        const spec = createTestSpec();

        const canvasId = await canvas.createCanvas(
          spec,
          "1234567890.123456",
          "C1234567890",
        );

        assertEquals(typeof canvasId, "string");
        assertEquals(canvasId.length > 0, true);
        assertEquals(canvasId.startsWith("canvas_"), true);
      });

      it("should format spec content using toMarkdown", async () => {
        const spec = createMinimalSpec();

        const canvasId = await canvas.createCanvas(
          spec,
          "1234567890.123456",
          "C1234567890",
        );

        // Verify canvas was created
        assertEquals(typeof canvasId, "string");

        // Get created canvases to verify content
        const created = canvas.getCreatedCanvases();
        assertEquals(created.length, 1);
        assertEquals(created[0].canvasId, canvasId);
        assertEquals(created[0].content.includes("# Minimal Spec"), true);
        assertEquals(created[0].content.includes("## Overview"), true);
      });

      it("should record thread and channel info", async () => {
        const spec = createTestSpec();

        const canvasId = await canvas.createCanvas(
          spec,
          "1234567890.123456",
          "C1234567890",
        );

        const created = canvas.getCreatedCanvases();
        assertEquals(created.length, 1);
        assertEquals(created[0].threadTs, "1234567890.123456");
        assertEquals(created[0].channelId, "C1234567890");
        assertEquals(created[0].canvasId, canvasId);
      });

      it("should throw configured error", async () => {
        const spec = createTestSpec();
        const error = new SlackCanvasError(
          "Canvas creation failed",
          "Quota exceeded",
          "Wait and retry",
        );
        canvas.setCreateCanvasError(error);

        await assertRejects(
          () => canvas.createCanvas(spec, "1234567890.123456", "C1234567890"),
          SlackCanvasError,
          "Canvas creation failed",
        );
      });

      it("should generate unique canvas IDs for multiple calls", async () => {
        const spec = createTestSpec();

        const canvasId1 = await canvas.createCanvas(
          spec,
          "1111.111",
          "C111",
        );
        const canvasId2 = await canvas.createCanvas(
          spec,
          "2222.222",
          "C222",
        );

        assertEquals(canvasId1 !== canvasId2, true);
        assertEquals(canvas.getCreatedCanvases().length, 2);
      });
    });

    describe("updateCanvas", () => {
      it("should update existing canvas with new content", async () => {
        const spec = createTestSpec();
        const canvasId = await canvas.createCanvas(
          spec,
          "1234567890.123456",
          "C1234567890",
        );

        const updatedSpec: SpecDocument = {
          ...spec,
          title: "Updated Specification",
          overview: "This spec has been updated.",
        };

        await canvas.updateCanvas(canvasId, updatedSpec);

        const updates = canvas.getUpdatedCanvases();
        assertEquals(updates.length, 1);
        assertEquals(updates[0].canvasId, canvasId);
        assertEquals(updates[0].content.includes("# Updated Specification"), true);
        assertEquals(updates[0].content.includes("This spec has been updated."), true);
      });

      it("should throw configured error", async () => {
        const spec = createTestSpec();
        const canvasId = await canvas.createCanvas(
          spec,
          "1234567890.123456",
          "C1234567890",
        );

        const error = new SlackCanvasError(
          "Canvas update failed",
          "Edit conflict",
          "Retry update",
        );
        canvas.setUpdateCanvasError(error);

        await assertRejects(
          () => canvas.updateCanvas(canvasId, spec),
          SlackCanvasError,
          "Canvas update failed",
        );
      });

      it("should record multiple updates to same canvas", async () => {
        const spec = createTestSpec();
        const canvasId = await canvas.createCanvas(
          spec,
          "1234567890.123456",
          "C1234567890",
        );

        const updatedSpec1: SpecDocument = { ...spec, title: "Update 1" };
        const updatedSpec2: SpecDocument = { ...spec, title: "Update 2" };

        await canvas.updateCanvas(canvasId, updatedSpec1);
        await canvas.updateCanvas(canvasId, updatedSpec2);

        const updates = canvas.getUpdatedCanvases();
        assertEquals(updates.length, 2);
        assertEquals(updates[0].canvasId, canvasId);
        assertEquals(updates[1].canvasId, canvasId);
        assertEquals(updates[1].content.includes("# Update 2"), true);
      });
    });

    describe("formatForCanvas", () => {
      it("should convert spec to markdown format", () => {
        const spec = createTestSpec();

        const formatted = canvas.formatForCanvas(spec);

        assertEquals(typeof formatted, "string");
        assertEquals(formatted.includes("# Test Specification"), true);
        assertEquals(formatted.includes("## Overview"), true);
        assertEquals(formatted.includes("## Problem Statement"), true);
        assertEquals(formatted.includes("## Goals and Non-Goals"), true);
        assertEquals(formatted.includes("## User Personas"), true);
        assertEquals(formatted.includes("## Use Cases"), true);
        assertEquals(formatted.includes("## Technical Details"), true);
        assertEquals(formatted.includes("## Open Questions"), true);
      });

      it("should handle minimal spec with empty sections", () => {
        const spec = createMinimalSpec();

        const formatted = canvas.formatForCanvas(spec);

        assertEquals(formatted.includes("# Minimal Spec"), true);
        assertEquals(formatted.includes("## Overview"), true);
        assertEquals(formatted.includes("## Problem Statement"), true);
        // Empty sections should not appear
        assertEquals(formatted.includes("## User Personas"), false);
        assertEquals(formatted.includes("## Use Cases"), false);
        assertEquals(formatted.includes("## Technical Details"), false);
        assertEquals(formatted.includes("## Open Questions"), false);
      });
    });

    describe("Mock state management", () => {
      it("should clear configured errors", async () => {
        const spec = createTestSpec();
        const error = new SlackCanvasError("Test", "Test", "Test");
        canvas.setCreateCanvasError(error);
        canvas.clear();

        // Should succeed after clear (no error configured)
        await canvas.createCanvas(spec, "1234567890.123456", "C1234567890");
      });

      it("should clear created and updated canvases", async () => {
        const spec = createTestSpec();
        const canvasId = await canvas.createCanvas(
          spec,
          "1234567890.123456",
          "C1234567890",
        );
        await canvas.updateCanvas(canvasId, spec);

        canvas.clear();

        assertEquals(canvas.getCreatedCanvases().length, 0);
        assertEquals(canvas.getUpdatedCanvases().length, 0);
      });
    });

    describe("getCanvasContent", () => {
      it("should return content for existing canvas", async () => {
        // Set up canvas content
        canvas.setCanvasContent("canvas_test_123", "# Test Spec\n\nThis is test content.");

        const content = await canvas.getCanvasContent("canvas_test_123");

        assertEquals(content, "# Test Spec\n\nThis is test content.");
      });

      it("should throw error for non-existent canvas", async () => {
        await assertRejects(
          () => canvas.getCanvasContent("canvas_nonexistent"),
          SlackCanvasError,
          "Canvas not found",
        );
      });

      it("should throw configured error", async () => {
        canvas.setCanvasContent("canvas_test_123", "Some content");
        const error = new SlackCanvasError(
          "Canvas read failed",
          "Permission denied",
          "Check permissions",
        );
        canvas.setGetCanvasContentError(error);

        await assertRejects(
          () => canvas.getCanvasContent("canvas_test_123"),
          SlackCanvasError,
          "Canvas read failed",
        );
      });

      it("should clear canvas contents and errors on clear()", async () => {
        canvas.setCanvasContent("canvas_test_123", "Some content");
        canvas.setGetCanvasContentError(new SlackCanvasError("Test", "Test", "Test"));

        canvas.clear();

        // Should fail because content was cleared
        await assertRejects(
          () => canvas.getCanvasContent("canvas_test_123"),
          SlackCanvasError,
          "Canvas not found",
        );
      });
    });
  });

  describe("CanvasManagerImpl with Slack API integration", () => {
    let canvasManager: CanvasManagerImpl;
    let mockMessagingClient: MockSlackMessagingClient;

    /**
     * Mock Slack Canvas API for testing.
     */
    interface MockCanvasApi {
      create: (params: {
        channel_id: string;
        thread_ts: string;
        content: string;
      }) => Promise<{ ok: boolean; canvas_id: string }>;
      edit: (params: {
        canvas_id: string;
        content: string;
      }) => Promise<{ ok: boolean }>;
    }

    let mockCanvasApi: MockCanvasApi;

    beforeEach(() => {
      mockMessagingClient = new MockSlackMessagingClient();

      // Create mock Canvas API
      mockCanvasApi = {
        create: (_params) =>
          Promise.resolve({
            ok: true,
            canvas_id: "canvas_1234567890",
          }),
        edit: (_params) =>
          Promise.resolve({
            ok: true,
          }),
      };

      canvasManager = new CanvasManagerImpl(
        mockCanvasApi,
        mockMessagingClient,
      );
    });

    afterEach(() => {
      mockMessagingClient.clear();
    });

    describe("createCanvas success path", () => {
      it("should create canvas and return canvas ID", async () => {
        const spec = createTestSpec();

        const canvasId = await canvasManager.createCanvas(
          spec,
          "1234567890.123456",
          "C1234567890",
        );

        assertEquals(canvasId, "canvas_1234567890");
      });

      it("should pass formatted content to Canvas API", async () => {
        const spec = createMinimalSpec();
        let capturedParams: {
          channel_id: string;
          thread_ts: string;
          content: string;
        } | undefined;

        mockCanvasApi.create = (params) => {
          capturedParams = params;
          return Promise.resolve({
            ok: true,
            canvas_id: "canvas_test",
          });
        };

        await canvasManager.createCanvas(
          spec,
          "1234567890.123456",
          "C1234567890",
        );

        assertEquals(capturedParams!.channel_id, "C1234567890");
        assertEquals(capturedParams!.thread_ts, "1234567890.123456");
        assertEquals(capturedParams!.content.includes("# Minimal Spec"), true);
        assertEquals(capturedParams!.content.includes("## Overview"), true);
      });
    });

    describe("createCanvas error handling", () => {
      it("should fall back to file upload on Canvas API failure", async () => {
        const spec = createTestSpec();

        mockCanvasApi.create = () => {
          throw new SlackCanvasError(
            "Canvas creation failed",
            "API returned 429",
            "Retry later",
          );
        };

        // Should fall back to file upload (Property 13)
        const result = await canvasManager.createCanvas(
          spec,
          "1234567890.123456",
          "C1234567890",
        );

        assertEquals(result.startsWith("fallback:"), true);

        // Verify file was uploaded
        const uploads = mockMessagingClient.getUploadedFiles();
        assertEquals(uploads.length, 1);
        assertEquals(uploads[0].filename, "brainstorm.md");
      });

      it("should not call uploadFile when creation succeeds", async () => {
        const spec = createTestSpec();

        await canvasManager.createCanvas(
          spec,
          "1234567890.123456",
          "C1234567890",
        );

        const uploads = mockMessagingClient.getUploadedFiles();
        assertEquals(uploads.length, 0, "Should not upload file on success");
      });

      it("should re-throw non-SlackCanvasError exceptions without fallback", async () => {
        const spec = createTestSpec();

        // Simulate a programming error or unexpected exception
        const unexpectedError = new TypeError("Unexpected error");
        mockCanvasApi.create = () => {
          throw unexpectedError;
        };

        // Should re-throw the error without attempting fallback
        await assertRejects(
          () => canvasManager.createCanvas(spec, "1234567890.123456", "C1234567890"),
          TypeError,
          "Unexpected error",
        );

        // Verify no fallback file upload was attempted
        const uploads = mockMessagingClient.getUploadedFiles();
        assertEquals(uploads.length, 0, "Should not upload file for non-SlackCanvasError");
      });

      it("should trigger fallback when Canvas API returns ok: false", async () => {
        const spec = createTestSpec();

        // Simulate Canvas API returning ok: false
        mockCanvasApi.create = () =>
          Promise.resolve({
            ok: false,
            canvas_id: "",
          });

        // Should trigger fallback to file upload
        const result = await canvasManager.createCanvas(
          spec,
          "1234567890.123456",
          "C1234567890",
        );

        assertEquals(result.startsWith("fallback:"), true);

        // Verify file was uploaded
        const uploads = mockMessagingClient.getUploadedFiles();
        assertEquals(uploads.length, 1);
        assertEquals(uploads[0].filename, "brainstorm.md");
      });
    });

    describe("updateCanvas", () => {
      it("should update canvas with new content", async () => {
        const spec = createTestSpec();
        let capturedParams: {
          canvas_id: string;
          content: string;
        } | undefined;

        mockCanvasApi.edit = (params) => {
          capturedParams = params;
          return Promise.resolve({ ok: true });
        };

        await canvasManager.updateCanvas("canvas_1234567890", spec);

        assertEquals(capturedParams!.canvas_id, "canvas_1234567890");
        assertEquals(capturedParams!.content.includes("# Test Specification"), true);
      });

      it("should throw SlackCanvasError on update failure", async () => {
        const spec = createTestSpec();

        mockCanvasApi.edit = () => {
          throw new SlackCanvasError(
            "Canvas update failed",
            "Edit conflict",
            "Retry",
          );
        };

        await assertRejects(
          () => canvasManager.updateCanvas("canvas_1234567890", spec),
          SlackCanvasError,
          "Canvas update failed",
        );
      });

      it("should throw SlackCanvasError when edit returns ok: false", async () => {
        const spec = createTestSpec();

        mockCanvasApi.edit = () =>
          Promise.resolve({
            ok: false,
          });

        await assertRejects(
          () => canvasManager.updateCanvas("canvas_1234567890", spec),
          SlackCanvasError,
          "Canvas update failed",
        );
      });
    });

    describe("formatForCanvas", () => {
      it("should return markdown formatted string", () => {
        const spec = createTestSpec();

        const formatted = canvasManager.formatForCanvas(spec);

        assertEquals(typeof formatted, "string");
        assertEquals(formatted.includes("# Test Specification"), true);
        assertEquals(formatted.includes("## Overview"), true);
      });
    });

    describe("getCanvasContent", () => {
      it("should return content from Canvas API", async () => {
        // Add get method to mock
        const mockCanvasApiWithGet = {
          ...mockCanvasApi,
          get: (_params: { canvas_id: string }) =>
            Promise.resolve({
              ok: true,
              content: "# Test Spec\n\nThis is the canvas content.",
            }),
        };

        const managerWithGet = new CanvasManagerImpl(
          mockCanvasApiWithGet,
          mockMessagingClient,
        );

        const content = await managerWithGet.getCanvasContent("canvas_1234567890");

        assertEquals(content, "# Test Spec\n\nThis is the canvas content.");
      });

      it("should pass correct canvas ID to Canvas API", async () => {
        let capturedParams: { canvas_id: string } | undefined;

        const mockCanvasApiWithGet = {
          ...mockCanvasApi,
          get: (params: { canvas_id: string }) => {
            capturedParams = params;
            return Promise.resolve({
              ok: true,
              content: "Content",
            });
          },
        };

        const managerWithGet = new CanvasManagerImpl(
          mockCanvasApiWithGet,
          mockMessagingClient,
        );

        await managerWithGet.getCanvasContent("canvas_test_id");

        assertEquals(capturedParams!.canvas_id, "canvas_test_id");
      });

      it("should throw SlackCanvasError when API returns ok: false", async () => {
        const mockCanvasApiWithGet = {
          ...mockCanvasApi,
          get: (_params: { canvas_id: string }) =>
            Promise.resolve({
              ok: false,
              content: "",
            }),
        };

        const managerWithGet = new CanvasManagerImpl(
          mockCanvasApiWithGet,
          mockMessagingClient,
        );

        await assertRejects(
          () => managerWithGet.getCanvasContent("canvas_1234567890"),
          SlackCanvasError,
          "Canvas read failed",
        );
      });

      it("should propagate Canvas API errors", async () => {
        const mockCanvasApiWithGet = {
          ...mockCanvasApi,
          get: (_params: { canvas_id: string }) => {
            throw new SlackCanvasError(
              "Canvas not found",
              "Canvas does not exist",
              "Check canvas ID",
            );
          },
        };

        const managerWithGet = new CanvasManagerImpl(
          mockCanvasApiWithGet,
          mockMessagingClient,
        );

        await assertRejects(
          () => managerWithGet.getCanvasContent("canvas_nonexistent"),
          SlackCanvasError,
          "Canvas not found",
        );
      });
    });
  });

  describe("CanvasManagerImpl with fallback to file upload", () => {
    let canvasManager: CanvasManagerImpl;
    let mockMessagingClient: MockSlackMessagingClient;

    /**
     * Mock Canvas API that fails to test fallback behavior.
     */
    interface MockCanvasApi {
      create: (params: {
        channel_id: string;
        thread_ts: string;
        content: string;
      }) => Promise<{ ok: boolean; canvas_id: string }>;
      edit: (params: {
        canvas_id: string;
        content: string;
      }) => Promise<{ ok: boolean }>;
    }

    let mockCanvasApi: MockCanvasApi;

    beforeEach(() => {
      mockMessagingClient = new MockSlackMessagingClient();

      // Create failing Canvas API
      mockCanvasApi = {
        create: () => {
          throw new SlackCanvasError(
            "Canvas creation failed",
            "Quota exceeded",
            "Wait and retry",
          );
        },
        edit: () => Promise.resolve({ ok: true }),
      };

      canvasManager = new CanvasManagerImpl(
        mockCanvasApi,
        mockMessagingClient,
      );
    });

    afterEach(() => {
      mockMessagingClient.clear();
    });

    describe("Property 13: Canvas Fallback", () => {
      /**
       * Property 13: If Canvas creation fails, then the system must upload
       * brainstorm.md as a file attachment to the thread.
       */

      it("should fall back to file upload when Canvas creation fails", async () => {
        const spec = createTestSpec();

        // Canvas creation will fail, triggering fallback
        const result = await canvasManager.createCanvas(
          spec,
          "1234567890.123456",
          "C1234567890",
        );

        // Should return special fallback indicator instead of canvas ID
        assertEquals(result.startsWith("fallback:"), true);

        // Should have uploaded file as fallback
        const uploads = mockMessagingClient.getUploadedFiles();
        assertEquals(uploads.length, 1);
        assertEquals(uploads[0].filename, "brainstorm.md");
        assertEquals(uploads[0].channelId, "C1234567890");
        assertEquals(uploads[0].threadTs, "1234567890.123456");
        assertEquals(uploads[0].contentType, "text/markdown");
      });

      it("should upload correct markdown content in fallback", async () => {
        const spec = createMinimalSpec();

        await canvasManager.createCanvas(
          spec,
          "1234567890.123456",
          "C1234567890",
        );

        const uploads = mockMessagingClient.getUploadedFiles();
        assertEquals(uploads.length, 1);

        const content = uploads[0].content;
        assertEquals(content.includes("# Minimal Spec"), true);
        assertEquals(content.includes("## Overview"), true);
        assertEquals(content.includes("## Problem Statement"), true);
      });

      it("should fall back for any SlackCanvasError type", async () => {
        const spec = createTestSpec();

        // Test different Canvas errors
        const errors = [
          new SlackCanvasError(
            "Permission denied",
            "Canvas not enabled",
            "Enable Canvas in workspace",
          ),
          new SlackCanvasError(
            "Quota exceeded",
            "Too many canvases",
            "Delete old canvases",
          ),
          new SlackCanvasError(
            "API error",
            "Temporary failure",
            "Retry later",
          ),
        ];

        for (const error of errors) {
          mockMessagingClient.clear();
          mockCanvasApi.create = () => {
            throw error;
          };

          await canvasManager.createCanvas(
            spec,
            "1234567890.123456",
            "C1234567890",
          );

          const uploads = mockMessagingClient.getUploadedFiles();
          assertEquals(
            uploads.length,
            1,
            `Should upload file for error: ${error.message}`,
          );
          assertEquals(uploads[0].filename, "brainstorm.md");
        }
      });

      it("should propagate file upload errors after fallback attempt", async () => {
        const spec = createTestSpec();

        // Make file upload also fail
        const uploadError = new SlackCanvasError(
          "File upload failed",
          "Network error",
          "Retry",
        );
        mockMessagingClient.setUploadFileError(uploadError);

        await assertRejects(
          () =>
            canvasManager.createCanvas(
              spec,
              "1234567890.123456",
              "C1234567890",
            ),
          SlackCanvasError,
          "File upload failed",
        );
      });
    });
  });
});
