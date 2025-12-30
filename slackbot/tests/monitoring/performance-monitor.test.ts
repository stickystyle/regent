// ABOUTME: Tests for PerformanceMonitor which orchestrates latency tracking with thinking indicators.
// ABOUTME: Validates auto-indicator posting when operations exceed thresholds and cleanup on completion/error.

import { assertEquals, assertRejects } from "@std/assert";
import { afterEach, beforeEach, describe, it } from "@std/testing/bdd";
import { PerformanceMonitor } from "../../src/monitoring/performance-monitor.ts";
import { MockSlackMessagingClient } from "../../src/clients/messaging-client.ts";

describe("PerformanceMonitor", () => {
  let messagingClient: MockSlackMessagingClient;
  let monitor: PerformanceMonitor;

  beforeEach(() => {
    messagingClient = new MockSlackMessagingClient();
    // Use very short delays for testing (10ms threshold, 5ms delay before indicator)
    monitor = new PerformanceMonitor(messagingClient, {
      indicatorDelayMs: 5,
      thresholdOverrides: {
        simple_message: 10,
        exploration: 20,
        synthesis: 20,
      },
    });
  });

  afterEach(() => {
    messagingClient.clear();
  });

  describe("trackOperation", () => {
    it("should execute the operation and return result", async () => {
      const operation = () => Promise.resolve("success");

      const result = await monitor.trackOperation(
        "simple_message",
        "C123",
        "1.1",
        operation,
      );

      assertEquals(result, "success");
    });

    it("should execute async operations correctly", async () => {
      const operation = async () => {
        await new Promise((resolve) => setTimeout(resolve, 2));
        return { data: "result" };
      };

      const result = await monitor.trackOperation(
        "exploration",
        "C123",
        "1.1",
        operation,
      );

      assertEquals(result.data, "result");
    });

    it("should propagate errors from the operation", async () => {
      const operation = () => Promise.reject(new Error("Operation failed"));

      await assertRejects(
        () =>
          monitor.trackOperation(
            "simple_message",
            "C123",
            "1.1",
            operation,
          ),
        Error,
        "Operation failed",
      );
    });
  });

  describe("Thinking indicator posting", () => {
    it("should post thinking indicator if operation takes longer than threshold", async () => {
      const operation = async () => {
        // Wait longer than indicatorDelayMs (5ms) + some buffer
        await new Promise((resolve) => setTimeout(resolve, 15));
        return "done";
      };

      await monitor.trackOperation(
        "simple_message",
        "C123",
        "1.1",
        operation,
      );

      const messages = messagingClient.getPostedMessages();
      // Should have posted at least one thinking indicator
      assertEquals(messages.length >= 1, true);
      assertEquals(messages[0].text.toLowerCase().includes("thinking"), true);
    });

    it("should NOT post indicator if operation completes within threshold", async () => {
      const operation = async () => {
        // Complete quickly (2ms < 5ms indicator delay)
        await new Promise((resolve) => setTimeout(resolve, 2));
        return "fast";
      };

      await monitor.trackOperation(
        "simple_message",
        "C123",
        "1.1",
        operation,
      );

      const messages = messagingClient.getPostedMessages();
      assertEquals(messages.length, 0);
    });
  });

  describe("Thinking indicator cleanup", () => {
    it("should delete thinking indicator after successful operation", async () => {
      const operation = async () => {
        // Wait for indicator to be posted
        await new Promise((resolve) => setTimeout(resolve, 15));
        return "done";
      };

      await monitor.trackOperation(
        "simple_message",
        "C123",
        "1.1",
        operation,
      );

      // After operation completes, indicator should be cleaned up
      // (marked as inactive in our implementation)
      assertEquals(monitor.hasActiveIndicator("C123", "1.1"), false);
    });

    it("should delete thinking indicator after operation fails", async () => {
      const operation = async () => {
        // Wait for indicator to be posted
        await new Promise((resolve) => setTimeout(resolve, 15));
        throw new Error("Failed");
      };

      try {
        await monitor.trackOperation(
          "simple_message",
          "C123",
          "1.1",
          operation,
        );
      } catch {
        // Expected to throw
      }

      // After operation fails, indicator should be cleaned up
      assertEquals(monitor.hasActiveIndicator("C123", "1.1"), false);
    });
  });

  describe("Operation type handling", () => {
    it("should track simple_message operations", async () => {
      const result = await monitor.trackOperation(
        "simple_message",
        "C123",
        "1.1",
        () => Promise.resolve("simple"),
      );

      assertEquals(result, "simple");
    });

    it("should track exploration operations", async () => {
      const result = await monitor.trackOperation(
        "exploration",
        "C123",
        "1.1",
        () => Promise.resolve("explored"),
      );

      assertEquals(result, "explored");
    });

    it("should track synthesis operations", async () => {
      const result = await monitor.trackOperation(
        "synthesis",
        "C123",
        "1.1",
        () => Promise.resolve("synthesized"),
      );

      assertEquals(result, "synthesized");
    });
  });

  describe("Multiple operations", () => {
    it("should handle sequential operations independently", async () => {
      const result1 = await monitor.trackOperation(
        "simple_message",
        "C123",
        "1.1",
        () => Promise.resolve("first"),
      );

      const result2 = await monitor.trackOperation(
        "simple_message",
        "C123",
        "1.1",
        () => Promise.resolve("second"),
      );

      assertEquals(result1, "first");
      assertEquals(result2, "second");
    });

    it("should handle operations in different threads", async () => {
      const [result1, result2] = await Promise.all([
        monitor.trackOperation(
          "simple_message",
          "C123",
          "1.1",
          async () => {
            await new Promise((resolve) => setTimeout(resolve, 2));
            return "thread1";
          },
        ),
        monitor.trackOperation(
          "simple_message",
          "C456",
          "2.2",
          async () => {
            await new Promise((resolve) => setTimeout(resolve, 2));
            return "thread2";
          },
        ),
      ]);

      assertEquals(result1, "thread1");
      assertEquals(result2, "thread2");
    });
  });
});

