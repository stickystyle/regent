// ABOUTME: Tests for Slack messaging client with postMessage and uploadFile operations.
// ABOUTME: Validates retry logic, rate limit handling, and threading behavior per Property 11.

import { assertEquals, assertRejects } from "@std/assert";
import { afterEach, beforeEach, describe, it } from "@std/testing/bdd";
import {
  MockSlackMessagingClient,
  SlackMessagingClientImpl,
} from "../../src/clients/messaging-client.ts";
import {
  NetworkTimeoutError,
  SlackRateLimitError,
  ValidationError,
} from "../../src/errors/types.ts";

/**
 * Type for mock Slack API object used in tests.
 */
interface MockSlackApi {
  chatPostMessage: (params: {
    channel: string;
    text: string;
    thread_ts?: string;
    blocks?: unknown[];
  }) => Promise<{ ok: boolean; ts: string; channel: string }>;
  filesUpload: (params: {
    channels: string;
    content: string;
    filename: string;
    thread_ts?: string;
    filetype?: string;
  }) => Promise<{ ok: boolean; file: { id: string } }>;
}

describe("SlackMessagingClient", () => {
  describe("MockSlackMessagingClient", () => {
    let client: MockSlackMessagingClient;

    beforeEach(() => {
      client = new MockSlackMessagingClient();
    });

    afterEach(() => {
      client.clear();
    });

    describe("postMessage", () => {
      it("should post simple message without thread", async () => {
        const result = await client.postMessage(
          "C1234567890",
          undefined,
          "Hello, world!",
        );

        assertEquals(result.ok, true);
        assertEquals(result.channel, "C1234567890");
        assertEquals(typeof result.ts, "string");
      });

      it("should post threaded message with thread_ts", async () => {
        const result = await client.postMessage(
          "C1234567890",
          "1234567890.123456",
          "Reply in thread",
        );

        assertEquals(result.ok, true);
        assertEquals(result.channel, "C1234567890");
        assertEquals(result.thread_ts, "1234567890.123456");
      });

      it("should post message with blocks", async () => {
        const blocks = [
          {
            type: "section",
            text: { type: "mrkdwn", text: "*Bold text*" },
          },
        ];

        const result = await client.postMessage(
          "C1234567890",
          undefined,
          "Fallback text",
          blocks,
        );

        assertEquals(result.ok, true);
        assertEquals(result.channel, "C1234567890");
      });

      it("should throw configured error", async () => {
        const error = new NetworkTimeoutError(
          "Timeout",
          "Network timeout during post",
          "Retry later",
        );
        client.setPostMessageError(error);

        await assertRejects(
          () => client.postMessage("C1234567890", undefined, "Hello"),
          NetworkTimeoutError,
        );
      });
    });

    describe("uploadFile", () => {
      it("should upload file with filename", async () => {
        const content = "# Brainstorm\n\nIdea details...";

        const result = await client.uploadFile(
          "C1234567890",
          undefined,
          "brainstorm.md",
          content,
        );

        assertEquals(result.ok, true);
        assertEquals(typeof result.file.id, "string");
      });

      it("should upload file to thread", async () => {
        const content = "# Requirements\n\nSpec details...";

        const result = await client.uploadFile(
          "C1234567890",
          "1234567890.123456",
          "requirements.md",
          content,
        );

        assertEquals(result.ok, true);
        assertEquals(result.file.id.length > 0, true);
      });

      it("should handle custom content type", async () => {
        const content = JSON.stringify({ key: "value" });

        const result = await client.uploadFile(
          "C1234567890",
          undefined,
          "data.json",
          content,
          "application/json",
        );

        assertEquals(result.ok, true);
      });

      it("should throw configured error", async () => {
        const error = new SlackRateLimitError(
          "Rate limit exceeded",
          "Too many uploads",
          "Wait before retrying",
          30,
        );
        client.setUploadFileError(error);

        await assertRejects(
          () =>
            client.uploadFile(
              "C1234567890",
              undefined,
              "test.md",
              "content",
            ),
          SlackRateLimitError,
        );
      });
    });

    describe("Mock state management", () => {
      it("should clear configured errors", async () => {
        const error = new NetworkTimeoutError("Test", "Test", "Test");
        client.setPostMessageError(error);
        client.clear();

        // Should succeed after clear (no error configured)
        await client.postMessage("C123", undefined, "Test");
      });

      it("should record posted messages", async () => {
        await client.postMessage("C123", undefined, "First");
        await client.postMessage("C123", "1.1", "Second");

        const messages = client.getPostedMessages();
        assertEquals(messages.length, 2);
        assertEquals(messages[0].text, "First");
        assertEquals(messages[1].text, "Second");
        assertEquals(messages[1].threadTs, "1.1");
      });

      it("should record uploaded files", async () => {
        await client.uploadFile("C123", undefined, "file1.md", "Content 1");
        await client.uploadFile("C123", "1.1", "file2.md", "Content 2");

        const files = client.getUploadedFiles();
        assertEquals(files.length, 2);
        assertEquals(files[0].filename, "file1.md");
        assertEquals(files[1].filename, "file2.md");
        assertEquals(files[1].threadTs, "1.1");
      });
    });
  });

  describe("SlackMessagingClientImpl with RetryHandler", () => {
    let mockSlackApi: MockSlackApi;
    let client: SlackMessagingClientImpl;

    beforeEach(() => {
      // Create a mock Slack API object
      mockSlackApi = {
        chatPostMessage: (params) =>
          Promise.resolve({
            ok: true,
            ts: "1234567890.123456",
            channel: params.channel,
          }),
        filesUpload: (_params) =>
          Promise.resolve({
            ok: true,
            file: { id: "F1234567890" },
          }),
      };

      // Create client with mock API
      client = new SlackMessagingClientImpl(mockSlackApi);
    });

    describe("Rate limit error handling", () => {
      it("should extract retry-after from SlackRateLimitError", async () => {
        let attempts = 0;
        mockSlackApi.chatPostMessage = () => {
          attempts++;
          throw new SlackRateLimitError(
            "Rate limited",
            "Too many requests",
            "Wait and retry",
            30,
          );
        };

        await assertRejects(
          () => client.postMessage("C123", undefined, "Test"),
          SlackRateLimitError,
          "Rate limited",
        );

        // Should retry 3 times
        assertEquals(attempts, 3);
      });

      it("should retry network timeout errors", async () => {
        let attempts = 0;
        mockSlackApi.chatPostMessage = () => {
          attempts++;
          if (attempts < 2) {
            throw new NetworkTimeoutError(
              "Timeout",
              "Request timed out",
              "Retry",
            );
          }
          return Promise.resolve({
            ok: true,
            ts: "1234567890.123456",
            channel: "C123",
          });
        };

        const result = await client.postMessage("C123", undefined, "Test");

        assertEquals(result.ok, true);
        assertEquals(attempts, 2);
      });

      it("should not retry permanent errors", async () => {
        let attempts = 0;
        mockSlackApi.chatPostMessage = () => {
          attempts++;
          throw new ValidationError(
            "Invalid channel",
            "Channel not found",
            "Check channel ID",
          );
        };

        await assertRejects(
          () => client.postMessage("C123", undefined, "Test"),
          ValidationError,
        );

        assertEquals(attempts, 1, "Should not retry permanent errors");
      });
    });

    describe("File upload retry logic", () => {
      it("should retry file upload on transient errors", async () => {
        let attempts = 0;
        mockSlackApi.filesUpload = () => {
          attempts++;
          if (attempts < 2) {
            throw new NetworkTimeoutError(
              "Upload timeout",
              "Connection lost",
              "Retry upload",
            );
          }
          return Promise.resolve({
            ok: true,
            file: { id: "F1234567890" },
          });
        };

        const result = await client.uploadFile(
          "C123",
          undefined,
          "test.md",
          "content",
        );

        assertEquals(result.ok, true);
        assertEquals(attempts, 2);
      });

      it("should handle rate limit on file upload", async () => {
        let attempts = 0;
        mockSlackApi.filesUpload = () => {
          attempts++;
          throw new SlackRateLimitError(
            "Upload rate limited",
            "Too many files",
            "Wait before retry",
            60,
          );
        };

        await assertRejects(
          () => client.uploadFile("C123", undefined, "test.md", "content"),
          SlackRateLimitError,
        );

        assertEquals(attempts, 3);
      });
    });

    describe("Threading behavior", () => {
      it("should include thread_ts in postMessage when provided", async () => {
        let capturedParams: {
          channel: string;
          text: string;
          thread_ts?: string;
          blocks?: unknown[];
        } | undefined;
        mockSlackApi.chatPostMessage = (params) => {
          capturedParams = params;
          return Promise.resolve({
            ok: true,
            ts: "1234567890.123456",
            channel: params.channel,
          });
        };

        await client.postMessage("C123", "1111.222", "Threaded message");

        assertEquals(capturedParams!.thread_ts, "1111.222");
        assertEquals(capturedParams!.channel, "C123");
        assertEquals(capturedParams!.text, "Threaded message");
      });

      it("should omit thread_ts when not provided", async () => {
        let capturedParams: {
          channel: string;
          text: string;
          thread_ts?: string;
          blocks?: unknown[];
        } | undefined;
        mockSlackApi.chatPostMessage = (params) => {
          capturedParams = params;
          return Promise.resolve({
            ok: true,
            ts: "1234567890.123456",
            channel: params.channel,
          });
        };

        await client.postMessage("C123", undefined, "Non-threaded message");

        assertEquals(capturedParams!.thread_ts, undefined);
        assertEquals(capturedParams!.text, "Non-threaded message");
      });

      it("should include thread_ts in uploadFile when provided", async () => {
        let capturedParams: {
          channels: string;
          content: string;
          filename: string;
          thread_ts?: string;
          filetype?: string;
        } | undefined;
        mockSlackApi.filesUpload = (params) => {
          capturedParams = params;
          return Promise.resolve({
            ok: true,
            file: { id: "F123" },
          });
        };

        await client.uploadFile("C123", "1111.222", "file.md", "content");

        assertEquals(capturedParams!.thread_ts, "1111.222");
        assertEquals(capturedParams!.filename, "file.md");
      });
    });

    describe("onRetry callback integration", () => {
      it("should call onRetry callback before retries", async () => {
        const retryEvents: Array<{
          attempt: number;
          delay: number;
          errorType: string;
        }> = [];

        let attempts = 0;
        mockSlackApi.chatPostMessage = () => {
          attempts++;
          throw new NetworkTimeoutError("Timeout", "Test", "Retry");
        };

        // Create client with custom retry config
        const customClient = new SlackMessagingClientImpl(mockSlackApi, {
          maxAttempts: 3,
          baseDelayMs: 10,
          multiplier: 2,
          onRetry: (attempt: number, delay: number, error) => {
            retryEvents.push({
              attempt,
              delay,
              errorType: error.type,
            });
          },
        });

        await assertRejects(
          () => customClient.postMessage("C123", undefined, "Test"),
          NetworkTimeoutError,
        );

        // Should have 2 retry events (attempts 2 and 3)
        assertEquals(retryEvents.length, 2);
        assertEquals(retryEvents[0].attempt, 2);
        assertEquals(retryEvents[0].delay, 10);
        assertEquals(retryEvents[0].errorType, "NetworkTimeoutError");
        assertEquals(retryEvents[1].attempt, 3);
        assertEquals(retryEvents[1].delay, 20);
      });
    });

    describe("Blocks parameter support", () => {
      it("should pass blocks to Slack API", async () => {
        let capturedParams: {
          channel: string;
          text: string;
          thread_ts?: string;
          blocks?: unknown[];
        } | undefined;
        mockSlackApi.chatPostMessage = (params) => {
          capturedParams = params;
          return Promise.resolve({
            ok: true,
            ts: "1234567890.123456",
            channel: params.channel,
          });
        };

        const blocks = [
          {
            type: "section",
            text: { type: "mrkdwn", text: "*Bold*" },
          },
        ];

        await client.postMessage("C123", undefined, "Fallback", blocks);

        assertEquals(capturedParams!.blocks, blocks);
        assertEquals(capturedParams!.text, "Fallback");
      });

      it("should work without blocks parameter", async () => {
        let capturedParams: {
          channel: string;
          text: string;
          thread_ts?: string;
          blocks?: unknown[];
        } | undefined;
        mockSlackApi.chatPostMessage = (params) => {
          capturedParams = params;
          return Promise.resolve({
            ok: true,
            ts: "1234567890.123456",
            channel: params.channel,
          });
        };

        await client.postMessage("C123", undefined, "Plain text");

        assertEquals(capturedParams!.blocks, undefined);
        assertEquals(capturedParams!.text, "Plain text");
      });
    });
  });
});

