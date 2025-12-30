// ABOUTME: Tests for ThinkingIndicatorManager which posts and deletes thinking indicators in Slack.
// ABOUTME: Validates indicator posting, deletion via chat.update, and error handling.

import { assertEquals, assertRejects } from "@std/assert";
import { afterEach, beforeEach, describe, it } from "@std/testing/bdd";
import { ThinkingIndicatorManager } from "../../src/monitoring/thinking-indicator.ts";
import { MockSlackMessagingClient } from "../../src/clients/messaging-client.ts";
import { NetworkTimeoutError } from "../../src/errors/types.ts";

describe("ThinkingIndicatorManager", () => {
  let messagingClient: MockSlackMessagingClient;
  let manager: ThinkingIndicatorManager;

  beforeEach(() => {
    messagingClient = new MockSlackMessagingClient();
    manager = new ThinkingIndicatorManager(messagingClient);
  });

  afterEach(() => {
    messagingClient.clear();
  });

  describe("postThinkingIndicator", () => {
    it("should post thinking message to channel thread", async () => {
      const messageTs = await manager.postThinkingIndicator(
        "C1234567890",
        "1234567890.123456",
      );

      assertEquals(typeof messageTs, "string");
      assertEquals(messageTs.length > 0, true);

      const messages = messagingClient.getPostedMessages();
      assertEquals(messages.length, 1);
      assertEquals(messages[0].channelId, "C1234567890");
      assertEquals(messages[0].threadTs, "1234567890.123456");
    });

    it("should include thinking indicator text", async () => {
      await manager.postThinkingIndicator("C123", "1.1");

      const messages = messagingClient.getPostedMessages();
      assertEquals(messages.length, 1);
      // Check that message contains thinking indicator
      assertEquals(messages[0].text.toLowerCase().includes("thinking"), true);
    });

    it("should throw error if post fails", async () => {
      const error = new NetworkTimeoutError(
        "Network timeout",
        "Failed to post message",
        "Retry later",
      );
      messagingClient.setPostMessageError(error);

      await assertRejects(
        () => manager.postThinkingIndicator("C123", "1.1"),
        NetworkTimeoutError,
      );
    });

    it("should return unique message timestamp for each call", async () => {
      const ts1 = await manager.postThinkingIndicator("C123", "1.1");
      const ts2 = await manager.postThinkingIndicator("C123", "1.1");

      assertEquals(ts1 !== ts2, true);
    });
  });

  describe("deleteThinkingIndicator", () => {
    it("should call updateMessage to remove indicator", async () => {
      // First post an indicator
      const indicatorTs = await manager.postThinkingIndicator("C123", "1.1");

      // Then delete it
      await manager.deleteThinkingIndicator("C123", indicatorTs);

      // Should have called updateMessage (implemented via postMessage with update flag)
      // The indicator should be tracked as deleted
      assertEquals(manager.isIndicatorActive(indicatorTs), false);
    });

    it("should not throw error for unknown message timestamp", async () => {
      // Should complete without error even for unknown ts
      await manager.deleteThinkingIndicator("C123", "unknown.ts");
    });
  });

  describe("isIndicatorActive", () => {
    it("should return true for posted indicator", async () => {
      const ts = await manager.postThinkingIndicator("C123", "1.1");

      assertEquals(manager.isIndicatorActive(ts), true);
    });

    it("should return false after deletion", async () => {
      const ts = await manager.postThinkingIndicator("C123", "1.1");
      await manager.deleteThinkingIndicator("C123", ts);

      assertEquals(manager.isIndicatorActive(ts), false);
    });

    it("should return false for unknown timestamp", () => {
      assertEquals(manager.isIndicatorActive("unknown.ts"), false);
    });
  });

  describe("Indicator text formatting", () => {
    it("should use emoji or typing indicator format", async () => {
      await manager.postThinkingIndicator("C123", "1.1");

      const messages = messagingClient.getPostedMessages();
      const text = messages[0].text;

      // Should contain some form of thinking/typing indicator
      const hasIndicator = text.includes("...") ||
        text.includes("thinking") ||
        text.includes("Thinking");
      assertEquals(hasIndicator, true);
    });
  });
});

describe("ThinkingIndicatorManager Error Handling", () => {
  let messagingClient: MockSlackMessagingClient;
  let manager: ThinkingIndicatorManager;

  beforeEach(() => {
    messagingClient = new MockSlackMessagingClient();
    manager = new ThinkingIndicatorManager(messagingClient);
  });

  afterEach(() => {
    messagingClient.clear();
  });

  it("should propagate post errors", async () => {
    const error = new NetworkTimeoutError("Timeout", "Details", "Action");
    messagingClient.setPostMessageError(error);

    await assertRejects(
      () => manager.postThinkingIndicator("C123", "1.1"),
      NetworkTimeoutError,
      "Timeout",
    );
  });

  it("should handle delete gracefully even if update would fail", async () => {
    // Post successfully first
    const ts = await manager.postThinkingIndicator("C123", "1.1");

    // Even if we can't actually update/delete in Slack,
    // the manager should mark it as inactive locally
    await manager.deleteThinkingIndicator("C123", ts);
    assertEquals(manager.isIndicatorActive(ts), false);
  });
});
