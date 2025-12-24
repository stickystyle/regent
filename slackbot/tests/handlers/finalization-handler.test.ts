// ABOUTME: Tests for finalization handler that processes @regent approved commands.
// ABOUTME: Validates Epic creation and brainstorm comment storage flow.

import { assertEquals, assertThrows } from "@std/assert";
import { afterEach, beforeEach, describe, it } from "@std/testing/bdd";
import {
  extractSpecSummary,
  extractSpecTitle,
  type FinalizationDependencies,
  handleFinalization,
  parseRepository,
} from "../../src/handlers/finalization-handler.ts";
import { MockCanvasManager } from "../../src/managers/canvas-manager.ts";
import { MockEpicManager } from "../../src/managers/epic-manager.ts";
import { MockSlackMessagingClient } from "../../src/clients/messaging-client.ts";
import { Phase, type Session } from "../../src/types/session.ts";
import { MockDatastoreClient } from "../../src/managers/datastore-client.ts";
import { SessionManager } from "../../src/managers/session-manager.ts";
import { SlackCanvasError, ValidationError } from "../../src/errors/types.ts";

/**
 * Extended MockDatastoreClient with helper methods for testing.
 */
class TestDatastoreClient extends MockDatastoreClient {
  setSession(session: Session): void {
    this.put(session);
  }

  async getSession(sessionId: string): Promise<Session | undefined> {
    const result = await this.get(sessionId);
    return result.item;
  }
}