describe("Property 11: Retry Logic for Messaging Client", () => {
  /**
   * Property 11: For any transient error (timeout, rate limit),
   * the messaging client should retry with exponential backoff up to 3 times.
   */

  it("should retry exactly 3 times for all transient errors", async () => {
    const transientErrorFactories = [
      () => new NetworkTimeoutError("Timeout", "Network timeout", "Retry later"),
      () =>
        new SlackRateLimitError(
          "Rate limited",
          "Too many requests",
          "Wait",
          30,
        ),
    ];

    for (const createError of transientErrorFactories) {
      let attempts = 0;

      const mockApi: MockSlackApi = {
        chatPostMessage: () => {
          attempts++;
          throw createError();
        },
        filesUpload: () => {
          attempts++;
          throw createError();
        },
      };

      const client = new SlackMessagingClientImpl(mockApi, {
        maxAttempts: 3,
        baseDelayMs: 1,
        multiplier: 2,
      });

      // Test postMessage
      attempts = 0;
      await assertRejects(
        () => client.postMessage("C123", undefined, "Test"),
      );
      assertEquals(
        attempts,
        3,
        `postMessage should retry 3 times for ${createError().type}`,
      );

      // Test uploadFile
      attempts = 0;
      await assertRejects(
        () => client.uploadFile("C123", undefined, "test.md", "content"),
      );
      assertEquals(
        attempts,
        3,
        `uploadFile should retry 3 times for ${createError().type}`,
      );
    }
  });

  it("should apply exponential backoff between retries", async () => {
    const delays: number[] = [];

    const mockApi: MockSlackApi = {
      chatPostMessage: () => {
        throw new NetworkTimeoutError("Timeout", "Test", "Retry");
      },
      filesUpload: () =>
        Promise.resolve({
          ok: true,
          file: { id: "F123" },
        }),
    };

    const client = new SlackMessagingClientImpl(mockApi, {
      maxAttempts: 4,
      baseDelayMs: 100,
      multiplier: 2,
      onRetry: (_attempt: number, delay: number) => {
        delays.push(delay);
      },
    });

    await assertRejects(
      () => client.postMessage("C123", undefined, "Test"),
    );

    // Delays before attempts 2, 3, 4
    assertEquals(delays, [100, 200, 400]);
  });

  it("should succeed if operation succeeds within retry limit", async () => {
    let attempts = 0;

    const mockApi: MockSlackApi = {
      chatPostMessage: () => {
        attempts++;
        if (attempts < 2) {
          throw new NetworkTimeoutError("Timeout", "Test", "Retry");
        }
        return Promise.resolve({
          ok: true,
          ts: "1234567890.123456",
          channel: "C123",
        });
      },
      filesUpload: () =>
        Promise.resolve({
          ok: true,
          file: { id: "F123" },
        }),
    };

    const client = new SlackMessagingClientImpl(mockApi);

    const result = await client.postMessage("C123", undefined, "Test");

    assertEquals(result.ok, true);
    assertEquals(attempts, 2);
  });
});
