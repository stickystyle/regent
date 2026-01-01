// ABOUTME: Tests for the exploration timeout scheduled trigger.
// ABOUTME: Verifies trigger configuration for session timeout monitoring.

import { assertEquals, assertExists, assertStringIncludes } from "@std/assert";
import { describe, it } from "@std/testing/bdd";

// Read trigger file as text for static validation
// This avoids dependency issues with workflow imports that may not exist yet
const triggerPath = new URL("../../triggers/exploration-timeout.ts", import.meta.url);
const triggerContent = await Deno.readTextFile(triggerPath);

describe("Exploration Timeout Trigger (Static Analysis)", () => {
  describe("trigger type", () => {
    it("should use TriggerTypes.Scheduled", () => {
      assertStringIncludes(triggerContent, "TriggerTypes.Scheduled");
    });
  });

  describe("trigger name", () => {
    it("should have name 'exploration_timeout'", () => {
      assertStringIncludes(triggerContent, 'name: "exploration_timeout"');
    });
  });

  describe("workflow reference", () => {
    it("should reference ExplorationTimeoutWorkflow", () => {
      assertStringIncludes(triggerContent, "ExplorationTimeoutWorkflow");
    });

    it("should use workflow callback_id pattern for workflow field", () => {
      assertStringIncludes(triggerContent, "#/workflows/");
    });
  });

  describe("schedule configuration", () => {
    it("should have schedule property", () => {
      assertStringIncludes(triggerContent, "schedule:");
    });

    it("should have start_time in schedule", () => {
      assertStringIncludes(triggerContent, "start_time:");
    });

    it("should have frequency configuration", () => {
      assertStringIncludes(triggerContent, "frequency:");
    });

    it("should use hourly frequency type", () => {
      assertStringIncludes(triggerContent, 'type: "hourly"');
    });

    it("should repeat every 1 hour", () => {
      assertStringIncludes(triggerContent, "repeats_every: 1");
    });
  });

  describe("trigger inputs", () => {
    it("should have inputs property", () => {
      assertStringIncludes(triggerContent, "inputs:");
    });

    it("should have empty inputs object", () => {
      // The scheduled trigger queries datastore directly, no inputs needed
      assertStringIncludes(triggerContent, "inputs: {}");
    });
  });

  describe("exports", () => {
    it("should export trigger as default", () => {
      assertStringIncludes(triggerContent, "export default");
    });
  });
});

describe("Exploration Timeout Trigger (File Existence)", () => {
  it("should exist at triggers/exploration-timeout.ts", async () => {
    const stat = await Deno.stat(triggerPath);
    assertExists(stat);
    assertEquals(stat.isFile, true);
  });
});

describe("Exploration Timeout Trigger (ABOUTME Headers)", () => {
  it("should have ABOUTME header comments", () => {
    assertStringIncludes(triggerContent, "// ABOUTME:");
  });

  it("should have two ABOUTME header lines", () => {
    const aboutmeMatches = triggerContent.match(/\/\/ ABOUTME:/g);
    assertExists(aboutmeMatches);
    assertEquals(aboutmeMatches.length >= 2, true);
  });
});

describe("Exploration Timeout Trigger (Runtime)", () => {
  it("should import without errors", async () => {
    const module = await import("../../triggers/exploration-timeout.ts");
    assertExists(module.default);
  });
});
