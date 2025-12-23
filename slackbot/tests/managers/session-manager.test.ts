// ABOUTME: Tests for SessionManager covering session lifecycle and Slack Datastore integration.
// ABOUTME: Includes property tests for Property 6 (Session Resumption) and Property 9 (TTL Enforcement).

import { assertEquals, assertExists, assertRejects } from "@std/assert";
import { afterEach, beforeEach, describe, it } from "@std/testing/bdd";
import { MockSlackClient, type SlackThreadMessage } from "../../src/clients/slack-client.ts";
import { MockDatastoreClient } from "../../src/managers/datastore-client.ts";
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
});
