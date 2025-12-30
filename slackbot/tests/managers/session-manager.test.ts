// ABOUTME: Tests for SessionManager covering session lifecycle and Slack Datastore integration.
// ABOUTME: Includes property tests for Property 6 (Session Resumption) and Property 9 (TTL Enforcement).

import { assertEquals, assertExists, assertRejects } from "@std/assert";
import { afterEach, beforeEach, describe, it } from "@std/testing/bdd";
import { MockSlackClient, type SlackThreadMessage } from "../../src/clients/slack-client.ts";
import { MockDatastoreClient } from "../../src/managers/datastore-client.ts";
import { MockEpicManager } from "../../src/managers/epic-manager.ts";
import { MessageCache } from "../../src/managers/message-cache.ts";
import { SessionManager } from "../../src/managers/session-manager.ts";
import { formatSessionId, Phase } from "../../src/types/session.ts";

describe("SessionManager", () => {
  let datastore: MockDatastoreClient;
  let sessionManager: SessionManager;

  beforeEach(() => {
    datastore = new MockDatastoreClient();
    sessionManager = new SessionManager(datastore);
  });

  afterEach(() => {
    datastore.clear();
  });

  describe("createSession", () => {
    it("should create a session with correct session ID format", async () => {
      const channelId = "C1234567890";
      const threadTs = "1234567890.123456";
      const repo = "owner/repo";
      const userId = "U1234567890";

      const session = await sessionManager.createSession(
        channelId,
        threadTs,
        repo,
        userId,
      );

      assertEquals(session.session_id, "C1234567890:1234567890.123456");
    });

    it("should set initial phase to Questioning", async () => {
      const session = await sessionManager.createSession(
        "C1234567890",
        "1234567890.123456",
        "owner/repo",
        "U1234567890",
      );

      assertEquals(session.phase, Phase.Questioning);
    });

    it("should set initial confidence_score to 0", async () => {
      const session = await sessionManager.createSession(
        "C1234567890",
        "1234567890.123456",
        "owner/repo",
        "U1234567890",
      );

      assertEquals(session.confidence_score, 0);
    });

    it("should store repository correctly", async () => {
      const session = await sessionManager.createSession(
        "C1234567890",
        "1234567890.123456",
        "stickystyle/regent",
        "U1234567890",
      );

      assertEquals(session.repository, "stickystyle/regent");
    });

    it("should handle empty repository string", async () => {
      const session = await sessionManager.createSession(
        "C1234567890",
        "1234567890.123456",
        "",
        "U1234567890",
      );

      assertEquals(session.repository, undefined);
    });

    it("should store initiator user ID", async () => {
      const session = await sessionManager.createSession(
        "C1234567890",
        "1234567890.123456",
        "owner/repo",
        "U9876543210",
      );

      assertEquals(session.initiator_user_id, "U9876543210");
    });

    it("should set created_at timestamp", async () => {
      const beforeCreate = new Date();
      const session = await sessionManager.createSession(
        "C1234567890",
        "1234567890.123456",
        "owner/repo",
        "U1234567890",
      );
      const afterCreate = new Date();

      const createdAt = new Date(session.created_at);
      assertEquals(createdAt >= beforeCreate, true);
      assertEquals(createdAt <= afterCreate, true);
    });

    it("should set TTL to exactly 30 days from created_at", async () => {
      const session = await sessionManager.createSession(
        "C1234567890",
        "1234567890.123456",
        "owner/repo",
        "U1234567890",
      );

      const createdAt = new Date(session.created_at);
      const ttl = new Date(session.ttl);
      const daysDiff = (ttl.getTime() - createdAt.getTime()) /
        (24 * 60 * 60 * 1000);

      assertEquals(daysDiff, 30);
    });

    it("should not set canvas_id on creation", async () => {
      const session = await sessionManager.createSession(
        "C1234567890",
        "1234567890.123456",
        "owner/repo",
        "U1234567890",
      );

      assertEquals(session.canvas_id, undefined);
    });

    it("should prevent duplicate sessions for same channel and thread", async () => {
      const channelId = "C1234567890";
      const threadTs = "1234567890.123456";

      await sessionManager.createSession(
        channelId,
        threadTs,
        "owner/repo",
        "U1234567890",
      );

      await assertRejects(
        () =>
          sessionManager.createSession(
            channelId,
            threadTs,
            "other/repo",
            "U9876543210",
          ),
        Error,
        "Session already exists",
      );
    });

    it("should allow different sessions in different channels", async () => {
      const session1 = await sessionManager.createSession(
        "C1111111111",
        "1234567890.123456",
        "owner/repo",
        "U1234567890",
      );

      const session2 = await sessionManager.createSession(
        "C2222222222",
        "1234567890.123456",
        "owner/repo",
        "U1234567890",
      );

      assertEquals(session1.session_id !== session2.session_id, true);
    });

    it("should allow different sessions in same channel with different threads", async () => {
      const session1 = await sessionManager.createSession(
        "C1234567890",
        "1111111111.111111",
        "owner/repo",
        "U1234567890",
      );

      const session2 = await sessionManager.createSession(
        "C1234567890",
        "2222222222.222222",
        "owner/repo",
        "U1234567890",
      );

      assertEquals(session1.session_id !== session2.session_id, true);
    });
  });

  describe("loadSession", () => {
    it("should load an existing session", async () => {
      const channelId = "C1234567890";
      const threadTs = "1234567890.123456";
      const created = await sessionManager.createSession(
        channelId,
        threadTs,
        "owner/repo",
        "U1234567890",
      );

      const loaded = await sessionManager.loadSession(channelId, threadTs);

      assertExists(loaded);
      assertEquals(loaded!.session_id, created.session_id);
      assertEquals(loaded!.repository, created.repository);
      assertEquals(loaded!.phase, created.phase);
      assertEquals(loaded!.initiator_user_id, created.initiator_user_id);
    });

    it("should return null for non-existent session", async () => {
      const loaded = await sessionManager.loadSession(
        "C9999999999",
        "9999999999.999999",
      );

      assertEquals(loaded, null);
    });

    it("should return null for expired session", async () => {
      const channelId = "C1234567890";
      const threadTs = "1234567890.123456";

      // Create session
      await sessionManager.createSession(
        channelId,
        threadTs,
        "owner/repo",
        "U1234567890",
      );

      // Fast-forward time past TTL (31 days)
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 31);
      datastore.setCurrentTime(futureDate);

      const loaded = await sessionManager.loadSession(channelId, threadTs);

      assertEquals(loaded, null);
    });

    it("should load session that is not yet expired", async () => {
      const channelId = "C1234567890";
      const threadTs = "1234567890.123456";

      await sessionManager.createSession(
        channelId,
        threadTs,
        "owner/repo",
        "U1234567890",
      );

      // Fast-forward time within TTL (29 days)
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 29);
      datastore.setCurrentTime(futureDate);

      const loaded = await sessionManager.loadSession(channelId, threadTs);

      assertExists(loaded);
    });

    it("should preserve all session fields when loading", async () => {
      const channelId = "C1234567890";
      const threadTs = "1234567890.123456";

      const created = await sessionManager.createSession(
        channelId,
        threadTs,
        "owner/repo",
        "U1234567890",
      );

      const loaded = await sessionManager.loadSession(channelId, threadTs);

      assertExists(loaded);
      assertEquals(loaded!.session_id, created.session_id);
      assertEquals(loaded!.repository, created.repository);
      assertEquals(loaded!.phase, created.phase);
      assertEquals(loaded!.initiator_user_id, created.initiator_user_id);
      assertEquals(loaded!.confidence_score, created.confidence_score);
      assertEquals(loaded!.created_at, created.created_at);
      assertEquals(loaded!.ttl, created.ttl);
    });
  });

  describe("updateSession", () => {
    it("should persist phase transitions to Review", async () => {
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

      const loaded = await sessionManager.loadSession(channelId, threadTs);
      assertEquals(loaded!.phase, Phase.Review);
    });

    it("should persist phase transitions to Finalized", async () => {
      const channelId = "C1234567890";
      const threadTs = "1234567890.123456";

      const session = await sessionManager.createSession(
        channelId,
        threadTs,
        "owner/repo",
        "U1234567890",
      );

      session.phase = Phase.Finalized;
      await sessionManager.updateSession(session);

      const loaded = await sessionManager.loadSession(channelId, threadTs);
      assertEquals(loaded!.phase, Phase.Finalized);
    });

    it("should persist confidence score updates", async () => {
      const channelId = "C1234567890";
      const threadTs = "1234567890.123456";

      const session = await sessionManager.createSession(
        channelId,
        threadTs,
        "owner/repo",
        "U1234567890",
      );

      session.confidence_score = 75;
      await sessionManager.updateSession(session);

      const loaded = await sessionManager.loadSession(channelId, threadTs);
      assertEquals(loaded!.confidence_score, 75);
    });

    it("should persist confidence score at 95% threshold", async () => {
      const channelId = "C1234567890";
      const threadTs = "1234567890.123456";

      const session = await sessionManager.createSession(
        channelId,
        threadTs,
        "owner/repo",
        "U1234567890",
      );

      session.confidence_score = 95;
      await sessionManager.updateSession(session);

      const loaded = await sessionManager.loadSession(channelId, threadTs);
      assertEquals(loaded!.confidence_score, 95);
    });

    it("should store canvas_id when set", async () => {
      const channelId = "C1234567890";
      const threadTs = "1234567890.123456";

      const session = await sessionManager.createSession(
        channelId,
        threadTs,
        "owner/repo",
        "U1234567890",
      );

      session.canvas_id = "F1234567890";
      await sessionManager.updateSession(session);

      const loaded = await sessionManager.loadSession(channelId, threadTs);
      assertEquals(loaded!.canvas_id, "F1234567890");
    });

    it("should not modify created_at on update", async () => {
      const channelId = "C1234567890";
      const threadTs = "1234567890.123456";

      const session = await sessionManager.createSession(
        channelId,
        threadTs,
        "owner/repo",
        "U1234567890",
      );

      const originalCreatedAt = session.created_at;
      session.confidence_score = 50;
      await sessionManager.updateSession(session);

      const loaded = await sessionManager.loadSession(channelId, threadTs);
      assertEquals(loaded!.created_at, originalCreatedAt);
    });

    it("should not modify TTL on update", async () => {
      const channelId = "C1234567890";
      const threadTs = "1234567890.123456";

      const session = await sessionManager.createSession(
        channelId,
        threadTs,
        "owner/repo",
        "U1234567890",
      );

      const originalTtl = session.ttl;
      session.confidence_score = 50;
      await sessionManager.updateSession(session);

      const loaded = await sessionManager.loadSession(channelId, threadTs);
      assertEquals(loaded!.ttl, originalTtl);
    });

    it("should throw error when updating non-existent session", async () => {
      const nonExistentSession = {
        session_id: "C9999999999:9999999999.999999",
        phase: Phase.Questioning,
        initiator_user_id: "U1234567890",
        confidence_score: 50,
        created_at: new Date().toISOString(),
        ttl: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      };

      await assertRejects(
        () => sessionManager.updateSession(nonExistentSession),
        Error,
        "Session not found",
      );
    });
  });

  describe("Property 9: TTL Enforcement", () => {
    it("should set TTL to creation timestamp plus 30 days for any creation time", async () => {
      // Test with multiple random creation times
      const testCases = [
        new Date("2025-01-01T00:00:00.000Z"),
        new Date("2025-02-15T12:30:45.123Z"),
        new Date("2025-06-30T23:59:59.999Z"),
        new Date("2025-12-31T00:00:00.000Z"),
        new Date("2024-02-29T06:15:30.000Z"), // Leap year
      ];

      for (const testTime of testCases) {
        const datastore = new MockDatastoreClient(testTime);
        const manager = new SessionManager(datastore, () => testTime);

        const session = await manager.createSession(
          `C${Date.now()}`,
          `${Date.now()}.${Math.random().toString().slice(2, 8)}`,
          "owner/repo",
          "U1234567890",
        );

        const createdAt = new Date(session.created_at);
        const ttl = new Date(session.ttl);
        const daysDiff = (ttl.getTime() - createdAt.getTime()) /
          (24 * 60 * 60 * 1000);

        assertEquals(
          daysDiff,
          30,
          `TTL should be 30 days from ${testTime.toISOString()}, got ${daysDiff} days`,
        );
      }
    });

    it("should allow deletion after TTL expiration", async () => {
      const now = new Date("2025-01-01T00:00:00.000Z");
      const datastore = new MockDatastoreClient(now);
      const manager = new SessionManager(datastore, () => now);

      const channelId = "C1234567890";
      const threadTs = "1234567890.123456";

      await manager.createSession(
        channelId,
        threadTs,
        "owner/repo",
        "U1234567890",
      );

      // Session should exist before TTL expires
      const beforeExpiry = await manager.loadSession(channelId, threadTs);
      assertExists(beforeExpiry);

      // Fast-forward past TTL (31 days)
      const afterExpiry = new Date("2025-02-01T00:00:00.001Z");
      datastore.setCurrentTime(afterExpiry);

      // Session should be gone after TTL expires
      const expiredSession = await manager.loadSession(channelId, threadTs);
      assertEquals(expiredSession, null);
    });

    it("should calculate correct TTL across month boundaries", async () => {
      // Jan 15 -> Feb 14 (30 days)
      const jan15 = new Date("2025-01-15T12:00:00.000Z");
      const datastore1 = new MockDatastoreClient(jan15);
      const manager1 = new SessionManager(datastore1, () => jan15);

      const session1 = await manager1.createSession(
        "C1111111111",
        "1111111111.111111",
        "owner/repo",
        "U1234567890",
      );

      const ttl1 = new Date(session1.ttl);
      assertEquals(ttl1.toISOString(), "2025-02-14T12:00:00.000Z");

      // Feb 15 -> Mar 17 (30 days)
      const feb15 = new Date("2025-02-15T12:00:00.000Z");
      const datastore2 = new MockDatastoreClient(feb15);
      const manager2 = new SessionManager(datastore2, () => feb15);

      const session2 = await manager2.createSession(
        "C2222222222",
        "2222222222.222222",
        "owner/repo",
        "U1234567890",
      );

      const ttl2 = new Date(session2.ttl);
      assertEquals(ttl2.toISOString(), "2025-03-17T12:00:00.000Z");
    });

    it("should handle leap year correctly", async () => {
      // Feb 28, 2024 (leap year) -> Mar 29, 2024
      const feb28Leap = new Date("2024-02-28T12:00:00.000Z");
      const datastore = new MockDatastoreClient(feb28Leap);
      const manager = new SessionManager(datastore, () => feb28Leap);

      const session = await manager.createSession(
        "C1234567890",
        "1234567890.123456",
        "owner/repo",
        "U1234567890",
      );

      const ttl = new Date(session.ttl);
      assertEquals(ttl.toISOString(), "2024-03-29T12:00:00.000Z");
    });
  });

  describe("Property 1: Session Isolation", () => {
    it("should create sessions with unique IDs in different channels", async () => {
      // Arrange - Same thread timestamp, different channels
      const threadTs = "1234567890.123456";
      const channel1 = "C1111111111";
      const channel2 = "C2222222222";
      const channel3 = "C3333333333";
      const userId = "U1234567890";

      // Act - Create sessions in different channels
      const session1 = await sessionManager.createSession(
        channel1,
        threadTs,
        "owner/repo",
        userId,
      );
      const session2 = await sessionManager.createSession(
        channel2,
        threadTs,
        "owner/repo",
        userId,
      );
      const session3 = await sessionManager.createSession(
        channel3,
        threadTs,
        "owner/repo",
        userId,
      );

      // Assert - All session IDs are unique
      assertEquals(session1.session_id, `${channel1}:${threadTs}`);
      assertEquals(session2.session_id, `${channel2}:${threadTs}`);
      assertEquals(session3.session_id, `${channel3}:${threadTs}`);
      assertEquals(session1.session_id !== session2.session_id, true);
      assertEquals(session2.session_id !== session3.session_id, true);
      assertEquals(session1.session_id !== session3.session_id, true);
    });

    it("should create sessions with unique IDs in different threads within same channel", async () => {
      // Arrange - Same channel, different thread timestamps
      const channelId = "C1234567890";
      const thread1 = "1111111111.111111";
      const thread2 = "2222222222.222222";
      const thread3 = "3333333333.333333";
      const userId = "U1234567890";

      // Act - Create sessions in different threads
      const session1 = await sessionManager.createSession(
        channelId,
        thread1,
        "owner/repo",
        userId,
      );
      const session2 = await sessionManager.createSession(
        channelId,
        thread2,
        "owner/repo",
        userId,
      );
      const session3 = await sessionManager.createSession(
        channelId,
        thread3,
        "owner/repo",
        userId,
      );

      // Assert - All session IDs are unique
      assertEquals(session1.session_id, `${channelId}:${thread1}`);
      assertEquals(session2.session_id, `${channelId}:${thread2}`);
      assertEquals(session3.session_id, `${channelId}:${thread3}`);
      assertEquals(session1.session_id !== session2.session_id, true);
      assertEquals(session2.session_id !== session3.session_id, true);
      assertEquals(session1.session_id !== session3.session_id, true);
    });

    it("should guarantee uniqueness via composite key channel_id:thread_ts", async () => {
      // Arrange - Various combinations of channels and threads
      const userId = "U1234567890";
      const testCases = [
        { channel: "C1111111111", thread: "1111111111.111111" },
        { channel: "C1111111111", thread: "2222222222.222222" },
        { channel: "C2222222222", thread: "1111111111.111111" },
        { channel: "C2222222222", thread: "2222222222.222222" },
      ];

      // Act - Create all sessions
      const sessions = [];
      for (const { channel, thread } of testCases) {
        const session = await sessionManager.createSession(
          channel,
          thread,
          "owner/repo",
          userId,
        );
        sessions.push(session);
      }

      // Assert - All session IDs are unique
      const sessionIds = sessions.map((s) => s.session_id);
      const uniqueIds = new Set(sessionIds);
      assertEquals(uniqueIds.size, sessionIds.length);

      // Verify expected format
      for (let i = 0; i < testCases.length; i++) {
        const expectedId =
          `${testCases[i].channel}:${testCases[i].thread}`;
        assertEquals(sessions[i].session_id, expectedId);
      }
    });

    it("should isolate phase state between concurrent sessions", async () => {
      // Arrange - Create two sessions
      const session1 = await sessionManager.createSession(
        "C1111111111",
        "1111111111.111111",
        "owner/repo1",
        "U1111111111",
      );
      // Create session2 to verify isolation - we only need to modify session1
      await sessionManager.createSession(
        "C2222222222",
        "2222222222.222222",
        "owner/repo2",
        "U2222222222",
      );

      // Act - Update phase of session1 only
      session1.phase = Phase.Review;
      await sessionManager.updateSession(session1);

      // Assert - Session2 phase is unchanged
      const loadedSession1 = await sessionManager.loadSession(
        "C1111111111",
        "1111111111.111111",
      );
      const loadedSession2 = await sessionManager.loadSession(
        "C2222222222",
        "2222222222.222222",
      );

      assertEquals(loadedSession1!.phase, Phase.Review);
      assertEquals(loadedSession2!.phase, Phase.Questioning);
    });

    it("should isolate confidence_score state between concurrent sessions", async () => {
      // Arrange - Create two sessions
      const session1 = await sessionManager.createSession(
        "C1111111111",
        "1111111111.111111",
        "owner/repo1",
        "U1111111111",
      );
      // Create session2 to verify isolation - we only need to modify session1
      await sessionManager.createSession(
        "C2222222222",
        "2222222222.222222",
        "owner/repo2",
        "U2222222222",
      );

      // Act - Update confidence_score of session1 only
      session1.confidence_score = 75;
      await sessionManager.updateSession(session1);

      // Assert - Session2 confidence_score is unchanged
      const loadedSession1 = await sessionManager.loadSession(
        "C1111111111",
        "1111111111.111111",
      );
      const loadedSession2 = await sessionManager.loadSession(
        "C2222222222",
        "2222222222.222222",
      );

      assertEquals(loadedSession1!.confidence_score, 75);
      assertEquals(loadedSession2!.confidence_score, 0);
    });

    it("should isolate canvas_id state between concurrent sessions", async () => {
      // Arrange - Create two sessions
      const session1 = await sessionManager.createSession(
        "C1111111111",
        "1111111111.111111",
        "owner/repo1",
        "U1111111111",
      );
      // Create session2 to verify isolation - we only need to modify session1
      await sessionManager.createSession(
        "C2222222222",
        "2222222222.222222",
        "owner/repo2",
        "U2222222222",
      );

      // Act - Set canvas_id on session1 only
      session1.canvas_id = "F1234567890";
      await sessionManager.updateSession(session1);

      // Assert - Session2 canvas_id is unchanged
      const loadedSession1 = await sessionManager.loadSession(
        "C1111111111",
        "1111111111.111111",
      );
      const loadedSession2 = await sessionManager.loadSession(
        "C2222222222",
        "2222222222.222222",
      );

      assertEquals(loadedSession1!.canvas_id, "F1234567890");
      assertEquals(loadedSession2!.canvas_id, undefined);
    });

    it("should isolate epic fields between concurrent sessions", async () => {
      // Arrange - Create two sessions
      const session1 = await sessionManager.createSession(
        "C1111111111",
        "1111111111.111111",
        "owner/repo1",
        "U1111111111",
      );
      // Create session2 to verify isolation - we only need to modify session1
      await sessionManager.createSession(
        "C2222222222",
        "2222222222.222222",
        "owner/repo2",
        "U2222222222",
      );

      // Act - Set epic fields on session1 only
      session1.phase = Phase.Finalized;
      session1.epic_number = 42;
      session1.epic_url = "https://github.com/owner/repo1/issues/42";
      session1.spec_comment_ids = { brainstorm: 100, requirements: 101 };
      await sessionManager.updateSession(session1);

      // Assert - Session2 epic fields are unchanged
      const loadedSession1 = await sessionManager.loadSession(
        "C1111111111",
        "1111111111.111111",
      );
      const loadedSession2 = await sessionManager.loadSession(
        "C2222222222",
        "2222222222.222222",
      );

      assertEquals(loadedSession1!.epic_number, 42);
      assertEquals(loadedSession1!.epic_url, "https://github.com/owner/repo1/issues/42");
      assertEquals(loadedSession1!.spec_comment_ids?.brainstorm, 100);
      assertEquals(loadedSession1!.spec_comment_ids?.requirements, 101);

      assertEquals(loadedSession2!.epic_number, undefined);
      assertEquals(loadedSession2!.epic_url, undefined);
      assertEquals(loadedSession2!.spec_comment_ids, undefined);
    });

    it("should handle interleaved updates to multiple sessions without cross-contamination", async () => {
      // Arrange - Create three concurrent sessions
      const session1 = await sessionManager.createSession(
        "C1111111111",
        "1111111111.111111",
        "owner/repo1",
        "U1111111111",
      );
      const session2 = await sessionManager.createSession(
        "C2222222222",
        "2222222222.222222",
        "owner/repo2",
        "U2222222222",
      );
      const session3 = await sessionManager.createSession(
        "C3333333333",
        "3333333333.333333",
        "owner/repo3",
        "U3333333333",
      );

      // Act - Interleaved updates to simulate concurrent usage
      session1.confidence_score = 25;
      await sessionManager.updateSession(session1);

      session2.phase = Phase.Review;
      session2.canvas_id = "F2222222222";
      await sessionManager.updateSession(session2);

      session1.confidence_score = 50;
      await sessionManager.updateSession(session1);

      session3.phase = Phase.Finalized;
      session3.epic_number = 99;
      await sessionManager.updateSession(session3);

      session1.phase = Phase.Review;
      session1.confidence_score = 75;
      await sessionManager.updateSession(session1);

      session2.confidence_score = 95;
      await sessionManager.updateSession(session2);

      // Assert - Each session has only its own state, no cross-contamination
      const loaded1 = await sessionManager.loadSession(
        "C1111111111",
        "1111111111.111111",
      );
      const loaded2 = await sessionManager.loadSession(
        "C2222222222",
        "2222222222.222222",
      );
      const loaded3 = await sessionManager.loadSession(
        "C3333333333",
        "3333333333.333333",
      );

      // Session 1 assertions
      assertEquals(loaded1!.phase, Phase.Review);
      assertEquals(loaded1!.confidence_score, 75);
      assertEquals(loaded1!.canvas_id, undefined);
      assertEquals(loaded1!.epic_number, undefined);
      assertEquals(loaded1!.repository, "owner/repo1");

      // Session 2 assertions
      assertEquals(loaded2!.phase, Phase.Review);
      assertEquals(loaded2!.confidence_score, 95);
      assertEquals(loaded2!.canvas_id, "F2222222222");
      assertEquals(loaded2!.epic_number, undefined);
      assertEquals(loaded2!.repository, "owner/repo2");

      // Session 3 assertions
      assertEquals(loaded3!.phase, Phase.Finalized);
      assertEquals(loaded3!.confidence_score, 0);
      assertEquals(loaded3!.canvas_id, undefined);
      assertEquals(loaded3!.epic_number, 99);
      assertEquals(loaded3!.repository, "owner/repo3");
    });

    it("should correctly identify sessions using channel ID and thread timestamp", async () => {
      // Arrange - Create sessions with specific channel/thread combinations
      const session1 = await sessionManager.createSession(
        "C1234567890",
        "1111111111.111111",
        "owner/repo",
        "U1234567890",
      );
      const session2 = await sessionManager.createSession(
        "C1234567890",
        "2222222222.222222",
        "owner/repo",
        "U1234567890",
      );
      const session3 = await sessionManager.createSession(
        "C9876543210",
        "1111111111.111111",
        "owner/repo",
        "U1234567890",
      );

      // Update each session differently
      session1.confidence_score = 10;
      session2.confidence_score = 20;
      session3.confidence_score = 30;
      await sessionManager.updateSession(session1);
      await sessionManager.updateSession(session2);
      await sessionManager.updateSession(session3);

      // Act - Load sessions by their specific channel/thread combinations
      const loaded1 = await sessionManager.loadSession(
        "C1234567890",
        "1111111111.111111",
      );
      const loaded2 = await sessionManager.loadSession(
        "C1234567890",
        "2222222222.222222",
      );
      const loaded3 = await sessionManager.loadSession(
        "C9876543210",
        "1111111111.111111",
      );

      // Assert - Each load returns the correct session
      assertEquals(loaded1!.confidence_score, 10);
      assertEquals(loaded2!.confidence_score, 20);
      assertEquals(loaded3!.confidence_score, 30);

      // Verify session IDs match expected composite keys
      assertEquals(loaded1!.session_id, "C1234567890:1111111111.111111");
      assertEquals(loaded2!.session_id, "C1234567890:2222222222.222222");
      assertEquals(loaded3!.session_id, "C9876543210:1111111111.111111");
    });

    it("should preserve independent initiator_user_id for each session", async () => {
      // Arrange - Create sessions with different initiators
      await sessionManager.createSession(
        "C1111111111",
        "1111111111.111111",
        "owner/repo",
        "U1111111111",
      );
      await sessionManager.createSession(
        "C2222222222",
        "2222222222.222222",
        "owner/repo",
        "U2222222222",
      );
      await sessionManager.createSession(
        "C3333333333",
        "3333333333.333333",
        "owner/repo",
        "U3333333333",
      );

      // Act - Load all sessions
      const loaded1 = await sessionManager.loadSession(
        "C1111111111",
        "1111111111.111111",
      );
      const loaded2 = await sessionManager.loadSession(
        "C2222222222",
        "2222222222.222222",
      );
      const loaded3 = await sessionManager.loadSession(
        "C3333333333",
        "3333333333.333333",
      );

      // Assert - Each session has its own initiator
      assertEquals(loaded1!.initiator_user_id, "U1111111111");
      assertEquals(loaded2!.initiator_user_id, "U2222222222");
      assertEquals(loaded3!.initiator_user_id, "U3333333333");
    });

    it("should preserve independent repository for each session", async () => {
      // Arrange - Create sessions with different repositories
      await sessionManager.createSession(
        "C1111111111",
        "1111111111.111111",
        "org1/repo1",
        "U1234567890",
      );
      await sessionManager.createSession(
        "C2222222222",
        "2222222222.222222",
        "org2/repo2",
        "U1234567890",
      );
      await sessionManager.createSession(
        "C3333333333",
        "3333333333.333333",
        "", // No repository
        "U1234567890",
      );

      // Act - Load all sessions
      const loaded1 = await sessionManager.loadSession(
        "C1111111111",
        "1111111111.111111",
      );
      const loaded2 = await sessionManager.loadSession(
        "C2222222222",
        "2222222222.222222",
      );
      const loaded3 = await sessionManager.loadSession(
        "C3333333333",
        "3333333333.333333",
      );

      // Assert - Each session has its own repository
      assertEquals(loaded1!.repository, "org1/repo1");
      assertEquals(loaded2!.repository, "org2/repo2");
      assertEquals(loaded3!.repository, undefined);
    });

    it("should preserve independent TTL for each session", async () => {
      // Arrange - Create sessions at different times
      const time1 = new Date("2025-01-01T00:00:00.000Z");
      const time2 = new Date("2025-01-15T00:00:00.000Z");

      const datastore1 = new MockDatastoreClient(time1);
      const manager1 = new SessionManager(datastore1, () => time1);

      const session1 = await manager1.createSession(
        "C1111111111",
        "1111111111.111111",
        "owner/repo",
        "U1234567890",
      );

      // Create second session 14 days later using same datastore
      datastore1.setCurrentTime(time2);
      const manager2 = new SessionManager(datastore1, () => time2);

      const session2 = await manager2.createSession(
        "C2222222222",
        "2222222222.222222",
        "owner/repo",
        "U1234567890",
      );

      // Assert - TTLs are 30 days from their respective creation times
      const ttl1 = new Date(session1.ttl);
      const ttl2 = new Date(session2.ttl);

      assertEquals(ttl1.toISOString(), "2025-01-31T00:00:00.000Z");
      assertEquals(ttl2.toISOString(), "2025-02-14T00:00:00.000Z");

      // Verify TTLs are different
      assertEquals(ttl1.getTime() !== ttl2.getTime(), true);
    });
  });

  describe("rebuildFromHistory", () => {
    let slackClient: MockSlackClient;
    let messageCache: MessageCache;

    beforeEach(() => {
      slackClient = new MockSlackClient();
      messageCache = new MessageCache();
    });

    afterEach(() => {
      slackClient.clear();
      messageCache.clear();
    });

    it("should throw error when SlackClient is not configured", async () => {
      const managerWithoutSlack = new SessionManager(datastore);
      await assertRejects(
        () => managerWithoutSlack.rebuildFromHistory("C123", "123.456"),
        Error,
        "SlackClient is required",
      );
    });

    it("should create session from thread messages", async () => {
      // Arrange
      const channelId = "C1234567890";
      const threadTs = "1234567890.123456";
      const messages: SlackThreadMessage[] = [
        { user: "U1111111111", text: "@regent start", ts: "1234567890.123456" },
        {
          user: "B9999999999",
          text: "What problem are you solving?",
          ts: "1234567890.123457",
          bot_id: "B9999999999",
        },
        {
          user: "U1111111111",
          text: "@regent We need a better way to manage specs",
          ts: "1234567890.123458",
        },
      ];
      slackClient.setThreadMessages(channelId, threadTs, messages);

      const managerWithSlack = new SessionManager(
        datastore,
        undefined,
        slackClient,
        messageCache,
      );

      // Act
      const session = await managerWithSlack.rebuildFromHistory(
        channelId,
        threadTs,
      );

      // Assert
      assertExists(session);
      assertEquals(session.session_id, formatSessionId(channelId, threadTs));
      assertEquals(session.phase, Phase.Questioning);
    });

    it("should detect initiator from first user mentioning @regent", async () => {
      // Arrange
      const channelId = "C1234567890";
      const threadTs = "1234567890.123456";
      const messages: SlackThreadMessage[] = [
        {
          user: "U2222222222",
          text: "Just chatting here",
          ts: "1234567890.123455",
        },
        { user: "U1111111111", text: "@regent start", ts: "1234567890.123456" },
        {
          user: "U3333333333",
          text: "@regent me too",
          ts: "1234567890.123457",
        },
      ];
      slackClient.setThreadMessages(channelId, threadTs, messages);

      const managerWithSlack = new SessionManager(
        datastore,
        undefined,
        slackClient,
        messageCache,
      );

      // Act
      const session = await managerWithSlack.rebuildFromHistory(
        channelId,
        threadTs,
      );

      // Assert
      assertEquals(session.initiator_user_id, "U1111111111");
    });

    it("should mark messages starting with @regent as official answers", async () => {
      // Arrange
      const channelId = "C1234567890";
      const threadTs = "1234567890.123456";
      const messages: SlackThreadMessage[] = [
        { user: "U1111111111", text: "@regent start", ts: "1234567890.123456" },
        {
          user: "B9999999999",
          text: "What is the problem?",
          ts: "1234567890.123457",
          bot_id: "B9999999999",
        },
        {
          user: "U1111111111",
          text: "Let me think...",
          ts: "1234567890.123458",
        },
        {
          user: "U1111111111",
          text: "@regent The problem is X",
          ts: "1234567890.123459",
        },
      ];
      slackClient.setThreadMessages(channelId, threadTs, messages);

      const managerWithSlack = new SessionManager(
        datastore,
        undefined,
        slackClient,
        messageCache,
      );

      // Act
      await managerWithSlack.rebuildFromHistory(channelId, threadTs);

      // Assert
      const cachedMessages = messageCache.get(
        formatSessionId(channelId, threadTs),
      );
      assertEquals(cachedMessages.length, 4);

      // Verify messages were cached with correct content
      assertEquals(cachedMessages[0].text, "@regent start");
      assertEquals(cachedMessages[1].sender, "bot");
      assertEquals(cachedMessages[2].text, "Let me think...");
      assertEquals(cachedMessages[3].text, "@regent The problem is X");
    });

    it("should set phase to Questioning when no Canvas found", async () => {
      // Arrange
      const channelId = "C1234567890";
      const threadTs = "1234567890.123456";
      const messages: SlackThreadMessage[] = [
        { user: "U1111111111", text: "@regent start", ts: "1234567890.123456" },
        {
          user: "B9999999999",
          text: "What is your goal?",
          ts: "1234567890.123457",
          bot_id: "B9999999999",
        },
      ];
      slackClient.setThreadMessages(channelId, threadTs, messages);

      const managerWithSlack = new SessionManager(
        datastore,
        undefined,
        slackClient,
        messageCache,
      );

      // Act
      const session = await managerWithSlack.rebuildFromHistory(
        channelId,
        threadTs,
      );

      // Assert
      assertEquals(session.phase, Phase.Questioning);
    });

    it("should set phase to Review when Canvas message exists in thread", async () => {
      // Arrange
      const channelId = "C1234567890";
      const threadTs = "1234567890.123456";
      // Canvas messages typically have a specific block structure
      const canvasBlock = {
        type: "file",
        file_id: "F1234567890",
        source: "remote",
      };
      const messages: SlackThreadMessage[] = [
        { user: "U1111111111", text: "@regent start", ts: "1234567890.123456" },
        {
          user: "B9999999999",
          text: "Here is the spec canvas",
          ts: "1234567890.123457",
          bot_id: "B9999999999",
          blocks: [canvasBlock],
        },
      ];
      slackClient.setThreadMessages(channelId, threadTs, messages);

      const managerWithSlack = new SessionManager(
        datastore,
        undefined,
        slackClient,
        messageCache,
      );

      // Act
      const session = await managerWithSlack.rebuildFromHistory(
        channelId,
        threadTs,
      );

      // Assert
      assertEquals(session.phase, Phase.Review);
      assertEquals(session.canvas_id, "F1234567890");
    });

    it("should handle pagination for threads with 100+ messages", async () => {
      // Arrange
      const channelId = "C1234567890";
      const threadTs = "1234567890.123456";

      // Create 150 messages to test pagination
      const messages: SlackThreadMessage[] = [];
      messages.push({
        user: "U1111111111",
        text: "@regent start",
        ts: "1234567890.000000",
      });
      for (let i = 1; i < 150; i++) {
        messages.push({
          user: i % 2 === 0 ? "U1111111111" : "B9999999999",
          text: `Message ${i}`,
          ts: `1234567890.${String(i).padStart(6, "0")}`,
          bot_id: i % 2 === 1 ? "B9999999999" : undefined,
        });
      }
      slackClient.setThreadMessages(channelId, threadTs, messages);
      slackClient.setPageSize(100); // Simulate Slack's 100 message limit

      const managerWithSlack = new SessionManager(
        datastore,
        undefined,
        slackClient,
        messageCache,
      );

      // Act
      const session = await managerWithSlack.rebuildFromHistory(
        channelId,
        threadTs,
      );

      // Assert
      assertExists(session);
      const cachedMessages = messageCache.get(
        formatSessionId(channelId, threadTs),
      );
      assertEquals(
        cachedMessages.length,
        150,
        "Should have all 150 messages from paginated results",
      );
    });

    it("should populate MessageCache with all messages", async () => {
      // Arrange
      const channelId = "C1234567890";
      const threadTs = "1234567890.123456";
      const messages: SlackThreadMessage[] = [
        { user: "U1111111111", text: "@regent start", ts: "1234567890.123456" },
        {
          user: "B9999999999",
          text: "Question 1",
          ts: "1234567890.123457",
          bot_id: "B9999999999",
        },
        {
          user: "U1111111111",
          text: "@regent Answer 1",
          ts: "1234567890.123458",
        },
        {
          user: "B9999999999",
          text: "Question 2",
          ts: "1234567890.123459",
          bot_id: "B9999999999",
        },
        {
          user: "U1111111111",
          text: "@regent Answer 2",
          ts: "1234567890.123460",
        },
      ];
      slackClient.setThreadMessages(channelId, threadTs, messages);

      const managerWithSlack = new SessionManager(
        datastore,
        undefined,
        slackClient,
        messageCache,
      );

      // Act
      await managerWithSlack.rebuildFromHistory(channelId, threadTs);

      // Assert
      const cachedMessages = messageCache.get(
        formatSessionId(channelId, threadTs),
      );
      assertEquals(cachedMessages.length, 5);
      assertEquals(cachedMessages[0].text, "@regent start");
      assertEquals(cachedMessages[0].sender, "U1111111111");
      assertEquals(cachedMessages[1].text, "Question 1");
      assertEquals(cachedMessages[1].sender, "bot");
      assertEquals(cachedMessages[4].text, "@regent Answer 2");
    });

    it("should throw error when no @regent mention found in thread", async () => {
      // Arrange
      const channelId = "C1234567890";
      const threadTs = "1234567890.123456";
      const messages: SlackThreadMessage[] = [
        { user: "U1111111111", text: "Hello", ts: "1234567890.123456" },
        { user: "U2222222222", text: "Hi there", ts: "1234567890.123457" },
      ];
      slackClient.setThreadMessages(channelId, threadTs, messages);

      const managerWithSlack = new SessionManager(
        datastore,
        undefined,
        slackClient,
        messageCache,
      );

      // Act & Assert
      await assertRejects(
        () => managerWithSlack.rebuildFromHistory(channelId, threadTs),
        Error,
        "No @regent mention found",
      );
    });

    it("should throw error when thread is empty", async () => {
      // Arrange
      const channelId = "C1234567890";
      const threadTs = "1234567890.123456";
      slackClient.setThreadMessages(channelId, threadTs, []);

      const managerWithSlack = new SessionManager(
        datastore,
        undefined,
        slackClient,
        messageCache,
      );

      // Act & Assert
      await assertRejects(
        () => managerWithSlack.rebuildFromHistory(channelId, threadTs),
        Error,
        "Thread is empty",
      );
    });
  });

  describe("Property 6: Session Resumption Completeness", () => {
    let slackClient: MockSlackClient;
    let messageCache: MessageCache;

    beforeEach(() => {
      slackClient = new MockSlackClient();
      messageCache = new MessageCache();
    });

    afterEach(() => {
      slackClient.clear();
      messageCache.clear();
    });

    it("should rebuild complete conversation history after session expiration", async () => {
      // Arrange - Create a thread with existing conversation history
      const channelId = "C1234567890";
      const threadTs = "1234567890.123456";
      const conversationHistory: SlackThreadMessage[] = [
        { user: "U1111111111", text: "@regent start", ts: "1234567890.123456" },
        {
          user: "B9999999999",
          text: "What problem are you solving?",
          ts: "1234567890.123457",
          bot_id: "B9999999999",
        },
        {
          user: "U1111111111",
          text: "@regent Managing specifications",
          ts: "1234567890.123458",
        },
        {
          user: "B9999999999",
          text: "Who are the users?",
          ts: "1234567890.123459",
          bot_id: "B9999999999",
        },
        {
          user: "U1111111111",
          text: "@regent Developers and PMs",
          ts: "1234567890.123460",
        },
        {
          user: "B9999999999",
          text: "What is the scope?",
          ts: "1234567890.123461",
          bot_id: "B9999999999",
        },
        {
          user: "U2222222222",
          text: "Good question",
          ts: "1234567890.123462",
        },
        {
          user: "U1111111111",
          text: "@regent Team-level spec management",
          ts: "1234567890.123463",
        },
      ];
      slackClient.setThreadMessages(channelId, threadTs, conversationHistory);

      // Create initial session
      const initialTime = new Date("2025-01-01T00:00:00.000Z");
      const initialDatastore = new MockDatastoreClient(initialTime);
      const initialManager = new SessionManager(
        initialDatastore,
        () => initialTime,
        slackClient,
        messageCache,
      );

      const originalSession = await initialManager.createSession(
        channelId,
        threadTs,
        "owner/repo",
        "U1111111111",
      );
      assertExists(originalSession);

      // Fast-forward time past TTL (31 days) to simulate expiration
      const expiredTime = new Date("2025-02-02T00:00:00.000Z");
      initialDatastore.setCurrentTime(expiredTime);

      // Verify session is expired
      const expiredSession = await initialManager.loadSession(
        channelId,
        threadTs,
      );
      assertEquals(expiredSession, null, "Session should be expired");

      // Create new datastore and manager for rebuild (simulating new instance)
      const rebuildDatastore = new MockDatastoreClient(expiredTime);
      const rebuildCache = new MessageCache();
      const rebuildManager = new SessionManager(
        rebuildDatastore,
        () => expiredTime,
        slackClient,
        rebuildCache,
      );

      // Act - Rebuild session from history
      const rebuiltSession = await rebuildManager.rebuildFromHistory(
        channelId,
        threadTs,
      );

      // Assert - Complete history is rebuilt
      assertExists(rebuiltSession);
      assertEquals(
        rebuiltSession.initiator_user_id,
        "U1111111111",
        "Initiator should be detected from history",
      );

      const cachedMessages = rebuildCache.get(
        formatSessionId(channelId, threadTs),
      );
      assertEquals(
        cachedMessages.length,
        conversationHistory.length,
        "All messages should be in cache",
      );

      // Verify @regent messages are identified
      const regentMessages = cachedMessages.filter(
        (m) => m.text.includes("@regent"),
      );
      assertEquals(
        regentMessages.length,
        4,
        "Should have 4 @regent messages from users",
      );

      // Verify bot messages are identified
      const botMessages = cachedMessages.filter((m) => m.sender === "bot");
      assertEquals(botMessages.length, 3, "Should have 3 bot questions");

      // Verify discussion messages are preserved
      const discussionMessages = cachedMessages.filter(
        (m) => m.sender !== "bot" && !m.text.includes("@regent"),
      );
      assertEquals(
        discussionMessages.length,
        1,
        "Should have 1 discussion message",
      );
    });

    it("should correctly infer phase when rebuilding with Canvas", async () => {
      // Arrange - Thread with Canvas (review phase)
      const channelId = "C1234567890";
      const threadTs = "1234567890.123456";
      const canvasBlock = {
        type: "file",
        file_id: "F9876543210",
        source: "remote",
      };
      const conversationHistory: SlackThreadMessage[] = [
        { user: "U1111111111", text: "@regent start", ts: "1234567890.123456" },
        {
          user: "B9999999999",
          text: "Question 1",
          ts: "1234567890.123457",
          bot_id: "B9999999999",
        },
        {
          user: "U1111111111",
          text: "@regent Answer 1",
          ts: "1234567890.123458",
        },
        {
          user: "B9999999999",
          text: "Here is your spec Canvas for review",
          ts: "1234567890.123459",
          bot_id: "B9999999999",
          blocks: [canvasBlock],
        },
      ];
      slackClient.setThreadMessages(channelId, threadTs, conversationHistory);

      const now = new Date("2025-01-01T00:00:00.000Z");
      const managerWithSlack = new SessionManager(
        datastore,
        () => now,
        slackClient,
        messageCache,
      );

      // Act
      const session = await managerWithSlack.rebuildFromHistory(
        channelId,
        threadTs,
      );

      // Assert
      assertEquals(
        session.phase,
        Phase.Review,
        "Should be in Review phase when Canvas exists",
      );
      assertEquals(
        session.canvas_id,
        "F9876543210",
        "Canvas ID should be extracted",
      );
    });

    it("should preserve message ordering when rebuilding", async () => {
      // Arrange
      const channelId = "C1234567890";
      const threadTs = "1234567890.123456";
      const messages: SlackThreadMessage[] = [
        { user: "U1111111111", text: "@regent First", ts: "1234567890.000001" },
        { user: "U1111111111", text: "Second", ts: "1234567890.000002" },
        { user: "U1111111111", text: "Third", ts: "1234567890.000003" },
        { user: "U1111111111", text: "Fourth", ts: "1234567890.000004" },
      ];
      slackClient.setThreadMessages(channelId, threadTs, messages);

      const managerWithSlack = new SessionManager(
        datastore,
        undefined,
        slackClient,
        messageCache,
      );

      // Act
      await managerWithSlack.rebuildFromHistory(channelId, threadTs);

      // Assert
      const cachedMessages = messageCache.get(
        formatSessionId(channelId, threadTs),
      );
      assertEquals(cachedMessages[0].text, "@regent First");
      assertEquals(cachedMessages[1].text, "Second");
      assertEquals(cachedMessages[2].text, "Third");
      assertEquals(cachedMessages[3].text, "Fourth");
    });
  });

  describe("canPivotToContinue", () => {
    let mockEpicManager: MockEpicManager;

    beforeEach(() => {
      mockEpicManager = new MockEpicManager();
    });

    afterEach(() => {
      mockEpicManager.clear();
    });

    it("should detect pivot opportunity when session is Finalized with Epic but no requirements", async () => {
      // Arrange - Create and finalize a session with Epic
      const channelId = "C1234567890";
      const threadTs = "1234567890.123456";
      const session = await sessionManager.createSession(
        channelId,
        threadTs,
        "owner/repo",
        "U1234567890",
      );

      // Set up session as finalized with Epic and brainstorm
      session.phase = Phase.Finalized;
      session.epic_number = 42;
      session.epic_url = "https://github.com/owner/repo/issues/42";
      session.spec_comment_ids = { brainstorm: 100 };
      await sessionManager.updateSession(session);

      // Add brainstorm comment to Epic
      await mockEpicManager.addSpecComment(
        "owner",
        "repo",
        42,
        "brainstorm",
        "# Brainstorm content",
      );

      // Act
      const result = await sessionManager.canPivotToContinue(
        session,
        mockEpicManager,
      );

      // Assert
      assertEquals(result.canContinue, true);
      assertEquals(result.nextPhase, "requirements");
      assertEquals(result.currentSpec, "# Brainstorm content");
    });

    it("should detect pivot opportunity when session is Finalized with Epic but no design", async () => {
      // Arrange - Create and finalize a session with Epic and requirements
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

      // Add both brainstorm and requirements comments to Epic
      await mockEpicManager.addSpecComment(
        "owner",
        "repo",
        42,
        "brainstorm",
        "# Brainstorm content",
      );
      await mockEpicManager.addSpecComment(
        "owner",
        "repo",
        42,
        "requirements",
        "# Requirements content",
      );

      // Act
      const result = await sessionManager.canPivotToContinue(
        session,
        mockEpicManager,
      );

      // Assert
      assertEquals(result.canContinue, true);
      assertEquals(result.nextPhase, "design");
    });

    it("should not allow pivot when session is not Finalized", async () => {
      // Arrange - Create session in Questioning phase
      const channelId = "C1234567890";
      const threadTs = "1234567890.123456";
      const session = await sessionManager.createSession(
        channelId,
        threadTs,
        "owner/repo",
        "U1234567890",
      );

      // Act
      const result = await sessionManager.canPivotToContinue(
        session,
        mockEpicManager,
      );

      // Assert
      assertEquals(result.canContinue, false);
      assertEquals(result.reason, "Session is not finalized");
    });

    it("should not allow pivot when no Epic exists", async () => {
      // Arrange - Create finalized session without Epic
      const channelId = "C1234567890";
      const threadTs = "1234567890.123456";
      const session = await sessionManager.createSession(
        channelId,
        threadTs,
        "owner/repo",
        "U1234567890",
      );

      session.phase = Phase.Finalized;
      await sessionManager.updateSession(session);

      // Act
      const result = await sessionManager.canPivotToContinue(
        session,
        mockEpicManager,
      );

      // Assert
      assertEquals(result.canContinue, false);
      assertEquals(result.reason, "No Epic associated with session");
    });

    it("should not allow pivot when all spec phases are complete", async () => {
      // Arrange - Create finalized session with all spec phases complete
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
      await mockEpicManager.addSpecComment(
        "owner",
        "repo",
        42,
        "brainstorm",
        "# Brainstorm",
      );
      await mockEpicManager.addSpecComment(
        "owner",
        "repo",
        42,
        "requirements",
        "# Requirements",
      );
      await mockEpicManager.addSpecComment("owner", "repo", 42, "design", "# Design");

      // Act
      const result = await sessionManager.canPivotToContinue(
        session,
        mockEpicManager,
      );

      // Assert
      assertEquals(result.canContinue, false);
      assertEquals(result.reason, "All spec phases are complete");
    });

    it("should not allow pivot when session has no repository", async () => {
      // Arrange - Create finalized session without repository
      const channelId = "C1234567890";
      const threadTs = "1234567890.123456";
      const session = await sessionManager.createSession(
        channelId,
        threadTs,
        "", // Empty repository
        "U1234567890",
      );

      session.phase = Phase.Finalized;
      session.epic_number = 42;
      await sessionManager.updateSession(session);

      // Act
      const result = await sessionManager.canPivotToContinue(
        session,
        mockEpicManager,
      );

      // Assert
      assertEquals(result.canContinue, false);
      assertEquals(result.reason, "No Epic associated with session");
    });

    it("should not allow pivot when repository format is malformed", async () => {
      // Arrange - Create finalized session with malformed repository
      const channelId = "C1234567890";
      const threadTs = "1234567890.123456";
      const session = await sessionManager.createSession(
        channelId,
        threadTs,
        "invalid-repo-format", // No slash separator
        "U1234567890",
      );

      session.phase = Phase.Finalized;
      session.epic_number = 42;
      session.epic_url = "https://github.com/invalid/issues/42";
      session.spec_comment_ids = { brainstorm: 100 };
      await sessionManager.updateSession(session);

      // Act
      const result = await sessionManager.canPivotToContinue(
        session,
        mockEpicManager,
      );

      // Assert
      assertEquals(result.canContinue, false);
      assertEquals(
        result.reason?.includes("Invalid repository format"),
        true,
        "Reason should mention invalid repository format",
      );
    });

    it("should not allow pivot when repository has empty owner or repo", async () => {
      // Arrange - Create finalized session with malformed repository (empty parts)
      const channelId = "C1234567890";
      const threadTs = "1234567890.123456";
      const session = await sessionManager.createSession(
        channelId,
        threadTs,
        "/repo", // Empty owner
        "U1234567890",
      );

      session.phase = Phase.Finalized;
      session.epic_number = 42;
      session.epic_url = "https://github.com/invalid/issues/42";
      session.spec_comment_ids = { brainstorm: 100 };
      await sessionManager.updateSession(session);

      // Act
      const result = await sessionManager.canPivotToContinue(
        session,
        mockEpicManager,
      );

      // Assert
      assertEquals(result.canContinue, false);
      assertEquals(
        result.reason?.includes("Invalid repository format"),
        true,
        "Reason should mention invalid repository format",
      );
    });

    it("should return requirements content as currentSpec when pivoting to design phase", async () => {
      // Arrange - Create and finalize a session with Epic and requirements
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

      // Add both brainstorm and requirements comments to Epic
      await mockEpicManager.addSpecComment(
        "owner",
        "repo",
        42,
        "brainstorm",
        "# Brainstorm content",
      );
      await mockEpicManager.addSpecComment(
        "owner",
        "repo",
        42,
        "requirements",
        "# Requirements content\n\nThis is the requirements spec.",
      );

      // Act
      const result = await sessionManager.canPivotToContinue(
        session,
        mockEpicManager,
      );

      // Assert
      assertEquals(result.canContinue, true);
      assertEquals(result.nextPhase, "design");
      assertEquals(
        result.currentSpec,
        "# Requirements content\n\nThis is the requirements spec.",
        "currentSpec should contain requirements content for design phase",
      );
    });
  });

  describe("resumeSession", () => {
    it("should resume session by transitioning back to Questioning phase", async () => {
      // Arrange - Create and finalize a session
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

      // Act
      const resumedSession = await sessionManager.resumeSession(session);

      // Assert
      assertEquals(resumedSession.phase, Phase.Questioning);
      assertEquals(resumedSession.epic_number, 42);
      assertEquals(resumedSession.epic_url, "https://github.com/owner/repo/issues/42");
      assertEquals(resumedSession.spec_comment_ids?.brainstorm, 100);
    });

    it("should preserve all Epic fields when resuming", async () => {
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

      // Act
      const resumedSession = await sessionManager.resumeSession(session);

      // Assert - All Epic fields preserved
      assertEquals(resumedSession.epic_number, 42);
      assertEquals(resumedSession.epic_url, "https://github.com/owner/repo/issues/42");
      assertEquals(resumedSession.spec_comment_ids?.brainstorm, 100);
      assertEquals(resumedSession.spec_comment_ids?.requirements, 101);
      assertEquals(resumedSession.repository, "owner/repo");
    });

    it("should persist resumed session to datastore", async () => {
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
      await sessionManager.updateSession(session);

      // Act
      await sessionManager.resumeSession(session);

      // Assert - Load from datastore to verify persistence
      const loadedSession = await sessionManager.loadSession(channelId, threadTs);
      assertEquals(loadedSession?.phase, Phase.Questioning);
      assertEquals(loadedSession?.epic_number, 42);
    });
  });
});
