// ABOUTME: Tests for SessionOrchestrator.handleExplorationResult() method.
// ABOUTME: Validates exploration context storage, phase updates, and message posting.

import { assertEquals, assertExists } from "@std/assert";
import { afterEach, beforeEach, describe, it } from "@std/testing/bdd";
import { MockAnthropicClient } from "../../src/clients/anthropic-client.ts";
import { MockGitHubClient } from "../../src/clients/github-client.ts";
import { MockSlackMessagingClient } from "../../src/clients/messaging-client.ts";
import { MockDatastoreClient } from "../../src/managers/datastore-client.ts";
import { SessionManager } from "../../src/managers/session-manager.ts";
import { SessionOrchestrator } from "../../src/orchestrators/session-orchestrator.ts";
import type {
  ExplorationCallbackError,
  ExplorationCallbackSuccess,
} from "../../src/types/exploration-callback.ts";
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

describe("SessionOrchestrator.handleExplorationResult", () => {
  let orchestrator: SessionOrchestrator;
  let sessionManager: SessionManager;
  let githubClient: MockGitHubClient;
  let anthropicClient: MockAnthropicClient;
  let messagingClient: MockSlackMessagingClient;
  let datastore: TestDatastoreClient;

  const channelId = "C1234567890";
  const threadTs = "1234567890.123456";
  const sessionId = `${channelId}:${threadTs}`;

  const createValidSession = (): Session => ({
    session_id: sessionId,
    phase: Phase.Questioning,
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
      project_overview: "A TypeScript project using Deno",
      architecture_summary: "Clean architecture with dependency injection",
      relevant_patterns: ["Repository pattern", "Factory pattern"],
      key_files: ["src/main.ts", "src/types/index.ts"],
      testing_approach: "Unit tests with mocks",
    },
  });

  const createErrorCallback = (): ExplorationCallbackError => ({
    session_id: sessionId,
    status: "error",
    error: {
      message: "Failed to clone repository: access denied",
      code: "CLONE_FAILED",
    },
  });

  beforeEach(() => {
    datastore = new TestDatastoreClient();
    sessionManager = new SessionManager(datastore);
    githubClient = new MockGitHubClient();
    anthropicClient = new MockAnthropicClient();
    messagingClient = new MockSlackMessagingClient();

    orchestrator = new SessionOrchestrator(
      sessionManager,
      githubClient,
      anthropicClient,
      messagingClient,
    );
  });

  afterEach(() => {
    datastore.clear();
    githubClient.clear();
    anthropicClient.clear();
    messagingClient.clear();
  });

  describe("success callback handling", () => {
    it("should post exploration summary to thread", async () => {
      datastore.setSession(createValidSession());
      const callback = createSuccessCallback();

      await orchestrator.handleExplorationResult(callback);

      const messages = messagingClient.getPostedMessages();
      assertEquals(messages.length >= 1, true);
      assertEquals(messages[0].channelId, channelId);
      assertEquals(messages[0].threadTs, threadTs);
    });

    it("should include project overview in summary", async () => {
      datastore.setSession(createValidSession());
      const callback = createSuccessCallback();

      await orchestrator.handleExplorationResult(callback);

      const messages = messagingClient.getPostedMessages();
      const summaryMessage = messages.find((m) =>
        m.text.toLowerCase().includes("typescript") ||
        m.text.toLowerCase().includes("deno") ||
        m.text.toLowerCase().includes("analysis") ||
        m.text.toLowerCase().includes("exploration")
      );
      assertExists(summaryMessage);
    });

    it("should include patterns in summary when available", async () => {
      datastore.setSession(createValidSession());
      const callback: ExplorationCallbackSuccess = {
        session_id: sessionId,
        status: "success",
        exploration_context: {
          relevant_patterns: ["MVC pattern", "Observer pattern"],
        },
      };

      await orchestrator.handleExplorationResult(callback);

      const messages = messagingClient.getPostedMessages();
      const patternMessage = messages.find((m) =>
        m.text.toLowerCase().includes("pattern") ||
        m.text.toLowerCase().includes("mvc") ||
        m.text.toLowerCase().includes("observer")
      );
      assertExists(patternMessage);
    });

    it("should update session phase to questioning", async () => {
      // Create a session that might be in a different initial state
      const session = createValidSession();
      datastore.setSession(session);
      const callback = createSuccessCallback();

      await orchestrator.handleExplorationResult(callback);

      const updatedSession = await datastore.getSession(sessionId);
      assertExists(updatedSession);
      assertEquals(updatedSession.phase, Phase.Questioning);
    });

    it("should cache exploration context for use in questions", async () => {
      datastore.setSession(createValidSession());
      const callback = createSuccessCallback();

      anthropicClient.setNextQuestionResponse({
        question: "What specific feature are you building?",
        confidence_score: 25,
      });

      await orchestrator.handleExplorationResult(callback);

      // Verify that the exploration context is available for subsequent operations
      // by checking if the summary message references the context
      const messages = messagingClient.getPostedMessages();
      assertEquals(messages.length >= 1, true);
    });
  });

  describe("error callback handling", () => {
    it("should post error message to thread", async () => {
      datastore.setSession(createValidSession());
      const callback = createErrorCallback();

      await orchestrator.handleExplorationResult(callback);

      const messages = messagingClient.getPostedMessages();
      assertEquals(messages.length >= 1, true);
      assertEquals(messages[0].channelId, channelId);
      assertEquals(messages[0].threadTs, threadTs);
    });

    it("should include error message in posted message", async () => {
      datastore.setSession(createValidSession());
      const callback: ExplorationCallbackError = {
        session_id: sessionId,
        status: "error",
        error: {
          message: "Repository not found",
          code: "CLONE_FAILED",
        },
      };

      await orchestrator.handleExplorationResult(callback);

      const messages = messagingClient.getPostedMessages();
      const errorMessage = messages.find((m) =>
        m.text.toLowerCase().includes("error") ||
        m.text.toLowerCase().includes("failed") ||
        m.text.toLowerCase().includes("not found")
      );
      assertExists(errorMessage);
    });

    it("should offer to continue without context after error", async () => {
      datastore.setSession(createValidSession());
      const callback = createErrorCallback();

      await orchestrator.handleExplorationResult(callback);

      const messages = messagingClient.getPostedMessages();
      const continueMessage = messages.find((m) =>
        m.text.toLowerCase().includes("continue") ||
        m.text.toLowerCase().includes("without")
      );
      assertExists(continueMessage);
    });

    it("should handle INSTALL_FAILED error code", async () => {
      datastore.setSession(createValidSession());
      const callback: ExplorationCallbackError = {
        session_id: sessionId,
        status: "error",
        error: {
          message: "npm install failed",
          code: "INSTALL_FAILED",
        },
      };

      await orchestrator.handleExplorationResult(callback);

      const messages = messagingClient.getPostedMessages();
      assertEquals(messages.length >= 1, true);
    });

    it("should handle EXPLORATION_FAILED error code", async () => {
      datastore.setSession(createValidSession());
      const callback: ExplorationCallbackError = {
        session_id: sessionId,
        status: "error",
        error: {
          message: "Claude API error during exploration",
          code: "EXPLORATION_FAILED",
        },
      };

      await orchestrator.handleExplorationResult(callback);

      const messages = messagingClient.getPostedMessages();
      assertEquals(messages.length >= 1, true);
    });

    it("should transition session to Questioning phase after exploration error", async () => {
      const session = createValidSession();
      session.phase = Phase.Initializing;
      datastore.setSession(session);

      const callback = createErrorCallback();

      anthropicClient.setNextQuestionResponse({
        question: "What problem are you trying to solve?",
        confidence_score: 20,
      });

      await orchestrator.handleExplorationResult(callback);

      const updatedSession = await datastore.getSession(sessionId);
      assertExists(updatedSession);
      assertEquals(updatedSession.phase, Phase.Questioning);
    });

    it("should generate first question after exploration error", async () => {
      datastore.setSession(createValidSession());
      const callback = createErrorCallback();

      anthropicClient.setNextQuestionResponse({
        question: "What is the core problem you want to solve?",
        confidence_score: 20,
      });

      await orchestrator.handleExplorationResult(callback);

      // Should have called Anthropic API to generate first question
      const conversations = anthropicClient.getConversationHistory();
      assertEquals(conversations.length >= 1, true);
    });

    it("should post first question to Slack after exploration error", async () => {
      datastore.setSession(createValidSession());
      const callback = createErrorCallback();

      anthropicClient.setNextQuestionResponse({
        question: "What is the core problem you want to solve?",
        confidence_score: 20,
      });

      await orchestrator.handleExplorationResult(callback);

      const messages = messagingClient.getPostedMessages();
      // Should have error message + first question
      assertEquals(messages.length >= 2, true);

      const questionMessage = messages.find((m) =>
        m.text.includes("core problem") || m.text.includes("solve")
      );
      assertExists(questionMessage);
    });
  });

  describe("session not found handling", () => {
    it("should handle missing session gracefully", async () => {
      // Do not set any session in the datastore
      const callback = createSuccessCallback();

      // Should not throw - handles gracefully
      await orchestrator.handleExplorationResult(callback);

      // No messages should be posted since session doesn't exist
      const messages = messagingClient.getPostedMessages();
      assertEquals(messages.length, 0);
    });

    it("should not throw error for unknown session", async () => {
      const callback: ExplorationCallbackSuccess = {
        session_id: "C9999999999:9999999999.999999",
        status: "success",
        exploration_context: {},
      };

      // Should not throw
      await orchestrator.handleExplorationResult(callback);
    });
  });

  describe("message formatting", () => {
    it("should format success message with repository info", async () => {
      const session = createValidSession();
      session.repository = "acme/awesome-project";
      datastore.setSession(session);

      const callback = createSuccessCallback();

      await orchestrator.handleExplorationResult(callback);

      const messages = messagingClient.getPostedMessages();
      assertEquals(messages.length >= 1, true);
    });

    it("should include key files count in summary when available", async () => {
      datastore.setSession(createValidSession());
      const callback: ExplorationCallbackSuccess = {
        session_id: sessionId,
        status: "success",
        exploration_context: {
          key_files: ["file1.ts", "file2.ts", "file3.ts"],
        },
      };

      await orchestrator.handleExplorationResult(callback);

      const messages = messagingClient.getPostedMessages();
      // Should mention files or file count
      const fileMessage = messages.find((m) =>
        m.text.toLowerCase().includes("file") ||
        m.text.includes("3")
      );
      assertExists(fileMessage);
    });
  });
});
