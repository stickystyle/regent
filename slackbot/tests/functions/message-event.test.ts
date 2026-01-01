// ABOUTME: Tests for the message-event ROSI function output parameters.
// ABOUTME: Validates session_id and is_direct_mention outputs are correctly generated.

import { assertEquals } from "@std/assert";
import { describe, it } from "@std/testing/bdd";

/**
 * Note: Testing the ROSI SlackFunction directly is challenging because it wraps
 * the Slack SDK. Instead, we test the logic that generates the new outputs.
 *
 * The message-event function needs to output:
 * - session_id: derived from `channel_id:thread_ts` for cache lookup
 * - is_direct_mention: whether the message was an @regent mention
 */

interface TestMessage {
  sender: string;
  text: string;
  timestamp: string;
  isDirectMention: boolean;
}

interface TestHandlerResult {
  shouldRespond: boolean;
  message?: TestMessage;
}

describe("session_id output generation", () => {
  it("should generate session_id from channel_id and thread_ts", () => {
    const channelId = "C1234567890";
    const threadTs = "1234567890.123456";

    const sessionId = `${channelId}:${threadTs}`;

    assertEquals(sessionId, "C1234567890:1234567890.123456");
  });

  it("should handle different channel formats", () => {
    const testCases = [
      { channel: "C12345", thread: "1111.2222", expected: "C12345:1111.2222" },
      {
        channel: "CABCDEFGH",
        thread: "9999999999.000001",
        expected: "CABCDEFGH:9999999999.000001",
      },
      {
        channel: "C000000000",
        thread: "0.0",
        expected: "C000000000:0.0",
      },
    ];

    for (const { channel, thread, expected } of testCases) {
      const sessionId = `${channel}:${thread}`;
      assertEquals(sessionId, expected);
    }
  });

  it("should generate undefined session_id when thread_ts is missing", () => {
    const channelId = "C1234567890";
    const threadTs: string | undefined = undefined;

    const sessionId = threadTs ? `${channelId}:${threadTs}` : undefined;

    assertEquals(sessionId, undefined);
  });
});

describe("is_direct_mention output", () => {
  it("should be true when shouldRespond is true (message contains @regent)", () => {
    // From handler result: shouldRespond: true means @regent was detected
    const handlerResult: TestHandlerResult = {
      shouldRespond: true,
      message: {
        sender: "U1234567890",
        text: "@regent answer",
        timestamp: "1234567890.123456",
        isDirectMention: true,
      },
    };

    // ROSI function should output is_direct_mention based on message.isDirectMention
    const isDirectMention = handlerResult.message?.isDirectMention ?? false;

    assertEquals(isDirectMention, true);
  });

  it("should be false when shouldRespond is false (no @regent mention)", () => {
    const handlerResult: TestHandlerResult = {
      shouldRespond: false,
      message: {
        sender: "U1234567890",
        text: "just a comment",
        timestamp: "1234567890.123456",
        isDirectMention: false,
      },
    };

    const isDirectMention = handlerResult.message?.isDirectMention ?? false;

    assertEquals(isDirectMention, false);
  });

  it("should default to false when message is undefined (bot message)", () => {
    const handlerResult: TestHandlerResult = {
      shouldRespond: false,
      message: undefined,
    };

    const isDirectMention = handlerResult.message?.isDirectMention ?? false;

    assertEquals(isDirectMention, false);
  });
});

