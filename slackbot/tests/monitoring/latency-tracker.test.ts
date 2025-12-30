// ABOUTME: Tests for LatencyTracker which tracks operation timing and latency thresholds.
// ABOUTME: Validates operation start/stop timing, unique IDs, and threshold categorization.

import { assertEquals, assertExists, assertNotEquals } from "@std/assert";
import { afterEach, beforeEach, describe, it } from "@std/testing/bdd";
import { LatencyTracker } from "../../src/monitoring/latency-tracker.ts";
import type { OperationType } from "../../src/monitoring/latency-tracker.ts";

describe("LatencyTracker", () => {
  let tracker: LatencyTracker;

  beforeEach(() => {
    tracker = new LatencyTracker();
  });

  afterEach(() => {
    tracker.clear();
  });

  describe("startOperation", () => {
    it("should return a unique operation ID", () => {
      const id1 = tracker.startOperation("simple_message");
      const id2 = tracker.startOperation("simple_message");

      assertExists(id1);
      assertExists(id2);
      assertNotEquals(id1, id2);
    });

    it("should accept different operation types", () => {
      const simpleId = tracker.startOperation("simple_message");
      const explorationId = tracker.startOperation("exploration");
      const synthesisId = tracker.startOperation("synthesis");

      assertExists(simpleId);
      assertExists(explorationId);
      assertExists(synthesisId);
    });
  });

  describe("stopOperation", () => {
    it("should calculate duration correctly", async () => {
      const id = tracker.startOperation("simple_message");

      // Wait a small amount to ensure non-zero duration
      await new Promise((resolve) => setTimeout(resolve, 10));

      const duration = tracker.stopOperation(id);

      assertEquals(duration >= 10, true, `Duration should be >= 10ms, got ${duration}`);
    });

    it("should return 0 for unknown operation ID", () => {
      const duration = tracker.stopOperation("unknown-id");
      assertEquals(duration, 0);
    });

    it("should not allow stopping same operation twice", async () => {
      const id = tracker.startOperation("simple_message");
      await new Promise((resolve) => setTimeout(resolve, 5));

      const duration1 = tracker.stopOperation(id);
      const duration2 = tracker.stopOperation(id);

      // First stop should return the duration
      assertEquals(duration1 > 0, true);
      // Second stop should return 0 (already stopped)
      assertEquals(duration2, 0);
    });
  });

  describe("getLatency", () => {
    it("should return duration after stop", async () => {
      const id = tracker.startOperation("simple_message");
      await new Promise((resolve) => setTimeout(resolve, 10));
      tracker.stopOperation(id);

      const latency = tracker.getLatency(id);

      assertExists(latency);
      assertEquals(latency! >= 10, true);
    });

    it("should return undefined for in-progress operation", () => {
      const id = tracker.startOperation("simple_message");

      const latency = tracker.getLatency(id);

      assertEquals(latency, undefined);
    });

    it("should return undefined for unknown operation ID", () => {
      const latency = tracker.getLatency("unknown-id");
      assertEquals(latency, undefined);
    });
  });

  describe("getOperationType", () => {
    it("should return the operation type for a tracked operation", () => {
      const id = tracker.startOperation("exploration");

      const type = tracker.getOperationType(id);

      assertEquals(type, "exploration");
    });

    it("should return undefined for unknown operation ID", () => {
      const type = tracker.getOperationType("unknown-id");
      assertEquals(type, undefined);
    });
  });

  describe("getThreshold", () => {
    it("should return 5000ms threshold for simple_message", () => {
      const threshold = tracker.getThreshold("simple_message");
      assertEquals(threshold, 5000);
    });

    it("should return 30000ms threshold for exploration", () => {
      const threshold = tracker.getThreshold("exploration");
      assertEquals(threshold, 30000);
    });

    it("should return 30000ms threshold for synthesis", () => {
      const threshold = tracker.getThreshold("synthesis");
      assertEquals(threshold, 30000);
    });
  });

  describe("isExceedingThreshold", () => {
    it("should return false when operation is within threshold", () => {
      const id = tracker.startOperation("simple_message");
      // Immediately check - should be well within 5000ms
      const exceeding = tracker.isExceedingThreshold(id);
      assertEquals(exceeding, false);
    });

    it("should return false for unknown operation ID", () => {
      const exceeding = tracker.isExceedingThreshold("unknown-id");
      assertEquals(exceeding, false);
    });
  });

  describe("clear", () => {
    it("should remove all tracked operations", async () => {
      const id = tracker.startOperation("simple_message");
      await new Promise((resolve) => setTimeout(resolve, 5));
      tracker.stopOperation(id);

      tracker.clear();

      assertEquals(tracker.getLatency(id), undefined);
      assertEquals(tracker.getOperationType(id), undefined);
    });
  });
});

describe("Operation Type Categorization", () => {
  let tracker: LatencyTracker;

  beforeEach(() => {
    tracker = new LatencyTracker();
  });

  afterEach(() => {
    tracker.clear();
  });

  it("should categorize simple_message with 5 second threshold", () => {
    const type: OperationType = "simple_message";
    assertEquals(tracker.getThreshold(type), 5000);
  });

  it("should categorize exploration with 30 second threshold", () => {
    const type: OperationType = "exploration";
    assertEquals(tracker.getThreshold(type), 30000);
  });

  it("should categorize synthesis with 30 second threshold", () => {
    const type: OperationType = "synthesis";
    assertEquals(tracker.getThreshold(type), 30000);
  });

  it("should track operation type alongside timing", () => {
    const simpleId = tracker.startOperation("simple_message");
    const explorationId = tracker.startOperation("exploration");
    const synthesisId = tracker.startOperation("synthesis");

    assertEquals(tracker.getOperationType(simpleId), "simple_message");
    assertEquals(tracker.getOperationType(explorationId), "exploration");
    assertEquals(tracker.getOperationType(synthesisId), "synthesis");
  });
});
