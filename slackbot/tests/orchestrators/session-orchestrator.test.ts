// ABOUTME: Tests for SessionOrchestrator covering session initialization flow.
// ABOUTME: Tests acknowledgment posting, session creation, repository exploration, and first question generation.

import { assertEquals, assertExists, assertRejects } from "@std/assert";
import { afterEach, beforeEach, describe, it } from "@std/testing/bdd";
import { MockAnthropicClient } from "../../src/clients/anthropic-client.ts";
import { MockGitHubClient } from "../../src/clients/github-client.ts";
import { MockSlackMessagingClient } from "../../src/clients/messaging-client.ts";
import { AnthropicModelError, GitHubAccessError } from "../../src/errors/types.ts";
import type { DatastoreClient, DatastoreResponse } from "../../src/managers/datastore-client.ts";
import { MockDatastoreClient } from "../../src/managers/datastore-client.ts";
import { SessionManager } from "../../src/managers/session-manager.ts";
import { SessionOrchestrator } from "../../src/orchestrators/session-orchestrator.ts";
import type { Session } from "../../src/types/session.ts";
import type { SlashCommand } from "../../src/types/slash-command.ts";

describe("SessionOrchestrator", () => {
  let orchestrator: SessionOrchestrator;
  let sessionManager: SessionManager;
  let githubClient: MockGitHubClient;
  let anthropicClient: MockAnthropicClient;
  let messagingClient: MockSlackMessagingClient;
  let datastore: MockDatastoreClient;

  beforeEach(() => {
    datastore = new MockDatastoreClient();
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

  describe("handleSlashCommand", () => {
    const createSlashCommand = (overrides?: Partial<SlashCommand>): SlashCommand => ({
      idea: "build a feature",
      channelId: "C1234567890",
      userId: "U1234567890",
      channelType: "channel",
      responseUrl: "https://hooks.slack.com/commands/123/456",
      ...overrides,
    });

    describe("acknowledgment posting", () => {
      it("should post acknowledgment message as first action", async () => {
        const command = createSlashCommand();
        const threadTs = "1234567890.123456";

        await orchestrator.handleSlashCommand(command, threadTs);

        const messages = messagingClient.getPostedMessages();
        assertExists(messages[0]);
        assertEquals(messages[0].channelId, command.channelId);
        assertEquals(messages[0].threadTs, threadTs);
      });

      it("should include idea text in acknowledgment when provided", async () => {
        const command = createSlashCommand({ idea: "build a dashboard" });
        const threadTs = "1234567890.123456";

        await orchestrator.handleSlashCommand(command, threadTs);

        const messages = messagingClient.getPostedMessages();
        assertEquals(messages[0].text.includes("dashboard"), true);
      });
    });

    describe("session creation", () => {
      it("should create session with correct channel ID and thread timestamp", async () => {
        const command = createSlashCommand({ channelId: "C9876543210" });
        const threadTs = "9999999999.999999";

        await orchestrator.handleSlashCommand(command, threadTs);

        const session = await sessionManager.loadSession("C9876543210", threadTs);
        assertExists(session);
        assertEquals(session.session_id, "C9876543210:9999999999.999999");
      });

      it("should create session with repository when provided", async () => {
        const command = createSlashCommand({ repository: "owner/repo" });
        const threadTs = "1234567890.123456";

        await orchestrator.handleSlashCommand(command, threadTs);

        const session = await sessionManager.loadSession(command.channelId, threadTs);
        assertExists(session);
        assertEquals(session.repository, "owner/repo");
      });

      it("should create session without repository when not provided", async () => {
        const command = createSlashCommand({ repository: undefined });
        const threadTs = "1234567890.123456";

        await orchestrator.handleSlashCommand(command, threadTs);

        const session = await sessionManager.loadSession(command.channelId, threadTs);
        assertExists(session);
        assertEquals(session.repository, undefined);
      });

      it("should create session with correct user ID", async () => {
        const command = createSlashCommand({ userId: "U9999999999" });
        const threadTs = "1234567890.123456";

        await orchestrator.handleSlashCommand(command, threadTs);

        const session = await sessionManager.loadSession(command.channelId, threadTs);
        assertExists(session);
        assertEquals(session.initiator_user_id, "U9999999999");
      });
    });

    describe("repository exploration (async flow)", () => {
      it("should trigger exploration workflow when --repo flag provided", async () => {
        const command = createSlashCommand({ repository: "owner/repo" });
        const threadTs = "1234567890.123456";

        await orchestrator.handleSlashCommand(command, threadTs);

        // Verify GitHub client triggered exploration workflow
        const calls = githubClient.getTriggerExplorationCalls();
        assertEquals(calls.length, 1);
        assertEquals(calls[0].targetRepo, "owner/repo");
      });

      it("should post exploration status message before triggering workflow", async () => {
        const command = createSlashCommand({ repository: "owner/repo" });
        const threadTs = "1234567890.123456";

        await orchestrator.handleSlashCommand(command, threadTs);

        const messages = messagingClient.getPostedMessages();
        // Should have: acknowledgment, exploration status
        assertEquals(messages.length >= 2, true);
        // Second message should be exploration status
        const explorationMessage = messages.find((m) =>
          m.text.toLowerCase().includes("exploring") ||
          m.text.toLowerCase().includes("codebase")
        );
        assertExists(explorationMessage);
      });

      it("should NOT call exploreRepository directly (async flow uses webhook)", async () => {
        const command = createSlashCommand({ repository: "owner/repo" });
        const threadTs = "1234567890.123456";

        await orchestrator.handleSlashCommand(command, threadTs);

        // Verify exploreRepository was NOT called directly
        const exploreDirectCalls = githubClient.getExploreRepositoryCalls();
        assertEquals(exploreDirectCalls.length, 0);
      });

      it("should not trigger exploration when --repo flag not provided", async () => {
        const command = createSlashCommand({ repository: undefined });
        const threadTs = "1234567890.123456";

        await orchestrator.handleSlashCommand(command, threadTs);

        // Verify triggerExploration was NOT called
        const calls = githubClient.getTriggerExplorationCalls();
        assertEquals(calls.length, 0);

        // Verify Anthropic client was called without context
        const conversations = anthropicClient.getConversationHistory();
        assertExists(conversations[0]);
        assertEquals(conversations[0].context, null);
      });

      it("should pass repository to triggerExploration", async () => {
        const command = createSlashCommand({ repository: "stickystyle/regent" });
        const threadTs = "1234567890.123456";

        await orchestrator.handleSlashCommand(command, threadTs);

        // Verify the mock was called with correct repository
        const calls = githubClient.getTriggerExplorationCalls();
        assertEquals(calls[0].targetRepo, "stickystyle/regent");
      });
    });

    describe("first question generation (without repo)", () => {
      it("should generate first question after session creation", async () => {
        const command = createSlashCommand();
        const threadTs = "1234567890.123456";

        anthropicClient.setNextQuestionResponse({
          question: "What problem are you trying to solve?",
          confidence_score: 20,
        });

        await orchestrator.handleSlashCommand(command, threadTs);

        const conversations = anthropicClient.getConversationHistory();
        assertEquals(conversations.length >= 1, true);
      });

      it("should post first question to Slack thread", async () => {
        const command = createSlashCommand();
        const threadTs = "1234567890.123456";

        anthropicClient.setNextQuestionResponse({
          question: "What users will benefit from this feature?",
          confidence_score: 25,
        });

        await orchestrator.handleSlashCommand(command, threadTs);

        const messages = messagingClient.getPostedMessages();
        const questionMessage = messages.find((m) =>
          m.text.includes("users") || m.text.includes("benefit")
        );
        assertExists(questionMessage);
        assertEquals(questionMessage.threadTs, threadTs);
      });

      it("should NOT generate first question when repo is provided (async flow)", async () => {
        const command = createSlashCommand({ repository: "owner/repo" });
        const threadTs = "1234567890.123456";

        await orchestrator.handleSlashCommand(command, threadTs);

        // With repo, question generation happens via webhook callback, not immediately
        const conversations = anthropicClient.getConversationHistory();
        assertEquals(conversations.length, 0);
      });

      it("should include idea text in context for question generation", async () => {
        const command = createSlashCommand({ idea: "build a user dashboard" });
        const threadTs = "1234567890.123456";

        await orchestrator.handleSlashCommand(command, threadTs);

        const conversations = anthropicClient.getConversationHistory();
        assertExists(conversations[0]);
        // The idea should be passed in the messages
        const hasIdea = conversations[0].messages.some((m) => m.text.includes("dashboard"));
        assertEquals(hasIdea, true);
      });
    });

    describe("error handling - workflow trigger failure", () => {
      it("should post error message when workflow trigger fails", async () => {
        githubClient.setTriggerExplorationError(new Error("Workflow trigger failed"));

        const command = createSlashCommand({ repository: "private/repo" });
        const threadTs = "1234567890.123456";

        await orchestrator.handleSlashCommand(command, threadTs);

        const messages = messagingClient.getPostedMessages();
        const errorMessage = messages.find((m) =>
          m.text.toLowerCase().includes("error") ||
          m.text.toLowerCase().includes("failed") ||
          m.text.toLowerCase().includes("unable")
        );
        assertExists(errorMessage);
      });

      it("should offer to continue without context when workflow trigger fails", async () => {
        githubClient.setTriggerExplorationError(new Error("Workflow trigger failed"));

        const command = createSlashCommand({ repository: "private/repo" });
        const threadTs = "1234567890.123456";

        await orchestrator.handleSlashCommand(command, threadTs);

        const messages = messagingClient.getPostedMessages();
        const continueMessage = messages.find((m) =>
          m.text.toLowerCase().includes("continue") ||
          m.text.toLowerCase().includes("without")
        );
        assertExists(continueMessage);
      });

      it("should create session even when workflow trigger fails", async () => {
        githubClient.setTriggerExplorationError(new Error("Workflow trigger failed"));

        const command = createSlashCommand({ repository: "private/repo" });
        const threadTs = "1234567890.123456";

        await orchestrator.handleSlashCommand(command, threadTs);

        const session = await sessionManager.loadSession(command.channelId, threadTs);
        assertExists(session);
      });

      it("should handle GitHubAccessError during workflow trigger", async () => {
        const accessError = new GitHubAccessError(
          "Access denied",
          "GitHub token lacks permissions for workflow dispatch",
          "Update token permissions",
        );
        githubClient.setTriggerExplorationError(accessError);

        const command = createSlashCommand({ repository: "private/repo" });
        const threadTs = "1234567890.123456";

        await orchestrator.handleSlashCommand(command, threadTs);

        const messages = messagingClient.getPostedMessages();
        const errorMessage = messages.find((m) => m.text.toLowerCase().includes("access denied"));
        assertExists(errorMessage);
      });
    });

    describe("message ordering", () => {
      it("should post messages in correct order with repo: ack, exploring...", async () => {
        const command = createSlashCommand({ repository: "owner/repo" });
        const threadTs = "1234567890.123456";

        await orchestrator.handleSlashCommand(command, threadTs);

        const messages = messagingClient.getPostedMessages();
        // With repo (async flow): ack + exploring = 2 messages
        assertEquals(messages.length, 2);

        // First message should be acknowledgment
        assertEquals(
          messages[0].text.toLowerCase().includes("brainstorm") ||
            messages[0].text.toLowerCase().includes("starting"),
          true,
        );

        // Second message should be "exploring codebase"
        assertEquals(
          messages[1].text.toLowerCase().includes("exploring") ||
            messages[1].text.toLowerCase().includes("codebase"),
          true,
        );
      });

      it("should post messages in correct order without repo: ack, question", async () => {
        const command = createSlashCommand({ repository: undefined });
        const threadTs = "1234567890.123456";

        anthropicClient.setNextQuestionResponse({
          question: "What is the main goal?",
          confidence_score: 20,
        });

        await orchestrator.handleSlashCommand(command, threadTs);

        const messages = messagingClient.getPostedMessages();
        // Without repo: ack + question = 2 messages
        assertEquals(messages.length >= 2, true);
      });
    });

    describe("error handling - session creation failure", () => {
      it("should throw error when session creation fails", async () => {
        // Use a failing datastore
        const failingDatastore = new FailingMockDatastoreClient();
        const failingSessionManager = new SessionManager(failingDatastore);

        orchestrator = new SessionOrchestrator(
          failingSessionManager,
          githubClient,
          anthropicClient,
          messagingClient,
        );

        const command = createSlashCommand();
        const threadTs = "1234567890.123456";

        await assertRejects(
          async () => await orchestrator.handleSlashCommand(command, threadTs),
          Error,
          "Failed to create session",
        );
      });
    });

    describe("repository format handling (async flow)", () => {
      // Note: Repository format validation now happens in the GHA workflow.
      // Invalid formats are passed through to triggerExploration and errors are
      // reported via the webhook callback.

      it("should trigger exploration even with unusual repository format", async () => {
        const command = createSlashCommand({ repository: "invalidrepo" });
        const threadTs = "1234567890.123456";

        await orchestrator.handleSlashCommand(command, threadTs);

        // Should still trigger exploration - validation happens in GHA workflow
        const calls = githubClient.getTriggerExplorationCalls();
        assertEquals(calls.length, 1);
        assertEquals(calls[0].targetRepo, "invalidrepo");
      });

      it("should create session even with unusual repository format", async () => {
        const command = createSlashCommand({ repository: "invalidrepo" });
        const threadTs = "1234567890.123456";

        await orchestrator.handleSlashCommand(command, threadTs);

        const session = await sessionManager.loadSession(command.channelId, threadTs);
        assertExists(session);
      });

      it("should pass repository format to GHA for validation", async () => {
        const command = createSlashCommand({ repository: "owner/repo/extra" });
        const threadTs = "1234567890.123456";

        await orchestrator.handleSlashCommand(command, threadTs);

        // Repository format is passed through - GHA validates it
        const calls = githubClient.getTriggerExplorationCalls();
        assertEquals(calls[0].targetRepo, "owner/repo/extra");
      });
    });

    describe("error handling - Anthropic API failure", () => {
      it("should post error message when question generation fails", async () => {
        const apiError = new AnthropicModelError(
          "Request rejected",
          "Content policy violation",
          "Modify the prompt",
        );
        anthropicClient.setContinueConversationError(apiError);

        const command = createSlashCommand();
        const threadTs = "1234567890.123456";

        // Should not throw - error is handled gracefully
        await orchestrator.handleSlashCommand(command, threadTs);

        const messages = messagingClient.getPostedMessages();
        const errorMessage = messages.find((m) =>
          m.text.toLowerCase().includes("unable to generate") ||
          m.text.toLowerCase().includes("error")
        );
        assertExists(errorMessage);
      });

      it("should include error details in message when Anthropic API fails", async () => {
        const apiError = new AnthropicModelError(
          "Request rejected",
          "Content policy violation",
          "Modify the prompt",
        );
        anthropicClient.setContinueConversationError(apiError);

        const command = createSlashCommand();
        const threadTs = "1234567890.123456";

        await orchestrator.handleSlashCommand(command, threadTs);

        const messages = messagingClient.getPostedMessages();
        const errorMessage = messages.find((m) => m.text.includes("Request rejected"));
        assertExists(errorMessage);
      });

      it("should still create session even when question generation fails", async () => {
        const apiError = new AnthropicModelError(
          "Request rejected",
          "Content policy violation",
          "Modify the prompt",
        );
        anthropicClient.setContinueConversationError(apiError);

        const command = createSlashCommand();
        const threadTs = "1234567890.123456";

        await orchestrator.handleSlashCommand(command, threadTs);

        // Session should still be created
        const session = await sessionManager.loadSession(command.channelId, threadTs);
        assertExists(session);
      });
    });
  });
});

/**
 * Mock datastore client that always fails on put operations.
 * Used to test session creation failure handling.
 */
class FailingMockDatastoreClient implements DatastoreClient {
  put(_session: Session): Promise<DatastoreResponse<Session>> {
    return Promise.resolve({
      ok: false,
      error: "Datastore unavailable",
    });
  }

  get(_sessionId: string): Promise<DatastoreResponse<Session>> {
    return Promise.resolve({
      ok: false,
      error: "datastore_error: item not found",
    });
  }

  delete(_sessionId: string): Promise<DatastoreResponse<void>> {
    return Promise.resolve({ ok: false });
  }
}
