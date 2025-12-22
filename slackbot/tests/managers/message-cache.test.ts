// ABOUTME: Tests for MessageCache covering in-memory message storage and eviction.
// ABOUTME: Validates cache operations for session message history during active sessions.

import { assertEquals, assertExists } from "@std/assert";
import { afterEach, beforeEach, describe, it } from "@std/testing/bdd";
import { MessageCache } from "../../src/managers/message-cache.ts";
import type { Message } from "../../src/types/message.ts";

describe("MessageCache", () => {
  let cache: MessageCache;

  beforeEach(() => {
    cache = new MessageCache();
  });

  afterEach(() => {
    cache.clear();
  });

  describe("get", () => {
    it("should return empty array for non-existent session", () => {
      const messages = cache.get("non-existent-session");
      assertEquals(messages, []);
    });

    it("should return cached messages for session", () => {
      const sessionId = "C1234567890:1234567890.123456";
      const message: Message = {
        sender: "U1234567890",
        text: "Hello",
        timestamp: "1234567890.123456",
      };

      cache.append(sessionId, message);
      const messages = cache.get(sessionId);

      assertEquals(messages.length, 1);
      assertEquals(messages[0].text, "Hello");
    });

    it("should return messages in order of insertion", () => {
      const sessionId = "C1234567890:1234567890.123456";
      const message1: Message = {
        sender: "U1234567890",
        text: "First",
        timestamp: "1234567890.123456",
      };
      const message2: Message = {
        sender: "bot",
        text: "Second",
        timestamp: "1234567890.123457",
      };
      const message3: Message = {
        sender: "U1234567890",
        text: "Third",
        timestamp: "1234567890.123458",
      };

      cache.append(sessionId, message1);
      cache.append(sessionId, message2);
      cache.append(sessionId, message3);
      const messages = cache.get(sessionId);

      assertEquals(messages.length, 3);
      assertEquals(messages[0].text, "First");
      assertEquals(messages[1].text, "Second");
      assertEquals(messages[2].text, "Third");
    });
  });

  describe("append", () => {
    it("should add message to empty cache", () => {
      const sessionId = "C1234567890:1234567890.123456";
      const message: Message = {
        sender: "U1234567890",
        text: "Hello",
        timestamp: "1234567890.123456",
      };

      cache.append(sessionId, message);
      const messages = cache.get(sessionId);

      assertEquals(messages.length, 1);
    });

    it("should add message to existing cache", () => {
      const sessionId = "C1234567890:1234567890.123456";
      const message1: Message = {
        sender: "U1234567890",
        text: "First",
        timestamp: "1234567890.123456",
      };
      const message2: Message = {
        sender: "bot",
        text: "Second",
        timestamp: "1234567890.123457",
      };

      cache.append(sessionId, message1);
      cache.append(sessionId, message2);
      const messages = cache.get(sessionId);

      assertEquals(messages.length, 2);
    });

    it("should preserve message fields", () => {
      const sessionId = "C1234567890:1234567890.123456";
      const message: Message = {
        sender: "U1234567890",
        text: "@regent This is my answer",
        timestamp: "1234567890.123456",
        attachments: [
          {
            file_id: "F1234567890",
            filename: "spec.md",
            mimetype: "text/markdown",
            content: "# Spec",
          },
        ],
      };

      cache.append(sessionId, message);
      const messages = cache.get(sessionId);

      assertEquals(messages[0].sender, "U1234567890");
      assertEquals(messages[0].text, "@regent This is my answer");
      assertEquals(messages[0].timestamp, "1234567890.123456");
      assertExists(messages[0].attachments);
      assertEquals(messages[0].attachments!.length, 1);
      assertEquals(messages[0].attachments![0].file_id, "F1234567890");
    });

    it("should handle multiple sessions independently", () => {
      const sessionId1 = "C1111111111:1111111111.111111";
      const sessionId2 = "C2222222222:2222222222.222222";
      const message1: Message = {
        sender: "U1234567890",
        text: "Session 1 message",
        timestamp: "1234567890.123456",
      };
      const message2: Message = {
        sender: "U9876543210",
        text: "Session 2 message",
        timestamp: "9876543210.654321",
      };

      cache.append(sessionId1, message1);
      cache.append(sessionId2, message2);

      const messages1 = cache.get(sessionId1);
      const messages2 = cache.get(sessionId2);

      assertEquals(messages1.length, 1);
      assertEquals(messages1[0].text, "Session 1 message");
      assertEquals(messages2.length, 1);
      assertEquals(messages2[0].text, "Session 2 message");
    });
  });

  describe("evict", () => {
    it("should remove all messages for a session", () => {
      const sessionId = "C1234567890:1234567890.123456";
      const message: Message = {
        sender: "U1234567890",
        text: "Hello",
        timestamp: "1234567890.123456",
      };

      cache.append(sessionId, message);
      cache.evict(sessionId);
      const messages = cache.get(sessionId);

      assertEquals(messages, []);
    });

    it("should not affect other sessions", () => {
      const sessionId1 = "C1111111111:1111111111.111111";
      const sessionId2 = "C2222222222:2222222222.222222";
      const message1: Message = {
        sender: "U1234567890",
        text: "Session 1",
        timestamp: "1234567890.123456",
      };
      const message2: Message = {
        sender: "U1234567890",
        text: "Session 2",
        timestamp: "1234567890.123456",
      };

      cache.append(sessionId1, message1);
      cache.append(sessionId2, message2);
      cache.evict(sessionId1);

      assertEquals(cache.get(sessionId1), []);
      assertEquals(cache.get(sessionId2).length, 1);
    });

    it("should be safe to call on non-existent session", () => {
      // Should not throw
      cache.evict("non-existent-session");
      assertEquals(cache.get("non-existent-session"), []);
    });
  });

  describe("clear", () => {
    it("should remove all sessions from cache", () => {
      const sessionId1 = "C1111111111:1111111111.111111";
      const sessionId2 = "C2222222222:2222222222.222222";
      const message: Message = {
        sender: "U1234567890",
        text: "Hello",
        timestamp: "1234567890.123456",
      };

      cache.append(sessionId1, message);
      cache.append(sessionId2, message);
      cache.clear();

      assertEquals(cache.get(sessionId1), []);
      assertEquals(cache.get(sessionId2), []);
    });
  });
});
