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
  let originalEnv: Map<string, string | undefined>;

  const createSlashCommand = (overrides?: Partial<SlashCommand>): SlashCommand => ({
    idea: "build a feature",
    channelId: "C1234567890",
    userId: "U1234567890",
    channelType: "channel",
    responseUrl: "https://hooks.slack.com/commands/123/456",
    ...overrides,
  });

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

    // Store original env values for EXPLORATION_CALLBACK_URL
    originalEnv = new Map();
    originalEnv.set("EXPLORATION_CALLBACK_URL", Deno.env.get("EXPLORATION_CALLBACK_URL"));
  });

  afterEach(() => {
    datastore.clear();
    githubClient.clear();
    anthropicClient.clear();
    messagingClient.clear();

    // Restore original env values
    for (const [key, value] of originalEnv) {
      if (value !== undefined) {
        Deno.env.set(key, value);
      } else {
        Deno.env.delete(key);
      }
    }
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

    it("should pass EXPLORATION_CALLBACK_URL to triggerExploration when configured", async () => {
      const command = createSlashCommand({ repository: "owner/repo" });
      const threadTs = "1234567890.123456";
      const testCallbackUrl = "https://hooks.slack.com/triggers/T123/456/secret";

      // Set the callback URL environment variable
      Deno.env.set("EXPLORATION_CALLBACK_URL", testCallbackUrl);

      await orchestrator.handleSlashCommand(command, threadTs);

      const calls = githubClient.getTriggerExplorationCalls();
      assertEquals(calls.length, 1);
      assertEquals(calls[0].callbackUrl, testCallbackUrl);
    });

    it("should pass undefined callbackUrl when EXPLORATION_CALLBACK_URL is not set", async () => {
      const command = createSlashCommand({ repository: "owner/repo" });
      const threadTs = "1234567890.123456";

      // Ensure the callback URL is not set
      Deno.env.delete("EXPLORATION_CALLBACK_URL");

      await orchestrator.handleSlashCommand(command, threadTs);

      const calls = githubClient.getTriggerExplorationCalls();
      assertEquals(calls.length, 1);
      assertEquals(calls[0].callbackUrl, undefined);
    });

    it("should treat empty string EXPLORATION_CALLBACK_URL as not configured", async () => {
      const command = createSlashCommand({ repository: "owner/repo" });
      const threadTs = "1234567890.123456";

      // Set callback URL to empty string
      Deno.env.set("EXPLORATION_CALLBACK_URL", "");

      await orchestrator.handleSlashCommand(command, threadTs);

      const calls = githubClient.getTriggerExplorationCalls();
      assertEquals(calls.length, 1);
      assertEquals(calls[0].callbackUrl, undefined);
    });

    it("should treat whitespace-only EXPLORATION_CALLBACK_URL as not configured", async () => {
      const command = createSlashCommand({ repository: "owner/repo" });
      const threadTs = "1234567890.123456";

      // Set callback URL to whitespace only
      Deno.env.set("EXPLORATION_CALLBACK_URL", "   ");

      await orchestrator.handleSlashCommand(command, threadTs);

      const calls = githubClient.getTriggerExplorationCalls();
      assertEquals(calls.length, 1);
      assertEquals(calls[0].callbackUrl, undefined);
    });

    it("should reject HTTP callback URLs with validation error", async () => {
      const command = createSlashCommand({ repository: "owner/repo" });
      const threadTs = "1234567890.123456";

      // Set callback URL to HTTP (insecure)
      Deno.env.set("EXPLORATION_CALLBACK_URL", "http://hooks.slack.com/triggers/T123/456/secret");

      anthropicClient.setNextQuestionResponse({
        question: "What problem are you trying to solve?",
        confidence_score: 20,
      });

      await orchestrator.handleSlashCommand(command, threadTs);

      // Should have posted an error message about HTTPS
      const messages = messagingClient.getPostedMessages();
      const httpsErrorMessage = messages.find((m) =>
        m.text.toLowerCase().includes("https") ||
        m.text.toLowerCase().includes("callback url")
      );
      assertExists(httpsErrorMessage);

      // Should still transition to questioning phase and generate first question
      const session = await sessionManager.loadSession(command.channelId, threadTs);
      assertExists(session);
      assertEquals(session.phase, Phase.Questioning);
    });

    it("should reject malformed callback URLs with validation error", async () => {
      const command = createSlashCommand({ repository: "owner/repo" });
      const threadTs = "1234567890.123456";

      // Set callback URL to invalid format
      Deno.env.set("EXPLORATION_CALLBACK_URL", "not-a-valid-url");

      anthropicClient.setNextQuestionResponse({
        question: "What problem are you trying to solve?",
        confidence_score: 20,
      });

      await orchestrator.handleSlashCommand(command, threadTs);

      // Should have posted an error message about invalid URL
      const messages = messagingClient.getPostedMessages();
      const invalidUrlMessage = messages.find((m) =>
        m.text.toLowerCase().includes("invalid") ||
        m.text.toLowerCase().includes("url")
      );
      assertExists(invalidUrlMessage);

      // Should still transition to questioning phase and generate first question
      const session = await sessionManager.loadSession(command.channelId, threadTs);
      assertExists(session);
      assertEquals(session.phase, Phase.Questioning);
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
});
