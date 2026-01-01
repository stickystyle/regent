// ABOUTME: Tests for message event handler covering event filtering, mention parsing, and answer recording.
// ABOUTME: Follows TDD approach to ensure message event handling works correctly.

import { assertEquals, assertThrows } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import { ValidationError } from "../../src/errors/types.ts";
import {
  handleMessageEvent,
  isMentionCommand,
  parseMessageEvent,
} from "../../src/handlers/message-event.ts";
import type { SlackMessageEventInput } from "../../src/handlers/message-event.ts";

describe("parseMessageEvent", () => {
  describe("event type detection", () => {
    it("should parse app_mention event", () => {
      const input: SlackMessageEventInput = {
        type: "app_mention",
        user: "U1234567890",
        text: "<@U0BOTID> answer to question",
        ts: "1234567890.123456",
        channel: "C1234567890",
        thread_ts: "1234567890.123456",
      };

      const result = parseMessageEvent(input);

      assertEquals(result.eventType, "app_mention");
      assertEquals(result.userId, "U1234567890");
      assertEquals(result.text, "<@U0BOTID> answer to question");
      assertEquals(result.timestamp, "1234567890.123456");
      assertEquals(result.channelId, "C1234567890");
      assertEquals(result.threadTs, "1234567890.123456");
    });

    it("should parse regular message event", () => {
      const input: SlackMessageEventInput = {
        type: "message",
        user: "U1234567890",
        text: "just a comment",
        ts: "1234567890.123456",
        channel: "C1234567890",
        thread_ts: "1234567880.123456",
      };

      const result = parseMessageEvent(input);

      assertEquals(result.eventType, "message");
      assertEquals(result.userId, "U1234567890");
      assertEquals(result.text, "just a comment");
      assertEquals(result.threadTs, "1234567880.123456");
    });

    it("should detect thread vs channel root", () => {
      const inputThread: SlackMessageEventInput = {
        type: "message",
        user: "U1234567890",
        text: "thread message",
        ts: "1234567890.123456",
        channel: "C1234567890",
        thread_ts: "1234567880.123456",
      };

      const resultThread = parseMessageEvent(inputThread);
      assertEquals(resultThread.isInThread, true);

      const inputRoot: SlackMessageEventInput = {
        type: "message",
        user: "U1234567890",
        text: "channel message",
        ts: "1234567890.123456",
        channel: "C1234567890",
      };

      const resultRoot = parseMessageEvent(inputRoot);
      assertEquals(resultRoot.isInThread, false);
    });

    it("should handle message with no thread_ts", () => {
      const input: SlackMessageEventInput = {
        type: "message",
        user: "U1234567890",
        text: "channel root message",
        ts: "1234567890.123456",
        channel: "C1234567890",
      };

      const result = parseMessageEvent(input);

      assertEquals(result.isInThread, false);
      assertEquals(result.threadTs, undefined);
    });
  });

  describe("bot message filtering", () => {
    it("should handle bot messages", () => {
      const input: SlackMessageEventInput = {
        type: "message",
        bot_id: "B1234567890",
        text: "bot message",
        ts: "1234567890.123456",
        channel: "C1234567890",
      };

      const result = parseMessageEvent(input);

      assertEquals(result.isBot, true);
      assertEquals(result.userId, undefined);
    });

    it("should handle user messages", () => {
      const input: SlackMessageEventInput = {
        type: "message",
        user: "U1234567890",
        text: "user message",
        ts: "1234567890.123456",
        channel: "C1234567890",
      };

      const result = parseMessageEvent(input);

      assertEquals(result.isBot, false);
      assertEquals(result.userId, "U1234567890");
    });
  });
});

describe("isMentionCommand", () => {
  describe("@regent prefix detection", () => {
    it("should detect @regent mention", () => {
      assertEquals(isMentionCommand("@regent answer text"), true);
    });

    it("should detect @regent with no text after", () => {
      assertEquals(isMentionCommand("@regent"), true);
    });

    it("should handle text with bot mention tag", () => {
      assertEquals(isMentionCommand("<@U0BOTID> @regent answer"), true);
    });

    it("should reject message without @regent", () => {
      assertEquals(isMentionCommand("just a comment"), false);
    });

    it("should reject @regent not at start", () => {
      assertEquals(isMentionCommand("I'll use @regent here"), false);
    });

    it("should handle leading whitespace", () => {
      assertEquals(isMentionCommand("  @regent answer"), false);
    });

    it("should detect @regent after bot mention tag", () => {
      assertEquals(isMentionCommand("<@U0BOTID> @regent next"), true);
    });
  });
});

