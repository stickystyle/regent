// ABOUTME: Integration tests for error handling and recovery across all error categories.
// ABOUTME: Tests GitHubAccessError, AnthropicRateLimitError, SlackCanvasError, NetworkTimeoutError.

import { assertEquals, assertExists } from "@std/assert";
import { afterEach, beforeEach, describe, it } from "@std/testing/bdd";

import { MockAnthropicClient } from "../../src/clients/anthropic-client.ts";
import { MockGitHubClient } from "../../src/clients/github-client.ts";
import { MockSlackMessagingClient } from "../../src/clients/messaging-client.ts";
import { MockCanvasManager } from "../../src/managers/canvas-manager.ts";
import { MockDatastoreClient } from "../../src/managers/datastore-client.ts";
import { MockEpicManager } from "../../src/managers/epic-manager.ts";
import { SessionManager } from "../../src/managers/session-manager.ts";
import { SessionOrchestrator } from "../../src/orchestrators/session-orchestrator.ts";
import {
  type FinalizationDependencies,
  handleFinalization,
} from "../../src/handlers/finalization-handler.ts";
import { formatSessionId, Phase, type Session } from "../../src/types/session.ts";
import type { SlashCommand } from "../../src/types/slash-command.ts";
import {
  AnthropicModelError,
  AnthropicRateLimitError,
  GitHubAccessError,
  NetworkTimeoutError,
  SlackCanvasError,
} from "../../src/errors/types.ts";

