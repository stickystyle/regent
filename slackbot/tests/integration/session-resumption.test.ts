// ABOUTME: Integration tests for session expiration and rebuild from history.
// ABOUTME: Tests TTL enforcement, history reconstruction, and phase inference.

import { assertEquals, assertExists } from "@std/assert";
import { afterEach, beforeEach, describe, it } from "@std/testing/bdd";

import { MockSlackClient, type SlackThreadMessage } from "../../src/clients/slack-client.ts";
import { MockDatastoreClient } from "../../src/managers/datastore-client.ts";
import { MessageCache } from "../../src/managers/message-cache.ts";
import { SessionManager } from "../../src/managers/session-manager.ts";
import { formatSessionId, Phase, type Session } from "../../src/types/session.ts";

describe("Session Resumption Integration", () => {
  let datastoreClient: MockDatastoreClient;
  let sessionManager: SessionManager;
  let slackClient: MockSlackClient;
  let messageCache: MessageCache;
  let currentTime: Date;

  const channelId = "C1234567890";
  const threadTs = "1234567890.123456";
  const userId = "U1111111111";
  const sessionId = formatSessionId(channelId, threadTs);
  const TEST_CANVAS_ID = "F1234567890";

  /**
   * Helper function to set the current time for both datastore and session manager.
   */
  function setTime(time: Date): void {
    currentTime = time;
    datastoreClient.setCurrentTime(time);
  }

  beforeEach(() => {
    currentTime = new Date();
    datastoreClient = new MockDatastoreClient(currentTime);
    slackClient = new MockSlackClient();
    messageCache = new MessageCache();
    sessionManager = new SessionManager(
      datastoreClient,
      () => currentTime,
      slackClient,
      messageCache,
    );
  });

  afterEach(() => {
    datastoreClient.clear();
    slackClient.clear();
    messageCache.clear();
  });

  /**
   * Helper to create a valid session for testing.
   */
  function createValidSession(overrides: Partial<Session> = {}): Session {
    return {
      session_id: sessionId,
      phase: Phase.Questioning,
      repository: "owner/repo",
      initiator_user_id: userId,
      confidence_score: 50,
      created_at: new Date().toISOString(),
      ttl: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      ...overrides,
    };
  }

  /**
   * Helper to create thread messages for history reconstruction.
   */
  function createThreadMessages(messages: Array<{
    text: string;
    isBot?: boolean;
    hasCanvas?: boolean;
  }>): SlackThreadMessage[] {
    return messages.map((msg, i) => ({
      user: msg.isBot ? "B9999999999" : userId,
      text: msg.text,
      ts: `1234567890.${String(i + 1).padStart(6, "0")}`,
      bot_id: msg.isBot ? "B9999999999" : undefined,
      blocks: msg.hasCanvas
        ? [{ type: "file", file_id: TEST_CANVAS_ID, source: "remote" }]
        : undefined,
    }));
  }

  describe("session expiration (TTL enforcement)", () => {
    it("should return null for session after TTL expires", async () => {
      // Create session at a known time
      const createdTime = new Date("2025-01-01T00:00:00.000Z");
      setTime(createdTime);

      const session = await sessionManager.createSession(
        channelId,
        threadTs,
        "owner/repo",
        userId,
      );
      assertExists(session);

      // Verify session exists before TTL
      let loaded = await sessionManager.loadSession(channelId, threadTs);
      assertExists(loaded);

      // Fast-forward past TTL (31 days)
      const expiredTime = new Date("2025-02-02T00:00:00.000Z");
      setTime(expiredTime);

      // Session should be null after TTL
      loaded = await sessionManager.loadSession(channelId, threadTs);
      assertEquals(loaded, null, "Session should be null after TTL expiration");
    });

    it("should return session when within TTL window", async () => {
      const createdTime = new Date("2025-01-01T00:00:00.000Z");
      setTime(createdTime);

      await sessionManager.createSession(
        channelId,
        threadTs,
        "owner/repo",
        userId,
      );

      // Fast-forward 29 days (within TTL)
      const withinTTL = new Date("2025-01-30T00:00:00.000Z");
      setTime(withinTTL);

      const loaded = await sessionManager.loadSession(channelId, threadTs);
      assertExists(loaded, "Session should exist within TTL window");
    });

    it("should handle TTL boundary exactly at 30 days", async () => {
      const createdTime = new Date("2025-01-01T12:00:00.000Z");
      setTime(createdTime);

      const session = await sessionManager.createSession(
        channelId,
        threadTs,
        "owner/repo",
        userId,
      );

      // Verify TTL is exactly 30 days from creation
      const ttl = new Date(session.ttl);
      const expectedTTL = new Date("2025-01-31T12:00:00.000Z");
      assertEquals(ttl.toISOString(), expectedTTL.toISOString());

      // Just before TTL (29 days, 23 hours, 59 minutes)
      const justBefore = new Date("2025-01-31T11:59:00.000Z");
      setTime(justBefore);
      let loaded = await sessionManager.loadSession(channelId, threadTs);
      assertExists(loaded, "Session should exist just before TTL");

      // Just after TTL (30 days, 1 second)
      const justAfter = new Date("2025-01-31T12:00:01.000Z");
      setTime(justAfter);
      loaded = await sessionManager.loadSession(channelId, threadTs);
      assertEquals(loaded, null, "Session should be null just after TTL");
    });
  });

  describe("rebuild from history (rebuildFromHistory)", () => {
    it("should rebuild session from thread messages", async () => {
      const messages = createThreadMessages([
        { text: "@regent Let's brainstorm a feature" },
        { text: "What problem are you solving?", isBot: true },
        { text: "@regent We need better search" },
        { text: "Who are the primary users?", isBot: true },
        { text: "@regent Developers and product managers" },
      ]);
      slackClient.setThreadMessages(channelId, threadTs, messages);

      const session = await sessionManager.rebuildFromHistory(channelId, threadTs);

      assertExists(session);
      assertEquals(session.session_id, sessionId);
      assertEquals(session.initiator_user_id, userId);
    });

    it("should detect initiator from first @regent mention", async () => {
      const messages: SlackThreadMessage[] = [
        { user: "U0000000000", text: "Random comment", ts: "1234567890.000001" },
        { user: userId, text: "@regent start brainstorm", ts: "1234567890.000002" },
        { user: "U2222222222", text: "@regent me too", ts: "1234567890.000003" },
      ];
      slackClient.setThreadMessages(channelId, threadTs, messages);

      const session = await sessionManager.rebuildFromHistory(channelId, threadTs);

      assertExists(session);
      assertEquals(session.initiator_user_id, userId);
    });

    it("should populate MessageCache with all messages", async () => {
      const messages = createThreadMessages([
        { text: "@regent start" },
        { text: "Question 1?", isBot: true },
        { text: "@regent Answer 1" },
        { text: "Question 2?", isBot: true },
        { text: "@regent Answer 2" },
        { text: "Question 3?", isBot: true },
      ]);
      slackClient.setThreadMessages(channelId, threadTs, messages);

      await sessionManager.rebuildFromHistory(channelId, threadTs);

      const cached = messageCache.get(sessionId);
      assertEquals(cached.length, 6, "All 6 messages should be cached");
    });

    it("should preserve message ordering in cache", async () => {
      const messages = createThreadMessages([
        { text: "@regent First" },
        { text: "Second response", isBot: true },
        { text: "@regent Third" },
        { text: "Fourth response", isBot: true },
      ]);
      slackClient.setThreadMessages(channelId, threadTs, messages);

      await sessionManager.rebuildFromHistory(channelId, threadTs);

      const cached = messageCache.get(sessionId);
      assertEquals(cached[0].text, "@regent First");
      assertEquals(cached[1].text, "Second response");
      assertEquals(cached[2].text, "@regent Third");
      assertEquals(cached[3].text, "Fourth response");
    });
  });

  describe("phase inference during rebuild", () => {
    it("should infer Questioning phase when no Canvas found", async () => {
      const messages = createThreadMessages([
        { text: "@regent start" },
        { text: "What is your goal?", isBot: true },
        { text: "@regent Building an API" },
      ]);
      slackClient.setThreadMessages(channelId, threadTs, messages);

      const session = await sessionManager.rebuildFromHistory(channelId, threadTs);

      assertExists(session);
      assertEquals(session.phase, Phase.Questioning);
      assertEquals(session.canvas_id, undefined);
    });

    it("should infer Review phase when Canvas message exists", async () => {
      const messages = createThreadMessages([
        { text: "@regent start" },
        { text: "Question?", isBot: true },
        { text: "@regent Answer" },
        { text: "Here is your spec Canvas", isBot: true, hasCanvas: true },
      ]);
      slackClient.setThreadMessages(channelId, threadTs, messages);

      const session = await sessionManager.rebuildFromHistory(channelId, threadTs);

      assertExists(session);
      assertEquals(session.phase, Phase.Review);
      assertEquals(session.canvas_id, TEST_CANVAS_ID);
    });

    it("should extract Canvas ID from message blocks", async () => {
      const messagesWithCanvas: SlackThreadMessage[] = [
        { user: userId, text: "@regent start", ts: "1234567890.000001" },
        {
          user: "B9999999999",
          text: "Spec ready for review",
          ts: "1234567890.000002",
          bot_id: "B9999999999",
          blocks: [{ type: "file", file_id: "F9876543210", source: "remote" }],
        },
      ];
      slackClient.setThreadMessages(channelId, threadTs, messagesWithCanvas);

      const session = await sessionManager.rebuildFromHistory(channelId, threadTs);

      assertExists(session);
      assertEquals(session.canvas_id, "F9876543210");
    });
  });

  describe("continue conversation after rebuild", () => {
    it("should allow session updates after rebuild", async () => {
      const messages = createThreadMessages([
        { text: "@regent start" },
        { text: "What problem?", isBot: true },
        { text: "@regent Search is slow" },
      ]);
      slackClient.setThreadMessages(channelId, threadTs, messages);

      const session = await sessionManager.rebuildFromHistory(channelId, threadTs);
      assertExists(session);

      // Update confidence score (simulating continued Q&A)
      session.confidence_score = 50;
      await sessionManager.updateSession(session);

      // Verify update persisted
      const loaded = await sessionManager.loadSession(channelId, threadTs);
      assertExists(loaded);
      assertEquals(loaded.confidence_score, 50);
    });

    it("should allow phase transition after rebuild", async () => {
      const messages = createThreadMessages([
        { text: "@regent start" },
        { text: "Question?", isBot: true },
        { text: "@regent Answer" },
      ]);
      slackClient.setThreadMessages(channelId, threadTs, messages);

      const session = await sessionManager.rebuildFromHistory(channelId, threadTs);
      assertExists(session);
      assertEquals(session.phase, Phase.Questioning);

      // Transition to Review
      session.phase = Phase.Review;
      session.canvas_id = "F_NEW_CANVAS";
      await sessionManager.updateSession(session);

      const loaded = await sessionManager.loadSession(channelId, threadTs);
      assertExists(loaded);
      assertEquals(loaded.phase, Phase.Review);
      assertEquals(loaded.canvas_id, "F_NEW_CANVAS");
    });
  });

  describe("pagination handling", () => {
    it("should handle threads with 100+ messages using pagination", async () => {
      // Create 150 messages
      const messages: SlackThreadMessage[] = [
        { user: userId, text: "@regent start", ts: "1234567890.000000" },
      ];
      for (let i = 1; i < 150; i++) {
        messages.push({
          user: i % 2 === 0 ? userId : "B9999999999",
          text: `Message ${i}`,
          ts: `1234567890.${String(i).padStart(6, "0")}`,
          bot_id: i % 2 === 1 ? "B9999999999" : undefined,
        });
      }
      slackClient.setThreadMessages(channelId, threadTs, messages);
      slackClient.setPageSize(100); // Simulate Slack's 100 message limit

      const session = await sessionManager.rebuildFromHistory(channelId, threadTs);

      assertExists(session);

      // All messages should be in cache
      const cached = messageCache.get(sessionId);
      assertEquals(cached.length, 150, "All 150 messages should be fetched via pagination");
    });
  });

  describe("error handling during rebuild", () => {
    it("should throw error when no @regent mention found in thread", async () => {
      const messages: SlackThreadMessage[] = [
        { user: userId, text: "Hello", ts: "1234567890.000001" },
        { user: "U2222222222", text: "Hi there", ts: "1234567890.000002" },
      ];
      slackClient.setThreadMessages(channelId, threadTs, messages);

      let error: Error | undefined;
      try {
        await sessionManager.rebuildFromHistory(channelId, threadTs);
      } catch (e) {
        error = e as Error;
      }

      assertExists(error);
      assertEquals(error.message.includes("@regent"), true);
    });

    it("should throw error when thread is empty", async () => {
      slackClient.setThreadMessages(channelId, threadTs, []);

      let error: Error | undefined;
      try {
        await sessionManager.rebuildFromHistory(channelId, threadTs);
      } catch (e) {
        error = e as Error;
      }

      assertExists(error);
      assertEquals(error.message.includes("empty"), true);
    });

    it("should throw error when SlackClient is not configured", async () => {
      const managerWithoutSlack = new SessionManager(datastoreClient);

      let error: Error | undefined;
      try {
        await managerWithoutSlack.rebuildFromHistory(channelId, threadTs);
      } catch (e) {
        error = e as Error;
      }

      assertExists(error);
      assertEquals(error.message.includes("SlackClient"), true);
    });
  });

  describe("complete resumption workflow", () => {
    it("should complete full expire -> rebuild -> continue flow", async () => {
      // Step 1: Create initial session
      const createdTime = new Date("2025-01-01T00:00:00.000Z");
      setTime(createdTime);

      const initialSession = await sessionManager.createSession(
        channelId,
        threadTs,
        "owner/repo",
        userId,
      );
      assertExists(initialSession);

      // Step 2: Simulate some conversation progress
      initialSession.confidence_score = 60;
      await sessionManager.updateSession(initialSession);

      // Step 3: Advance time past TTL
      const expiredTime = new Date("2025-02-02T00:00:00.000Z");
      setTime(expiredTime);

      // Step 4: Verify session is expired
      const expiredSession = await sessionManager.loadSession(channelId, threadTs);
      assertEquals(expiredSession, null, "Session should be expired");

      // Step 5: Set up thread messages for rebuild
      const threadMessages = createThreadMessages([
        { text: "@regent Let's continue" },
        { text: "What was your last answer about?", isBot: true },
        { text: "@regent We discussed the search feature" },
        { text: "Great, what's the next priority?", isBot: true },
      ]);
      slackClient.setThreadMessages(channelId, threadTs, threadMessages);

      // Step 6: Rebuild session
      const rebuiltSession = await sessionManager.rebuildFromHistory(channelId, threadTs);

      assertExists(rebuiltSession);
      assertEquals(rebuiltSession.phase, Phase.Questioning);
      assertEquals(rebuiltSession.initiator_user_id, userId);

      // Step 7: Continue conversation with rebuilt session
      rebuiltSession.confidence_score = 70;
      await sessionManager.updateSession(rebuiltSession);

      const continuedSession = await sessionManager.loadSession(channelId, threadTs);
      assertExists(continuedSession);
      assertEquals(continuedSession.confidence_score, 70);
    });

    it("should restore Review phase with Canvas after rebuild", async () => {
      // Create initial session that had reached Review phase
      const createdTime = new Date("2025-01-01T00:00:00.000Z");
      setTime(createdTime);

      await sessionManager.createSession(
        channelId,
        threadTs,
        "owner/repo",
        userId,
      );

      // Expire the session
      const expiredTime = new Date("2025-02-02T00:00:00.000Z");
      setTime(expiredTime);

      // Thread with Canvas message
      const threadMessages = createThreadMessages([
        { text: "@regent start feature" },
        { text: "Several questions...", isBot: true },
        { text: "@regent All answered" },
        { text: "Here is your spec Canvas for review", isBot: true, hasCanvas: true },
      ]);
      slackClient.setThreadMessages(channelId, threadTs, threadMessages);

      // Rebuild should detect Review phase
      const rebuiltSession = await sessionManager.rebuildFromHistory(channelId, threadTs);

      assertExists(rebuiltSession);
      assertEquals(rebuiltSession.phase, Phase.Review);
      assertEquals(rebuiltSession.canvas_id, TEST_CANVAS_ID);
    });
  });
});
