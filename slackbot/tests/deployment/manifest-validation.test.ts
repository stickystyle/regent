// ABOUTME: Deployment validation tests for Slack app manifest configuration.
// ABOUTME: Verifies required scopes, workflows, and manifest structure via static analysis.

import { assertEquals, assertExists, assertStringIncludes } from "@std/assert";
import { describe, it } from "@std/testing/bdd";

// Read manifest.ts as text for static validation
// This avoids dependency on deno-slack-sdk which may be unavailable
const manifestPath = new URL("../../manifest.ts", import.meta.url);
const manifestContent = await Deno.readTextFile(manifestPath);

describe("Manifest Configuration (Static Analysis)", () => {
  describe("app metadata", () => {
    it("should have correct app name", () => {
      assertStringIncludes(manifestContent, 'name: "regent-slackbot"');
    });

    it("should have a description", () => {
      assertStringIncludes(manifestContent, "description:");
    });
  });

  describe("bot scopes", () => {
    it("should have app_mentions:read scope for mentions", () => {
      assertStringIncludes(
        manifestContent,
        '"app_mentions:read"',
      );
    });

    it("should have channels:history scope for thread history", () => {
      assertStringIncludes(
        manifestContent,
        '"channels:history"',
      );
    });

    it("should have channels:read scope for channel info", () => {
      assertStringIncludes(
        manifestContent,
        '"channels:read"',
      );
    });

    it("should have chat:write scope for posting messages", () => {
      assertStringIncludes(
        manifestContent,
        '"chat:write"',
      );
    });

    it("should have commands scope for slash commands", () => {
      assertStringIncludes(
        manifestContent,
        '"commands"',
      );
    });

    it("should have datastore:read scope for session storage", () => {
      assertStringIncludes(
        manifestContent,
        '"datastore:read"',
      );
    });

    it("should have datastore:write scope for session storage", () => {
      assertStringIncludes(
        manifestContent,
        '"datastore:write"',
      );
    });

    it("should have files:read scope for file access", () => {
      assertStringIncludes(
        manifestContent,
        '"files:read"',
      );
    });

    it("should have files:write scope for uploading brainstorm.md", () => {
      assertStringIncludes(
        manifestContent,
        '"files:write"',
      );
    });

    it("should have users:read scope for user information", () => {
      assertStringIncludes(
        manifestContent,
        '"users:read"',
      );
    });

    it("should have canvases:write scope for canvas documents", () => {
      assertStringIncludes(
        manifestContent,
        '"canvases:write"',
      );
    });
  });

  describe("outgoing domains", () => {
    it("should allow api.anthropic.com for Claude API", () => {
      assertStringIncludes(
        manifestContent,
        '"api.anthropic.com"',
      );
    });

    it("should allow api.github.com for GitHub API", () => {
      assertStringIncludes(
        manifestContent,
        '"api.github.com"',
      );
    });
  });

  describe("datastores", () => {
    it("should import SessionsDatastore", () => {
      assertStringIncludes(
        manifestContent,
        "SessionsDatastore",
      );
    });

    it("should register datastores in manifest", () => {
      assertStringIncludes(
        manifestContent,
        "datastores:",
      );
    });
  });

  describe("workflows", () => {
    it("should import SlashCommandWorkflow", () => {
      assertStringIncludes(
        manifestContent,
        "SlashCommandWorkflow",
      );
    });

    it("should import MessageEventWorkflow", () => {
      assertStringIncludes(
        manifestContent,
        "MessageEventWorkflow",
      );
    });

    it("should import ExplorationCallbackWorkflow", () => {
      assertStringIncludes(
        manifestContent,
        "ExplorationCallbackWorkflow",
      );
    });

    it("should register workflows in manifest", () => {
      assertStringIncludes(
        manifestContent,
        "workflows:",
      );
    });
  });
});

describe("ROSI Functions (File Existence)", () => {
  const functionsDir = new URL("../../functions/", import.meta.url);

  it("should have slash-command.ts function", async () => {
    const filePath = new URL("slash-command.ts", functionsDir);
    const stat = await Deno.stat(filePath);
    assertExists(stat);
    assertEquals(stat.isFile, true);
  });

  it("should have message-event.ts function", async () => {
    const filePath = new URL("message-event.ts", functionsDir);
    const stat = await Deno.stat(filePath);
    assertExists(stat);
    assertEquals(stat.isFile, true);
  });
});

describe("ROSI Workflows (File Existence)", () => {
  const workflowsDir = new URL("../../workflows/", import.meta.url);

  it("should have slash-command-workflow.ts workflow", async () => {
    const filePath = new URL("slash-command-workflow.ts", workflowsDir);
    const stat = await Deno.stat(filePath);
    assertExists(stat);
    assertEquals(stat.isFile, true);
  });

  it("should have message-event-workflow.ts workflow", async () => {
    const filePath = new URL("message-event-workflow.ts", workflowsDir);
    const stat = await Deno.stat(filePath);
    assertExists(stat);
    assertEquals(stat.isFile, true);
  });

  it("should have exploration-callback-workflow.ts workflow", async () => {
    const filePath = new URL("exploration-callback-workflow.ts", workflowsDir);
    const stat = await Deno.stat(filePath);
    assertExists(stat);
    assertEquals(stat.isFile, true);
  });
});

describe("Triggers (File Existence)", () => {
  const triggersDir = new URL("../../triggers/", import.meta.url);

  it("should have brainstorm-command.ts trigger", async () => {
    const filePath = new URL("brainstorm-command.ts", triggersDir);
    const stat = await Deno.stat(filePath);
    assertExists(stat);
    assertEquals(stat.isFile, true);
  });

  it("should have message-events.ts trigger", async () => {
    const filePath = new URL("message-events.ts", triggersDir);
    const stat = await Deno.stat(filePath);
    assertExists(stat);
    assertEquals(stat.isFile, true);
  });

  it("should have exploration-callback.ts trigger", async () => {
    const filePath = new URL("exploration-callback.ts", triggersDir);
    const stat = await Deno.stat(filePath);
    assertExists(stat);
    assertEquals(stat.isFile, true);
  });
});

describe("Environment Configuration", () => {
  const envExamplePath = new URL("../../.env.example", import.meta.url);

  it("should have .env.example file", async () => {
    const stat = await Deno.stat(envExamplePath);
    assertExists(stat);
    assertEquals(stat.isFile, true);
  });

  it("should document ANTHROPIC_API_KEY", async () => {
    const content = await Deno.readTextFile(envExamplePath);
    assertStringIncludes(content, "ANTHROPIC_API_KEY");
  });

  it("should document GITHUB_TOKEN", async () => {
    const content = await Deno.readTextFile(envExamplePath);
    assertStringIncludes(content, "GITHUB_TOKEN");
  });

  it("should document CALLBACK_SECRET", async () => {
    const content = await Deno.readTextFile(envExamplePath);
    assertStringIncludes(content, "CALLBACK_SECRET");
  });
});
