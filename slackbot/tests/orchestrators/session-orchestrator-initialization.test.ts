// ABOUTME: Tests for SessionOrchestrator async initialization flow with GitHub Actions exploration.
// ABOUTME: Tests slash command handling with --repo flag triggering workflow_dispatch.

import { assertEquals, assertExists } from "@std/assert";
import { afterEach, beforeEach, describe, it } from "@std/testing/bdd";
import { MockAnthropicClient } from "../../src/clients/anthropic-client.ts";
import { MockGitHubClient } from "../../src/clients/github-client.ts";
import { MockSlackMessagingClient } from "../../src/clients/messaging-client.ts";
import { MockDatastoreClient } from "../../src/managers/datastore-client.ts";
import { SessionManager } from "../../src/managers/session-manager.ts";
import { SessionOrchestrator } from "../../src/orchestrators/session-orchestrator.ts";
import { Phase } from "../../src/types/session.ts";
import type { SlashCommand } from "../../src/types/slash-command.ts";

describe("SessionOrchestrator - Async Initialization", () => {
  let orchestrator: SessionOrchestrator;
  let sessionManager: SessionManager;
  let githubClient: MockGitHubClient;
  let anthropicClient: MockAnthropicClient;
  let messagingClient: MockSlackMessagingClient;
  let datastore: MockDatastoreClient;

  const createSlashCommand = (overrides?: Partial<SlashCommand>): SlashCommand => ({
    idea: "build a feature",
    channelId: "C1234567890",
    userId: "U1234567890",
    channelType: "channel",
    responseUrl: "https://hooks.slack.com/commands/123/456",
    ...overrides,
  });

  let originalCallbackUrl: string | undefined;

  beforeEach(() => {
    // Save and set default callback URL for tests that expect exploration to trigger
    originalCallbackUrl = Deno.env.get("EXPLORATION_CALLBACK_URL");
    Deno.env.set("EXPLORATION_CALLBACK_URL", "https://example.com/callback");

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
    // Restore original callback URL
    if (originalCallbackUrl !== undefined) {
      Deno.env.set("EXPLORATION_CALLBACK_URL", originalCallbackUrl);
    } else {
      Deno.env.delete("EXPLORATION_CALLBACK_URL");
    }

    datastore.clear();
    githubClient.clear();
    anthropicClient.clear();
    messagingClient.clear();
  });

  describe("slash command with --repo flag", () => {
    it("should create session in Initializing phase when repo is provided", async () => {
      const command = createSlashCommand({ repository: "owner/repo" });
      const threadTs = "1234567890.123456";

      await orchestrator.handleSlashCommand(command, threadTs);

      const session = await sessionManager.loadSession(command.channelId, threadTs);
      assertExists(session);
      assertEquals(session.phase, Phase.Initializing);
    });

    it("should trigger exploration workflow with correct inputs", async () => {
      const command = createSlashCommand({
        repository: "owner/repo",
        idea: "build a user dashboard",
      });
      const threadTs = "1234567890.123456";

      await orchestrator.handleSlashCommand(command, threadTs);

      const calls = githubClient.getTriggerExplorationCalls();
      assertEquals(calls.length, 1);
      assertEquals(calls[0].targetRepo, "owner/repo");
      assertEquals(calls[0].idea, "build a user dashboard");
      assertExists(calls[0].sessionId);
      assertEquals(calls[0].sessionId, "C1234567890:1234567890.123456");
    });

    it("should post 'Exploring codebase...' message", async () => {
      const command = createSlashCommand({ repository: "owner/repo" });
      const threadTs = "1234567890.123456";

      await orchestrator.handleSlashCommand(command, threadTs);

      const messages = messagingClient.getPostedMessages();
      const exploringMessage = messages.find((m) =>
        m.text.toLowerCase().includes("exploring") &&
        m.text.toLowerCase().includes("codebase")
      );
      assertExists(exploringMessage);
    });

    it("should return immediately without blocking on exploration", async () => {
      const command = createSlashCommand({ repository: "owner/repo" });
      const threadTs = "1234567890.123456";

      const startTime = Date.now();
      await orchestrator.handleSlashCommand(command, threadTs);
      const elapsed = Date.now() - startTime;

      // Should complete quickly (less than 1 second) as exploration is async
      assertEquals(elapsed < 1000, true);
    });

    it("should NOT generate first question when repo is provided", async () => {
      const command = createSlashCommand({ repository: "owner/repo" });
      const threadTs = "1234567890.123456";

      anthropicClient.setNextQuestionResponse({
        question: "What problem are you trying to solve?",
        confidence_score: 20,
      });

      await orchestrator.handleSlashCommand(command, threadTs);

      // Should not have called Anthropic API
      const conversations = anthropicClient.getConversationHistory();
      assertEquals(conversations.length, 0);
    });

    it("should NOT call exploreRepository directly when repo is provided", async () => {
      const command = createSlashCommand({ repository: "owner/repo" });
      const threadTs = "1234567890.123456";

      await orchestrator.handleSlashCommand(command, threadTs);

      // The old synchronous exploreRepository should not be called
      // Only triggerExploration should be called
      const exploreDirectCalls = githubClient.getExploreRepositoryCalls();
      assertEquals(exploreDirectCalls.length, 0);
    });
  });

  describe("workflow trigger failure", () => {
    it("should post error message when workflow trigger fails", async () => {
      const command = createSlashCommand({ repository: "owner/repo" });
      const threadTs = "1234567890.123456";

      githubClient.setTriggerExplorationError(new Error("Workflow trigger failed"));

      await orchestrator.handleSlashCommand(command, threadTs);

      const messages = messagingClient.getPostedMessages();
      const errorMessage = messages.find((m) =>
        m.text.toLowerCase().includes("error") ||
        m.text.toLowerCase().includes("failed") ||
        m.text.toLowerCase().includes("unable")
      );
      assertExists(errorMessage);
    });

    it("should still create session when workflow trigger fails", async () => {
      const command = createSlashCommand({ repository: "owner/repo" });
      const threadTs = "1234567890.123456";

      githubClient.setTriggerExplorationError(new Error("Workflow trigger failed"));

      await orchestrator.handleSlashCommand(command, threadTs);

      const session = await sessionManager.loadSession(command.channelId, threadTs);
      assertExists(session);
    });

    it("should offer to continue without context when workflow trigger fails", async () => {
      const command = createSlashCommand({ repository: "owner/repo" });
      const threadTs = "1234567890.123456";

      githubClient.setTriggerExplorationError(new Error("Workflow trigger failed"));

      await orchestrator.handleSlashCommand(command, threadTs);

      const messages = messagingClient.getPostedMessages();
      const continueMessage = messages.find((m) =>
        m.text.toLowerCase().includes("continue") ||
        m.text.toLowerCase().includes("without context")
      );
      assertExists(continueMessage);
    });

    it("should transition session to Questioning phase after workflow trigger failure", async () => {
      const command = createSlashCommand({ repository: "owner/repo" });
      const threadTs = "1234567890.123456";

      githubClient.setTriggerExplorationError(new Error("Workflow trigger failed"));
      anthropicClient.setNextQuestionResponse({
        question: "What problem are you trying to solve?",
        confidence_score: 20,
      });

      await orchestrator.handleSlashCommand(command, threadTs);

      const session = await sessionManager.loadSession(command.channelId, threadTs);
      assertExists(session);
      assertEquals(session.phase, Phase.Questioning);
    });

    it("should generate first question after workflow trigger failure", async () => {
      const command = createSlashCommand({ repository: "owner/repo" });
      const threadTs = "1234567890.123456";

      githubClient.setTriggerExplorationError(new Error("Workflow trigger failed"));
      anthropicClient.setNextQuestionResponse({
        question: "What is the core problem you want to solve?",
        confidence_score: 20,
      });

      await orchestrator.handleSlashCommand(command, threadTs);

      // Should have called Anthropic API to generate first question
      const conversations = anthropicClient.getConversationHistory();
      assertEquals(conversations.length >= 1, true);
    });

    it("should post first question to Slack after workflow trigger failure", async () => {
      const command = createSlashCommand({ repository: "owner/repo" });
      const threadTs = "1234567890.123456";

      githubClient.setTriggerExplorationError(new Error("Workflow trigger failed"));
      anthropicClient.setNextQuestionResponse({
        question: "What is the core problem you want to solve?",
        confidence_score: 20,
      });

      await orchestrator.handleSlashCommand(command, threadTs);

      const messages = messagingClient.getPostedMessages();
      const questionMessage = messages.find((m) =>
        m.text.includes("core problem") || m.text.includes("solve")
      );
      assertExists(questionMessage);
    });
  });

  describe("missing callback URL configuration", () => {
    it("should post configuration error when EXPLORATION_CALLBACK_URL is not set", async () => {
      // Ensure environment variable is not set
      const originalCallbackUrl = Deno.env.get("EXPLORATION_CALLBACK_URL");
      Deno.env.delete("EXPLORATION_CALLBACK_URL");

      try {
        const command = createSlashCommand({ repository: "owner/repo" });
        const threadTs = "1234567890.123456";

        anthropicClient.setNextQuestionResponse({
          question: "What problem are you trying to solve?",
          confidence_score: 20,
        });

        await orchestrator.handleSlashCommand(command, threadTs);

        const messages = messagingClient.getPostedMessages();
        const configMessage = messages.find((m) =>
          m.text.toLowerCase().includes("not configured") ||
          m.text.toLowerCase().includes("callback_url")
        );
        assertExists(configMessage);
      } finally {
        // Restore original value
        if (originalCallbackUrl) {
          Deno.env.set("EXPLORATION_CALLBACK_URL", originalCallbackUrl);
        }
      }
    });

    it("should transition to Questioning phase when callback URL is missing", async () => {
      // Ensure environment variable is not set
      const originalCallbackUrl = Deno.env.get("EXPLORATION_CALLBACK_URL");
      Deno.env.delete("EXPLORATION_CALLBACK_URL");

      try {
        const command = createSlashCommand({ repository: "owner/repo" });
        const threadTs = "1234567890.123456";

        anthropicClient.setNextQuestionResponse({
          question: "What problem are you trying to solve?",
          confidence_score: 20,
        });

        await orchestrator.handleSlashCommand(command, threadTs);

        const session = await sessionManager.loadSession(command.channelId, threadTs);
        assertExists(session);
        assertEquals(session.phase, Phase.Questioning);
      } finally {
        // Restore original value
        if (originalCallbackUrl) {
          Deno.env.set("EXPLORATION_CALLBACK_URL", originalCallbackUrl);
        }
      }
    });

    it("should generate first question when callback URL is missing", async () => {
      // Ensure environment variable is not set
      const originalCallbackUrl = Deno.env.get("EXPLORATION_CALLBACK_URL");
      Deno.env.delete("EXPLORATION_CALLBACK_URL");

      try {
        const command = createSlashCommand({ repository: "owner/repo" });
        const threadTs = "1234567890.123456";

        anthropicClient.setNextQuestionResponse({
          question: "What is the core problem you want to solve?",
          confidence_score: 20,
        });

        await orchestrator.handleSlashCommand(command, threadTs);

        // Should have called Anthropic API to generate first question
        const conversations = anthropicClient.getConversationHistory();
        assertEquals(conversations.length >= 1, true);
      } finally {
        // Restore original value
        if (originalCallbackUrl) {
          Deno.env.set("EXPLORATION_CALLBACK_URL", originalCallbackUrl);
        }
      }
    });

    it("should NOT trigger exploration workflow when callback URL is missing", async () => {
      // Ensure environment variable is not set
      const originalCallbackUrl = Deno.env.get("EXPLORATION_CALLBACK_URL");
      Deno.env.delete("EXPLORATION_CALLBACK_URL");

      try {
        const command = createSlashCommand({ repository: "owner/repo" });
        const threadTs = "1234567890.123456";

        anthropicClient.setNextQuestionResponse({
          question: "What problem are you trying to solve?",
          confidence_score: 20,
        });

        await orchestrator.handleSlashCommand(command, threadTs);

        // Should NOT have called triggerExploration
        const calls = githubClient.getTriggerExplorationCalls();
        assertEquals(calls.length, 0);
      } finally {
        // Restore original value
        if (originalCallbackUrl) {
          Deno.env.set("EXPLORATION_CALLBACK_URL", originalCallbackUrl);
        }
      }
    });
  });

  describe("slash command without --repo flag", () => {
    it("should create session in Questioning phase when no repo is provided", async () => {
      const command = createSlashCommand({ repository: undefined });
      const threadTs = "1234567890.123456";

      anthropicClient.setNextQuestionResponse({
        question: "What problem are you trying to solve?",
        confidence_score: 20,
      });

      await orchestrator.handleSlashCommand(command, threadTs);

      const session = await sessionManager.loadSession(command.channelId, threadTs);
      assertExists(session);
      assertEquals(session.phase, Phase.Questioning);
    });

    it("should generate first question when no repo is provided", async () => {
      const command = createSlashCommand({ repository: undefined });
      const threadTs = "1234567890.123456";

      anthropicClient.setNextQuestionResponse({
        question: "What is the core problem you want to solve?",
        confidence_score: 20,
      });

      await orchestrator.handleSlashCommand(command, threadTs);

      const conversations = anthropicClient.getConversationHistory();
      assertEquals(conversations.length >= 1, true);
    });

    it("should post first question to Slack when no repo is provided", async () => {
      const command = createSlashCommand({ repository: undefined });
      const threadTs = "1234567890.123456";

      anthropicClient.setNextQuestionResponse({
        question: "What users will benefit from this?",
        confidence_score: 25,
      });

      await orchestrator.handleSlashCommand(command, threadTs);

      const messages = messagingClient.getPostedMessages();
      const questionMessage = messages.find((m) =>
        m.text.includes("users") || m.text.includes("benefit")
      );
      assertExists(questionMessage);
    });

    it("should NOT call triggerExploration when no repo is provided", async () => {
      const command = createSlashCommand({ repository: undefined });
      const threadTs = "1234567890.123456";

      anthropicClient.setNextQuestionResponse({
        question: "What problem are you trying to solve?",
        confidence_score: 20,
      });

      await orchestrator.handleSlashCommand(command, threadTs);

      const calls = githubClient.getTriggerExplorationCalls();
      assertEquals(calls.length, 0);
    });
  });

  describe("callback URL configuration", () => {
    it("should use EXPLORATION_CALLBACK_URL environment variable", async () => {
      // Set environment variable
      const originalCallbackUrl = Deno.env.get("EXPLORATION_CALLBACK_URL");
      Deno.env.set("EXPLORATION_CALLBACK_URL", "https://example.com/webhook");

      try {
        const command = createSlashCommand({ repository: "owner/repo" });
        const threadTs = "1234567890.123456";

        await orchestrator.handleSlashCommand(command, threadTs);

        const calls = githubClient.getTriggerExplorationCalls();
        assertEquals(calls.length, 1);
        assertEquals(calls[0].callbackUrl, "https://example.com/webhook");
      } finally {
        // Restore original value
        if (originalCallbackUrl) {
          Deno.env.set("EXPLORATION_CALLBACK_URL", originalCallbackUrl);
        } else {
          Deno.env.delete("EXPLORATION_CALLBACK_URL");
        }
      }
    });
  });
});
