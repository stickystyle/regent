// ABOUTME: Tests for SessionOrchestrator review phase transition.
// ABOUTME: Tests spec synthesis, Canvas creation, and review instructions on confidence threshold or manual trigger.

import { assertEquals, assertExists } from "@std/assert";
import { afterEach, beforeEach, describe, it } from "@std/testing/bdd";
import { MockAnthropicClient } from "../../src/clients/anthropic-client.ts";
import { MockGitHubClient } from "../../src/clients/github-client.ts";
import { MockSlackMessagingClient } from "../../src/clients/messaging-client.ts";
import { MockCanvasManager } from "../../src/managers/canvas-manager.ts";
import { MockDatastoreClient } from "../../src/managers/datastore-client.ts";
import { MessageCache } from "../../src/managers/message-cache.ts";
import { SessionManager } from "../../src/managers/session-manager.ts";
import { SessionOrchestrator } from "../../src/orchestrators/session-orchestrator.ts";
import type { Session } from "../../src/types/session.ts";
import { Phase } from "../../src/types/session.ts";
import type { SpecDocument } from "../../src/types/spec-document.ts";

/**
 * Helper to create a test session.
 */
function createTestSession(overrides?: Partial<Session>): Session {
  const now = new Date();
  const ttl = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  return {
    session_id: "C1234567890:1234567890.123456",
    phase: Phase.Questioning,
    initiator_user_id: "U1234567890",
    confidence_score: 50,
    created_at: now.toISOString(),
    ttl: ttl.toISOString(),
    ...overrides,
  };
}

/**
 * Helper to create a test SpecDocument.
 */
function createTestSpec(): SpecDocument {
  return {
    title: "Test Feature",
    overview: "A test feature for review transition testing.",
    problem_statement: "We need to test the review phase transition.",
    goals: ["Test confidence threshold trigger", "Test manual trigger"],
    non_goals: ["Test unrelated features"],
    personas: [
      {
        name: "Developer",
        description: "A developer testing the review transition.",
      },
    ],
    use_cases: [
      {
        id: "UC1",
        title: "Trigger Review",
        description: "User triggers review phase via confidence or manual action.",
      },
    ],
    technical_details: "Uses SessionOrchestrator to manage phase transitions.",
    open_questions: [],
  };
}

