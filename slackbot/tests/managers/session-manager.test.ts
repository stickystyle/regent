// ABOUTME: Tests for SessionManager covering session lifecycle and Slack Datastore integration.
// ABOUTME: Includes property test for Property 9 - TTL Enforcement (30 days from creation).

import { assertEquals, assertExists, assertRejects } from "@std/assert";
import { afterEach, beforeEach, describe, it } from "@std/testing/bdd";
import { MockDatastoreClient } from "../../src/managers/datastore-client.ts";
import { SessionManager } from "../../src/managers/session-manager.ts";
import { Phase } from "../../src/types/session.ts";

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
});
