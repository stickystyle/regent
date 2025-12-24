// ABOUTME: Integration tests for the finalization flow.
// ABOUTME: Tests end-to-end approval of specs and Epic creation.

import { assertEquals, assertExists } from "@std/assert";
import { afterEach, beforeEach, describe, it } from "@std/testing/bdd";

import {
  type FinalizationDependencies,
  handleFinalization,
} from "../../src/handlers/finalization-handler.ts";
import { SessionManager } from "../../src/managers/session-manager.ts";
import { MockCanvasManager } from "../../src/managers/canvas-manager.ts";
import { MockEpicManager } from "../../src/managers/epic-manager.ts";
import { MockSlackMessagingClient } from "../../src/clients/messaging-client.ts";
import { MockDatastoreClient } from "../../src/managers/datastore-client.ts";
import { formatSessionId, Phase, type Session } from "../../src/types/session.ts";
import { SlackCanvasError } from "../../src/errors/types.ts";

describe("Finalization Integration", () => {
  let sessionManager: SessionManager;
  let canvasManager: MockCanvasManager;
  let epicManager: MockEpicManager;
  let messagingClient: MockSlackMessagingClient;
  let datastoreClient: MockDatastoreClient;

  const channelId = "C123456";
  const threadTs = "1234567890.123456";
  const sessionId = formatSessionId(channelId, threadTs);

  beforeEach(() => {
    datastoreClient = new MockDatastoreClient();
    sessionManager = new SessionManager(datastoreClient);
    canvasManager = new MockCanvasManager();
    epicManager = new MockEpicManager();
    messagingClient = new MockSlackMessagingClient();
  });

  afterEach(() => {
    canvasManager.clear();
    epicManager.clear();
    messagingClient.clear();
    datastoreClient.clear();
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
      initiator_user_id: "U123",
      confidence_score: 80,
      created_at: new Date().toISOString(),
      ttl: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      ...overrides,
    };
  }

  /**
   * Helper to create dependencies for tests.
   */
  function createDependencies(): FinalizationDependencies {
    return {
      sessionManager,
      canvasManager,
      epicManager,
      messagingClient,
    };
  }

  describe("full approval flow", () => {
    it("should create Epic and store brainstorm when approved", async () => {
      // Setup: Create session in Review phase with repository
      const session = createValidSession();
      await datastoreClient.put(session);

      // Setup: Set Canvas content
      const specContent = `# User Authentication Feature

This spec defines the user authentication flow for the application.

## Goals
- Implement secure login
- Support OAuth providers

## Use Cases
- User can sign in with email/password
- User can sign in with Google`;

      canvasManager.setCanvasContent("canvas_123", specContent);

      // Execute: Run finalization
      const dependencies = createDependencies();
      const result = await handleFinalization(channelId, threadTs, dependencies);

      // Assert: Success result
      assertEquals(result.success, true);
      assertEquals(result.epicUrl, "https://github.com/owner/repo/issues/1");
      assertEquals(result.error, undefined);

      // Assert: Epic was created with correct data
      const createdEpics = epicManager.getCreatedEpics();
      assertEquals(createdEpics.length, 1);
      assertEquals(createdEpics[0].owner, "owner");
      assertEquals(createdEpics[0].repo, "repo");
      assertEquals(createdEpics[0].title, "User Authentication Feature");

      // Assert: Brainstorm comment was added
      const addedComments = epicManager.getAddedComments();
      assertEquals(addedComments.length, 1);
      assertEquals(addedComments[0].specType, "brainstorm");
      assertEquals(addedComments[0].content, specContent);

      // Assert: Session was updated to Finalized
      const updatedSession = await sessionManager.loadSession(channelId, threadTs);
      assertExists(updatedSession);
      assertEquals(updatedSession.phase, Phase.Finalized);

      // Assert: Confirmation message was posted
      const postedMessages = messagingClient.getPostedMessages();
      assertEquals(postedMessages.length, 1);
      assertEquals(postedMessages[0].channelId, channelId);
      assertEquals(postedMessages[0].threadTs, threadTs);
      // Message should contain Epic URL
      assertEquals(
        postedMessages[0].text.includes("https://github.com/owner/repo/issues/1"),
        true,
      );
    });

    it("should extract summary from spec content for Epic body", async () => {
      // Setup: Create session
      const session = createValidSession();
      await datastoreClient.put(session);

      // Setup: Canvas content with specific summary
      const specContent = `# Feature Name

This is the first paragraph that becomes the summary.

## Details
More content here.`;

      canvasManager.setCanvasContent("canvas_123", specContent);

      // Execute
      const dependencies = createDependencies();
      await handleFinalization(channelId, threadTs, dependencies);

      // Assert: Epic was created with summary from first paragraph
      const createdEpics = epicManager.getCreatedEpics();
      assertEquals(
        createdEpics[0].summary,
        "This is the first paragraph that becomes the summary.",
      );
    });

    it("should handle spec without explicit title", async () => {
      // Setup
      const session = createValidSession();
      await datastoreClient.put(session);

      // Canvas content without # heading
      const specContent = "Just some content without a title heading.";
      canvasManager.setCanvasContent("canvas_123", specContent);

      // Execute
      const dependencies = createDependencies();
      const result = await handleFinalization(channelId, threadTs, dependencies);

      // Assert: Uses default title
      assertEquals(result.success, true);
      const createdEpics = epicManager.getCreatedEpics();
      assertEquals(createdEpics[0].title, "Brainstorm Specification");
    });
  });

  describe("session validation errors", () => {
    it("should handle session not found", async () => {
      const dependencies = createDependencies();

      const result = await handleFinalization(channelId, threadTs, dependencies);

      assertEquals(result.success, false);
      assertEquals(result.error, "No active session found for this thread");
    });

    it("should handle wrong phase (Questioning)", async () => {
      const session = createValidSession({ phase: Phase.Questioning });
      await datastoreClient.put(session);

      const dependencies = createDependencies();

      const result = await handleFinalization(channelId, threadTs, dependencies);

      assertEquals(result.success, false);
      assertEquals(result.error?.includes("Review"), true);
    });

    it("should handle wrong phase (already Finalized)", async () => {
      const session = createValidSession({ phase: Phase.Finalized });
      await datastoreClient.put(session);

      const dependencies = createDependencies();

      const result = await handleFinalization(channelId, threadTs, dependencies);

      assertEquals(result.success, false);
      assertEquals(result.error?.includes("Review"), true);
    });

    it("should handle missing repository configuration", async () => {
      const session = createValidSession({ repository: undefined });
      await datastoreClient.put(session);

      const dependencies = createDependencies();

      const result = await handleFinalization(channelId, threadTs, dependencies);

      assertEquals(result.success, false);
      assertEquals(result.error?.includes("repository"), true);
    });

    it("should handle missing canvas_id", async () => {
      const session = createValidSession({ canvas_id: undefined });
      await datastoreClient.put(session);

      const dependencies = createDependencies();

      const result = await handleFinalization(channelId, threadTs, dependencies);

      assertEquals(result.success, false);
      assertEquals(result.error?.includes("Canvas"), true);
    });
  });

  describe("external API error handling", () => {
    it("should handle GitHub API error during Epic creation", async () => {
      const session = createValidSession();
      await datastoreClient.put(session);
      canvasManager.setCanvasContent("canvas_123", "# Test Spec\n\nContent here");

      // Inject error
      epicManager.setCreateEpicError(new Error("GitHub API error"));

      const dependencies = createDependencies();

      const result = await handleFinalization(channelId, threadTs, dependencies);

      assertEquals(result.success, false);
      assertEquals(result.error?.includes("GitHub"), true);

      // Should NOT transition session to Finalized on failure
      const unchangedSession = await sessionManager.loadSession(channelId, threadTs);
      assertExists(unchangedSession);
      assertEquals(unchangedSession.phase, Phase.Review);
    });

    it("should handle GitHub API error during comment creation", async () => {
      const session = createValidSession();
      await datastoreClient.put(session);
      canvasManager.setCanvasContent("canvas_123", "# Test Spec\n\nContent here");

      // Inject comment error (Epic creation succeeds)
      epicManager.setAddSpecCommentError(new Error("Comment API error"));

      const dependencies = createDependencies();

      const result = await handleFinalization(channelId, threadTs, dependencies);

      assertEquals(result.success, false);
      assertEquals(result.error?.includes("Comment"), true);

      // Session should NOT transition on comment failure
      const unchangedSession = await sessionManager.loadSession(channelId, threadTs);
      assertExists(unchangedSession);
      assertEquals(unchangedSession.phase, Phase.Review);
    });

    it("should handle Canvas API error when reading content", async () => {
      const session = createValidSession();
      await datastoreClient.put(session);

      // Inject Canvas read error
      canvasManager.setGetCanvasContentError(
        new SlackCanvasError(
          "Canvas read failed",
          "Canvas not found",
          "Check canvas ID",
        ),
      );

      const dependencies = createDependencies();

      const result = await handleFinalization(channelId, threadTs, dependencies);

      assertEquals(result.success, false);
      assertEquals(result.error?.includes("Canvas"), true);

      // Session should NOT transition on Canvas failure
      const unchangedSession = await sessionManager.loadSession(channelId, threadTs);
      assertExists(unchangedSession);
      assertEquals(unchangedSession.phase, Phase.Review);
    });
  });

  describe("error notification", () => {
    it("should post error message to Slack on GitHub failure", async () => {
      const session = createValidSession();
      await datastoreClient.put(session);
      canvasManager.setCanvasContent("canvas_123", "# Test Spec\n\nContent here");
      epicManager.setCreateEpicError(new Error("Rate limit exceeded"));

      const dependencies = createDependencies();
      await handleFinalization(channelId, threadTs, dependencies);

      // Should post error message
      const messages = messagingClient.getPostedMessages();
      assertEquals(messages.length, 1);
      assertEquals(messages[0].channelId, channelId);
      assertEquals(messages[0].threadTs, threadTs);
      assertEquals(messages[0].text.includes("Rate limit exceeded"), true);
    });

    it("should post formatted error message for SlackCanvasError", async () => {
      const session = createValidSession();
      await datastoreClient.put(session);
      canvasManager.setGetCanvasContentError(
        new SlackCanvasError(
          "Canvas read failed",
          "Permission denied",
          "Request Canvas API scope",
        ),
      );

      const dependencies = createDependencies();
      await handleFinalization(channelId, threadTs, dependencies);

      // Should post formatted error message
      const messages = messagingClient.getPostedMessages();
      assertEquals(messages.length, 1);
      assertEquals(messages[0].text.includes("Canvas read failed"), true);
    });
  });

  describe("side effect verification", () => {
    it("should verify all side effects occur in correct order on success", async () => {
      const session = createValidSession();
      await datastoreClient.put(session);
      canvasManager.setCanvasContent("canvas_123", "# Complete Feature\n\nFull spec here.");

      const dependencies = createDependencies();
      const result = await handleFinalization(channelId, threadTs, dependencies);

      // Verify success
      assertEquals(result.success, true);

      // Side effect 1: Epic created
      const epics = epicManager.getCreatedEpics();
      assertEquals(epics.length, 1);
      assertEquals(epics[0].number, 1);

      // Side effect 2: Comment added to Epic
      const comments = epicManager.getAddedComments();
      assertEquals(comments.length, 1);
      assertEquals(comments[0].epicNumber, 1);

      // Side effect 3: Session updated to Finalized
      const updatedSession = await sessionManager.loadSession(channelId, threadTs);
      assertExists(updatedSession);
      assertEquals(updatedSession.phase, Phase.Finalized);

      // Side effect 4: Success message posted
      const messages = messagingClient.getPostedMessages();
      assertEquals(messages.length, 1);
    });

    it("should not create Epic comment if Epic creation fails", async () => {
      const session = createValidSession();
      await datastoreClient.put(session);
      canvasManager.setCanvasContent("canvas_123", "# Test\n\nContent");
      epicManager.setCreateEpicError(new Error("Epic failed"));

      const dependencies = createDependencies();
      await handleFinalization(channelId, threadTs, dependencies);

      // No Epic created
      assertEquals(epicManager.getCreatedEpics().length, 0);

      // No comment attempted
      assertEquals(epicManager.getAddedComments().length, 0);
    });

    it("should not update session if comment creation fails", async () => {
      const session = createValidSession();
      await datastoreClient.put(session);
      canvasManager.setCanvasContent("canvas_123", "# Test\n\nContent");
      epicManager.setAddSpecCommentError(new Error("Comment failed"));

      const dependencies = createDependencies();
      await handleFinalization(channelId, threadTs, dependencies);

      // Epic was created
      assertEquals(epicManager.getCreatedEpics().length, 1);

      // But session was NOT updated
      const unchangedSession = await sessionManager.loadSession(channelId, threadTs);
      assertExists(unchangedSession);
      assertEquals(unchangedSession.phase, Phase.Review);
    });
  });

  describe("repository parsing", () => {
    it("should correctly parse owner/repo with hyphens", async () => {
      const session = createValidSession({ repository: "my-org/my-repo" });
      await datastoreClient.put(session);
      canvasManager.setCanvasContent("canvas_123", "# Test\n\nContent");

      const dependencies = createDependencies();
      const result = await handleFinalization(channelId, threadTs, dependencies);

      assertEquals(result.success, true);
      const epics = epicManager.getCreatedEpics();
      assertEquals(epics[0].owner, "my-org");
      assertEquals(epics[0].repo, "my-repo");
    });

    it("should correctly parse owner/repo with dots", async () => {
      const session = createValidSession({ repository: "org/repo.name" });
      await datastoreClient.put(session);
      canvasManager.setCanvasContent("canvas_123", "# Test\n\nContent");

      const dependencies = createDependencies();
      const result = await handleFinalization(channelId, threadTs, dependencies);

      assertEquals(result.success, true);
      const epics = epicManager.getCreatedEpics();
      assertEquals(epics[0].owner, "org");
      assertEquals(epics[0].repo, "repo.name");
    });
  });

  describe("idempotency", () => {
    it("should not allow duplicate finalization (already Finalized)", async () => {
      // First: Successful finalization
      const session = createValidSession();
      await datastoreClient.put(session);
      canvasManager.setCanvasContent("canvas_123", "# Test\n\nContent");

      const dependencies = createDependencies();
      const firstResult = await handleFinalization(channelId, threadTs, dependencies);
      assertEquals(firstResult.success, true);

      // Second attempt: Should fail because session is now Finalized
      const secondResult = await handleFinalization(channelId, threadTs, dependencies);
      assertEquals(secondResult.success, false);
      assertEquals(secondResult.error?.includes("Review"), true);

      // Only one Epic should exist
      assertEquals(epicManager.getCreatedEpics().length, 1);
    });
  });
});