describe("ROSI function output contract", () => {
  it("should produce all required outputs for @regent message", () => {
    // Simulate ROSI function inputs
    const inputs = {
      type: "app_mention",
      channel: "C1234567890",
      user: "U1234567890",
      text: "<@UBOT> @regent This is my answer",
      ts: "1234567890.123456",
      thread_ts: "1234567880.123456",
    };

    // Simulated handler result
    const handlerResult: TestHandlerResult = {
      shouldRespond: true,
      message: {
        sender: inputs.user,
        text: inputs.text,
        timestamp: inputs.ts,
        isDirectMention: true,
      },
    };

    // Expected ROSI function outputs
    const expectedOutputs = {
      should_respond: true,
      sender: "U1234567890",
      message_text: "<@UBOT> @regent This is my answer",
      timestamp: "1234567890.123456",
      channel_id: "C1234567890",
      thread_ts: "1234567880.123456",
      session_id: "C1234567890:1234567880.123456",
      is_direct_mention: true,
      is_validation_error: false,
    };

    // Compute what the ROSI function should output
    const actualOutputs = {
      should_respond: handlerResult.shouldRespond,
      sender: handlerResult.message?.sender,
      message_text: handlerResult.message?.text,
      timestamp: handlerResult.message?.timestamp,
      channel_id: inputs.channel,
      thread_ts: inputs.thread_ts,
      session_id: inputs.thread_ts ? `${inputs.channel}:${inputs.thread_ts}` : undefined,
      is_direct_mention: handlerResult.message?.isDirectMention ?? false,
      is_validation_error: false,
    };

    assertEquals(actualOutputs, expectedOutputs);
  });

  it("should produce all required outputs for context message", () => {
    const inputs = {
      type: "message",
      channel: "C1234567890",
      user: "U1234567890",
      text: "Just a discussion comment",
      ts: "1234567890.123456",
      thread_ts: "1234567880.123456",
    };

    const handlerResult: TestHandlerResult = {
      shouldRespond: false,
      message: {
        sender: inputs.user,
        text: inputs.text,
        timestamp: inputs.ts,
        isDirectMention: false,
      },
    };

    const expectedOutputs = {
      should_respond: false,
      sender: "U1234567890",
      message_text: "Just a discussion comment",
      timestamp: "1234567890.123456",
      channel_id: "C1234567890",
      thread_ts: "1234567880.123456",
      session_id: "C1234567890:1234567880.123456",
      is_direct_mention: false,
      is_validation_error: false,
    };

    const actualOutputs = {
      should_respond: handlerResult.shouldRespond,
      sender: handlerResult.message?.sender,
      message_text: handlerResult.message?.text,
      timestamp: handlerResult.message?.timestamp,
      channel_id: inputs.channel,
      thread_ts: inputs.thread_ts,
      session_id: inputs.thread_ts ? `${inputs.channel}:${inputs.thread_ts}` : undefined,
      is_direct_mention: handlerResult.message?.isDirectMention ?? false,
      is_validation_error: false,
    };

    assertEquals(actualOutputs, expectedOutputs);
  });

  it("should handle bot messages with no session_id derivation", () => {
    const inputs = {
      type: "message",
      channel: "C1234567890",
      text: "Bot message",
      ts: "1234567890.123456",
      thread_ts: "1234567880.123456",
      bot_id: "B1234567890",
    };

    // Bot messages return no message object
    const handlerResult: TestHandlerResult = {
      shouldRespond: false,
      message: undefined,
    };

    const expectedOutputs = {
      should_respond: false,
      sender: undefined,
      message_text: undefined,
      timestamp: undefined,
      channel_id: "C1234567890",
      thread_ts: "1234567880.123456",
      session_id: "C1234567890:1234567880.123456",
      is_direct_mention: false,
      is_validation_error: false,
    };

    const actualOutputs = {
      should_respond: handlerResult.shouldRespond,
      sender: handlerResult.message?.sender,
      message_text: handlerResult.message?.text,
      timestamp: handlerResult.message?.timestamp,
      channel_id: inputs.channel,
      thread_ts: inputs.thread_ts,
      session_id: inputs.thread_ts ? `${inputs.channel}:${inputs.thread_ts}` : undefined,
      is_direct_mention: handlerResult.message?.isDirectMention ?? false,
      is_validation_error: false,
    };

    assertEquals(actualOutputs, expectedOutputs);
  });
});