describe("handleMessageEvent", () => {
  describe("event routing", () => {
    it("should handle app_mention event in thread", () => {
      const input: SlackMessageEventInput = {
        type: "app_mention",
        user: "U1234567890",
        text: "<@U0BOTID> @regent This is my answer",
        ts: "1234567890.123456",
        channel: "C1234567890",
        thread_ts: "1234567880.123456",
      };

      const result = handleMessageEvent(input);

      assertEquals(result.shouldRespond, true);
      assertEquals(result.message?.text, "<@U0BOTID> @regent This is my answer");
    });

    it("should handle message event without @regent", () => {
      const input: SlackMessageEventInput = {
        type: "message",
        user: "U1234567890",
        text: "just a comment for context",
        ts: "1234567890.123456",
        channel: "C1234567890",
        thread_ts: "1234567880.123456",
      };

      const result = handleMessageEvent(input);

      assertEquals(result.shouldRespond, false);
      assertEquals(result.message?.text, "just a comment for context");
    });

    it("should ignore bot messages", () => {
      const input: SlackMessageEventInput = {
        type: "message",
        bot_id: "B1234567890",
        text: "bot message",
        ts: "1234567890.123456",
        channel: "C1234567890",
        thread_ts: "1234567880.123456",
      };

      const result = handleMessageEvent(input);

      assertEquals(result.shouldRespond, false);
      assertEquals(result.message, undefined);
    });

    it("should pass any @regent message to LLM for processing", () => {
      const input: SlackMessageEventInput = {
        type: "app_mention",
        user: "U1234567890",
        text: "<@U0BOTID> @regent we're done here",
        ts: "1234567890.123456",
        channel: "C1234567890",
        thread_ts: "1234567880.123456",
      };

      const result = handleMessageEvent(input);

      assertEquals(result.shouldRespond, true);
      assertEquals(result.message?.text, "<@U0BOTID> @regent we're done here");
    });

    it("should pass @regent with any content for LLM understanding", () => {
      const input: SlackMessageEventInput = {
        type: "app_mention",
        user: "U1234567890",
        text: "<@U0BOTID> @regent looks good to me",
        ts: "1234567890.123456",
        channel: "C1234567890",
        thread_ts: "1234567880.123456",
      };

      const result = handleMessageEvent(input);

      assertEquals(result.shouldRespond, true);
      assertEquals(result.message?.text, "<@U0BOTID> @regent looks good to me");
    });
  });

  describe("message storage", () => {
    it("should create Message object with correct fields for @regent message", () => {
      const input: SlackMessageEventInput = {
        type: "app_mention",
        user: "U1234567890",
        text: "<@U0BOTID> @regent My answer text",
        ts: "1234567890.123456",
        channel: "C1234567890",
        thread_ts: "1234567880.123456",
      };

      const result = handleMessageEvent(input);

      assertEquals(result.message?.sender, "U1234567890");
      assertEquals(result.message?.text, "<@U0BOTID> @regent My answer text");
      assertEquals(result.message?.timestamp, "1234567890.123456");
    });

    it("should create Message object for context message", () => {
      const input: SlackMessageEventInput = {
        type: "message",
        user: "U1234567890",
        text: "just a comment",
        ts: "1234567890.123456",
        channel: "C1234567890",
        thread_ts: "1234567880.123456",
      };

      const result = handleMessageEvent(input);

      assertEquals(result.message?.sender, "U1234567890");
      assertEquals(result.message?.text, "just a comment");
      assertEquals(result.message?.timestamp, "1234567890.123456");
    });
  });

  describe("validation", () => {
    it("should throw ValidationError for message without thread_ts", () => {
      const input: SlackMessageEventInput = {
        type: "message",
        user: "U1234567890",
        text: "channel root message",
        ts: "1234567890.123456",
        channel: "C1234567890",
      };

      assertThrows(
        () => handleMessageEvent(input),
        ValidationError,
        "must be in a thread",
      );
    });

    it("should throw ValidationError for message without user or bot_id", () => {
      const input: SlackMessageEventInput = {
        type: "message",
        text: "message with no sender",
        ts: "1234567890.123456",
        channel: "C1234567890",
        thread_ts: "1234567880.123456",
      };

      assertThrows(
        () => handleMessageEvent(input),
        ValidationError,
        "Missing sender",
      );
    });
  });
});

