// ABOUTME: Tests for SessionOrchestrator approval detection and finalization flow.
// ABOUTME: Tests isApprovalIntent, handleApproval with/without repo configured.

import { assertEquals, assertExists } from "@std/assert";
import { afterEach, beforeEach, describe, it } from "@std/testing/bdd";
import { MockAnthropicClient } from "../../src/clients/anthropic-client.ts";
import { MockGitHubClient } from "../../src/clients/github-client.ts";
import { MockSlackMessagingClient } from "../../src/clients/messaging-client.ts";
import { MockCanvasManager } from "../../src/managers/canvas-manager.ts";
import { MockDatastoreClient } from "../../src/managers/datastore-client.ts";
import { MockEpicManager } from "../../src/managers/epic-manager.ts";
import { MessageCache } from "../../src/managers/message-cache.ts";
import { SessionManager } from "../../src/managers/session-manager.ts";
import { SessionOrchestrator } from "../../src/orchestrators/session-orchestrator.ts";
import type { Session } from "../../src/types/session.ts";
import { Phase } from "../../src/types/session.ts";

/**
 * Helper to create a test session in Review phase.
 */
function createReviewSession(overrides?: Partial<Session>): Session {
  const now = new Date();
  const ttl = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  return {
    session_id: "C1234567890:1234567890.123456",
    phase: Phase.Review,
    initiator_user_id: "U1234567890",
    confidence_score: 95,
    created_at: now.toISOString(),
    ttl: ttl.toISOString(),
    canvas_id: "canvas_abc123",
    ...overrides,
  };
}

