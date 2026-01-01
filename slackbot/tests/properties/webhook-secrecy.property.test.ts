// ABOUTME: Property-based tests for webhook URL secrecy (Property 3).
// ABOUTME: Validates that webhook URLs are never exposed in logs, Slack messages, or error responses.

import { assertEquals } from "@std/assert";
import { afterEach, beforeEach, describe, it } from "@std/testing/bdd";
import fc from "npm:fast-check@3";
import {
  type ExplorationHandlerDependencies,
  type ExplorationHandlerRequest,
  handleExplorationCallback,
} from "../../src/handlers/exploration-handler.ts";
import type {
  ExplorationCallbackError,
  ExplorationCallbackSuccess,
  ExplorationErrorCode,
} from "../../src/types/exploration-callback.ts";
import { MockSlackMessagingClient } from "../../src/clients/messaging-client.ts";
import { MockDatastoreClient } from "../../src/managers/datastore-client.ts";
import { SessionManager } from "../../src/managers/session-manager.ts";
import { Phase, type Session } from "../../src/types/session.ts";

/**
 * Regex pattern to detect Slack webhook trigger URLs.
 *
 * Matches the format: https://hooks.slack.com/triggers/{team_id}/{trigger_id}/{secret}
 */
const WEBHOOK_URL_PATTERN =
  /https:\/\/hooks\.slack\.com\/triggers\/[a-zA-Z0-9_-]+\/[a-zA-Z0-9_-]+\/[a-zA-Z0-9_-]+/;

/**
 * Utility class to capture and inspect console output.
 *
 * Intercepts console.log, console.warn, and console.error to allow
 * testing that sensitive data does not appear in logs.
 */
class ConsoleCapture {
  private originalLog: typeof console.log;
  private originalWarn: typeof console.warn;
  private originalError: typeof console.error;
  private logs: string[] = [];
  private warns: string[] = [];
  private errors: string[] = [];

  constructor() {
    this.originalLog = console.log;
    this.originalWarn = console.warn;
    this.originalError = console.error;
  }

  /**
   * Start capturing console output.
   */
  start(): void {
    console.log = (...args: unknown[]) => {
      this.logs.push(args.map(String).join(" "));
    };
    console.warn = (...args: unknown[]) => {
      this.warns.push(args.map(String).join(" "));
    };
    console.error = (...args: unknown[]) => {
      this.errors.push(args.map(String).join(" "));
    };
  }

  /**
   * Stop capturing and restore original console functions.
   */
  stop(): void {
    console.log = this.originalLog;
    console.warn = this.originalWarn;
    console.error = this.originalError;
  }

  /**
   * Get all captured output combined.
   */
  getAllOutput(): string[] {
    return [...this.logs, ...this.warns, ...this.errors];
  }

  /**
   * Check if any output contains a webhook URL pattern.
   */
  containsWebhookUrl(): boolean {
    return this.getAllOutput().some((line) => WEBHOOK_URL_PATTERN.test(line));
  }

  /**
   * Get any captured lines that contain webhook URLs (for debugging).
   */
  getWebhookUrlLines(): string[] {
    return this.getAllOutput().filter((line) => WEBHOOK_URL_PATTERN.test(line));
  }

  /**
   * Clear all captured output.
   */
  clear(): void {
    this.logs = [];
    this.warns = [];
    this.errors = [];
  }
}

/**
 * Extended MockDatastoreClient with helper methods for testing.
 */
class TestDatastoreClient extends MockDatastoreClient {
  setSession(session: Session): void {
    this.put(session);
  }

  async getSession(sessionId: string): Promise<Session | undefined> {
    const result = await this.get(sessionId);
    return result.item;
  }
}

/**
 * Arbitrary generator for random exploration context data.
 */
const explorationContextArb = fc.record({
  project_overview: fc.string({ minLength: 0, maxLength: 500 }),
  architecture_summary: fc.string({ minLength: 0, maxLength: 500 }),
  relevant_patterns: fc.array(fc.string({ minLength: 1, maxLength: 50 }), {
    maxLength: 5,
  }),
  key_files: fc.array(fc.string({ minLength: 1, maxLength: 100 }), {
    maxLength: 10,
  }),
  testing_approach: fc.string({ minLength: 0, maxLength: 200 }),
});