describe("PerformanceMonitor Configuration", () => {
  let messagingClient: MockSlackMessagingClient;

  beforeEach(() => {
    messagingClient = new MockSlackMessagingClient();
  });

  afterEach(() => {
    messagingClient.clear();
  });

  it("should use default thresholds when not configured", async () => {
    const monitor = new PerformanceMonitor(messagingClient);

    // Fast operation should complete without indicator
    const result = await monitor.trackOperation(
      "simple_message",
      "C123",
      "1.1",
      () => Promise.resolve("fast"),
    );

    assertEquals(result, "fast");
    assertEquals(messagingClient.getPostedMessages().length, 0);
  });

  it("should respect custom indicator delay", async () => {
    // Very short indicator delay (1ms)
    const monitor = new PerformanceMonitor(messagingClient, {
      indicatorDelayMs: 1,
    });

    const result = await monitor.trackOperation(
      "simple_message",
      "C123",
      "1.1",
      async () => {
        // Small delay that exceeds 1ms indicator delay
        await new Promise((resolve) => setTimeout(resolve, 10));
        return "delayed";
      },
    );

    assertEquals(result, "delayed");
    // Should have posted indicator due to short delay
    assertEquals(messagingClient.getPostedMessages().length >= 1, true);
  });
});

describe("PerformanceMonitor State Management", () => {
  let messagingClient: MockSlackMessagingClient;
  let monitor: PerformanceMonitor;

  beforeEach(() => {
    messagingClient = new MockSlackMessagingClient();
    monitor = new PerformanceMonitor(messagingClient, {
      indicatorDelayMs: 5,
    });
  });

  afterEach(() => {
    messagingClient.clear();
  });

  it("should not have active indicator before operation", () => {
    assertEquals(monitor.hasActiveIndicator("C123", "1.1"), false);
  });

  it("should clean up state after operation completes", async () => {
    await monitor.trackOperation(
      "simple_message",
      "C123",
      "1.1",
      () => Promise.resolve("done"),
    );

    assertEquals(monitor.hasActiveIndicator("C123", "1.1"), false);
  });
});
