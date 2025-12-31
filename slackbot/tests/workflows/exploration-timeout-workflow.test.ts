// ABOUTME: Tests for the exploration timeout workflow definition.
// ABOUTME: Verifies workflow structure and function wiring via static analysis.

import { assertEquals, assertExists, assertStringIncludes } from "@std/assert";
import { describe, it } from "@std/testing/bdd";

// Read workflow file as text for static validation
// This avoids dependency issues with function imports that may not exist yet
const workflowPath = new URL(
  "../../workflows/exploration-timeout-workflow.ts",
  import.meta.url,
);
const workflowContent = await Deno.readTextFile(workflowPath);

describe("Exploration Timeout Workflow (Static Analysis)", () => {
  describe("workflow definition", () => {
    it("should use DefineWorkflow", () => {
      assertStringIncludes(workflowContent, "DefineWorkflow");
    });

    it("should have callback_id 'exploration_timeout_workflow'", () => {
      assertStringIncludes(
        workflowContent,
        'callback_id: "exploration_timeout_workflow"',
      );
    });

    it("should have a title", () => {
      assertStringIncludes(workflowContent, 'title: "Exploration Timeout Check"');
    });

    it("should have a description", () => {
      assertStringIncludes(workflowContent, "description:");
    });
  });

  describe("input parameters", () => {
    it("should have input_parameters property", () => {
      assertStringIncludes(workflowContent, "input_parameters:");
    });

    it("should have empty properties object", () => {
      assertStringIncludes(workflowContent, "properties: {}");
    });

    it("should have empty required array", () => {
      assertStringIncludes(workflowContent, "required: []");
    });
  });

  describe("function import", () => {
    it("should import ExplorationTimeoutFunction", () => {
      assertStringIncludes(workflowContent, "ExplorationTimeoutFunction");
    });

    it("should import from exploration-timeout-check.ts", () => {
      assertStringIncludes(
        workflowContent,
        'from "../functions/exploration-timeout-check.ts"',
      );
    });
  });

  describe("addStep wiring", () => {
    it("should call addStep on the workflow", () => {
      assertStringIncludes(
        workflowContent,
        "ExplorationTimeoutWorkflow.addStep",
      );
    });

    it("should pass ExplorationTimeoutFunction to addStep", () => {
      assertStringIncludes(
        workflowContent,
        "addStep(ExplorationTimeoutFunction",
      );
    });

    it("should pass empty inputs to addStep", () => {
      // The function has no inputs, so addStep should pass {}
      assertStringIncludes(workflowContent, "addStep(ExplorationTimeoutFunction, {})");
    });

    it("should not have TODO comment for function step", () => {
      const hasTodo = workflowContent.includes("TODO: Task 8");
      assertEquals(hasTodo, false, "TODO comment should be removed");
    });
  });

  describe("exports", () => {
    it("should export ExplorationTimeoutWorkflow as named export", () => {
      assertStringIncludes(
        workflowContent,
        "export const ExplorationTimeoutWorkflow",
      );
    });

    it("should export workflow as default", () => {
      assertStringIncludes(workflowContent, "export default");
    });
  });
});

describe("Exploration Timeout Workflow (File Existence)", () => {
  it("should exist at workflows/exploration-timeout-workflow.ts", async () => {
    const stat = await Deno.stat(workflowPath);
    assertExists(stat);
    assertEquals(stat.isFile, true);
  });
});

describe("Exploration Timeout Workflow (ABOUTME Headers)", () => {
  it("should have ABOUTME header comments", () => {
    assertStringIncludes(workflowContent, "// ABOUTME:");
  });

  it("should have two ABOUTME header lines", () => {
    const aboutmeMatches = workflowContent.match(/\/\/ ABOUTME:/g);
    assertExists(aboutmeMatches);
    assertEquals(aboutmeMatches.length >= 2, true);
  });
});

describe("Exploration Timeout Workflow (Runtime)", () => {
  it("should import without errors", async () => {
    const module = await import("../../workflows/exploration-timeout-workflow.ts");
    assertExists(module.default);
    assertExists(module.ExplorationTimeoutWorkflow);
  });

  it("should have correct workflow definition properties", async () => {
    const module = await import("../../workflows/exploration-timeout-workflow.ts");
    const workflow = module.ExplorationTimeoutWorkflow;

    assertExists(workflow.definition);
    assertEquals(workflow.definition.callback_id, "exploration_timeout_workflow");
    assertEquals(workflow.definition.title, "Exploration Timeout Check");
  });
});