describe("Finalization Handler", () => {
  describe("parseRepository", () => {
    it("should parse owner and repo from repository string", () => {
      const result = parseRepository("stickystyle/regent");

      assertEquals(result.owner, "stickystyle");
      assertEquals(result.repo, "regent");
    });

    it("should handle repository with dots in name", () => {
      const result = parseRepository("org/repo.name");

      assertEquals(result.owner, "org");
      assertEquals(result.repo, "repo.name");
    });

    it("should handle repository with hyphens", () => {
      const result = parseRepository("my-org/my-repo");

      assertEquals(result.owner, "my-org");
      assertEquals(result.repo, "my-repo");
    });

    it("should throw ValidationError for empty string", () => {
      assertThrows(
        () => parseRepository(""),
        ValidationError,
        "Invalid repository format",
      );
    });

    it("should throw ValidationError for string without slash", () => {
      assertThrows(
        () => parseRepository("no-slash-here"),
        ValidationError,
        "Invalid repository format",
      );
    });

    it("should throw ValidationError for string with only slash", () => {
      assertThrows(
        () => parseRepository("/"),
        ValidationError,
        "Invalid repository format",
      );
    });

    it("should throw ValidationError for missing owner", () => {
      assertThrows(
        () => parseRepository("/repo"),
        ValidationError,
        "Invalid repository format",
      );
    });

    it("should throw ValidationError for missing repo", () => {
      assertThrows(
        () => parseRepository("owner/"),
        ValidationError,
        "Invalid repository format",
      );
    });

    it("should throw ValidationError for multiple slashes", () => {
      assertThrows(
        () => parseRepository("owner/repo/extra"),
        ValidationError,
        "Invalid repository format",
      );
    });
  });

  describe("extractSpecTitle", () => {
    it("should extract title from first heading", () => {
      const content = "# My Spec Title\n\nSome content here.";

      const title = extractSpecTitle(content);

      assertEquals(title, "My Spec Title");
    });

    it("should extract title from heading with extra spaces", () => {
      const content = "#   Spaced Title   \n\nContent.";

      const title = extractSpecTitle(content);

      assertEquals(title, "Spaced Title");
    });

    it("should return default title if no heading found", () => {
      const content = "No heading here, just content.";

      const title = extractSpecTitle(content);

      assertEquals(title, "Brainstorm Specification");
    });

    it("should use first heading even if not at start", () => {
      const content = "Some preamble\n\n# Actual Title\n\nContent.";

      const title = extractSpecTitle(content);

      assertEquals(title, "Actual Title");
    });

    it("should not match ## headings as title", () => {
      const content = "## Secondary Heading\n\nContent.";

      const title = extractSpecTitle(content);

      assertEquals(title, "Brainstorm Specification");
    });
  });

  describe("extractSpecSummary", () => {
    it("should extract first non-heading paragraph", () => {
      const content = "# Title\n\nThis is the summary paragraph.\n\nMore content.";

      const summary = extractSpecSummary(content);

      assertEquals(summary, "This is the summary paragraph.");
    });

    it("should skip bullet points", () => {
      const content = "# Title\n\n- Bullet point\n* Star bullet\n\nActual summary.";

      const summary = extractSpecSummary(content);

      assertEquals(summary, "Actual summary.");
    });

    it("should truncate long summaries to 200 chars", () => {
      const longText = "A".repeat(250);
      const content = `# Title\n\n${longText}`;

      const summary = extractSpecSummary(content);

      assertEquals(summary.length, 200);
      assertEquals(summary.endsWith("..."), true);
      assertEquals(summary.slice(0, 197), "A".repeat(197));
    });

    it("should return default summary if no paragraph found", () => {
      const content = "# Title\n\n- Only bullets\n- Here\n";

      const summary = extractSpecSummary(content);

      assertEquals(summary, "Spec created via Regent Slack Bot");
    });

    it("should skip headings of any level", () => {
      const content = "# H1\n## H2\n### H3\n\nActual paragraph.";

      const summary = extractSpecSummary(content);

      assertEquals(summary, "Actual paragraph.");
    });
  });

  describe("handleFinalization", () => {
    let mockDatastore: TestDatastoreClient;
    let sessionManager: SessionManager;
    let canvasManager: MockCanvasManager;
    let epicManager: MockEpicManager;
    let messagingClient: MockSlackMessagingClient;
    let dependencies: FinalizationDependencies;

    const channelId = "C1234567890";
    const threadTs = "1234567890.123456";
    const sessionId = `${channelId}:${threadTs}`;

    beforeEach(() => {
      mockDatastore = new TestDatastoreClient();
      sessionManager = new SessionManager(mockDatastore);
      canvasManager = new MockCanvasManager();
      epicManager = new MockEpicManager();
      messagingClient = new MockSlackMessagingClient();

      dependencies = {
        sessionManager,
        canvasManager,
        epicManager,
        messagingClient,
      };
    });

    afterEach(() => {
      mockDatastore.clear();
      canvasManager.clear();
      epicManager.clear();
      messagingClient.clear();
    });

    describe("validation errors", () => {
      it("should return error if no session found", async () => {
        const result = await handleFinalization(channelId, threadTs, dependencies);

        assertEquals(result.success, false);
        assertEquals(result.error, "No active session found for this thread");
      });

      it("should return error if session is not in Review phase", async () => {
        const session: Session = {
          session_id: sessionId,
          phase: Phase.Questioning,
          initiator_user_id: "U123",
          confidence_score: 50,
          created_at: new Date().toISOString(),
          ttl: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          repository: "owner/repo",
          canvas_id: "canvas_123",
        };
        mockDatastore.setSession(session);

        const result = await handleFinalization(channelId, threadTs, dependencies);

        assertEquals(result.success, false);
        assertEquals(result.error, "Session is not in Review phase");
      });

      it("should return error if no repository configured", async () => {
        const session: Session = {
          session_id: sessionId,
          phase: Phase.Review,
          initiator_user_id: "U123",
          confidence_score: 80,
          created_at: new Date().toISOString(),
          ttl: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          canvas_id: "canvas_123",
        };
        mockDatastore.setSession(session);

        const result = await handleFinalization(channelId, threadTs, dependencies);

        assertEquals(result.success, false);
        assertEquals(result.error, "No GitHub repository configured for this session");
      });

      it("should return error if no canvas_id in session", async () => {
        const session: Session = {
          session_id: sessionId,
          phase: Phase.Review,
          initiator_user_id: "U123",
          confidence_score: 80,
          created_at: new Date().toISOString(),
          ttl: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          repository: "owner/repo",
        };
        mockDatastore.setSession(session);

        const result = await handleFinalization(channelId, threadTs, dependencies);

        assertEquals(result.success, false);
        assertEquals(result.error, "No spec Canvas found for this session");
      });
    });

    describe("successful finalization", () => {
      const validSession: Session = {
        session_id: sessionId,
        phase: Phase.Review,
        initiator_user_id: "U123",
        confidence_score: 85,
        created_at: new Date().toISOString(),
        ttl: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        repository: "stickystyle/regent",
        canvas_id: "canvas_abc123",
      };

      const canvasContent = `# Feature Specification

This is the summary of the feature we're building.

## Goals

- Goal 1
- Goal 2

## Technical Details

Some technical details here.
`;

      beforeEach(() => {
        mockDatastore.setSession(validSession);
        canvasManager.setCanvasContent("canvas_abc123", canvasContent);
      });

      it("should create Epic with title from spec", async () => {
        const result = await handleFinalization(channelId, threadTs, dependencies);

        assertEquals(result.success, true);

        const epics = epicManager.getCreatedEpics();
        assertEquals(epics.length, 1);
        assertEquals(epics[0].owner, "stickystyle");
        assertEquals(epics[0].repo, "regent");
        assertEquals(epics[0].title, "Feature Specification");
      });

      it("should create Epic with summary from spec", async () => {
        await handleFinalization(channelId, threadTs, dependencies);

        const epics = epicManager.getCreatedEpics();
        assertEquals(epics[0].summary, "This is the summary of the feature we're building.");
      });

      it("should add brainstorm as comment on Epic", async () => {
        await handleFinalization(channelId, threadTs, dependencies);

        const comments = epicManager.getAddedComments();
        assertEquals(comments.length, 1);
        assertEquals(comments[0].owner, "stickystyle");
        assertEquals(comments[0].repo, "regent");
        assertEquals(comments[0].epicNumber, 1);
        assertEquals(comments[0].specType, "brainstorm");
        assertEquals(comments[0].content, canvasContent);
      });

      it("should update session to Finalized phase", async () => {
        await handleFinalization(channelId, threadTs, dependencies);

        const updatedSession = await mockDatastore.getSession(sessionId);
        assertEquals(updatedSession?.phase, Phase.Finalized);
      });

      it("should post success message to Slack", async () => {
        await handleFinalization(channelId, threadTs, dependencies);

        const messages = messagingClient.getPostedMessages();
        assertEquals(messages.length, 1);
        assertEquals(messages[0].channelId, channelId);
        assertEquals(messages[0].threadTs, threadTs);
        assertEquals(messages[0].text.includes("Spec approved and stored on Epic"), true);
        assertEquals(
          messages[0].text.includes("https://github.com/stickystyle/regent/issues/1"),
          true,
        );
      });

      it("should return success result with Epic URL", async () => {
        const result = await handleFinalization(channelId, threadTs, dependencies);

        assertEquals(result.success, true);
        assertEquals(result.epicUrl, "https://github.com/stickystyle/regent/issues/1");
        assertEquals(result.error, undefined);
      });

      it("should update Canvas with Epic URL prepended", async () => {
        await handleFinalization(channelId, threadTs, dependencies);

        const updatedCanvases = canvasManager.getUpdatedCanvases();
        assertEquals(updatedCanvases.length, 1);
        assertEquals(updatedCanvases[0].canvasId, "canvas_abc123");

        // Check that the Epic URL is prepended to the content
        const updatedContent = updatedCanvases[0].content;
        assertEquals(updatedContent.startsWith("**GitHub Epic:** [#1]"), true);
        assertEquals(
          updatedContent.includes("https://github.com/stickystyle/regent/issues/1"),
          true,
        );
        assertEquals(updatedContent.includes("---"), true);
        assertEquals(updatedContent.includes("# Feature Specification"), true);
      });

      it("should store epic_number and epic_url in session after finalization", async () => {
        await handleFinalization(channelId, threadTs, dependencies);

        const updatedSession = await mockDatastore.getSession(sessionId);
        assertEquals(updatedSession?.epic_number, 1);
        assertEquals(
          updatedSession?.epic_url,
          "https://github.com/stickystyle/regent/issues/1",
        );
      });

      it("should store brainstorm comment_id in spec_comment_ids", async () => {
        await handleFinalization(channelId, threadTs, dependencies);

        const updatedSession = await mockDatastore.getSession(sessionId);
        assertEquals(updatedSession?.spec_comment_ids?.brainstorm, 1);
      });
    });

    describe("error handling", () => {
      const validSession: Session = {
        session_id: sessionId,
        phase: Phase.Review,
        initiator_user_id: "U123",
        confidence_score: 85,
        created_at: new Date().toISOString(),
        ttl: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        repository: "owner/repo",
        canvas_id: "canvas_123",
      };

      beforeEach(() => {
        mockDatastore.setSession(validSession);
      });

      it("should handle Canvas read errors", async () => {
        canvasManager.setGetCanvasContentError(
          new SlackCanvasError(
            "Canvas read failed",
            "Permission denied",
            "Check permissions",
          ),
        );

        const result = await handleFinalization(channelId, threadTs, dependencies);

        assertEquals(result.success, false);
        assertEquals(result.error?.includes("Canvas read failed"), true);
      });

      it("should handle Epic creation errors", async () => {
        canvasManager.setCanvasContent("canvas_123", "# Title\n\nContent.");
        epicManager.setCreateEpicError(new Error("GitHub API error"));

        const result = await handleFinalization(channelId, threadTs, dependencies);

        assertEquals(result.success, false);
        assertEquals(result.error?.includes("GitHub API error"), true);
      });

      it("should handle comment creation errors", async () => {
        canvasManager.setCanvasContent("canvas_123", "# Title\n\nContent.");
        epicManager.setAddSpecCommentError(new Error("Comment failed"));

        const result = await handleFinalization(channelId, threadTs, dependencies);

        assertEquals(result.success, false);
        assertEquals(result.error?.includes("Comment failed"), true);
      });

      it("should post error message to Slack on failure", async () => {
        canvasManager.setGetCanvasContentError(
          new SlackCanvasError(
            "Canvas read failed",
            "Not found",
            "Check ID",
          ),
        );

        await handleFinalization(channelId, threadTs, dependencies);

        const messages = messagingClient.getPostedMessages();
        assertEquals(messages.length, 1);
        assertEquals(messages[0].text.includes("Canvas read failed"), true);
      });
    });
  });
});
