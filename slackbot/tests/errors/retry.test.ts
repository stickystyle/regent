// ABOUTME: Tests for RetryHandler with exponential backoff timing and max retry limits.
// ABOUTME: Includes property test for Property 11 - Retry Logic correctness.

import { assertEquals, assertRejects } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import {
  calculateBackoffDelay,
  DEFAULT_RETRY_CONFIG,
  RetryHandler,
} from "../../src/errors/retry.ts";
import type { RetryConfig } from "../../src/errors/retry.ts";
import {
  AnthropicRateLimitError,
  GitHubRateLimitError,
  NetworkTimeoutError,
  SlackCanvasError,
  SlackRateLimitError,
  ValidationError,
} from "../../src/errors/types.ts";

describe("RetryHandler", () => {
  describe("Exponential Backoff Timing", () => {
    it("should calculate correct delay for attempt 1 (0ms - immediate)", () => {
      const delay = calculateBackoffDelay(1, { baseDelayMs: 1000, multiplier: 2 });
      assertEquals(delay, 0);
    });

    it("should calculate correct delay for attempt 2 (1000ms)", () => {
      const delay = calculateBackoffDelay(2, { baseDelayMs: 1000, multiplier: 2 });
      assertEquals(delay, 1000);
    });

    it("should calculate correct delay for attempt 3 (2000ms)", () => {
      const delay = calculateBackoffDelay(3, { baseDelayMs: 1000, multiplier: 2 });
      assertEquals(delay, 2000);
    });

    it("should respect custom base delay", () => {
      const delay = calculateBackoffDelay(2, { baseDelayMs: 500, multiplier: 2 });
      assertEquals(delay, 500);
    });

    it("should respect custom multiplier", () => {
      const delay = calculateBackoffDelay(3, { baseDelayMs: 1000, multiplier: 3 });
      assertEquals(delay, 3000);
    });
  });

  describe("Max Retry Attempts", () => {
    it("should retry up to maxAttempts times", async () => {
      let attempts = 0;
      const handler = new RetryHandler({ maxAttempts: 3, baseDelayMs: 1, multiplier: 2 });

      const operation = () => {
        attempts++;
        throw new NetworkTimeoutError("Timeout", "Test timeout", "Retry");
      };

      await assertRejects(
        () => handler.execute(operation),
        NetworkTimeoutError,
      );

      assertEquals(attempts, 3);
    });

    it("should succeed if operation succeeds within retry limit", async () => {
      let attempts = 0;
      const handler = new RetryHandler({ maxAttempts: 3, baseDelayMs: 1, multiplier: 2 });

      const operation = () => {
        attempts++;
        if (attempts < 2) {
          throw new NetworkTimeoutError("Timeout", "Test timeout", "Retry");
        }
        return "success";
      };

      const result = await handler.execute(operation);

      assertEquals(result, "success");
      assertEquals(attempts, 2);
    });

    it("should use default maxAttempts of 3", () => {
      assertEquals(DEFAULT_RETRY_CONFIG.maxAttempts, 3);
    });
  });

  describe("Transient vs Permanent Error Handling", () => {
    it("should retry transient errors", async () => {
      let attempts = 0;
      const handler = new RetryHandler({ maxAttempts: 3, baseDelayMs: 1, multiplier: 2 });

      const operation = () => {
        attempts++;
        throw new NetworkTimeoutError("Timeout", "Test timeout", "Retry");
      };

      await assertRejects(() => handler.execute(operation), NetworkTimeoutError);

      assertEquals(attempts, 3);
    });

    it("should NOT retry permanent errors", async () => {
      let attempts = 0;
      const handler = new RetryHandler({ maxAttempts: 3, baseDelayMs: 1, multiplier: 2 });

      const operation = () => {
        attempts++;
        throw new ValidationError("Invalid", "Bad input", "Fix it");
      };

      await assertRejects(() => handler.execute(operation), ValidationError);

      assertEquals(attempts, 1, "Permanent errors should not be retried");
    });

    it("should immediately throw non-BaseError errors", async () => {
      let attempts = 0;
      const handler = new RetryHandler({ maxAttempts: 3, baseDelayMs: 1, multiplier: 2 });

      const operation = () => {
        attempts++;
        throw new Error("Unknown error");
      };

      await assertRejects(() => handler.execute(operation), Error);

      assertEquals(attempts, 1, "Non-BaseError should not be retried");
    });
  });

  describe("Retry State Tracking", () => {
    it("should track attempt count", async () => {
      const handler = new RetryHandler({ maxAttempts: 3, baseDelayMs: 1, multiplier: 2 });
      const attemptNumbers: number[] = [];

      const operation = () => {
        attemptNumbers.push(handler.currentAttempt);
        throw new NetworkTimeoutError("Timeout", "Test", "Retry");
      };

      await assertRejects(() => handler.execute(operation), NetworkTimeoutError);

      assertEquals(attemptNumbers, [1, 2, 3]);
    });

    it("should reset state between execute calls", async () => {
      const handler = new RetryHandler({ maxAttempts: 3, baseDelayMs: 1, multiplier: 2 });

      // First execution - fails all attempts
      let firstRunAttempts = 0;
      await assertRejects(
        () =>
          handler.execute(() => {
            firstRunAttempts++;
            throw new NetworkTimeoutError("Timeout", "Test", "Retry");
          }),
        NetworkTimeoutError,
      );

      // Second execution - should start fresh
      let secondRunAttempts = 0;
      await assertRejects(
        () =>
          handler.execute(() => {
            secondRunAttempts++;
            throw new NetworkTimeoutError("Timeout", "Test", "Retry");
          }),
        NetworkTimeoutError,
      );

      assertEquals(firstRunAttempts, 3);
      assertEquals(secondRunAttempts, 3);
    });

    it("should report if retries are exhausted", async () => {
      const handler = new RetryHandler({ maxAttempts: 2, baseDelayMs: 1, multiplier: 2 });

      await assertRejects(
        () =>
          handler.execute(() => {
            throw new NetworkTimeoutError("Timeout", "Test", "Retry");
          }),
        NetworkTimeoutError,
      );

      assertEquals(handler.isExhausted, true);
    });
  });

  describe("Async Operation Support", () => {
    it("should handle async operations", async () => {
      const handler = new RetryHandler({ maxAttempts: 3, baseDelayMs: 1, multiplier: 2 });
      let attempts = 0;

      const asyncOperation = async () => {
        attempts++;
        await new Promise((resolve) => setTimeout(resolve, 1));
        if (attempts < 2) {
          throw new NetworkTimeoutError("Timeout", "Test", "Retry");
        }
        return "async success";
      };

      const result = await handler.execute(asyncOperation);

      assertEquals(result, "async success");
      assertEquals(attempts, 2);
    });

    it("should handle async operations that always fail", async () => {
      const handler = new RetryHandler({ maxAttempts: 3, baseDelayMs: 1, multiplier: 2 });
      let attempts = 0;

      const asyncOperation = async () => {
        attempts++;
        await new Promise((resolve) => setTimeout(resolve, 1));
        throw new NetworkTimeoutError("Timeout", "Test", "Retry");
      };

      await assertRejects(() => handler.execute(asyncOperation), NetworkTimeoutError);

      assertEquals(attempts, 3);
    });
  });

  describe("onRetry Callback", () => {
    it("should call onRetry callback before each retry", async () => {
      const retryEvents: Array<{ attempt: number; delay: number }> = [];
      const config: RetryConfig = {
        maxAttempts: 3,
        baseDelayMs: 100,
        multiplier: 2,
        onRetry: (attempt, delay, _error) => {
          retryEvents.push({ attempt, delay });
        },
      };
      const handler = new RetryHandler(config);

      await assertRejects(
        () =>
          handler.execute(() => {
            throw new NetworkTimeoutError("Timeout", "Test", "Retry");
          }),
        NetworkTimeoutError,
      );

      // onRetry called before attempt 2 and attempt 3
      assertEquals(retryEvents.length, 2);
      assertEquals(retryEvents[0], { attempt: 2, delay: 100 });
      assertEquals(retryEvents[1], { attempt: 3, delay: 200 });
    });
  });
});