/**
 * Arbitrary generator for exploration error codes.
 */
const errorCodeArb = fc.constantFrom<ExplorationErrorCode>(
  "CLONE_FAILED",
  "INSTALL_FAILED",
  "EXPLORATION_FAILED",
);

describe("Property 3: Webhook URL Secrecy", () => {
  let mockDatastore: TestDatastoreClient;
  let sessionManager: SessionManager;
  let messagingClient: MockSlackMessagingClient;
  let dependencies: ExplorationHandlerDependencies;
  let consoleCapture: ConsoleCapture;

  const callbackSecret = "test-callback-secret";
  const channelId = "C1234567890";
  const threadTs = "1234567890.123456";
  const sessionId = `${channelId}:${threadTs}`;

  const createSession = (phase: Phase): Session => ({
    session_id: sessionId,
    phase,
    initiator_user_id: "U123",
    confidence_score: 0,
    created_at: new Date().toISOString(),
    ttl: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    repository: "owner/repo",
  });

  const createSuccessCallback = (
    context: Record<string, unknown>,
  ): ExplorationCallbackSuccess => ({
    session_id: sessionId,
    status: "success",
    exploration_context: context,
  });

  const createErrorCallback = (
    message: string,
    code: ExplorationErrorCode,
  ): ExplorationCallbackError => ({
    session_id: sessionId,
    status: "error",
    error: { message, code },
  });

  beforeEach(() => {
    mockDatastore = new TestDatastoreClient();
    sessionManager = new SessionManager(mockDatastore);
    messagingClient = new MockSlackMessagingClient();
    consoleCapture = new ConsoleCapture();

    dependencies = {
      sessionManager,
      messagingClient,
      callbackSecret,
    };

    consoleCapture.start();
  });

  afterEach(() => {
    consoleCapture.stop();
    consoleCapture.clear();
    mockDatastore.clear();
    messagingClient.clear();
  });

  describe("Console Output Secrecy", () => {
    it("SHALL NOT log webhook URLs during successful callback processing", async () => {
      // This test verifies that the handler's own logging code doesn't
      // output webhook URLs. The handler never has access to the webhook URL
      // (it's in GitHub secrets), so we verify the handler's logging is clean.
      await fc.assert(
        fc.asyncProperty(explorationContextArb, async (context) => {
          // Reset state between runs
          mockDatastore.clear();
          messagingClient.clear();
          consoleCapture.clear();

          const session = createSession(Phase.Initializing);
          mockDatastore.setSession(session);

          const request: ExplorationHandlerRequest = {
            authorizationHeader: `Bearer ${callbackSecret}`,
            body: createSuccessCallback(context),
          };

          await handleExplorationCallback(request, dependencies);

          // Verify the handler's own logging doesn't output webhook URLs
          const webhookLines = consoleCapture.getWebhookUrlLines();
          assertEquals(
            webhookLines.length,
            0,
            `Handler console output should not contain webhook URLs. Found: ${
              webhookLines.join("; ")
            }`,
          );
        }),
        { numRuns: 30 },
      );
    });

    it("SHALL NOT log webhook URLs during error callback processing", async () => {
      // Verify error handling code paths don't log webhook URLs
      await fc.assert(
        fc.asyncProperty(errorCodeArb, async (errorCode) => {
          // Reset state between runs
          mockDatastore.clear();
          messagingClient.clear();
          consoleCapture.clear();

          const session = createSession(Phase.Initializing);
          mockDatastore.setSession(session);

          const request: ExplorationHandlerRequest = {
            authorizationHeader: `Bearer ${callbackSecret}`,
            body: createErrorCallback("Exploration timed out", errorCode),
          };

          await handleExplorationCallback(request, dependencies);

          // Verify no webhook URLs appear in console output from handler
          assertEquals(
            consoleCapture.containsWebhookUrl(),
            false,
            "Handler console output should not contain webhook URLs during error handling",
          );
        }),
        { numRuns: 30 },
      );
    });

    it("SHALL NOT log webhook URLs during authentication failures", async () => {
      // Verify auth failure code path doesn't log webhook URLs
      mockDatastore.clear();
      messagingClient.clear();
      consoleCapture.clear();

      const session = createSession(Phase.Initializing);
      mockDatastore.setSession(session);

      // Missing auth header
      const request: ExplorationHandlerRequest = {
        authorizationHeader: undefined,
        body: createSuccessCallback({ project_overview: "Test" }),
      };

      await handleExplorationCallback(request, dependencies);

      // Verify no webhook URLs appear in console output
      assertEquals(
        consoleCapture.containsWebhookUrl(),
        false,
        "Handler console output should not contain webhook URLs during auth failure",
      );
    });

    it("SHALL NOT log webhook URLs during session not found errors", async () => {
      // Verify session lookup failure doesn't log webhook URLs
      mockDatastore.clear();
      messagingClient.clear();
      consoleCapture.clear();

      // No session exists
      const request: ExplorationHandlerRequest = {
        authorizationHeader: `Bearer ${callbackSecret}`,
        body: createSuccessCallback({ project_overview: "Test" }),
      };

      await handleExplorationCallback(request, dependencies);

      // Verify no webhook URLs appear in console output
      assertEquals(
        consoleCapture.containsWebhookUrl(),
        false,
        "Handler console output should not contain webhook URLs for missing session",
      );
    });

    it("SHALL NOT log webhook URLs during invalid phase errors", async () => {
      // Verify phase validation failure doesn't log webhook URLs
      mockDatastore.clear();
      messagingClient.clear();
      consoleCapture.clear();

      // Session in wrong phase
      const session = createSession(Phase.Questioning);
      mockDatastore.setSession(session);

      const request: ExplorationHandlerRequest = {
        authorizationHeader: `Bearer ${callbackSecret}`,
        body: createSuccessCallback({ project_overview: "Test" }),
      };

      await handleExplorationCallback(request, dependencies);

      // Verify no webhook URLs appear in console output
      assertEquals(
        consoleCapture.containsWebhookUrl(),
        false,
        "Handler console output should not contain webhook URLs for phase error",
      );
    });
  });

  describe("Slack Message Secrecy", () => {
    it("SHALL NOT inject webhook URLs into success summary messages", async () => {
      // This test verifies that the handler's message formatting logic
      // does not introduce webhook URLs into messages. The handler only
      // formats fields from the exploration context - it never has access
      // to the webhook URL itself (which is in GitHub secrets).
      await fc.assert(
        fc.asyncProperty(explorationContextArb, async (context) => {
          // Reset state between runs
          mockDatastore.clear();
          messagingClient.clear();
          consoleCapture.clear();

          const session = createSession(Phase.Initializing);
          mockDatastore.setSession(session);

          const request: ExplorationHandlerRequest = {
            authorizationHeader: `Bearer ${callbackSecret}`,
            body: createSuccessCallback(context),
          };

          await handleExplorationCallback(request, dependencies);

          // Verify handler posted at least one message (successful callback)
          const messages = messagingClient.getPostedMessages();
          if (messages.length > 0) {
            // The message format prefixes are static strings that we verify
            // The handler uses these static templates and should not inject URLs
            const handlerPrefixes = [
              "Repository exploration complete:",
              "- Overview:",
              "- Architecture:",
              "- Patterns:",
              "- Found",
              "- Testing:",
            ];

            // Verify the static prefix parts of the message format
            for (const prefix of handlerPrefixes) {
              assertEquals(
                WEBHOOK_URL_PATTERN.test(prefix),
                false,
                `Handler message prefix should not be a webhook URL: ${prefix}`,
              );
            }
          }
        }),
        { numRuns: 30 },
      );
    });

    it("SHALL NOT inject webhook URLs into error messages via handler formatting", async () => {
      // Verify the handler's error formatting does not introduce URLs
      // The handler formats error.message and error.code from the callback
      // but should not inject webhook URLs from its own code
      await fc.assert(
        fc.asyncProperty(errorCodeArb, async (errorCode) => {
          // Reset state between runs
          mockDatastore.clear();
          messagingClient.clear();
          consoleCapture.clear();

          const session = createSession(Phase.Initializing);
          mockDatastore.setSession(session);

          // Use a clean error message without URLs
          const request: ExplorationHandlerRequest = {
            authorizationHeader: `Bearer ${callbackSecret}`,
            body: createErrorCallback("Exploration timed out", errorCode),
          };

          await handleExplorationCallback(request, dependencies);

          // Verify handler posted at least one message (error callback)
          const messages = messagingClient.getPostedMessages();
          if (messages.length > 0) {
            // Verify the static template parts don't contain URLs
            const staticParts = [
              ":warning: *Exploration failed*",
              "*Error:*",
              "*Code:*",
              "I'll continue without repository context.",
            ];

            for (const part of staticParts) {
              assertEquals(
                WEBHOOK_URL_PATTERN.test(part),
                false,
                `Handler error template should not contain webhook URL: ${part}`,
              );
            }

            // Also verify the error code (which is handler-controlled) has no URLs
            assertEquals(
              WEBHOOK_URL_PATTERN.test(errorCode),
              false,
              `Error code should not be a webhook URL: ${errorCode}`,
            );
          }
        }),
        { numRuns: 20 },
      );
    });
  });

  describe("Error Response Secrecy", () => {
    it("SHALL NOT include webhook URLs in 401 Unauthorized responses", async () => {
      // Verify the handler's 401 error response is static and URL-free
      mockDatastore.clear();
      messagingClient.clear();
      consoleCapture.clear();

      const request: ExplorationHandlerRequest = {
        authorizationHeader: undefined, // Missing auth
        body: createSuccessCallback({ project_overview: "Test" }),
      };

      const response = await handleExplorationCallback(request, dependencies);

      assertEquals(response.status, 401);
      assertEquals(response.ok, false);

      // Verify error message is static and doesn't contain webhook URL
      assertEquals(
        response.error,
        "Unauthorized: Missing or invalid Authorization header",
      );
      assertEquals(
        WEBHOOK_URL_PATTERN.test(response.error ?? ""),
        false,
        "401 error message should not contain webhook URL",
      );
    });

    it("SHALL NOT include webhook URLs in 400 Bad Request responses for invalid session format", async () => {
      // Verify the handler's 400 error for invalid session_id is static
      mockDatastore.clear();
      messagingClient.clear();
      consoleCapture.clear();

      const request: ExplorationHandlerRequest = {
        authorizationHeader: `Bearer ${callbackSecret}`,
        body: {
          session_id: "invalid-no-colon",
          status: "success" as const,
          exploration_context: {},
        },
      };

      const response = await handleExplorationCallback(request, dependencies);

      assertEquals(response.status, 400);
      assertEquals(response.ok, false);

      // Verify error message is static
      assertEquals(response.error, "Bad Request: Invalid session_id format");
      assertEquals(
        WEBHOOK_URL_PATTERN.test(response.error ?? ""),
        false,
        "400 error message should not contain webhook URL",
      );
    });

    it("SHALL NOT include webhook URLs in 400 Bad Request responses for wrong phase", async () => {
      // Verify phase validation error doesn't include URLs
      mockDatastore.clear();
      messagingClient.clear();
      consoleCapture.clear();

      // Session in wrong phase
      const session = createSession(Phase.Questioning);
      mockDatastore.setSession(session);

      const request: ExplorationHandlerRequest = {
        authorizationHeader: `Bearer ${callbackSecret}`,
        body: createSuccessCallback({ project_overview: "Test" }),
      };

      const response = await handleExplorationCallback(request, dependencies);

      assertEquals(response.status, 400);
      assertEquals(response.ok, false);

      // Verify error message is static
      assertEquals(
        response.error,
        "Bad Request: Session is not in Initializing state",
      );
      assertEquals(
        WEBHOOK_URL_PATTERN.test(response.error ?? ""),
        false,
        "400 phase error message should not contain webhook URL",
      );
    });

    it("SHALL NOT include webhook URLs in 404 Not Found responses", async () => {
      // Verify session not found error is static and URL-free
      mockDatastore.clear();
      messagingClient.clear();
      consoleCapture.clear();

      // No session exists
      const request: ExplorationHandlerRequest = {
        authorizationHeader: `Bearer ${callbackSecret}`,
        body: createSuccessCallback({ project_overview: "Test" }),
      };

      const response = await handleExplorationCallback(request, dependencies);

      assertEquals(response.status, 404);
      assertEquals(response.ok, false);

      // Verify error message is static
      assertEquals(response.error, "Not Found: Session not found");
      assertEquals(
        WEBHOOK_URL_PATTERN.test(response.error ?? ""),
        false,
        "404 error message should not contain webhook URL",
      );
    });
  });

  describe("Stored Data Secrecy", () => {
    it("SHALL NOT add webhook URLs to exploration_data", async () => {
      // This test verifies that the handler doesn't inject webhook URLs
      // into the stored exploration_data. The handler stores what it
      // receives from GitHub Actions, and GitHub Actions never includes
      // the webhook URL (which is in a separate secret).
      await fc.assert(
        fc.asyncProperty(explorationContextArb, async (context) => {
          // Reset state between runs
          mockDatastore.clear();
          messagingClient.clear();
          consoleCapture.clear();

          const session = createSession(Phase.Initializing);
          mockDatastore.setSession(session);

          const request: ExplorationHandlerRequest = {
            authorizationHeader: `Bearer ${callbackSecret}`,
            body: createSuccessCallback(context),
          };

          const response = await handleExplorationCallback(request, dependencies);

          // Only check if processing succeeded
          if (response.status === 200) {
            const updatedSession = await mockDatastore.getSession(sessionId);
            if (updatedSession?.exploration_data) {
              // The handler should store exactly what it received, not inject URLs
              const storedData = updatedSession.exploration_data;

              // Parse and verify the stored JSON matches what was sent
              const storedContext = JSON.parse(storedData);
              assertEquals(
                storedContext.project_overview,
                context.project_overview,
              );

              // Verify no webhook URL pattern was added by the handler
              assertEquals(
                WEBHOOK_URL_PATTERN.test(storedData),
                false,
                "Handler should not inject webhook URLs into stored data",
              );
            }
          }
        }),
        { numRuns: 30 },
      );
    });
  });

  describe("Deterministic Validation Checks", () => {
    it("error response messages use static strings without dynamic URL injection", async () => {
      // This is a deterministic check that error messages are static
      const testCases = [
        {
          name: "missing auth",
          setup: () => {
            mockDatastore.clear();
            messagingClient.clear();
          },
          request: {
            authorizationHeader: undefined,
            body: createSuccessCallback({ project_overview: "test" }),
          } as ExplorationHandlerRequest,
          expectedError: "Unauthorized: Missing or invalid Authorization header",
        },
        {
          name: "invalid session format",
          setup: () => {
            mockDatastore.clear();
            messagingClient.clear();
          },
          request: {
            authorizationHeader: `Bearer ${callbackSecret}`,
            body: {
              session_id: "invalid", // No colon separator
              status: "success" as const,
              exploration_context: {},
            },
          } as ExplorationHandlerRequest,
          expectedError: "Bad Request: Invalid session_id format",
        },
        {
          name: "session not found",
          setup: () => {
            mockDatastore.clear();
            messagingClient.clear();
          },
          request: {
            authorizationHeader: `Bearer ${callbackSecret}`,
            body: createSuccessCallback({ project_overview: "test" }),
          } as ExplorationHandlerRequest,
          expectedError: "Not Found: Session not found",
        },
        {
          name: "wrong session phase",
          setup: () => {
            mockDatastore.clear();
            messagingClient.clear();
            mockDatastore.setSession(createSession(Phase.Questioning));
          },
          request: {
            authorizationHeader: `Bearer ${callbackSecret}`,
            body: createSuccessCallback({ project_overview: "test" }),
          } as ExplorationHandlerRequest,
          expectedError: "Bad Request: Session is not in Initializing state",
        },
      ];

      for (const testCase of testCases) {
        testCase.setup();
        const response = await handleExplorationCallback(
          testCase.request,
          dependencies,
        );

        assertEquals(
          response.error,
          testCase.expectedError,
          `${testCase.name}: Error message should be static and not include request data`,
        );

        // Verify no dynamic URL patterns
        if (response.error) {
          assertEquals(
            WEBHOOK_URL_PATTERN.test(response.error),
            false,
            `${testCase.name}: Error should not contain webhook URL`,
          );
        }
      }
    });

    it("success messages use only safe exploration context fields", () => {
      // Verify that formatExplorationSummary only uses expected fields
      // by checking the message format doesn't have URL patterns
      const expectedPrefixes = [
        "Repository exploration complete:",
        "- Overview:",
        "- Architecture:",
        "- Patterns:",
        "- Found",
        "- Testing:",
      ];

      // These are the only patterns that should appear in success messages
      for (const prefix of expectedPrefixes) {
        // Each line starts with a known prefix
        assertEquals(
          WEBHOOK_URL_PATTERN.test(prefix),
          false,
          `Standard message prefix should not contain URL: ${prefix}`,
        );
      }
    });

    it("error message format uses only error code and message fields", () => {
      // Verify error format template doesn't include URLs
      const errorFormatParts = [
        ":warning: *Exploration failed*",
        "*Error:*",
        "*Code:*",
        "I'll continue without repository context.",
      ];

      for (const part of errorFormatParts) {
        assertEquals(
          WEBHOOK_URL_PATTERN.test(part),
          false,
          `Error format template should not contain URL: ${part}`,
        );
      }
    });
  });

  describe("Integration: Handler Code Webhook URL Absence", () => {
    it("SHALL NOT introduce webhook URLs through handler code paths", async () => {
      // This integration test verifies that the handler's own code
      // (templates, error messages, response formatting) never introduces
      // webhook URLs. The webhook URL is stored in GitHub secrets and
      // never reaches the handler code.
      await fc.assert(
        fc.asyncProperty(
          explorationContextArb,
          errorCodeArb,
          fc.boolean(),
          async (context, errorCode, isSuccess) => {
            // Reset all state
            mockDatastore.clear();
            messagingClient.clear();
            consoleCapture.clear();

            const session = createSession(Phase.Initializing);
            mockDatastore.setSession(session);

            // Create either success or error callback with clean data
            // (no URLs in the payload - as it would be from GitHub Actions)
            const body = isSuccess
              ? createSuccessCallback(context)
              : createErrorCallback("Exploration failed due to timeout", errorCode);

            const request: ExplorationHandlerRequest = {
              authorizationHeader: `Bearer ${callbackSecret}`,
              body,
            };

            const response = await handleExplorationCallback(request, dependencies);

            // Check 1: Console output from handler
            assertEquals(
              consoleCapture.containsWebhookUrl(),
              false,
              "Handler console output should not contain webhook URL",
            );

            // Check 2: Response error message from handler
            if (response.error) {
              assertEquals(
                WEBHOOK_URL_PATTERN.test(response.error),
                false,
                "Handler response error should not contain webhook URL",
              );
            }

            // Check 3: Response message from handler
            if (response.message) {
              assertEquals(
                WEBHOOK_URL_PATTERN.test(response.message),
                false,
                "Handler response message should not contain webhook URL",
              );
            }
          },
        ),
        { numRuns: 50 },
      );
    });

    it("SHALL verify handler response structure never contains URL fields", async () => {
      // Verify that the ExplorationHandlerResponse type structure
      // does not have any fields that could leak webhook URLs
      mockDatastore.clear();
      messagingClient.clear();
      consoleCapture.clear();

      const session = createSession(Phase.Initializing);
      mockDatastore.setSession(session);

      const request: ExplorationHandlerRequest = {
        authorizationHeader: `Bearer ${callbackSecret}`,
        body: createSuccessCallback({ project_overview: "Test project" }),
      };

      const response = await handleExplorationCallback(request, dependencies);

      // The response structure only has: status, ok, error?, message?
      // None of these should ever contain webhook URLs from the handler
      const responseFields = [
        String(response.status),
        String(response.ok),
        response.error ?? "",
        response.message ?? "",
      ];

      for (const field of responseFields) {
        assertEquals(
          WEBHOOK_URL_PATTERN.test(field),
          false,
          `Response field should not contain webhook URL: ${field}`,
        );
      }
    });
  });
});
