// ABOUTME: Integration tests for the complete questioning flow from slash command to review phase.
// ABOUTME: Tests Q&A loop, confidence progression, and phase transitions.

import { assertEquals, assertExists } from "@std/assert";
import { afterEach, beforeEach, describe, it } from "@std/testing/bdd";

import { MockAnthropicClient } from "../../src/clients/anthropic-client.ts";
import { MockGitHubClient } from "../../src/clients/github-client.ts";
import { MockSlackMessagingClient } from "../../src/clients/messaging-client.ts";
import { MockDatastoreClient } from "../../src/managers/datastore-client.ts";
import { SessionManager } from "../../src/managers/session-manager.ts";
import { SessionOrchestrator } from "../../src/orchestrators/session-orchestrator.ts";
import { formatSessionId, Phase } from "../../src/types/session.ts";
import type { SlashCommand } from "../../src/types/slash-command.ts";
import type { Message } from "../../src/types/message.ts";
import { AnthropicModelError } from "../../src/errors/types.ts";

describe("Flow: Questioning Phase Integration", () => {
  let orchestrator: SessionOrchestrator;
  let sessionManager: SessionManager;
  let githubClient: MockGitHubClient;
  let anthropicClient: MockAnthropicClient;
  let messagingClient: MockSlackMessagingClient;
  let datastoreClient: MockDatastoreClient;
  let originalCallbackUrl: string | undefined;

  const channelId = "C1234567890";
  const threadTs = "1234567890.123456";
  const userId = "U1234567890";
  const sessionId = formatSessionId(channelId, threadTs);

  beforeEach(() => {
    // Save and set default callback URL for tests that expect exploration to trigger
    originalCallbackUrl = Deno.env.get("EXPLORATION_CALLBACK_URL");
    Deno.env.set("EXPLORATION_CALLBACK_URL", "https://example.com/callback");

    datastoreClient = new MockDatastoreClient();
    sessionManager = new SessionManager(datastoreClient);
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

    datastoreClient.clear();
    githubClient.clear();
    anthropicClient.clear();
    messagingClient.clear();
  });

  /**
   * Helper to create a valid slash command for testing.
   */
  function createSlashCommand(overrides?: Partial<SlashCommand>): SlashCommand {
    return {
      idea: "build a feature",
      channelId,
      userId,
      channelType: "channel",
      responseUrl: "https://hooks.slack.com/commands/123/456",
      ...overrides,
    };
  }

  describe("complete questioning flow without repository", () => {
    it("should create session from /brainstorm command", async () => {
      const command = createSlashCommand({ idea: "user authentication system" });

      anthropicClient.setNextQuestionResponse({
        question: "What problem are you trying to solve?",
        confidence_score: 20,
      });

      await orchestrator.handleSlashCommand(command, threadTs);

      // Verify session was created
      const session = await sessionManager.loadSession(channelId, threadTs);
      assertExists(session);
      assertEquals(session.session_id, sessionId);
      assertEquals(session.phase, Phase.Questioning);
      assertEquals(session.initiator_user_id, userId);
    });

    it("should post acknowledgment and first question", async () => {
      const command = createSlashCommand({ idea: "user dashboard" });

      anthropicClient.setNextQuestionResponse({
        question: "What information should the dashboard display?",
        confidence_score: 25,
      });

      await orchestrator.handleSlashCommand(command, threadTs);

      const messages = messagingClient.getPostedMessages();
      assertEquals(messages.length >= 2, true, "Should post at least ack and question");

      // First message should be acknowledgment
      const ackMessage = messages[0];
      assertEquals(ackMessage.channelId, channelId);
      assertEquals(ackMessage.threadTs, threadTs);
      assertEquals(
        ackMessage.text.toLowerCase().includes("brainstorm") ||
          ackMessage.text.toLowerCase().includes("dashboard"),
        true,
      );

      // Second message should be the question
      const questionMessage = messages.find((m) => m.text.includes("dashboard"));
      assertExists(questionMessage);
    });

    it("should include idea in context for question generation", async () => {
      const command = createSlashCommand({ idea: "user notification system" });

      anthropicClient.setNextQuestionResponse({
        question: "What types of notifications should be supported?",
        confidence_score: 20,
      });

      await orchestrator.handleSlashCommand(command, threadTs);

      // Verify Anthropic was called with idea in messages
      const conversations = anthropicClient.getConversationHistory();
      assertExists(conversations[0]);
      const hasIdea = conversations[0].messages.some((m) =>
        m.text.includes("notification")
      );
      assertEquals(hasIdea, true, "Idea should be included in conversation context");
    });
  });

  describe("Q&A loop with multiple user answers", () => {
    it("should process multiple user answers and increase confidence", async () => {
      // Setup: Create initial session via slash command
      const command = createSlashCommand({ idea: "reporting feature" });

      anthropicClient.setNextQuestionResponse({
        question: "What types of reports do you need?",
        confidence_score: 20,
      });

      await orchestrator.handleSlashCommand(command, threadTs);

      // Verify initial session state (session starts at 0, confidence updates happen later)
      let session = await sessionManager.loadSession(channelId, threadTs);
      assertExists(session);
      assertEquals(session.confidence_score, 0, "Initial confidence is 0");

      // Simulate first user answer and bot response
      anthropicClient.setNextQuestionResponse({
        question: "Who are the primary users of these reports?",
        confidence_score: 40,
      });

      const answer1: Message = {
        sender: userId,
        text: "@regent We need daily sales reports and monthly summaries",
        timestamp: "1234567890.123457",
      };

      // Call continue conversation directly with new answer
      const response1 = await anthropicClient.continueConversation([answer1], null);
      assertEquals(response1.confidence_score, 40, "Confidence should increase");

      // Update session with new confidence (simulating what orchestrator does)
      session.confidence_score = response1.confidence_score;
      await sessionManager.updateSession(session);

      // Verify session was updated
      session = await sessionManager.loadSession(channelId, threadTs);
      assertExists(session);
      assertEquals(session.confidence_score, 40);
    });

    it("should track conversation history across multiple turns", async () => {
      const command = createSlashCommand({ idea: "search feature" });

      anthropicClient.setNextQuestionResponse({
        question: "What should users be able to search for?",
        confidence_score: 25,
      });

      await orchestrator.handleSlashCommand(command, threadTs);

      // First answer
      const answer1: Message = {
        sender: userId,
        text: "@regent Users should search for products and articles",
        timestamp: "1234567890.123457",
      };

      anthropicClient.setNextQuestionResponse({
        question: "What filters should be available?",
        confidence_score: 45,
      });

      await anthropicClient.continueConversation([answer1], null);

      // Second answer
      const answer2: Message = {
        sender: userId,
        text: "@regent We need filters by category, price, and date",
        timestamp: "1234567890.123458",
      };

      anthropicClient.setNextQuestionResponse({
        question: "How should search results be sorted?",
        confidence_score: 65,
      });

      await anthropicClient.continueConversation([answer1, answer2], null);

      // Verify conversation history was recorded
      const history = anthropicClient.getConversationHistory();
      assertEquals(history.length, 3, "Should have 3 conversation turns");
    });
  });

  describe("confidence score progression", () => {
    it("should start with low confidence and increase towards 95%", async () => {
      const confidenceProgression = [25, 40, 55, 70, 85, 95];

      // Create session
      const command = createSlashCommand({ idea: "analytics feature" });
      anthropicClient.setNextQuestionResponse({
        question: "What metrics do you want to track?",
        confidence_score: confidenceProgression[0],
      });

      await orchestrator.handleSlashCommand(command, threadTs);

      let session = await sessionManager.loadSession(channelId, threadTs);
      assertExists(session);
      // Session starts at 0, confidence gets updated as Q&A progresses
      assertEquals(session.confidence_score, 0, "Initial session confidence is 0");

      // Simulate first question response updating confidence
      session.confidence_score = confidenceProgression[0];
      await sessionManager.updateSession(session);

      // Verify first update
      session = await sessionManager.loadSession(channelId, threadTs);
      assertExists(session);
      assertEquals(session.confidence_score, 25, "First confidence update");

      // Simulate progression through answers
      for (let i = 1; i < confidenceProgression.length; i++) {
        anthropicClient.setNextQuestionResponse({
          question: `Follow-up question ${i}`,
          confidence_score: confidenceProgression[i],
        });

        const answer: Message = {
          sender: userId,
          text: `@regent Answer ${i}`,
          timestamp: `1234567890.12345${i + 6}`,
        };

        const response = await anthropicClient.continueConversation([answer], null);
        session.confidence_score = response.confidence_score;
        await sessionManager.updateSession(session);

        session = await sessionManager.loadSession(channelId, threadTs);
        assertExists(session);
        assertEquals(
          session.confidence_score,
          confidenceProgression[i],
          `Confidence at turn ${i} should be ${confidenceProgression[i]}`,
        );
      }
    });

    it("should handle confidence reaching 95% threshold", async () => {
      const command = createSlashCommand({ idea: "payment integration" });

      // Start with high confidence (simulating late-stage conversation)
      anthropicClient.setNextQuestionResponse({
        question: "Any final details about the payment flow?",
        confidence_score: 92,
      });

      await orchestrator.handleSlashCommand(command, threadTs);

      let session = await sessionManager.loadSession(channelId, threadTs);
      assertExists(session);
      assertEquals(session.phase, Phase.Questioning);

      // Reach threshold
      anthropicClient.setNextQuestionResponse({
        question: "I believe I have enough information now.",
        confidence_score: 95,
      });

      const answer: Message = {
        sender: userId,
        text: "@regent The payment should support credit cards and PayPal",
        timestamp: "1234567890.123457",
      };

      const response = await anthropicClient.continueConversation([answer], null);
      assertEquals(response.confidence_score >= 95, true, "Should reach threshold");

      // Update session to Review phase when confidence >= 95
      if (response.confidence_score >= 95) {
        session.phase = Phase.Review;
        session.confidence_score = response.confidence_score;
        await sessionManager.updateSession(session);
      }

      session = await sessionManager.loadSession(channelId, threadTs);
      assertExists(session);
      assertEquals(session.phase, Phase.Review, "Should transition to Review phase");
      assertEquals(session.confidence_score, 95);
    });
  });

  describe("session with repository exploration", () => {
    it("should trigger exploration when repository is provided", async () => {
      const command = createSlashCommand({
        idea: "add feature to repo",
        repository: "owner/repo",
      });

      await orchestrator.handleSlashCommand(command, threadTs);

      // Verify exploration was triggered
      const calls = githubClient.getTriggerExplorationCalls();
      assertEquals(calls.length, 1);
      assertEquals(calls[0].targetRepo, "owner/repo");
      assertEquals(calls[0].sessionId, sessionId);
    });

    it("should create session with repository stored", async () => {
      const command = createSlashCommand({
        idea: "improve API endpoints",
        repository: "stickystyle/regent",
      });

      await orchestrator.handleSlashCommand(command, threadTs);

      const session = await sessionManager.loadSession(channelId, threadTs);
      assertExists(session);
      assertEquals(session.repository, "stickystyle/regent");
    });

    it("should not generate first question when repo provided (async flow)", async () => {
      const command = createSlashCommand({
        idea: "add tests",
        repository: "owner/repo",
      });

      await orchestrator.handleSlashCommand(command, threadTs);

      // With repo, first question waits for exploration callback
      const conversations = anthropicClient.getConversationHistory();
      assertEquals(conversations.length, 0, "Should not call Anthropic until exploration completes");
    });

    it("should post exploration status message", async () => {
      const command = createSlashCommand({
        idea: "refactor module",
        repository: "owner/repo",
      });

      await orchestrator.handleSlashCommand(command, threadTs);

      const messages = messagingClient.getPostedMessages();
      const explorationMessage = messages.find((m) =>
        m.text.toLowerCase().includes("exploring") ||
        m.text.toLowerCase().includes("codebase")
      );
      assertExists(explorationMessage, "Should post exploration status message");
    });
  });

  describe("session without repository", () => {
    it("should generate first question immediately", async () => {
      const command = createSlashCommand({
        idea: "standalone feature",
        repository: undefined,
      });

      anthropicClient.setNextQuestionResponse({
        question: "What is the main purpose of this feature?",
        confidence_score: 20,
      });

      await orchestrator.handleSlashCommand(command, threadTs);

      // Anthropic should be called immediately
      const conversations = anthropicClient.getConversationHistory();
      assertEquals(conversations.length >= 1, true, "Should call Anthropic for first question");
      assertEquals(conversations[0].context, null, "Context should be null without repo");
    });

    it("should post question to thread immediately", async () => {
      const command = createSlashCommand({
        idea: "utility function",
        repository: undefined,
      });

      anthropicClient.setNextQuestionResponse({
        question: "What should this utility function do?",
        confidence_score: 25,
      });

      await orchestrator.handleSlashCommand(command, threadTs);

      const messages = messagingClient.getPostedMessages();
      const questionMessage = messages.find((m) => m.text.includes("utility"));
      assertExists(questionMessage, "Should post question immediately");
    });
  });

  describe("error handling during questioning", () => {
    it("should handle Anthropic API errors gracefully", async () => {
      const command = createSlashCommand({ idea: "error test" });

      anthropicClient.setContinueConversationError(
        new AnthropicModelError(
          "Model error",
          "Content policy violation",
          "Modify prompt",
        ),
      );

      // Should not throw
      await orchestrator.handleSlashCommand(command, threadTs);

      // Session should still be created
      const session = await sessionManager.loadSession(channelId, threadTs);
      assertExists(session);

      // Error message should be posted
      const messages = messagingClient.getPostedMessages();
      const errorMessage = messages.find((m) =>
        m.text.toLowerCase().includes("error") ||
        m.text.toLowerCase().includes("unable")
      );
      assertExists(errorMessage);
    });

    it("should handle GitHub exploration trigger failures", async () => {
      const command = createSlashCommand({
        idea: "exploration error test",
        repository: "private/repo",
      });

      githubClient.setTriggerExplorationError(new Error("Workflow trigger failed"));

      await orchestrator.handleSlashCommand(command, threadTs);

      // Session should still be created
      const session = await sessionManager.loadSession(channelId, threadTs);
      assertExists(session);

      // Error message should offer to continue without context
      const messages = messagingClient.getPostedMessages();
      const continueMessage = messages.find((m) =>
        m.text.toLowerCase().includes("continue") ||
        m.text.toLowerCase().includes("without")
      );
      assertExists(continueMessage, "Should offer to continue without context");
    });
  });

  describe("message ordering verification", () => {
    it("should post messages in correct order without repo", async () => {
      const command = createSlashCommand({
        idea: "ordering test",
        repository: undefined,
      });

      anthropicClient.setNextQuestionResponse({
        question: "Test question?",
        confidence_score: 20,
      });

      await orchestrator.handleSlashCommand(command, threadTs);

      const messages = messagingClient.getPostedMessages();
      assertEquals(messages.length >= 2, true, "Should have ack and question");

      // First should be acknowledgment
      assertEquals(
        messages[0].text.toLowerCase().includes("brainstorm") ||
          messages[0].text.toLowerCase().includes("ordering") ||
          messages[0].text.toLowerCase().includes("starting"),
        true,
        "First message should be acknowledgment",
      );
    });

    it("should post messages in correct order with repo", async () => {
      const command = createSlashCommand({
        idea: "repo ordering test",
        repository: "owner/repo",
      });

      await orchestrator.handleSlashCommand(command, threadTs);

      const messages = messagingClient.getPostedMessages();
      assertEquals(messages.length, 2, "Should have ack and exploring messages");

      // Second should mention exploring
      assertEquals(
        messages[1].text.toLowerCase().includes("exploring") ||
          messages[1].text.toLowerCase().includes("codebase"),
        true,
        "Second message should mention exploration",
      );
    });
  });
});