describe("Property 11: Retry Logic", () => {
  /**
   * Property 11: For any transient error (timeout, rate limit),
   * the system should retry with exponential backoff up to 3 times
   * before reporting failure.
   */

  it("should retry exactly 3 times for any transient error", async () => {
    // Test with ALL transient error types to verify Property 11
    const transientErrorFactories = [
      () => new NetworkTimeoutError("Timeout", "Test", "Retry"),
      () => new GitHubRateLimitError("Rate limit", "Test", "Retry", new Date()),
      () => new SlackRateLimitError("Rate limit", "Test", "Retry", 30),
      () => new SlackCanvasError("Canvas failed", "Test", "Retry"),
      () => new AnthropicRateLimitError("Rate limit", "Test", "Retry", 45),
    ];

    for (const createError of transientErrorFactories) {
      let attempts = 0;
      const handler = new RetryHandler({
        maxAttempts: 3,
        baseDelayMs: 1,
        multiplier: 2,
      });

      await assertRejects(
        () =>
          handler.execute(() => {
            attempts++;
            throw createError();
          }),
      );

      assertEquals(
        attempts,
        3,
        `Expected 3 attempts for ${createError().type}`,
      );
    }
  });

  it("should apply exponential backoff delays", async () => {
    const delays: number[] = [];
    const handler = new RetryHandler({
      maxAttempts: 4,
      baseDelayMs: 100,
      multiplier: 2,
      onRetry: (_attempt, delay) => {
        delays.push(delay);
      },
    });

    await assertRejects(
      () =>
        handler.execute(() => {
          throw new NetworkTimeoutError("Timeout", "Test", "Retry");
        }),
    );

    // Delays before attempts 2, 3, 4
    assertEquals(delays, [100, 200, 400]);
  });

  it("should report failure after exhausting retries", async () => {
    const handler = new RetryHandler({
      maxAttempts: 3,
      baseDelayMs: 1,
      multiplier: 2,
    });
    const thrownError = new NetworkTimeoutError("Final timeout", "All retries failed", "Give up");

    let caughtError: Error | null = null;
    try {
      await handler.execute(() => {
        throw thrownError;
      });
    } catch (e) {
      caughtError = e as Error;
    }

    assertEquals(caughtError, thrownError);
    assertEquals(handler.isExhausted, true);
  });

  it("should succeed immediately if no error occurs", async () => {
    const handler = new RetryHandler({
      maxAttempts: 3,
      baseDelayMs: 1,
      multiplier: 2,
    });

    const result = await handler.execute(() => "immediate success");

    assertEquals(result, "immediate success");
    assertEquals(handler.currentAttempt, 1);
    assertEquals(handler.isExhausted, false);
  });

  it("should not retry permanent errors regardless of retry config", async () => {
    let attempts = 0;
    const handler = new RetryHandler({
      maxAttempts: 10, // High limit to prove we don't retry
      baseDelayMs: 1,
      multiplier: 2,
    });

    await assertRejects(
      () =>
        handler.execute(() => {
          attempts++;
          throw new ValidationError("Invalid", "Not retryable", "Fix input");
        }),
    );

    assertEquals(attempts, 1, "Permanent errors must not be retried");
  });
});

describe("Default Retry Configuration", () => {
  it("should have sensible defaults", () => {
    assertEquals(DEFAULT_RETRY_CONFIG.maxAttempts, 3);
    assertEquals(DEFAULT_RETRY_CONFIG.baseDelayMs, 1000);
    assertEquals(DEFAULT_RETRY_CONFIG.multiplier, 2);
  });
});