describe("SessionOrchestrator - Review Phase Transition", () => {
  let orchestrator: SessionOrchestrator;
  let sessionManager: SessionManager;
  let githubClient: MockGitHubClient;
  let anthropicClient: MockAnthropicClient;
  let messagingClient: MockSlackMessagingClient;
  let canvasManager: MockCanvasManager;
  let messageCache: MessageCache;
  let datastore: MockDatastoreClient;

  beforeEach(() => {
    datastore = new MockDatastoreClient();
    messageCache = new MessageCache();
    sessionManager = new SessionManager(datastore, () => new Date(), undefined, messageCache);
    githubClient = new MockGitHubClient();
    anthropicClient = new MockAnthropicClient();
    messagingClient = new MockSlackMessagingClient();
    canvasManager = new MockCanvasManager();

    orchestrator = new SessionOrchestrator(
      sessionManager,
      githubClient,
      anthropicClient,
      messagingClient,
      messageCache,
      canvasManager,
    );
  });

  afterEach(() => {
    datastore.clear();
    githubClient.clear();
    anthropicClient.clear();
    messagingClient.clear();
    canvasManager.clear();
    messageCache.clear();
  });

  describe("Confidence threshold trigger", () => {
    it("should synthesize spec when confidence reaches 95%", async () => {
      // Arrange: Create session and add conversation history
      const session = createTestSession({ confidence_score: 90 });
      await datastore.put(session);

      messageCache.append(session.session_id, {
        sender: "U1234567890",
        text: "I want to build a login feature",
        timestamp: "1234567890.123456",
      });
      messageCache.append(session.session_id, {
        sender: "bot",
        text: "What authentication method would you prefer?",
        timestamp: "1234567890.123457",
      });

      anthropicClient.setNextQuestionResponse({
        question: "I'm 95% confident we have enough detail for the spec.",
        confidence_score: 95,
      });

      const testSpec = createTestSpec();
      anthropicClient.setNextSpecResponse(testSpec);

      // Act
      await orchestrator.runToolLoop(
        session,
        "OAuth2 with Google",
        "U1234567890",
        "1234567890.200000",
      );

      // Assert: Session should be in Review phase
      const updatedSession = await sessionManager.loadSession(
        "C1234567890",
        "1234567890.123456",
      );
      assertExists(updatedSession);
      assertEquals(updatedSession.phase, Phase.Review);
    });

    it("should create Canvas with synthesized spec", async () => {
      // Arrange
      const session = createTestSession({ confidence_score: 92 });
      await datastore.put(session);

      messageCache.append(session.session_id, {
        sender: "U1234567890",
        text: "Build auth system",
        timestamp: "1234567890.123456",
      });

      anthropicClient.setNextQuestionResponse({
        question: "I'm 97% confident.",
        confidence_score: 97,
      });

      const testSpec = createTestSpec();
      anthropicClient.setNextSpecResponse(testSpec);

      // Act
      await orchestrator.runToolLoop(
        session,
        "Final details here",
        "U1234567890",
        "1234567890.200000",
      );

      // Assert: Canvas should be created
      const createdCanvases = canvasManager.getCreatedCanvases();
      assertEquals(createdCanvases.length, 1);
      assertEquals(createdCanvases[0].content.includes("Test Feature"), true);
      assertEquals(createdCanvases[0].channelId, "C1234567890");
      assertEquals(createdCanvases[0].threadTs, "1234567890.123456");
    });

    it("should update session with canvas_id", async () => {
      // Arrange
      const session = createTestSession({ confidence_score: 93 });
      await datastore.put(session);

      anthropicClient.setNextQuestionResponse({
        question: "Ready for review. I'm 95% confident.",
        confidence_score: 95,
      });

      const testSpec = createTestSpec();
      anthropicClient.setNextSpecResponse(testSpec);

      // Act
      await orchestrator.runToolLoop(
        session,
        "User answer",
        "U1234567890",
        "1234567890.200000",
      );

      // Assert: Session should have canvas_id
      const updatedSession = await sessionManager.loadSession(
        "C1234567890",
        "1234567890.123456",
      );
      assertExists(updatedSession);
      assertExists(updatedSession.canvas_id);
      assertEquals(updatedSession.canvas_id?.startsWith("canvas_"), true);
    });

    it("should post review instructions to thread", async () => {
      // Arrange
      const session = createTestSession({ confidence_score: 90 });
      await datastore.put(session);

      anthropicClient.setNextQuestionResponse({
        question: "I'm 95% confident we have enough detail.",
        confidence_score: 95,
      });

      const testSpec = createTestSpec();
      anthropicClient.setNextSpecResponse(testSpec);

      // Act
      await orchestrator.runToolLoop(
        session,
        "User answer",
        "U1234567890",
        "1234567890.200000",
      );

      // Assert: Review instructions should be posted
      const messages = messagingClient.getPostedMessages();
      const reviewInstructions = messages.find((m) =>
        m.text.includes("Spec Ready for Review") ||
        m.text.includes("review") ||
        m.text.includes("approve")
      );
      assertExists(reviewInstructions);
    });

    it("should NOT trigger review transition below 95%", async () => {
      // Arrange
      const session = createTestSession({ confidence_score: 85 });
      await datastore.put(session);

      anthropicClient.setNextQuestionResponse({
        question: "What about edge cases? I'm 94% confident.",
        confidence_score: 94,
      });

      // Act
      await orchestrator.runToolLoop(
        session,
        "User answer",
        "U1234567890",
        "1234567890.200000",
      );

      // Assert: Should stay in Questioning phase
      const updatedSession = await sessionManager.loadSession(
        "C1234567890",
        "1234567890.123456",
      );
      assertExists(updatedSession);
      assertEquals(updatedSession.phase, Phase.Questioning);

      // Canvas should NOT be created
      const createdCanvases = canvasManager.getCreatedCanvases();
      assertEquals(createdCanvases.length, 0);
    });
  });

  describe("Manual trigger via @regent ready", () => {
    it("should transition to review when user says @regent ready", async () => {
      // Arrange
      const session = createTestSession({ confidence_score: 70 });
      await datastore.put(session);

      messageCache.append(session.session_id, {
        sender: "U1234567890",
        text: "Build a feature",
        timestamp: "1234567890.123456",
      });

      // The LLM should recognize the ready intent and respond accordingly
      anthropicClient.setNextQuestionResponse({
        question: "Understood, I'll prepare the spec for review. I'm now 100% confident.",
        confidence_score: 100,
      });

      const testSpec = createTestSpec();
      anthropicClient.setNextSpecResponse(testSpec);

      // Act: User sends "@regent ready" or similar
      await orchestrator.runToolLoop(
        session,
        "@regent ready",
        "U1234567890",
        "1234567890.200000",
      );

      // Assert: Should transition to Review
      const updatedSession = await sessionManager.loadSession(
        "C1234567890",
        "1234567890.123456",
      );
      assertExists(updatedSession);
      assertEquals(updatedSession.phase, Phase.Review);
    });

    it("should synthesize spec on manual trigger even at low confidence", async () => {
      // Arrange
      const session = createTestSession({ confidence_score: 50 });
      await datastore.put(session);

      messageCache.append(session.session_id, {
        sender: "U1234567890",
        text: "Build something simple",
        timestamp: "1234567890.123456",
      });

      // LLM recognizes the intent and bumps confidence
      anthropicClient.setNextQuestionResponse({
        question: "Got it, preparing the spec. I'm 95% confident.",
        confidence_score: 95,
      });

      const testSpec = createTestSpec();
      anthropicClient.setNextSpecResponse(testSpec);

      // Act
      await orchestrator.runToolLoop(
        session,
        "@regent we're done, let's review",
        "U1234567890",
        "1234567890.200000",
      );

      // Assert
      const createdCanvases = canvasManager.getCreatedCanvases();
      assertEquals(createdCanvases.length, 1);
    });
  });

  describe("Spec synthesis flow", () => {
    it("should call synthesizeSpec with full conversation history", async () => {
      // Arrange
      const session = createTestSession({ confidence_score: 93 });
      await datastore.put(session);

      // Add comprehensive conversation history
      messageCache.append(session.session_id, {
        sender: "U1234567890",
        text: "I want to build a dashboard",
        timestamp: "1234567890.100000",
      });
      messageCache.append(session.session_id, {
        sender: "bot",
        text: "What metrics should the dashboard display?",
        timestamp: "1234567890.100001",
      });
      messageCache.append(session.session_id, {
        sender: "U1234567890",
        text: "User engagement and revenue metrics",
        timestamp: "1234567890.100002",
      });
      messageCache.append(session.session_id, {
        sender: "bot",
        text: "Who will use this dashboard?",
        timestamp: "1234567890.100003",
      });
      messageCache.append(session.session_id, {
        sender: "U1234567890",
        text: "Product managers and executives",
        timestamp: "1234567890.100004",
      });

      anthropicClient.setNextQuestionResponse({
        question: "I'm 96% confident we have everything.",
        confidence_score: 96,
      });

      const testSpec: SpecDocument = {
        title: "Analytics Dashboard",
        overview: "A dashboard for tracking user engagement and revenue.",
        problem_statement: "Need visibility into key business metrics.",
        goals: ["Display user engagement", "Show revenue metrics"],
        non_goals: [],
        personas: [
          { name: "Product Manager", description: "Needs to track product metrics" },
          { name: "Executive", description: "Needs high-level business overview" },
        ],
        use_cases: [],
        technical_details: "",
        open_questions: [],
      };
      anthropicClient.setNextSpecResponse(testSpec);

      // Act
      await orchestrator.runToolLoop(
        session,
        "That covers everything",
        "U1234567890",
        "1234567890.200000",
      );

      // Assert: Canvas should contain synthesized spec content
      const createdCanvases = canvasManager.getCreatedCanvases();
      assertEquals(createdCanvases.length, 1);
      assertEquals(createdCanvases[0].content.includes("Analytics Dashboard"), true);
      assertEquals(createdCanvases[0].content.includes("Product Manager"), true);
    });

    it("should handle spec synthesis error gracefully", async () => {
      // Arrange
      const session = createTestSession({ confidence_score: 93 });
      await datastore.put(session);

      anthropicClient.setNextQuestionResponse({
        question: "Ready for review. I'm 95% confident.",
        confidence_score: 95,
      });

      // Configure synthesis to fail
      anthropicClient.setSynthesizeSpecError(new Error("Synthesis failed"));

      // Act
      await orchestrator.runToolLoop(
        session,
        "User answer",
        "U1234567890",
        "1234567890.200000",
      );

      // Assert: Error message should be posted
      const messages = messagingClient.getPostedMessages();
      const errorMessage = messages.find((m) =>
        m.text.includes("Unable") || m.text.includes("error") || m.text.includes("Error")
      );
      assertExists(errorMessage);
    });
  });

  describe("Review instructions message", () => {
    it("should include instructions for providing feedback", async () => {
      // Arrange
      const session = createTestSession({ confidence_score: 93 });
      await datastore.put(session);

      anthropicClient.setNextQuestionResponse({
        question: "I'm 95% confident.",
        confidence_score: 95,
      });

      const testSpec = createTestSpec();
      anthropicClient.setNextSpecResponse(testSpec);

      // Act
      await orchestrator.runToolLoop(
        session,
        "User answer",
        "U1234567890",
        "1234567890.200000",
      );

      // Assert: Instructions should mention feedback mechanism
      const messages = messagingClient.getPostedMessages();
      const reviewMessage = messages.find((m) =>
        m.text.includes("review") || m.text.includes("Review")
      );
      assertExists(reviewMessage);
      // Should include guidance on providing feedback
      assertEquals(
        reviewMessage.text.includes("feedback") ||
          reviewMessage.text.includes("comments") ||
          reviewMessage.text.includes("reply"),
        true,
      );
    });

    it("should include instructions for approval", async () => {
      // Arrange
      const session = createTestSession({ confidence_score: 93 });
      await datastore.put(session);

      anthropicClient.setNextQuestionResponse({
        question: "I'm 95% confident.",
        confidence_score: 95,
      });

      const testSpec = createTestSpec();
      anthropicClient.setNextSpecResponse(testSpec);

      // Act
      await orchestrator.runToolLoop(
        session,
        "User answer",
        "U1234567890",
        "1234567890.200000",
      );

      // Assert: Instructions should mention approval
      const messages = messagingClient.getPostedMessages();
      const reviewMessage = messages.find((m) =>
        m.text.includes("approve") || m.text.includes("finalize") || m.text.includes("satisfied")
      );
      assertExists(reviewMessage);
    });
  });
});