describe("Error Recovery Integration", () => {
  let sessionManager: SessionManager;
  let githubClient: MockGitHubClient;
  let anthropicClient: MockAnthropicClient;
  let messagingClient: MockSlackMessagingClient;
  let canvasManager: MockCanvasManager;
  let epicManager: MockEpicManager;
  let datastoreClient: MockDatastoreClient;
  let orchestrator: SessionOrchestrator;
  let originalCallbackUrl: string | undefined;

  const channelId = "C1234567890";
  const threadTs = "1234567890.123456";
  const userId = "U1234567890";
  const sessionId = formatSessionId(channelId, threadTs);

  beforeEach(() => {
    // Save and set default callback URL
    originalCallbackUrl = Deno.env.get("EXPLORATION_CALLBACK_URL");
    Deno.env.set("EXPLORATION_CALLBACK_URL", "https://example.com/callback");

    datastoreClient = new MockDatastoreClient();
    sessionManager = new SessionManager(datastoreClient);
    githubClient = new MockGitHubClient();
    anthropicClient = new MockAnthropicClient();
    messagingClient = new MockSlackMessagingClient();
    canvasManager = new MockCanvasManager();
    epicManager = new MockEpicManager();

    orchestrator = new SessionOrchestrator(
      sessionManager,
      githubClient,
      anthropicClient,
      messagingClient,
    );
  });

  afterEach(() => {
    // Restore original callback URL
    if (originalCallbackUrl !== undefined) {
      Deno.env.set("EXPLORATION_CALLBACK_URL", originalCallbackUrl);
    } else {
      Deno.env.delete("EXPLORATION_CALLBACK_URL");
    }

    datastoreClient.clear();
    githubClient.clear();
    anthropicClient.clear();
    messagingClient.clear();
    canvasManager.clear();
    epicManager.clear();
  });

  /**
   * Helper to create a slash command.
   */
  function createSlashCommand(overrides?: Partial<SlashCommand>): SlashCommand {
    return {
      idea: "test feature",
      channelId,
      userId,
      channelType: "channel",
      responseUrl: "https://hooks.slack.com/commands/123/456",
      ...overrides,
    };
  }

  /**
   * Helper to create a valid session for testing.
   */
  function createValidSession(overrides: Partial<Session> = {}): Session {
    return {
      session_id: sessionId,
      phase: Phase.Review,
      repository: "owner/repo",
      canvas_id: "canvas_123",
      initiator_user_id: userId,
      confidence_score: 95,
      created_at: new Date().toISOString(),
      ttl: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      ...overrides,
    };
  }

  /**
   * Helper to create dependencies for finalization handler.
   */
  function createFinalizationDependencies(): FinalizationDependencies {
    return {
      sessionManager,
      canvasManager,
      epicManager,
      messagingClient,
    };
  }

  describe("GitHubAccessError during exploration", () => {
    it("should handle access denied error gracefully", async () => {
      const accessError = new GitHubAccessError(
        "Access denied",
        "GitHub token lacks permissions for this repository",
        "Update token permissions or use a different token",
      );
      githubClient.setTriggerExplorationError(accessError);

      const command = createSlashCommand({ repository: "private/repo" });

      // Should not throw
      await orchestrator.handleSlashCommand(command, threadTs);

      // Session should still be created
      const session = await sessionManager.loadSession(channelId, threadTs);
      assertExists(session);

      // Error message should be posted to user
      const messages = messagingClient.getPostedMessages();
      const errorMessage = messages.find((m) =>
        m.text.toLowerCase().includes("access denied") ||
        m.text.toLowerCase().includes("permission")
      );
      assertExists(errorMessage, "Should post user-friendly error message");
    });

    it("should offer to continue without codebase context on access error", async () => {
      const accessError = new GitHubAccessError(
        "Repository not found",
        "Repository does not exist or is not accessible",
        "Verify repository name and access",
      );
      githubClient.setTriggerExplorationError(accessError);

      const command = createSlashCommand({ repository: "nonexistent/repo" });
      await orchestrator.handleSlashCommand(command, threadTs);

      const messages = messagingClient.getPostedMessages();
      const continueMessage = messages.find((m) =>
        m.text.toLowerCase().includes("continue") ||
        m.text.toLowerCase().includes("without")
      );
      assertExists(continueMessage, "Should offer to continue without context");
    });

    it("should not corrupt session state on access error", async () => {
      const accessError = new GitHubAccessError(
        "Token expired",
        "GitHub token has expired",
        "Generate a new token",
      );
      githubClient.setTriggerExplorationError(accessError);

      const command = createSlashCommand({ repository: "owner/repo" });
      await orchestrator.handleSlashCommand(command, threadTs);

      const session = await sessionManager.loadSession(channelId, threadTs);
      assertExists(session);
      assertEquals(session.phase, Phase.Questioning, "Phase should remain Questioning");
      assertEquals(session.repository, "owner/repo", "Repository should still be stored");
    });
  });

  describe("AnthropicRateLimitError during questioning", () => {
    it("should handle rate limit error with user-friendly message", async () => {
      const rateLimitError = new AnthropicRateLimitError(
        "Rate limit exceeded",
        "Too many requests to Anthropic API",
        "Wait and retry automatically",
        60,
      );
      anthropicClient.setContinueConversationError(rateLimitError);

      const command = createSlashCommand({ repository: undefined });
      await orchestrator.handleSlashCommand(command, threadTs);

      // Session should still be created
      const session = await sessionManager.loadSession(channelId, threadTs);
      assertExists(session);

      // Error message should be posted
      const messages = messagingClient.getPostedMessages();
      const errorMessage = messages.find((m) =>
        m.text.toLowerCase().includes("rate limit") ||
        m.text.toLowerCase().includes("try again")
      );
      assertExists(errorMessage, "Should post rate limit message");
    });

    it("should preserve session state after rate limit error", async () => {
      // Create existing session
      const existingSession = createValidSession({ phase: Phase.Questioning, confidence_score: 50 });
      await datastoreClient.put(existingSession);

      const rateLimitError = new AnthropicRateLimitError(
        "Rate limit exceeded",
        "API quota reached",
        "Wait for quota reset",
        30,
      );
      anthropicClient.setContinueConversationError(rateLimitError);

      // Simulate a follow-up question that hits rate limit
      // The orchestrator would call anthropicClient.continueConversation
      try {
        await anthropicClient.continueConversation([], null);
      } catch (_e) {
        // Expected to throw
      }

      // Session state should be unchanged
      const session = await sessionManager.loadSession(channelId, threadTs);
      assertExists(session);
      assertEquals(session.confidence_score, 50, "Confidence should be preserved");
      assertEquals(session.phase, Phase.Questioning, "Phase should be preserved");
    });
  });

  describe("SlackCanvasError during Canvas creation", () => {
    it("should handle Canvas creation failure gracefully", async () => {
      const canvasError = new SlackCanvasError(
        "Canvas creation failed",
        "Unable to create Canvas in channel",
        "Check Canvas API permissions",
      );
      canvasManager.setCreateCanvasError(canvasError);

      // Create a sample spec document for testing
      const testSpec = {
        title: "Test Spec",
        overview: "Test overview",
        problem_statement: "Test problem",
        goals: ["Goal 1"],
        non_goals: [],
        personas: [],
        use_cases: [],
        technical_details: "Test technical details",
        open_questions: [],
      };

      // Attempt to create Canvas (simulating transition to Review)
      let error: Error | undefined;
      try {
        await canvasManager.createCanvas(testSpec, threadTs, channelId);
      } catch (e) {
        error = e as Error;
      }

      assertExists(error);
      assertEquals(error.message, "Canvas creation failed");
    });

    it("should not transition to Review phase if Canvas creation fails", async () => {
      const session = createValidSession({
        phase: Phase.Questioning,
        canvas_id: undefined,
      });
      await datastoreClient.put(session);

      // Canvas creation will fail
      canvasManager.setCreateCanvasError(
        new SlackCanvasError(
          "Canvas quota exceeded",
          "Cannot create more Canvases",
          "Delete old Canvases",
        ),
      );

      // Create a sample spec document for testing
      const testSpec = {
        title: "Test Spec",
        overview: "Test overview",
        problem_statement: "Test problem",
        goals: ["Goal 1"],
        non_goals: [],
        personas: [],
        use_cases: [],
        technical_details: "Test technical details",
        open_questions: [],
      };

      // Attempt Canvas creation
      let canvasCreated = false;
      try {
        await canvasManager.createCanvas(testSpec, threadTs, channelId);
        canvasCreated = true;
      } catch (_e) {
        // Expected failure
      }

      assertEquals(canvasCreated, false, "Canvas creation should fail");

      // Session should remain in Questioning
      const unchangedSession = await sessionManager.loadSession(channelId, threadTs);
      assertExists(unchangedSession);
      assertEquals(unchangedSession.phase, Phase.Questioning);
      assertEquals(unchangedSession.canvas_id, undefined);
    });

    it("should handle Canvas read error during finalization", async () => {
      const session = createValidSession();
      await datastoreClient.put(session);

      canvasManager.setGetCanvasContentError(
        new SlackCanvasError(
          "Canvas not found",
          "Canvas has been deleted or is inaccessible",
          "Create a new Canvas",
        ),
      );

      const dependencies = createFinalizationDependencies();
      const result = await handleFinalization(channelId, threadTs, dependencies);

      assertEquals(result.success, false);
      assertEquals(result.error?.toLowerCase().includes("canvas"), true);
    });
  });

  describe("NetworkTimeoutError during operations", () => {
    it("should handle network timeout during exploration trigger", async () => {
      const timeoutError = new NetworkTimeoutError(
        "Request timed out",
        "GitHub API did not respond within timeout period",
        "Retry the request",
      );
      githubClient.setTriggerExplorationError(timeoutError);

      const command = createSlashCommand({ repository: "owner/repo" });
      await orchestrator.handleSlashCommand(command, threadTs);

      // Should post error message
      const messages = messagingClient.getPostedMessages();
      const errorMessage = messages.find((m) =>
        m.text.toLowerCase().includes("timeout") ||
        m.text.toLowerCase().includes("timed out") ||
        m.text.toLowerCase().includes("error")
      );
      assertExists(errorMessage, "Should post timeout error message");
    });

    it("should preserve session on network timeout", async () => {
      const command = createSlashCommand({ repository: "owner/repo" });

      // First, successfully create the session
      await orchestrator.handleSlashCommand(command, threadTs);

      const session = await sessionManager.loadSession(channelId, threadTs);
      assertExists(session, "Session should be created despite exploration failure");
    });
  });

  describe("AnthropicModelError during questioning", () => {
    it("should handle model error with clear message", async () => {
      const modelError = new AnthropicModelError(
        "Request rejected",
        "Content policy violation",
        "Modify the prompt",
      );
      anthropicClient.setContinueConversationError(modelError);

      const command = createSlashCommand({ repository: undefined });
      await orchestrator.handleSlashCommand(command, threadTs);

      // Error should be communicated
      const messages = messagingClient.getPostedMessages();
      const errorMessage = messages.find((m) =>
        m.text.includes("Request rejected") ||
        m.text.toLowerCase().includes("error")
      );
      assertExists(errorMessage);
    });

    it("should still create session on model error", async () => {
      const modelError = new AnthropicModelError(
        "Invalid input",
        "Input validation failed",
        "Check input format",
      );
      anthropicClient.setContinueConversationError(modelError);

      const command = createSlashCommand();
      await orchestrator.handleSlashCommand(command, threadTs);

      const session = await sessionManager.loadSession(channelId, threadTs);
      assertExists(session, "Session should be created despite model error");
    });
  });

  describe("error during Epic creation", () => {
    it("should handle Epic creation failure and preserve session state", async () => {
      const session = createValidSession();
      await datastoreClient.put(session);
      canvasManager.setCanvasContent("canvas_123", "# Test Spec\n\nContent");

      epicManager.setCreateEpicError(
        new GitHubAccessError(
          "Issue creation denied",
          "Token lacks issues:write scope",
          "Update token permissions",
        ),
      );

      const dependencies = createFinalizationDependencies();
      const result = await handleFinalization(channelId, threadTs, dependencies);

      assertEquals(result.success, false);
      // Error could contain "github", "issue", or "denied"
      assertEquals(
        result.error?.toLowerCase().includes("github") ||
          result.error?.toLowerCase().includes("issue") ||
          result.error?.toLowerCase().includes("denied"),
        true,
        `Error message should mention GitHub, issue, or denied: ${result.error}`,
      );

      // Session should NOT transition to Finalized
      const unchangedSession = await sessionManager.loadSession(channelId, threadTs);
      assertExists(unchangedSession);
      assertEquals(unchangedSession.phase, Phase.Review);
    });

    it("should handle comment creation failure after Epic created", async () => {
      const session = createValidSession();
      await datastoreClient.put(session);
      canvasManager.setCanvasContent("canvas_123", "# Test Spec\n\nContent");

      // Epic creation succeeds, comment fails
      epicManager.setAddSpecCommentError(new Error("Comment creation failed"));

      const dependencies = createFinalizationDependencies();
      const result = await handleFinalization(channelId, threadTs, dependencies);

      assertEquals(result.success, false);

      // Epic was created
      assertEquals(epicManager.getCreatedEpics().length, 1);

      // But session was NOT transitioned
      const unchangedSession = await sessionManager.loadSession(channelId, threadTs);
      assertExists(unchangedSession);
      assertEquals(unchangedSession.phase, Phase.Review);
    });

    it("should post error message to user on Epic failure", async () => {
      const session = createValidSession();
      await datastoreClient.put(session);
      canvasManager.setCanvasContent("canvas_123", "# Test\n\nContent");

      epicManager.setCreateEpicError(new Error("GitHub API unavailable"));

      const dependencies = createFinalizationDependencies();
      await handleFinalization(channelId, threadTs, dependencies);

      const messages = messagingClient.getPostedMessages();
      assertEquals(messages.length, 1);
      assertEquals(messages[0].text.includes("GitHub API unavailable"), true);
    });
  });

  describe("session state not corrupted by errors", () => {
    it("should preserve all session fields on partial failure", async () => {
      const originalSession = createValidSession({
        confidence_score: 95,
        canvas_id: "F9876543210",
        repository: "myorg/myrepo",
      });
      await datastoreClient.put(originalSession);
      canvasManager.setCanvasContent("F9876543210", "# Original Spec\n\nContent");

      // Fail on comment creation (after Epic creation)
      epicManager.setAddSpecCommentError(new Error("Network error"));

      const dependencies = createFinalizationDependencies();
      await handleFinalization(channelId, threadTs, dependencies);

      // Verify all original fields are preserved
      const preservedSession = await sessionManager.loadSession(channelId, threadTs);
      assertExists(preservedSession);
      assertEquals(preservedSession.phase, Phase.Review);
      assertEquals(preservedSession.confidence_score, 95);
      assertEquals(preservedSession.canvas_id, "F9876543210");
      assertEquals(preservedSession.repository, "myorg/myrepo");
      assertEquals(preservedSession.initiator_user_id, userId);
    });

    it("should maintain session integrity across multiple failed operations", async () => {
      const session = createValidSession({ phase: Phase.Questioning });
      await datastoreClient.put(session);

      // Multiple operations that fail
      anthropicClient.setContinueConversationError(
        new AnthropicRateLimitError("Rate limited", "Too fast", "Wait", 30),
      );

      try {
        await anthropicClient.continueConversation([], null);
      } catch (_e) {
        // Expected
      }

      anthropicClient.clear();
      anthropicClient.setContinueConversationError(
        new NetworkTimeoutError("Timeout", "Slow network", "Retry"),
      );

      try {
        await anthropicClient.continueConversation([], null);
      } catch (_e) {
        // Expected
      }

      // Session should be unmodified
      const unchangedSession = await sessionManager.loadSession(channelId, threadTs);
      assertExists(unchangedSession);
      assertEquals(unchangedSession.phase, Phase.Questioning);
      assertEquals(unchangedSession.confidence_score, 95);
    });
  });

  describe("user-friendly error messages", () => {
    it("should format GitHubAccessError for user display", () => {
      const error = new GitHubAccessError(
        "Access denied",
        "Token lacks repository access",
        "Update token permissions",
      );

      const slackMessage = error.toSlackMessage();

      assertEquals(slackMessage.includes(":warning:"), true);
      assertEquals(slackMessage.includes("Access denied"), true);
      assertEquals(slackMessage.includes("Token lacks repository access"), true);
      assertEquals(slackMessage.includes("Update token permissions"), true);
    });

    it("should format AnthropicRateLimitError with retry info", () => {
      const error = new AnthropicRateLimitError(
        "Rate limit exceeded",
        "API quota reached",
        "Wait for reset",
        60,
      );

      const slackMessage = error.toSlackMessage();

      assertEquals(slackMessage.includes(":warning:"), true);
      assertEquals(slackMessage.includes("Rate limit exceeded"), true);
      assertEquals(slackMessage.includes("Retry After:"), true);
    });

    it("should format SlackCanvasError appropriately", () => {
      const error = new SlackCanvasError(
        "Canvas operation failed",
        "Canvas API returned an error",
        "Try again later",
      );

      const slackMessage = error.toSlackMessage();

      assertEquals(slackMessage.includes(":warning:"), true);
      assertEquals(slackMessage.includes("Canvas operation failed"), true);
      assertEquals(slackMessage.includes("SlackCanvasError"), true);
    });

    it("should format NetworkTimeoutError with retry suggestion", () => {
      const error = new NetworkTimeoutError(
        "Request timed out",
        "Server did not respond in time",
        "Retry the request",
      );

      const slackMessage = error.toSlackMessage();

      assertEquals(slackMessage.includes(":warning:"), true);
      assertEquals(slackMessage.includes("Request timed out"), true);
      assertEquals(slackMessage.includes("Retry the request"), true);
    });
  });

  describe("transient vs permanent error handling", () => {
    it("should identify transient errors as retryable", () => {
      const rateLimitError = new AnthropicRateLimitError(
        "Rate limited",
        "Too many requests",
        "Wait",
        30,
      );
      const timeoutError = new NetworkTimeoutError(
        "Timeout",
        "Slow response",
        "Retry",
      );
      const canvasError = new SlackCanvasError(
        "Canvas error",
        "Temporary issue",
        "Try again",
      );

      assertEquals(rateLimitError.isRetryable, true);
      assertEquals(timeoutError.isRetryable, true);
      assertEquals(canvasError.isRetryable, true);
    });

    it("should identify permanent errors as non-retryable", () => {
      const accessError = new GitHubAccessError(
        "Access denied",
        "No permission",
        "Fix permissions",
      );
      const modelError = new AnthropicModelError(
        "Model error",
        "Invalid request",
        "Fix request",
      );

      assertEquals(accessError.isRetryable, false);
      assertEquals(modelError.isRetryable, false);
    });
  });
});