describe("Property: Conversational Intent Detection", () => {
  it("should trigger LLM response for any @regent message", () => {
    const testCases = [
      "@regent This is my answer",
      "@regent we're done here",
      "@regent looks good",
      "@regent let's move on",
      "@regent skip this one",
    ];

    for (const text of testCases) {
      const input: SlackMessageEventInput = {
        type: "app_mention",
        user: "U1234567890",
        text: `<@U0BOTID> ${text}`,
        ts: "1234567890.123456",
        channel: "C1234567890",
        thread_ts: "1234567880.123456",
      };

      const result = handleMessageEvent(input);

      assertEquals(
        result.shouldRespond,
        true,
        `Expected any @regent message to trigger LLM response: ${text}`,
      );
      assertEquals(
        result.message?.text,
        `<@U0BOTID> ${text}`,
        `Expected full message text to be preserved: ${text}`,
      );
    }
  });

  it("should not trigger LLM response for non-@regent messages", () => {
    const testCases = [
      "just a comment",
      "I think the answer is...",
      "Maybe we should consider this",
    ];

    for (const text of testCases) {
      const input: SlackMessageEventInput = {
        type: "message",
        user: "U1234567890",
        text: text,
        ts: "1234567890.123456",
        channel: "C1234567890",
        thread_ts: "1234567880.123456",
      };

      const result = handleMessageEvent(input);

      assertEquals(
        result.shouldRespond,
        false,
        `Expected non-@regent message to not trigger LLM response: ${text}`,
      );
    }
  });

  it("should preserve full message text for LLM context", () => {
    const input: SlackMessageEventInput = {
      type: "app_mention",
      user: "U1234567890",
      text: "<@U0BOTID> @regent I think we're all set here, ready to move forward",
      ts: "1234567890.123456",
      channel: "C1234567890",
      thread_ts: "1234567880.123456",
    };

    const result = handleMessageEvent(input);

    assertEquals(result.shouldRespond, true);
    assertEquals(
      result.message?.text,
      "<@U0BOTID> @regent I think we're all set here, ready to move forward",
    );
    assertEquals(result.message?.sender, "U1234567890");
    assertEquals(result.message?.timestamp, "1234567890.123456");
  });
});

describe("isDirectMention field", () => {
  it("should set isDirectMention true for @regent messages", () => {
    const input: SlackMessageEventInput = {
      type: "app_mention",
      user: "U1234567890",
      text: "<@U0BOTID> @regent This is my answer",
      ts: "1234567890.123456",
      channel: "C1234567890",
      thread_ts: "1234567880.123456",
    };

    const result = handleMessageEvent(input);

    assertEquals(result.message?.isDirectMention, true);
  });

  it("should set isDirectMention false for non-@regent messages", () => {
    const input: SlackMessageEventInput = {
      type: "message",
      user: "U1234567890",
      text: "Just a discussion comment",
      ts: "1234567890.123456",
      channel: "C1234567890",
      thread_ts: "1234567880.123456",
    };

    const result = handleMessageEvent(input);

    assertEquals(result.message?.isDirectMention, false);
  });

  it("should set isDirectMention true for direct @regent prefix", () => {
    const input: SlackMessageEventInput = {
      type: "message",
      user: "U1234567890",
      text: "@regent answer to question",
      ts: "1234567890.123456",
      channel: "C1234567890",
      thread_ts: "1234567880.123456",
    };

    const result = handleMessageEvent(input);

    assertEquals(result.shouldRespond, true);
    assertEquals(result.message?.isDirectMention, true);
  });

  it("should set isDirectMention false for ambient team discussion", () => {
    const input: SlackMessageEventInput = {
      type: "message",
      user: "U9876543210",
      text: "I think we should use PostgreSQL for this",
      ts: "1234567890.123456",
      channel: "C1234567890",
      thread_ts: "1234567880.123456",
    };

    const result = handleMessageEvent(input);

    assertEquals(result.shouldRespond, false);
    assertEquals(result.message?.isDirectMention, false);
  });

  it("should differentiate directed and ambient messages by isDirectMention", () => {
    const directedInput: SlackMessageEventInput = {
      type: "app_mention",
      user: "U1234567890",
      text: "<@U0BOTID> @regent We need a database",
      ts: "1234567890.123456",
      channel: "C1234567890",
      thread_ts: "1234567880.123456",
    };

    const ambientInput: SlackMessageEventInput = {
      type: "message",
      user: "U9876543210",
      text: "PostgreSQL would be a good choice",
      ts: "1234567890.123457",
      channel: "C1234567890",
      thread_ts: "1234567880.123456",
    };

    const directedResult = handleMessageEvent(directedInput);
    const ambientResult = handleMessageEvent(ambientInput);

    assertEquals(directedResult.message?.isDirectMention, true);
    assertEquals(directedResult.shouldRespond, true);
    assertEquals(ambientResult.message?.isDirectMention, false);
    assertEquals(ambientResult.shouldRespond, false);
  });

  it("should not set isDirectMention for bot messages (no message returned)", () => {
    const input: SlackMessageEventInput = {
      type: "message",
      bot_id: "B1234567890",
      text: "Bot question here",
      ts: "1234567890.123456",
      channel: "C1234567890",
      thread_ts: "1234567880.123456",
    };

    const result = handleMessageEvent(input);

    assertEquals(result.shouldRespond, false);
    assertEquals(result.message, undefined);
  });
});
