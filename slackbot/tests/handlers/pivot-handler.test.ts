// ABOUTME: Tests for pivot handler covering session resumption and pivot detection.
// ABOUTME: Follows TDD approach to ensure pivot handling works correctly for finalized sessions.

import { assertEquals } from "@std/assert";
import { afterEach, beforeEach, describe, it } from "@std/testing/bdd";
import { MockDatastoreClient } from "../../src/managers/datastore-client.ts";
import { MockEpicManager } from "../../src/managers/epic-manager.ts";
import { SessionManager } from "../../src/managers/session-manager.ts";
import { Phase } from "../../src/types/session.ts";
import { checkAndHandlePivot, type PivotDependencies } from "../../src/handlers/pivot-handler.ts";

describe("checkAndHandlePivot", () => {
  let datastore: MockDatastoreClient;
  let sessionManager: SessionManager;
  let epicManager: MockEpicManager;
  let messagingClient: MockMessagingClient;
  let dependencies: PivotDependencies;

  beforeEach(() => {
    datastore = new MockDatastoreClient();
    sessionManager = new SessionManager(datastore);
    epicManager = new MockEpicManager();
    messagingClient = new MockMessagingClient();
    dependencies = {
      sessionManager,
      epicManager,
      messagingClient,
    };
  });

  afterEach(() => {
    datastore.clear();
    epicManager.clear();
    messagingClient.clear();
  });

  describe("pivot detection on Finalized session with Epic", () => {
    it("should detect pivot and resume session when Finalized with Epic but no requirements", async () => {
      // Arrange - Create and finalize a session with Epic
      const channelId = "C1234567890";
      const threadTs = "1234567890.123456";
      const session = await sessionManager.createSession(
        channelId,
        threadTs,
        "owner/repo",
        "U1234567890",
      );

      session.phase = Phase.Finalized;
      session.epic_number = 42;
      session.epic_url = "https://github.com/owner/repo/issues/42";
      session.spec_comment_ids = { brainstorm: 100 };
      await sessionManager.updateSession(session);

      // Add brainstorm comment to Epic
      await epicManager.addSpecComment(
        "owner",
        "repo",
        42,
        "brainstorm",
        "# Brainstorm content",
      );

      // Act
      const result = await checkAndHandlePivot(
        channelId,
        threadTs,
        dependencies,
      );

      // Assert
      assertEquals(result.pivotDetected, true);
      assertEquals(result.nextPhase, "requirements");
      assertEquals(result.resumed, true);

      // Verify session was resumed
      const loadedSession = await sessionManager.loadSession(channelId, threadTs);
      assertEquals(loadedSession?.phase, Phase.Questioning);
    });

    it("should post acknowledgment message when resuming session", async () => {
      // Arrange
      const channelId = "C1234567890";
      const threadTs = "1234567890.123456";
      const session = await sessionManager.createSession(
        channelId,
        threadTs,
        "owner/repo",
        "U1234567890",
      );

      session.phase = Phase.Finalized;
      session.epic_number = 42;
      session.epic_url = "https://github.com/owner/repo/issues/42";
      session.spec_comment_ids = { brainstorm: 100 };
      await sessionManager.updateSession(session);

      await epicManager.addSpecComment(
        "owner",
        "repo",
        42,
        "brainstorm",
        "# Brainstorm content",
      );

      // Act
      await checkAndHandlePivot(channelId, threadTs, dependencies);

      // Assert - Check message was posted
      const messages = messagingClient.getPostedMessages();
      assertEquals(messages.length, 1);
      assertEquals(messages[0].channelId, channelId);
      assertEquals(messages[0].threadTs, threadTs);
      assertEquals(
        messages[0].text.includes("requirements"),
        true,
        "Message should mention next phase",
      );
      assertEquals(
        messages[0].text.includes("42"),
        true,
        "Message should mention Epic number",
      );
    });

    it("should detect pivot opportunity for design phase", async () => {
      // Arrange
      const channelId = "C1234567890";
      const threadTs = "1234567890.123456";
      const session = await sessionManager.createSession(
        channelId,
        threadTs,
        "owner/repo",
        "U1234567890",
      );

      session.phase = Phase.Finalized;
      session.epic_number = 42;
      session.epic_url = "https://github.com/owner/repo/issues/42";
      session.spec_comment_ids = { brainstorm: 100, requirements: 101 };
      await sessionManager.updateSession(session);

      // Add brainstorm and requirements comments to Epic
      await epicManager.addSpecComment("owner", "repo", 42, "brainstorm", "# Brainstorm");
      await epicManager.addSpecComment("owner", "repo", 42, "requirements", "# Requirements");

      // Act
      const result = await checkAndHandlePivot(channelId, threadTs, dependencies);

      // Assert
      assertEquals(result.pivotDetected, true);
      assertEquals(result.nextPhase, "design");
    });
  });

  describe("no pivot when session is not Finalized", () => {
    it("should not detect pivot when session is in Questioning phase", async () => {
      // Arrange
      const channelId = "C1234567890";
      const threadTs = "1234567890.123456";
      await sessionManager.createSession(
        channelId,
        threadTs,
        "owner/repo",
        "U1234567890",
      );

      // Act
      const result = await checkAndHandlePivot(channelId, threadTs, dependencies);

      // Assert
      assertEquals(result.pivotDetected, false);
      assertEquals(result.resumed, false);
    });

    it("should not detect pivot when session is in Review phase", async () => {
      // Arrange
      const channelId = "C1234567890";
      const threadTs = "1234567890.123456";
      const session = await sessionManager.createSession(
        channelId,
        threadTs,
        "owner/repo",
        "U1234567890",
      );

      session.phase = Phase.Review;
      await sessionManager.updateSession(session);

      // Act
      const result = await checkAndHandlePivot(channelId, threadTs, dependencies);

      // Assert
      assertEquals(result.pivotDetected, false);
      assertEquals(result.resumed, false);
    });
  });

  describe("no pivot when no Epic exists", () => {
    it("should not detect pivot when Finalized without Epic", async () => {
      // Arrange
      const channelId = "C1234567890";
      const threadTs = "1234567890.123456";
      const session = await sessionManager.createSession(
        channelId,
        threadTs,
        "owner/repo",
        "U1234567890",
      );

      session.phase = Phase.Finalized;
      // No epic_number set
      await sessionManager.updateSession(session);

      // Act
      const result = await checkAndHandlePivot(channelId, threadTs, dependencies);

      // Assert
      assertEquals(result.pivotDetected, false);
      assertEquals(result.resumed, false);
    });
  });

  describe("no pivot when all spec phases complete", () => {
    it("should not detect pivot when all phases are complete", async () => {
      // Arrange
      const channelId = "C1234567890";
      const threadTs = "1234567890.123456";
      const session = await sessionManager.createSession(
        channelId,
        threadTs,
        "owner/repo",
        "U1234567890",
      );

      session.phase = Phase.Finalized;
      session.epic_number = 42;
      session.epic_url = "https://github.com/owner/repo/issues/42";
      session.spec_comment_ids = {
        brainstorm: 100,
        requirements: 101,
        design: 102,
      };
      await sessionManager.updateSession(session);

      // Add all spec comments to Epic
      await epicManager.addSpecComment("owner", "repo", 42, "brainstorm", "# Brainstorm");
      await epicManager.addSpecComment("owner", "repo", 42, "requirements", "# Requirements");
      await epicManager.addSpecComment("owner", "repo", 42, "design", "# Design");

      // Act
      const result = await checkAndHandlePivot(channelId, threadTs, dependencies);

      // Assert
      assertEquals(result.pivotDetected, false);
      assertEquals(result.resumed, false);
      assertEquals(result.reason, "All spec phases are complete");
    });

    it("should not post message when no pivot detected", async () => {
      // Arrange
      const channelId = "C1234567890";
      const threadTs = "1234567890.123456";
      const session = await sessionManager.createSession(
        channelId,
        threadTs,
        "owner/repo",
        "U1234567890",
      );

      session.phase = Phase.Finalized;
      session.epic_number = 42;
      session.epic_url = "https://github.com/owner/repo/issues/42";
      session.spec_comment_ids = {
        brainstorm: 100,
        requirements: 101,
        design: 102,
      };
      await sessionManager.updateSession(session);

      await epicManager.addSpecComment("owner", "repo", 42, "brainstorm", "# Brainstorm");
      await epicManager.addSpecComment("owner", "repo", 42, "requirements", "# Requirements");
      await epicManager.addSpecComment("owner", "repo", 42, "design", "# Design");

      // Act
      await checkAndHandlePivot(channelId, threadTs, dependencies);

      // Assert - No message should be posted
      const messages = messagingClient.getPostedMessages();
      assertEquals(messages.length, 0);
    });
  });

  describe("no session found", () => {
    it("should handle missing session gracefully", async () => {
      // Act
      const result = await checkAndHandlePivot(
        "C9999999999",
        "9999999999.999999",
        dependencies,
      );

      // Assert
      assertEquals(result.pivotDetected, false);
      assertEquals(result.resumed, false);
      assertEquals(result.reason, "No session found");
    });
  });

  describe("error handling", () => {
    it("should handle errors from epicManager.getSpecComments gracefully", async () => {
      // Arrange - Create a finalized session with Epic
      const channelId = "C1234567890";
      const threadTs = "1234567890.123456";
      const session = await sessionManager.createSession(
        channelId,
        threadTs,
        "owner/repo",
        "U1234567890",
      );

      session.phase = Phase.Finalized;
      session.epic_number = 42;
      session.epic_url = "https://github.com/owner/repo/issues/42";
      session.spec_comment_ids = { brainstorm: 100 };
      await sessionManager.updateSession(session);

      // Make epicManager throw an error
      epicManager.setErrorOnGetSpecComments(new Error("GitHub API rate limited"));

      // Act
      const result = await checkAndHandlePivot(channelId, threadTs, dependencies);

      // Assert - Should handle error gracefully
      assertEquals(result.pivotDetected, false);
      assertEquals(result.resumed, false);
      assertEquals(
        result.reason?.includes("Error checking pivot status"),
        true,
        "Reason should indicate an error occurred",
      );
    });

    it("should include error message in reason when epicManager fails", async () => {
      // Arrange
      const channelId = "C1234567890";
      const threadTs = "1234567890.123456";
      const session = await sessionManager.createSession(
        channelId,
        threadTs,
        "owner/repo",
        "U1234567890",
      );

      session.phase = Phase.Finalized;
      session.epic_number = 42;
      session.epic_url = "https://github.com/owner/repo/issues/42";
      session.spec_comment_ids = { brainstorm: 100 };
      await sessionManager.updateSession(session);

      // Make epicManager throw a specific error
      epicManager.setErrorOnGetSpecComments(new Error("Network connection failed"));

      // Act
      const result = await checkAndHandlePivot(channelId, threadTs, dependencies);

      // Assert - Should include error message
      assertEquals(result.pivotDetected, false);
      assertEquals(result.resumed, false);
      assertEquals(
        result.reason?.includes("Network connection failed"),
        true,
        "Reason should include the original error message",
      );
    });
  });
});

/**
 * Mock messaging client for testing.
 */
class MockMessagingClient {
  private messages: Array<{
    channelId: string;
    threadTs: string;
    text: string;
  }> = [];

  postMessage(channelId: string, threadTs: string, text: string): Promise<void> {
    this.messages.push({ channelId, threadTs, text });
    return Promise.resolve();
  }

  getPostedMessages(): Array<{
    channelId: string;
    threadTs: string;
    text: string;
  }> {
    return [...this.messages];
  }

  clear(): void {
    this.messages = [];
  }
}
