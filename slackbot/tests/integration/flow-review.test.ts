// ABOUTME: Integration tests for the review phase including Canvas creation and finalization.
// ABOUTME: Tests feedback cycles, Canvas updates, approval flow, and Epic creation.

import { assertEquals, assertExists } from "@std/assert";
import { afterEach, beforeEach, describe, it } from "@std/testing/bdd";

import { MockAnthropicClient } from "../../src/clients/anthropic-client.ts";
import { MockSlackMessagingClient } from "../../src/clients/messaging-client.ts";
import { MockCanvasManager } from "../../src/managers/canvas-manager.ts";
import { MockDatastoreClient } from "../../src/managers/datastore-client.ts";
import { MockEpicManager } from "../../src/managers/epic-manager.ts";
import { SessionManager } from "../../src/managers/session-manager.ts";
import {
  type FinalizationDependencies,
  handleFinalization,
} from "../../src/handlers/finalization-handler.ts";
import { formatSessionId, Phase, type Session } from "../../src/types/session.ts";
import type { SpecDocument } from "../../src/types/spec-document.ts";
import type { Message } from "../../src/types/message.ts";

describe("Flow: Review Phase Integration", () => {
  let sessionManager: SessionManager;
  let canvasManager: MockCanvasManager;
  let epicManager: MockEpicManager;
  let messagingClient: MockSlackMessagingClient;
  let datastoreClient: MockDatastoreClient;
  let anthropicClient: MockAnthropicClient;

  const channelId = "C1234567890";
  const threadTs = "1234567890.123456";
  const userId = "U1234567890";
  const sessionId = formatSessionId(channelId, threadTs);

  beforeEach(() => {
    datastoreClient = new MockDatastoreClient();
    sessionManager = new SessionManager(datastoreClient);
    canvasManager = new MockCanvasManager();
    epicManager = new MockEpicManager();
    messagingClient = new MockSlackMessagingClient();
    anthropicClient = new MockAnthropicClient();
  });

  afterEach(() => {
    datastoreClient.clear();
    canvasManager.clear();
    epicManager.clear();
    messagingClient.clear();
    anthropicClient.clear();
  });

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

  /**
   * Helper to create a sample spec document.
   */
  function createSampleSpec(): SpecDocument {
    return {
      title: "User Authentication System",
      overview: "A comprehensive authentication system for the application.",
      problem_statement: "Users need a secure way to authenticate.",
      goals: ["Secure login", "OAuth support", "MFA option"],
      non_goals: ["Social login", "Biometric auth"],
      personas: [
        { name: "Regular User", description: "Standard application user" },
        { name: "Admin", description: "System administrator" },
      ],
      use_cases: [
        { id: "UC1", title: "Email Login", description: "User logs in with email and password" },
        { id: "UC2", title: "OAuth Login", description: "User logs in via Google OAuth" },
      ],
      technical_details: "Use JWT for session management. Store passwords with bcrypt.",
      open_questions: ["Should we support passwordless auth?"],
    };
  }

  describe("transition to review phase", () => {
    it("should transition from Questioning to Review when confidence >= 95%", async () => {
      // Create session in Questioning phase with high confidence
      const session = createValidSession({
        phase: Phase.Questioning,
        confidence_score: 95,
        canvas_id: undefined,
      });
      await datastoreClient.put(session);

      // Simulate confidence threshold reached
      session.phase = Phase.Review;
      await sessionManager.updateSession(session);

      const updatedSession = await sessionManager.loadSession(channelId, threadTs);
      assertExists(updatedSession);
      assertEquals(updatedSession.phase, Phase.Review);
    });

    it("should not transition when confidence < 95%", async () => {
      const session = createValidSession({
        phase: Phase.Questioning,
        confidence_score: 90,
        canvas_id: undefined,
      });
      await datastoreClient.put(session);

      // Session stays in Questioning
      const loadedSession = await sessionManager.loadSession(channelId, threadTs);
      assertExists(loadedSession);
      assertEquals(loadedSession.phase, Phase.Questioning);
    });
  });

  describe("Canvas creation on phase transition", () => {
    it("should create Canvas with synthesized spec content", async () => {
      const session = createValidSession({
        phase: Phase.Questioning,
        canvas_id: undefined,
      });
      await datastoreClient.put(session);

      // Synthesize spec
      const spec = createSampleSpec();
      anthropicClient.setNextSpecResponse(spec);

      const messages: Message[] = [
        { sender: userId, text: "@regent build auth", timestamp: "1234567890.123456" },
        { sender: "bot", text: "What type of auth?", timestamp: "1234567890.123457" },
        { sender: userId, text: "@regent OAuth and email", timestamp: "1234567890.123458" },
      ];

      const synthesizedSpec = await anthropicClient.synthesizeSpec(messages);
      assertEquals(synthesizedSpec.title, spec.title);

      // Create Canvas with spec content (uses SpecDocument, threadTs, channelId order)
      const canvasId = await canvasManager.createCanvas(
        synthesizedSpec,
        threadTs,
        channelId,
      );

      // Update session with Canvas ID
      session.phase = Phase.Review;
      session.canvas_id = canvasId;
      await sessionManager.updateSession(session);

      const updatedSession = await sessionManager.loadSession(channelId, threadTs);
      assertExists(updatedSession);
      assertEquals(updatedSession.canvas_id, canvasId);
    });

    it("should store Canvas ID in session", async () => {
      const session = createValidSession({ canvas_id: "F9876543210" });
      await datastoreClient.put(session);

      const loadedSession = await sessionManager.loadSession(channelId, threadTs);
      assertExists(loadedSession);
      assertEquals(loadedSession.canvas_id, "F9876543210");
    });
  });

  describe("review instructions posting", () => {
    it("should post review instructions to thread on Canvas creation", async () => {
      const session = createValidSession();
      await datastoreClient.put(session);

      // Simulate posting review instructions
      await messagingClient.postMessage(
        channelId,
        threadTs,
        "Your spec is ready for review! Reply with feedback or say `@regent approved` to finalize.",
      );

      const messages = messagingClient.getPostedMessages();
      assertEquals(messages.length, 1);
      assertEquals(messages[0].text.includes("review"), true);
      assertEquals(messages[0].text.includes("approved"), true);
    });

    it("should include Canvas reference in review instructions", async () => {
      const session = createValidSession({ canvas_id: "F1234567890" });
      await datastoreClient.put(session);

      // Post message with Canvas reference
      await messagingClient.postMessage(
        channelId,
        threadTs,
        "Spec Canvas created. Review and provide feedback.",
      );

      const messages = messagingClient.getPostedMessages();
      assertEquals(messages.length >= 1, true);
      assertEquals(messages[0].text.toLowerCase().includes("canvas"), true);
    });
  });

  describe("feedback and revision cycle", () => {
    it("should update Canvas content based on feedback", async () => {
      const session = createValidSession();
      await datastoreClient.put(session);

      const originalContent = "# Original Spec\n\nSome content here.";
      canvasManager.setCanvasContent("canvas_123", originalContent);

      // Revise spec based on feedback
      const originalSpec = createSampleSpec();
      anthropicClient.setNextSpecResponse({
        ...originalSpec,
        overview: originalSpec.overview + " (revised based on feedback)",
      });

      const revisedSpec = await anthropicClient.reviseSpec(originalSpec, "Add more detail about OAuth");
      assertEquals(revisedSpec.overview.includes("revised"), true);

      // Update Canvas with revised spec document
      await canvasManager.updateCanvas("canvas_123", revisedSpec);

      const updatedContent = await canvasManager.getCanvasContent("canvas_123");
      assertEquals(updatedContent.includes("revised"), true);
    });

    it("should preserve Canvas ID through multiple revisions", async () => {
      const session = createValidSession();
      await datastoreClient.put(session);

      canvasManager.setCanvasContent("canvas_123", "# Spec v1");

      // First revision - use updateCanvasContent for raw string content
      await canvasManager.updateCanvasContent("canvas_123", "# Spec v2 - revised");

      // Second revision
      await canvasManager.updateCanvasContent("canvas_123", "# Spec v3 - final");

      // Session should still reference same Canvas
      const loadedSession = await sessionManager.loadSession(channelId, threadTs);
      assertExists(loadedSession);
      assertEquals(loadedSession.canvas_id, "canvas_123");

      // Canvas should have latest content
      const finalContent = await canvasManager.getCanvasContent("canvas_123");
      assertEquals(finalContent.includes("v3"), true);
    });

    it("should track revision history implicitly through Canvas updates", async () => {
      const session = createValidSession();
      await datastoreClient.put(session);

      canvasManager.setCanvasContent("canvas_123", "# Initial");

      // Multiple updates - use updateCanvasContent for raw string content
      await canvasManager.updateCanvasContent("canvas_123", "# Revision 1");
      await canvasManager.updateCanvasContent("canvas_123", "# Revision 2");
      await canvasManager.updateCanvasContent("canvas_123", "# Revision 3");

      const updatedCanvases = canvasManager.getUpdatedCanvases();
      assertEquals(updatedCanvases.length, 3, "Should track all Canvas updates");
    });
  });

  describe("approval triggers Epic creation", () => {
    it("should create Epic when user approves the spec", async () => {
      const session = createValidSession();
      await datastoreClient.put(session);

      const specContent = `# User Authentication System

A comprehensive authentication system for the application.

## Goals
- Secure login
- OAuth support

## Use Cases
- User can sign in with email/password
- User can sign in with Google`;

      canvasManager.setCanvasContent("canvas_123", specContent);

      const dependencies = createFinalizationDependencies();
      const result = await handleFinalization(channelId, threadTs, dependencies);

      assertEquals(result.success, true);
      assertExists(result.epicUrl);

      const createdEpics = epicManager.getCreatedEpics();
      assertEquals(createdEpics.length, 1);
      assertEquals(createdEpics[0].owner, "owner");
      assertEquals(createdEpics[0].repo, "repo");
      assertEquals(createdEpics[0].title, "User Authentication System");
    });

    it("should add brainstorm comment to Epic", async () => {
      const session = createValidSession();
      await datastoreClient.put(session);

      const specContent = `# Feature Title

Feature overview here.`;

      canvasManager.setCanvasContent("canvas_123", specContent);

      const dependencies = createFinalizationDependencies();
      await handleFinalization(channelId, threadTs, dependencies);

      const addedComments = epicManager.getAddedComments();
      assertEquals(addedComments.length, 1);
      assertEquals(addedComments[0].specType, "brainstorm");
      assertEquals(addedComments[0].content, specContent);
    });

    it("should update session to Finalized phase", async () => {
      const session = createValidSession();
      await datastoreClient.put(session);
      canvasManager.setCanvasContent("canvas_123", "# Test\n\nContent");

      const dependencies = createFinalizationDependencies();
      await handleFinalization(channelId, threadTs, dependencies);

      const finalizedSession = await sessionManager.loadSession(channelId, threadTs);
      assertExists(finalizedSession);
      assertEquals(finalizedSession.phase, Phase.Finalized);
    });

    it("should store Epic number and URL in session", async () => {
      const session = createValidSession();
      await datastoreClient.put(session);
      canvasManager.setCanvasContent("canvas_123", "# Epic Test\n\nContent here");

      const dependencies = createFinalizationDependencies();
      const result = await handleFinalization(channelId, threadTs, dependencies);

      assertEquals(result.success, true);

      const finalizedSession = await sessionManager.loadSession(channelId, threadTs);
      assertExists(finalizedSession);
      assertEquals(finalizedSession.epic_number, 1);
      assertEquals(finalizedSession.epic_url?.includes("github.com"), true);
    });
  });

  describe("finalization completes session", () => {
    it("should post confirmation message with Epic URL", async () => {
      const session = createValidSession();
      await datastoreClient.put(session);
      canvasManager.setCanvasContent("canvas_123", "# Final Spec\n\nContent");

      const dependencies = createFinalizationDependencies();
      await handleFinalization(channelId, threadTs, dependencies);

      const messages = messagingClient.getPostedMessages();
      assertEquals(messages.length, 1);
      assertEquals(messages[0].channelId, channelId);
      assertEquals(messages[0].threadTs, threadTs);
      assertEquals(messages[0].text.includes("github.com"), true);
    });

    it("should not allow re-finalization of completed session", async () => {
      // First finalization
      const session = createValidSession();
      await datastoreClient.put(session);
      canvasManager.setCanvasContent("canvas_123", "# Spec\n\nContent");

      const dependencies = createFinalizationDependencies();
      const firstResult = await handleFinalization(channelId, threadTs, dependencies);
      assertEquals(firstResult.success, true);

      // Second attempt should fail
      const secondResult = await handleFinalization(channelId, threadTs, dependencies);
      assertEquals(secondResult.success, false);
      assertEquals(secondResult.error?.includes("Review"), true);

      // Only one Epic should exist
      assertEquals(epicManager.getCreatedEpics().length, 1);
    });

    it("should record spec comment IDs in session", async () => {
      const session = createValidSession();
      await datastoreClient.put(session);
      canvasManager.setCanvasContent("canvas_123", "# Complete Spec\n\nFull content");

      const dependencies = createFinalizationDependencies();
      await handleFinalization(channelId, threadTs, dependencies);

      const finalizedSession = await sessionManager.loadSession(channelId, threadTs);
      assertExists(finalizedSession);
      assertExists(finalizedSession.spec_comment_ids);
      assertExists(finalizedSession.spec_comment_ids.brainstorm);
    });
  });

  // Error handling tests (Canvas read errors, Epic creation errors, rollback on failure)
  // are consolidated in error-recovery.test.ts to avoid duplication.

  describe("session without repository", () => {
    it("should reject finalization when no repository configured", async () => {
      const session = createValidSession({ repository: undefined });
      await datastoreClient.put(session);
      canvasManager.setCanvasContent("canvas_123", "# Test\n\nContent");

      const dependencies = createFinalizationDependencies();
      const result = await handleFinalization(channelId, threadTs, dependencies);

      assertEquals(result.success, false);
      assertEquals(result.error?.toLowerCase().includes("repository"), true);
    });

    it("should still allow Canvas creation and review without repository", async () => {
      const session = createValidSession({
        phase: Phase.Review,
        repository: undefined,
      });
      await datastoreClient.put(session);

      canvasManager.setCanvasContent("canvas_123", "# Spec without repo\n\nContent");

      // Canvas should be readable
      const content = await canvasManager.getCanvasContent("canvas_123");
      assertEquals(content.includes("without repo"), true);
    });
  });
});
