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
import type { RepositoryContext } from "../../src/types/repository-context.ts";
import { Framework } from "../../src/types/repository-context.ts";
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

    describe("repository exploration", () => {
      it("should explore repository when --repo flag provided", async () => {
        const command = createSlashCommand({ repository: "owner/repo" });
        const threadTs = "1234567890.123456";

        await orchestrator.handleSlashCommand(command, threadTs);

        // Verify GitHub client was called with correct owner/repo
        const conversations = anthropicClient.getConversationHistory();
        assertExists(conversations[0]);
        assertExists(conversations[0].context);
        assertEquals(conversations[0].context?.repository, "owner/repo");
      });

      it("should post exploration status message before exploring", async () => {
        const command = createSlashCommand({ repository: "owner/repo" });
        const threadTs = "1234567890.123456";

        await orchestrator.handleSlashCommand(command, threadTs);

        const messages = messagingClient.getPostedMessages();
        // Should have: acknowledgment, exploration status, exploration summary, first question
        assertEquals(messages.length >= 2, true);
        // Second message should be exploration status
        const explorationMessage = messages.find((m) =>
          m.text.toLowerCase().includes("exploring") ||
          m.text.toLowerCase().includes("codebase")
        );
        assertExists(explorationMessage);
      });

      it("should post exploration summary after exploring repository", async () => {
        const mockContext: RepositoryContext = {
          repository: "owner/repo",
          framework: Framework.React,
          patterns: ["Component pattern", "Hooks pattern"],
          relevant_files: [{ path: "src/App.tsx", description: "Main app" }],
          structure: "src/\n  components/\n  hooks/",
        };
        // Configure the mock to return specific context
        githubClient.clear();
        const configurableClient = new ConfigurableMockGitHubClient();
        configurableClient.setExploreRepositoryResult(mockContext);

        orchestrator = new SessionOrchestrator(
          sessionManager,
          configurableClient,
          anthropicClient,
          messagingClient,
        );

        const command = createSlashCommand({ repository: "owner/repo" });
        const threadTs = "1234567890.123456";

        await orchestrator.handleSlashCommand(command, threadTs);

        const messages = messagingClient.getPostedMessages();
        // Should have a message mentioning framework or patterns (case insensitive)
        const summaryMessage = messages.find((m) =>
          m.text.toLowerCase().includes("react") ||
          m.text.toLowerCase().includes("framework")
        );
        assertExists(summaryMessage);
      });

      it("should not explore repository when --repo flag not provided", async () => {
        const command = createSlashCommand({ repository: undefined });
        const threadTs = "1234567890.123456";

        await orchestrator.handleSlashCommand(command, threadTs);

        // Verify Anthropic client was called without context
        const conversations = anthropicClient.getConversationHistory();
        assertExists(conversations[0]);
        assertEquals(conversations[0].context, null);
      });

      it("should parse owner and repo correctly from owner/repo string", async () => {
        const configurableClient = new ConfigurableMockGitHubClient();
        orchestrator = new SessionOrchestrator(
          sessionManager,
          configurableClient,
          anthropicClient,
          messagingClient,
        );

        const command = createSlashCommand({ repository: "stickystyle/regent" });
        const threadTs = "1234567890.123456";

        await orchestrator.handleSlashCommand(command, threadTs);

        // Verify the mock was called with correct owner and repo
        assertEquals(configurableClient.lastExploreCall?.owner, "stickystyle");
        assertEquals(configurableClient.lastExploreCall?.repo, "regent");
      });
    });

    describe("first question generation", () => {
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

      it("should include repository context in first question generation when available", async () => {
        const command = createSlashCommand({ repository: "owner/repo" });
        const threadTs = "1234567890.123456";

        await orchestrator.handleSlashCommand(command, threadTs);

        const conversations = anthropicClient.getConversationHistory();
        assertExists(conversations[0]);
        assertExists(conversations[0].context);
        assertEquals(conversations[0].context?.repository, "owner/repo");
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

    describe("error handling - access denied", () => {
      it("should post error message when repository access is denied", async () => {
        const accessError = new GitHubAccessError(
          "Access denied",
          "GitHub token lacks permissions",
          "Update token permissions",
        );
        githubClient.setExploreRepositoryError(accessError);

        const command = createSlashCommand({ repository: "private/repo" });
        const threadTs = "1234567890.123456";

        await orchestrator.handleSlashCommand(command, threadTs);

        const messages = messagingClient.getPostedMessages();
        const errorMessage = messages.find((m) =>
          m.text.toLowerCase().includes("access") ||
          m.text.toLowerCase().includes("permission") ||
          m.text.toLowerCase().includes("denied")
        );
        assertExists(errorMessage);
      });

      it("should offer to continue without context when access denied", async () => {
        const accessError = new GitHubAccessError(
          "Access denied",
          "GitHub token lacks permissions",
          "Update token permissions",
        );
        githubClient.setExploreRepositoryError(accessError);

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

      it("should still generate first question after access denied error", async () => {
        const accessError = new GitHubAccessError(
          "Access denied",
          "GitHub token lacks permissions",
          "Update token permissions",
        );
        githubClient.setExploreRepositoryError(accessError);

        const command = createSlashCommand({ repository: "private/repo" });
        const threadTs = "1234567890.123456";

        anthropicClient.setNextQuestionResponse({
          question: "What problem are you solving?",
          confidence_score: 20,
        });

        await orchestrator.handleSlashCommand(command, threadTs);

        // Should still generate question without repository context
        const conversations = anthropicClient.getConversationHistory();
        assertEquals(conversations.length >= 1, true);
        assertEquals(conversations[0].context, null);
      });

      it("should create session even when repository access fails", async () => {
        const accessError = new GitHubAccessError(
          "Access denied",
          "GitHub token lacks permissions",
          "Update token permissions",
        );
        githubClient.setExploreRepositoryError(accessError);

        const command = createSlashCommand({ repository: "private/repo" });
        const threadTs = "1234567890.123456";

        await orchestrator.handleSlashCommand(command, threadTs);

        const session = await sessionManager.loadSession(command.channelId, threadTs);
        assertExists(session);
      });
    });

    describe("error handling - repo not found", () => {
      it("should post error message when repository is not found", async () => {
        const notFoundError = new GitHubAccessError(
          "Repository not found",
          "The repository does not exist or is not accessible",
          "Verify the repository name and try again",
        );
        githubClient.setExploreRepositoryError(notFoundError);

        const command = createSlashCommand({ repository: "nonexistent/repo" });
        const threadTs = "1234567890.123456";

        await orchestrator.handleSlashCommand(command, threadTs);

        const messages = messagingClient.getPostedMessages();
        const errorMessage = messages.find((m) =>
          m.text.toLowerCase().includes("not found") ||
          m.text.toLowerCase().includes("doesn't exist") ||
          m.text.toLowerCase().includes("could not")
        );
        assertExists(errorMessage);
      });

      it("should offer to continue without context when repo not found", async () => {
        const notFoundError = new GitHubAccessError(
          "Repository not found",
          "The repository does not exist",
          "Verify the repository name",
        );
        githubClient.setExploreRepositoryError(notFoundError);

        const command = createSlashCommand({ repository: "nonexistent/repo" });
        const threadTs = "1234567890.123456";

        await orchestrator.handleSlashCommand(command, threadTs);

        const messages = messagingClient.getPostedMessages();
        const continueMessage = messages.find((m) =>
          m.text.toLowerCase().includes("continue") ||
          m.text.toLowerCase().includes("without")
        );
        assertExists(continueMessage);
      });

      it("should still generate first question after repo not found error", async () => {
        const notFoundError = new GitHubAccessError(
          "Repository not found",
          "The repository does not exist",
          "Verify the repository name",
        );
        githubClient.setExploreRepositoryError(notFoundError);

        const command = createSlashCommand({ repository: "nonexistent/repo" });
        const threadTs = "1234567890.123456";

        anthropicClient.setNextQuestionResponse({
          question: "What is the goal of this feature?",
          confidence_score: 20,
        });

        await orchestrator.handleSlashCommand(command, threadTs);

        // Should still generate question without repository context
        const conversations = anthropicClient.getConversationHistory();
        assertEquals(conversations.length >= 1, true);
      });
    });

    describe("message ordering", () => {
      it("should post messages in correct order: ack, exploration, summary, question", async () => {
        const configurableClient = new ConfigurableMockGitHubClient();
        const mockContext: RepositoryContext = {
          repository: "owner/repo",
          framework: Framework.NextJS,
          patterns: [],
          relevant_files: [],
          structure: "",
        };
        configurableClient.setExploreRepositoryResult(mockContext);

        orchestrator = new SessionOrchestrator(
          sessionManager,
          configurableClient,
          anthropicClient,
          messagingClient,
        );

        const command = createSlashCommand({ repository: "owner/repo" });
        const threadTs = "1234567890.123456";

        anthropicClient.setNextQuestionResponse({
          question: "What is the core problem?",
          confidence_score: 20,
        });

        await orchestrator.handleSlashCommand(command, threadTs);

        const messages = messagingClient.getPostedMessages();
        // Should have at least 4 messages
        assertEquals(messages.length >= 4, true);

        // First message should be acknowledgment (contains idea or brainstorm)
        assertEquals(
          messages[0].text.toLowerCase().includes("brainstorm") ||
            messages[0].text.toLowerCase().includes("starting") ||
            messages[0].text.toLowerCase().includes("idea"),
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

    describe("error handling - invalid repository format", () => {
      it("should post error message for repository without slash", async () => {
        const command = createSlashCommand({ repository: "invalidrepo" });
        const threadTs = "1234567890.123456";

        await orchestrator.handleSlashCommand(command, threadTs);

        const messages = messagingClient.getPostedMessages();
        const errorMessage = messages.find((m) =>
          m.text.toLowerCase().includes("invalid repository format")
        );
        assertExists(errorMessage);
      });

      it("should offer to continue without context for invalid repository format", async () => {
        const command = createSlashCommand({ repository: "invalidrepo" });
        const threadTs = "1234567890.123456";

        await orchestrator.handleSlashCommand(command, threadTs);

        const messages = messagingClient.getPostedMessages();
        const continueMessage = messages.find((m) =>
          m.text.toLowerCase().includes("continue") &&
          m.text.toLowerCase().includes("without")
        );
        assertExists(continueMessage);
      });

      it("should still generate first question after invalid repository format", async () => {
        const command = createSlashCommand({ repository: "invalidrepo" });
        const threadTs = "1234567890.123456";

        anthropicClient.setNextQuestionResponse({
          question: "What problem are you solving?",
          confidence_score: 20,
        });

        await orchestrator.handleSlashCommand(command, threadTs);

        // Should still generate question without repository context
        const conversations = anthropicClient.getConversationHistory();
        assertEquals(conversations.length >= 1, true);
        assertEquals(conversations[0].context, null);
      });

      it("should create session even when repository format is invalid", async () => {
        const command = createSlashCommand({ repository: "invalidrepo" });
        const threadTs = "1234567890.123456";

        await orchestrator.handleSlashCommand(command, threadTs);

        const session = await sessionManager.loadSession(command.channelId, threadTs);
        assertExists(session);
      });

      it("should handle repository with empty owner gracefully", async () => {
        const command = createSlashCommand({ repository: "/repo" });
        const threadTs = "1234567890.123456";

        await orchestrator.handleSlashCommand(command, threadTs);

        const messages = messagingClient.getPostedMessages();
        const errorMessage = messages.find((m) =>
          m.text.toLowerCase().includes("invalid repository format")
        );
        assertExists(errorMessage);
      });

      it("should handle repository with empty repo name gracefully", async () => {
        const command = createSlashCommand({ repository: "owner/" });
        const threadTs = "1234567890.123456";

        await orchestrator.handleSlashCommand(command, threadTs);

        const messages = messagingClient.getPostedMessages();
        const errorMessage = messages.find((m) =>
          m.text.toLowerCase().includes("invalid repository format")
        );
        assertExists(errorMessage);
      });

      it("should handle repository with multiple slashes gracefully", async () => {
        const command = createSlashCommand({ repository: "owner/repo/extra" });
        const threadTs = "1234567890.123456";

        await orchestrator.handleSlashCommand(command, threadTs);

        const messages = messagingClient.getPostedMessages();
        const errorMessage = messages.find((m) =>
          m.text.toLowerCase().includes("invalid repository format")
        );
        assertExists(errorMessage);
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
 * Configurable mock GitHub client for testing exploration results.
 */
class ConfigurableMockGitHubClient extends MockGitHubClient {
  private exploreResult: RepositoryContext | null = null;
  public lastExploreCall: { owner: string; repo: string } | null = null;

  setExploreRepositoryResult(context: RepositoryContext): void {
    this.exploreResult = context;
  }

  override exploreRepository(owner: string, repo: string): Promise<RepositoryContext> {
    this.lastExploreCall = { owner, repo };

    if (this.exploreResult) {
      return Promise.resolve(this.exploreResult);
    }

    return super.exploreRepository(owner, repo);
  }
}

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