describe("Property: Review Phase Transition at 95%", () => {
  /**
   * Property: When confidence >= 95%, the system MUST:
   * 1. Synthesize the spec from conversation
   * 2. Create a Canvas with the spec
   * 3. Post review instructions
   * 4. Transition session to Review phase
   */
  let orchestrator: SessionOrchestrator;
  let sessionManager: SessionManager;
  let githubClient: MockGitHubClient;
  let anthropicClient: MockAnthropicClient;
  let messagingClient: MockSlackMessagingClient;
  let canvasManager: MockCanvasManager;
  let messageCache: MessageCache;
  let datastore: MockDatastoreClient;

  beforeEach(() => {
    datastore = new MockDatastoreClient();
    messageCache = new MessageCache();
    sessionManager = new SessionManager(datastore, () => new Date(), undefined, messageCache);
    githubClient = new MockGitHubClient();
    anthropicClient = new MockAnthropicClient();
    messagingClient = new MockSlackMessagingClient();
    canvasManager = new MockCanvasManager();

    orchestrator = new SessionOrchestrator(
      sessionManager,
      githubClient,
      anthropicClient,
      messagingClient,
      messageCache,
      canvasManager,
    );
  });

  afterEach(() => {
    datastore.clear();
    githubClient.clear();
    anthropicClient.clear();
    messagingClient.clear();
    canvasManager.clear();
    messageCache.clear();
  });

  it("should complete all review transition steps when confidence reaches threshold", async () => {
    // Arrange
    const session = createTestSession({ confidence_score: 90 });
    await datastore.put(session);

    messageCache.append(session.session_id, {
      sender: "U1234567890",
      text: "Build a feature",
      timestamp: "1234567890.123456",
    });

    anthropicClient.setNextQuestionResponse({
      question: "I'm 95% confident we have enough detail.",
      confidence_score: 95,
    });

    const testSpec: SpecDocument = {
      title: "Complete Test Feature",
      overview: "Testing all review transition steps.",
      problem_statement: "Need to verify complete transition flow.",
      goals: ["Verify synthesis", "Verify Canvas", "Verify instructions"],
      non_goals: [],
      personas: [],
      use_cases: [],
      technical_details: "",
      open_questions: [],
    };
    anthropicClient.setNextSpecResponse(testSpec);

    // Act
    await orchestrator.runToolLoop(
      session,
      "Final answer",
      "U1234567890",
      "1234567890.200000",
    );

    // Assert all steps completed:

    // 1. Session transitioned to Review phase
    const updatedSession = await sessionManager.loadSession(
      "C1234567890",
      "1234567890.123456",
    );
    assertExists(updatedSession);
    assertEquals(updatedSession.phase, Phase.Review);

    // 2. Canvas was created
    const canvases = canvasManager.getCreatedCanvases();
    assertEquals(canvases.length, 1);
    assertEquals(canvases[0].content.includes("Complete Test Feature"), true);

    // 3. Session has canvas_id
    assertExists(updatedSession.canvas_id);

    // 4. Review instructions were posted
    const messages = messagingClient.getPostedMessages();
    const hasReviewInstructions = messages.some((m) =>
      m.text.includes("Review") || m.text.includes("review")
    );
    assertEquals(hasReviewInstructions, true);
  });
});
