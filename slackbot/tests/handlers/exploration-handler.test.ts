// ABOUTME: Tests for exploration callback handler that receives GitHub Actions results.
// ABOUTME: Validates authentication, payload parsing, session lookup, and orchestrator integration.

import { assertEquals, assertExists } from "@std/assert";
import { afterEach, beforeEach, describe, it } from "@std/testing/bdd";
import {
  type ExplorationHandlerDependencies,
  type ExplorationHandlerRequest,
  handleExplorationCallback,
  parseSessionId,
  validateAuthorizationHeader,
} from "../../src/handlers/exploration-handler.ts";
import type {
  ExplorationCallback,
  ExplorationCallbackError,
  ExplorationCallbackSuccess,
} from "../../src/types/exploration-callback.ts";
import { MockSlackMessagingClient } from "../../src/clients/messaging-client.ts";
import { MockDatastoreClient } from "../../src/managers/datastore-client.ts";
import { SessionManager } from "../../src/managers/session-manager.ts";
import { Phase, type Session } from "../../src/types/session.ts";

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

describe("Exploration Handler", () => {
  describe("validateAuthorizationHeader", () => {
    const validSecret = "test-callback-secret-12345";

    it("should return true for valid Bearer token matching secret", () => {
      const header = `Bearer ${validSecret}`;

      const result = validateAuthorizationHeader(header, validSecret);

      assertEquals(result, true);
    });

    it("should return false for missing Authorization header", () => {
      const result = validateAuthorizationHeader(undefined, validSecret);

      assertEquals(result, false);
    });

    it("should return false for empty Authorization header", () => {
      const result = validateAuthorizationHeader("", validSecret);

      assertEquals(result, false);
    });

    it("should return false for wrong token", () => {
      const header = "Bearer wrong-token";

      const result = validateAuthorizationHeader(header, validSecret);

      assertEquals(result, false);
    });

    it("should return false for missing Bearer prefix", () => {
      const header = validSecret;

      const result = validateAuthorizationHeader(header, validSecret);

      assertEquals(result, false);
    });

    it("should return false for lowercase bearer prefix", () => {
      const header = `bearer ${validSecret}`;

      const result = validateAuthorizationHeader(header, validSecret);

      assertEquals(result, false);
    });

    it("should return false for Basic auth instead of Bearer", () => {
      const header = `Basic ${validSecret}`;

      const result = validateAuthorizationHeader(header, validSecret);

      assertEquals(result, false);
    });
  });

  describe("parseSessionId", () => {
    it("should parse channelId and threadTs from valid session ID", () => {
      const sessionId = "C1234567890:1234567890.123456";

      const result = parseSessionId(sessionId);

      assertExists(result);
      assertEquals(result.channelId, "C1234567890");
      assertEquals(result.threadTs, "1234567890.123456");
    });

    it("should handle session ID with complex thread timestamp", () => {
      const sessionId = "C9999999999:9999999999.999999";

      const result = parseSessionId(sessionId);

      assertExists(result);
      assertEquals(result.channelId, "C9999999999");
      assertEquals(result.threadTs, "9999999999.999999");
    });

    it("should return null for session ID without colon", () => {
      const sessionId = "invalid-session-id";

      const result = parseSessionId(sessionId);

      assertEquals(result, null);
    });

    it("should return null for empty session ID", () => {
      const sessionId = "";

      const result = parseSessionId(sessionId);

      assertEquals(result, null);
    });

    it("should return null for session ID with only colon", () => {
      const sessionId = ":";

      const result = parseSessionId(sessionId);

      assertEquals(result, null);
    });

    it("should return null for session ID with empty channelId", () => {
      const sessionId = ":1234567890.123456";

      const result = parseSessionId(sessionId);

      assertEquals(result, null);
    });

    it("should return null for session ID with empty threadTs", () => {
      const sessionId = "C1234567890:";

      const result = parseSessionId(sessionId);

      assertEquals(result, null);
    });
  });

  describe("handleExplorationCallback", () => {
    let mockDatastore: TestDatastoreClient;
    let sessionManager: SessionManager;
    let messagingClient: MockSlackMessagingClient;
    let dependencies: ExplorationHandlerDependencies;

    const callbackSecret = "test-callback-secret";
    const channelId = "C1234567890";
    const threadTs = "1234567890.123456";
    const sessionId = `${channelId}:${threadTs}`;

    const createValidSession = (): Session => ({
      session_id: sessionId,
      phase: Phase.Initializing,
      initiator_user_id: "U123",
      confidence_score: 0,
      created_at: new Date().toISOString(),
      ttl: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      repository: "owner/repo",
    });

    const createSuccessCallback = (): ExplorationCallbackSuccess => ({
      session_id: sessionId,
      status: "success",
      exploration_context: {
        project_overview: "A TypeScript project",
        architecture_summary: "Clean architecture pattern",
        relevant_patterns: ["Repository pattern"],
        key_files: ["src/main.ts"],
      },
    });

    const createErrorCallback = (): ExplorationCallbackError => ({
      session_id: sessionId,
      status: "error",
      error: {
        message: "Failed to clone repository",
        code: "CLONE_FAILED",
      },
    });

    beforeEach(() => {
      mockDatastore = new TestDatastoreClient();
      sessionManager = new SessionManager(mockDatastore);
      messagingClient = new MockSlackMessagingClient();

      dependencies = {
        sessionManager,
        messagingClient,
        callbackSecret,
      };
    });

    afterEach(() => {
      mockDatastore.clear();
      messagingClient.clear();
    });

    describe("authentication validation", () => {
      it("should return 401 for missing Authorization header", async () => {
        const request: ExplorationHandlerRequest = {
          authorizationHeader: undefined,
          body: createSuccessCallback(),
        };

        const response = await handleExplorationCallback(request, dependencies);

        assertEquals(response.status, 401);
        assertEquals(response.error, "Unauthorized: Missing or invalid Authorization header");
      });

      it("should return 401 for invalid Authorization header", async () => {
        const request: ExplorationHandlerRequest = {
          authorizationHeader: "Bearer wrong-token",
          body: createSuccessCallback(),
        };

        const response = await handleExplorationCallback(request, dependencies);

        assertEquals(response.status, 401);
        assertEquals(response.error, "Unauthorized: Missing or invalid Authorization header");
      });

      it("should pass with valid Authorization header", async () => {
        mockDatastore.setSession(createValidSession());
        const request: ExplorationHandlerRequest = {
          authorizationHeader: `Bearer ${callbackSecret}`,
          body: createSuccessCallback(),
        };

        const response = await handleExplorationCallback(request, dependencies);

        assertEquals(response.status, 200);
      });
    });

    describe("payload parsing", () => {
      it("should parse valid success payload correctly", async () => {
        mockDatastore.setSession(createValidSession());
        const callback = createSuccessCallback();
        const request: ExplorationHandlerRequest = {
          authorizationHeader: `Bearer ${callbackSecret}`,
          body: callback,
        };

        const response = await handleExplorationCallback(request, dependencies);

        assertEquals(response.status, 200);
        // Verify that messages were posted (indicating successful processing)
        const messages = messagingClient.getPostedMessages();
        assertEquals(messages.length >= 1, true);
      });

      it("should parse valid error payload correctly", async () => {
        mockDatastore.setSession(createValidSession());
        const callback = createErrorCallback();
        const request: ExplorationHandlerRequest = {
          authorizationHeader: `Bearer ${callbackSecret}`,
          body: callback,
        };

        const response = await handleExplorationCallback(request, dependencies);

        assertEquals(response.status, 200);
        // Verify that an error message was posted
        const messages = messagingClient.getPostedMessages();
        const errorMessage = messages.find((m) =>
          m.text.toLowerCase().includes("error") ||
          m.text.toLowerCase().includes("failed")
        );
        assertExists(errorMessage);
      });

      it("should return 400 for invalid session_id format", async () => {
        const callback: ExplorationCallback = {
          session_id: "invalid-session-id",
          status: "success",
          exploration_context: {},
        };
        const request: ExplorationHandlerRequest = {
          authorizationHeader: `Bearer ${callbackSecret}`,
          body: callback,
        };

        const response = await handleExplorationCallback(request, dependencies);

        assertEquals(response.status, 400);
        assertEquals(response.error, "Bad Request: Invalid session_id format");
      });
    });

    describe("session lookup", () => {
      it("should return 404 for non-existent sessions", async () => {
        // Do not set any session in the datastore
        const request: ExplorationHandlerRequest = {
          authorizationHeader: `Bearer ${callbackSecret}`,
          body: createSuccessCallback(),
        };

        const response = await handleExplorationCallback(request, dependencies);

        assertEquals(response.status, 404);
        assertEquals(response.ok, false);
        assertEquals(response.error, "Not Found: Session not found");
      });

      it("should process callback when session exists in Initializing state", async () => {
        const session = createValidSession();
        session.phase = Phase.Initializing;
        mockDatastore.setSession(session);
        const request: ExplorationHandlerRequest = {
          authorizationHeader: `Bearer ${callbackSecret}`,
          body: createSuccessCallback(),
        };

        const response = await handleExplorationCallback(request, dependencies);

        assertEquals(response.status, 200);
      });
    });

    describe("session phase validation", () => {
      it("should return 400 for sessions in Questioning state", async () => {
        const session = createValidSession();
        session.phase = Phase.Questioning;
        mockDatastore.setSession(session);
        const request: ExplorationHandlerRequest = {
          authorizationHeader: `Bearer ${callbackSecret}`,
          body: createSuccessCallback(),
        };

        const response = await handleExplorationCallback(request, dependencies);

        assertEquals(response.status, 400);
        assertEquals(response.ok, false);
        assertEquals(response.error, "Bad Request: Session is not in Initializing state");
      });

      it("should return 400 for sessions in Review state", async () => {
        const session = createValidSession();
        session.phase = Phase.Review;
        mockDatastore.setSession(session);
        const request: ExplorationHandlerRequest = {
          authorizationHeader: `Bearer ${callbackSecret}`,
          body: createSuccessCallback(),
        };

        const response = await handleExplorationCallback(request, dependencies);

        assertEquals(response.status, 400);
        assertEquals(response.ok, false);
        assertEquals(response.error, "Bad Request: Session is not in Initializing state");
      });

      it("should return 400 for sessions in Finalized state", async () => {
        const session = createValidSession();
        session.phase = Phase.Finalized;
        mockDatastore.setSession(session);
        const request: ExplorationHandlerRequest = {
          authorizationHeader: `Bearer ${callbackSecret}`,
          body: createSuccessCallback(),
        };

        const response = await handleExplorationCallback(request, dependencies);

        assertEquals(response.status, 400);
        assertEquals(response.ok, false);
        assertEquals(response.error, "Bad Request: Session is not in Initializing state");
      });

      it("should reject duplicate callbacks (session already processed)", async () => {
        // First callback succeeds and transitions session to Questioning
        const session = createValidSession();
        session.phase = Phase.Initializing;
        mockDatastore.setSession(session);

        const request: ExplorationHandlerRequest = {
          authorizationHeader: `Bearer ${callbackSecret}`,
          body: createSuccessCallback(),
        };

        // First callback should succeed
        const firstResponse = await handleExplorationCallback(request, dependencies);
        assertEquals(firstResponse.status, 200);

        // Second callback should fail (session is no longer Initializing)
        const secondResponse = await handleExplorationCallback(request, dependencies);
        assertEquals(secondResponse.status, 400);
        assertEquals(secondResponse.error, "Bad Request: Session is not in Initializing state");
      });
    });

    describe("success callback handling", () => {
      it("should post exploration summary to thread on success", async () => {
        mockDatastore.setSession(createValidSession());
        const callback = createSuccessCallback();
        const request: ExplorationHandlerRequest = {
          authorizationHeader: `Bearer ${callbackSecret}`,
          body: callback,
        };

        await handleExplorationCallback(request, dependencies);

        const messages = messagingClient.getPostedMessages();
        assertEquals(messages.length >= 1, true);
        assertEquals(messages[0].channelId, channelId);
        assertEquals(messages[0].threadTs, threadTs);
      });

      it("should include exploration context info in summary message", async () => {
        mockDatastore.setSession(createValidSession());
        const callback: ExplorationCallbackSuccess = {
          session_id: sessionId,
          status: "success",
          exploration_context: {
            project_overview: "A Next.js e-commerce app",
            architecture_summary: "Feature-sliced design",
            relevant_patterns: ["Repository pattern", "CQRS"],
          },
        };
        const request: ExplorationHandlerRequest = {
          authorizationHeader: `Bearer ${callbackSecret}`,
          body: callback,
        };

        await handleExplorationCallback(request, dependencies);

        const messages = messagingClient.getPostedMessages();
        const summaryMessage = messages.find((m) =>
          m.text.toLowerCase().includes("exploration") ||
          m.text.toLowerCase().includes("analysis") ||
          m.text.toLowerCase().includes("repository")
        );
        assertExists(summaryMessage);
      });
    });

    describe("error callback handling", () => {
      it("should post error message to thread on failure", async () => {
        mockDatastore.setSession(createValidSession());
        const callback = createErrorCallback();
        const request: ExplorationHandlerRequest = {
          authorizationHeader: `Bearer ${callbackSecret}`,
          body: callback,
        };

        await handleExplorationCallback(request, dependencies);

        const messages = messagingClient.getPostedMessages();
        assertEquals(messages.length >= 1, true);
        assertEquals(messages[0].channelId, channelId);
        assertEquals(messages[0].threadTs, threadTs);
      });

      it("should include error details in error message", async () => {
        mockDatastore.setSession(createValidSession());
        const callback: ExplorationCallbackError = {
          session_id: sessionId,
          status: "error",
          error: {
            message: "Repository access denied",
            code: "CLONE_FAILED",
          },
        };
        const request: ExplorationHandlerRequest = {
          authorizationHeader: `Bearer ${callbackSecret}`,
          body: callback,
        };

        await handleExplorationCallback(request, dependencies);

        const messages = messagingClient.getPostedMessages();
        const errorMessage = messages.find((m) =>
          m.text.toLowerCase().includes("error") ||
          m.text.toLowerCase().includes("failed") ||
          m.text.toLowerCase().includes("denied")
        );
        assertExists(errorMessage);
      });

      it("should offer to continue without context after error", async () => {
        mockDatastore.setSession(createValidSession());
        const callback = createErrorCallback();
        const request: ExplorationHandlerRequest = {
          authorizationHeader: `Bearer ${callbackSecret}`,
          body: callback,
        };

        await handleExplorationCallback(request, dependencies);

        const messages = messagingClient.getPostedMessages();
        const continueMessage = messages.find((m) =>
          m.text.toLowerCase().includes("continue") ||
          m.text.toLowerCase().includes("without")
        );
        assertExists(continueMessage);
      });
    });

    describe("payload size validation", () => {
      it("should accept payloads under 100KB", async () => {
        mockDatastore.setSession(createValidSession());
        // Create a payload just under 100KB
        const largeContext = {
          project_overview: "A".repeat(50000),
          architecture_summary: "B".repeat(49000),
        };
        const callback: ExplorationCallbackSuccess = {
          session_id: sessionId,
          status: "success",
          exploration_context: largeContext,
        };
        const request: ExplorationHandlerRequest = {
          authorizationHeader: `Bearer ${callbackSecret}`,
          body: callback,
        };

        const response = await handleExplorationCallback(request, dependencies);

        assertEquals(response.status, 200);
        assertEquals(response.ok, true);
      });

      it("should return 400 for payloads exceeding 100KB", async () => {
        mockDatastore.setSession(createValidSession());
        // Create a payload over 100KB (102400 bytes)
        const largeContext = {
          project_overview: "A".repeat(60000),
          architecture_summary: "B".repeat(50000),
        };
        const callback: ExplorationCallbackSuccess = {
          session_id: sessionId,
          status: "success",
          exploration_context: largeContext,
        };
        const request: ExplorationHandlerRequest = {
          authorizationHeader: `Bearer ${callbackSecret}`,
          body: callback,
        };

        const response = await handleExplorationCallback(request, dependencies);

        assertEquals(response.status, 400);
        assertEquals(response.ok, false);
        assertEquals(response.error, "Bad Request: Payload exceeds 100KB limit");
      });
    });

    describe("exploration data storage", () => {
      it("should store exploration_data in session on success", async () => {
        mockDatastore.setSession(createValidSession());
        const callback = createSuccessCallback();
        const request: ExplorationHandlerRequest = {
          authorizationHeader: `Bearer ${callbackSecret}`,
          body: callback,
        };

        await handleExplorationCallback(request, dependencies);

        // Verify session was updated with exploration_data
        const updatedSession = await mockDatastore.getSession(sessionId);
        assertExists(updatedSession);
        assertExists(updatedSession.exploration_data);
        // Verify it's valid JSON
        const parsed = JSON.parse(updatedSession.exploration_data);
        assertEquals(parsed.project_overview, "A TypeScript project");
      });

      it("should transition session from Initializing to Questioning", async () => {
        const session = createValidSession();
        assertEquals(session.phase, Phase.Initializing);
        mockDatastore.setSession(session);

        const request: ExplorationHandlerRequest = {
          authorizationHeader: `Bearer ${callbackSecret}`,
          body: createSuccessCallback(),
        };

        await handleExplorationCallback(request, dependencies);

        const updatedSession = await mockDatastore.getSession(sessionId);
        assertExists(updatedSession);
        assertEquals(updatedSession.phase, Phase.Questioning);
      });

      it("should store exploration_data on error callback too", async () => {
        mockDatastore.setSession(createValidSession());
        const callback = createErrorCallback();
        const request: ExplorationHandlerRequest = {
          authorizationHeader: `Bearer ${callbackSecret}`,
          body: callback,
        };

        await handleExplorationCallback(request, dependencies);

        // Session should still transition (exploration failed but we continue)
        const updatedSession = await mockDatastore.getSession(sessionId);
        assertExists(updatedSession);
        assertEquals(updatedSession.phase, Phase.Questioning);
        // Verify error information is stored in exploration_data
        assertExists(updatedSession.exploration_data);
        const parsedData = JSON.parse(updatedSession.exploration_data);
        assertExists(parsedData.error);
        assertEquals(parsedData.error.message, "Failed to clone repository");
        assertEquals(parsedData.error.code, "CLONE_FAILED");
      });
    });

    describe("response format", () => {
      it("should return ok: true on success", async () => {
        mockDatastore.setSession(createValidSession());
        const request: ExplorationHandlerRequest = {
          authorizationHeader: `Bearer ${callbackSecret}`,
          body: createSuccessCallback(),
        };

        const response = await handleExplorationCallback(request, dependencies);

        assertEquals(response.status, 200);
        assertEquals(response.ok, true);
      });

      it("should return ok: false on error", async () => {
        const request: ExplorationHandlerRequest = {
          authorizationHeader: undefined,
          body: createSuccessCallback(),
        };

        const response = await handleExplorationCallback(request, dependencies);

        assertEquals(response.ok, false);
      });
    });
  });
});