describe("SessionOrchestrator - Approval Detection", () => {
  let orchestrator: SessionOrchestrator;
  let sessionManager: SessionManager;
  let githubClient: MockGitHubClient;
  let anthropicClient: MockAnthropicClient;
  let messagingClient: MockSlackMessagingClient;
  let canvasManager: MockCanvasManager;
  let epicManager: MockEpicManager;
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
    epicManager = new MockEpicManager();

    orchestrator = new SessionOrchestrator(
      sessionManager,
      githubClient,
      anthropicClient,
      messagingClient,
      messageCache,
      canvasManager,
      epicManager,
    );
  });

  afterEach(() => {
    datastore.clear();
    githubClient.clear();
    anthropicClient.clear();
    messagingClient.clear();
    canvasManager.clear();
    epicManager.clear();
    messageCache.clear();
  });

  describe("isApprovalIntent detection", () => {
    it("should detect 'approved' as approval", async () => {
      const session = createReviewSession();
      await datastore.put(session);
      canvasManager.setCanvasContent("canvas_abc123", "# Test Spec\n\nContent.");

      await orchestrator.handleReviewFeedback(
        session,
        "approved",
        "U1234567890",
        "1234567890.200000",
      );

      // Should not call revision, should handle approval
      const messages = messagingClient.getPostedMessages();
      const hasApprovalAck = messages.some((m) =>
        m.text.toLowerCase().includes("approved") ||
        m.text.toLowerCase().includes("finalized") ||
        m.text.toLowerCase().includes("ready")
      );
      assertEquals(hasApprovalAck, true);
    });

    it("should detect 'looks good' as approval", async () => {
      const session = createReviewSession();
      await datastore.put(session);
      canvasManager.setCanvasContent("canvas_abc123", "# Test Spec\n\nContent.");

      await orchestrator.handleReviewFeedback(
        session,
        "looks good",
        "U1234567890",
        "1234567890.200000",
      );

      const messages = messagingClient.getPostedMessages();
      const hasApprovalAck = messages.some((m) =>
        m.text.toLowerCase().includes("approved") ||
        m.text.toLowerCase().includes("finalized") ||
        m.text.toLowerCase().includes("ready")
      );
      assertEquals(hasApprovalAck, true);
    });

    it("should detect 'ship it' as approval", async () => {
      const session = createReviewSession();
      await datastore.put(session);
      canvasManager.setCanvasContent("canvas_abc123", "# Test Spec\n\nContent.");

      await orchestrator.handleReviewFeedback(
        session,
        "ship it",
        "U1234567890",
        "1234567890.200000",
      );

      const messages = messagingClient.getPostedMessages();
      const hasApprovalAck = messages.some((m) =>
        m.text.toLowerCase().includes("approved") ||
        m.text.toLowerCase().includes("finalized") ||
        m.text.toLowerCase().includes("ready")
      );
      assertEquals(hasApprovalAck, true);
    });

    it("should detect 'lgtm' as approval", async () => {
      const session = createReviewSession();
      await datastore.put(session);
      canvasManager.setCanvasContent("canvas_abc123", "# Test Spec\n\nContent.");

      await orchestrator.handleReviewFeedback(
        session,
        "lgtm",
        "U1234567890",
        "1234567890.200000",
      );

      const messages = messagingClient.getPostedMessages();
      const hasApprovalAck = messages.some((m) =>
        m.text.toLowerCase().includes("approved") ||
        m.text.toLowerCase().includes("finalized") ||
        m.text.toLowerCase().includes("ready")
      );
      assertEquals(hasApprovalAck, true);
    });

    it("should NOT detect 'not approved' as approval (negation)", async () => {
      const session = createReviewSession();
      await datastore.put(session);
      canvasManager.setCanvasContent("canvas_abc123", "# Test Spec\n\nContent.");

      // Setup mock for revision
      anthropicClient.setNextSpecResponse({
        title: "Test Spec",
        overview: "Updated spec",
        problem_statement: "",
        goals: [],
        non_goals: [],
        personas: [],
        use_cases: [],
        technical_details: "",
        open_questions: [],
      });

      await orchestrator.handleReviewFeedback(
        session,
        "I'm not approved of this yet",
        "U1234567890",
        "1234567890.200000",
      );

      // Should trigger revision instead of approval
      const messages = messagingClient.getPostedMessages();
      const hasRevisionAck = messages.some((m) =>
        m.text.toLowerCase().includes("updated") ||
        m.text.toLowerCase().includes("feedback")
      );
      assertEquals(hasRevisionAck, true);
    });

    it("should NOT detect approval when 'don't approve' is used", async () => {
      const session = createReviewSession();
      await datastore.put(session);
      canvasManager.setCanvasContent("canvas_abc123", "# Test Spec\n\nContent.");

      anthropicClient.setNextSpecResponse({
        title: "Test Spec",
        overview: "Updated spec",
        problem_statement: "",
        goals: [],
        non_goals: [],
        personas: [],
        use_cases: [],
        technical_details: "",
        open_questions: [],
      });

      await orchestrator.handleReviewFeedback(
        session,
        "I don't approve this",
        "U1234567890",
        "1234567890.200000",
      );

      const messages = messagingClient.getPostedMessages();
      const hasRevisionAck = messages.some((m) =>
        m.text.toLowerCase().includes("updated") ||
        m.text.toLowerCase().includes("feedback")
      );
      assertEquals(hasRevisionAck, true);
    });
  });

  describe("handleApproval with repository configured", () => {
    const canvasContent = `# Feature Specification

This is the summary of the feature we're building.

## Goals

- Goal 1
- Goal 2

## Technical Details

Some technical details here.
`;

    it("should call handleFinalization when repo is configured", async () => {
      const session = createReviewSession({
        repository: "stickystyle/regent",
      });
      await datastore.put(session);
      canvasManager.setCanvasContent("canvas_abc123", canvasContent);

      await orchestrator.handleReviewFeedback(
        session,
        "approved",
        "U1234567890",
        "1234567890.200000",
      );

      // Epic should be created
      const epics = epicManager.getCreatedEpics();
      assertEquals(epics.length, 1);
      assertEquals(epics[0].owner, "stickystyle");
      assertEquals(epics[0].repo, "regent");
    });

    it("should create Epic with title extracted from spec", async () => {
      const session = createReviewSession({
        repository: "owner/repo",
      });
      await datastore.put(session);
      canvasManager.setCanvasContent("canvas_abc123", canvasContent);

      await orchestrator.handleReviewFeedback(
        session,
        "lgtm",
        "U1234567890",
        "1234567890.200000",
      );

      const epics = epicManager.getCreatedEpics();
      assertEquals(epics[0].title, "Feature Specification");
    });

    it("should add brainstorm as comment on Epic", async () => {
      const session = createReviewSession({
        repository: "owner/repo",
      });
      await datastore.put(session);
      canvasManager.setCanvasContent("canvas_abc123", canvasContent);

      await orchestrator.handleReviewFeedback(
        session,
        "looks good",
        "U1234567890",
        "1234567890.200000",
      );

      const comments = epicManager.getAddedComments();
      assertEquals(comments.length, 1);
      assertEquals(comments[0].specType, "brainstorm");
      assertEquals(comments[0].content, canvasContent);
    });

    it("should post Epic URL to Slack on success", async () => {
      const session = createReviewSession({
        repository: "owner/repo",
      });
      await datastore.put(session);
      canvasManager.setCanvasContent("canvas_abc123", canvasContent);

      await orchestrator.handleReviewFeedback(
        session,
        "ship it",
        "U1234567890",
        "1234567890.200000",
      );

      const messages = messagingClient.getPostedMessages();
      const epicMessage = messages.find((m) =>
        m.text.includes("https://github.com/owner/repo/issues/")
      );
      assertExists(epicMessage);
    });

    it("should update session to Finalized phase", async () => {
      const session = createReviewSession({
        repository: "owner/repo",
      });
      await datastore.put(session);
      canvasManager.setCanvasContent("canvas_abc123", canvasContent);

      await orchestrator.handleReviewFeedback(
        session,
        "approved",
        "U1234567890",
        "1234567890.200000",
      );

      const updatedSession = await sessionManager.loadSession(
        "C1234567890",
        "1234567890.123456",
      );
      assertExists(updatedSession);
      assertEquals(updatedSession.phase, Phase.Finalized);
    });

    it("should store epic_number and epic_url in session", async () => {
      const session = createReviewSession({
        repository: "owner/repo",
      });
      await datastore.put(session);
      canvasManager.setCanvasContent("canvas_abc123", canvasContent);

      await orchestrator.handleReviewFeedback(
        session,
        "approved",
        "U1234567890",
        "1234567890.200000",
      );

      const updatedSession = await sessionManager.loadSession(
        "C1234567890",
        "1234567890.123456",
      );
      assertExists(updatedSession);
      assertExists(updatedSession.epic_number);
      assertExists(updatedSession.epic_url);
      assertEquals(updatedSession.epic_url?.includes("github.com"), true);
    });
  });

  describe("handleApproval without repository configured", () => {
    it("should mark session as Finalized when no repo", async () => {
      const session = createReviewSession({
        repository: undefined,
      });
      await datastore.put(session);

      await orchestrator.handleReviewFeedback(
        session,
        "approved",
        "U1234567890",
        "1234567890.200000",
      );

      const updatedSession = await sessionManager.loadSession(
        "C1234567890",
        "1234567890.123456",
      );
      assertExists(updatedSession);
      assertEquals(updatedSession.phase, Phase.Finalized);
    });

    it("should NOT create Epic when no repo configured", async () => {
      const session = createReviewSession({
        repository: undefined,
      });
      await datastore.put(session);

      await orchestrator.handleReviewFeedback(
        session,
        "looks good",
        "U1234567890",
        "1234567890.200000",
      );

      const epics = epicManager.getCreatedEpics();
      assertEquals(epics.length, 0);
    });

    it("should post Canvas/file available message when no repo", async () => {
      const session = createReviewSession({
        repository: undefined,
      });
      await datastore.put(session);

      await orchestrator.handleReviewFeedback(
        session,
        "ship it",
        "U1234567890",
        "1234567890.200000",
      );

      const messages = messagingClient.getPostedMessages();
      const finalizedMessage = messages.find((m) =>
        m.text.toLowerCase().includes("finalized") ||
        m.text.toLowerCase().includes("canvas") ||
        m.text.toLowerCase().includes("available")
      );
      assertExists(finalizedMessage);
    });
  });

  describe("handleApproval error handling", () => {
    it("should post error message when Epic creation fails", async () => {
      const session = createReviewSession({
        repository: "owner/repo",
      });
      await datastore.put(session);
      canvasManager.setCanvasContent("canvas_abc123", "# Test Spec\n\nContent.");
      epicManager.setCreateEpicError(new Error("GitHub API rate limit exceeded"));

      await orchestrator.handleReviewFeedback(
        session,
        "approved",
        "U1234567890",
        "1234567890.200000",
      );

      const messages = messagingClient.getPostedMessages();
      const errorMessage = messages.find((m) =>
        m.text.toLowerCase().includes("error") ||
        m.text.toLowerCase().includes("failed") ||
        m.text.toLowerCase().includes("unable")
      );
      assertExists(errorMessage);
    });

    it("should handle Canvas read errors gracefully", async () => {
      const session = createReviewSession({
        repository: "owner/repo",
      });
      await datastore.put(session);
      // Don't set canvas content - will cause getCanvasContent to fail

      await orchestrator.handleReviewFeedback(
        session,
        "approved",
        "U1234567890",
        "1234567890.200000",
      );

      const messages = messagingClient.getPostedMessages();
      const errorMessage = messages.find((m) =>
        m.text.toLowerCase().includes("error") ||
        m.text.toLowerCase().includes("canvas") ||
        m.text.toLowerCase().includes("not found")
      );
      assertExists(errorMessage);
    });

    it("should not transition to Finalized when finalization fails", async () => {
      const session = createReviewSession({
        repository: "owner/repo",
      });
      await datastore.put(session);
      canvasManager.setCanvasContent("canvas_abc123", "# Test Spec\n\nContent.");
      epicManager.setCreateEpicError(new Error("GitHub API error"));

      await orchestrator.handleReviewFeedback(
        session,
        "approved",
        "U1234567890",
        "1234567890.200000",
      );

      // Session should remain in Review phase
      const updatedSession = await sessionManager.loadSession(
        "C1234567890",
        "1234567890.123456",
      );
      assertExists(updatedSession);
      assertEquals(updatedSession.phase, Phase.Review);
    });
  });
});
