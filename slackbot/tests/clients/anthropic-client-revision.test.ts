// ABOUTME: Tests for AnthropicClient reviseSpec method.
// ABOUTME: Tests updating SpecDocument based on user feedback during Review phase.

import { assertEquals, assertRejects } from "@std/assert";
import { beforeEach, describe, it } from "@std/testing/bdd";
import { AnthropicClientImpl, MockAnthropicClient } from "../../src/clients/anthropic-client.ts";
import { AnthropicModelError } from "../../src/errors/types.ts";
import type { SpecDocument } from "../../src/types/spec-document.ts";

/**
 * Type for mock Anthropic API object used in tests.
 */
interface MockAnthropicApi {
  post: (
    url: string,
    body: unknown,
    headers?: Record<string, string>,
  ) => Promise<Response>;
}

/**
 * Helper to create a test SpecDocument.
 */
function createTestSpec(): SpecDocument {
  return {
    title: "Original Feature",
    overview: "Original overview text.",
    problem_statement: "Original problem statement.",
    goals: ["Original goal 1", "Original goal 2"],
    non_goals: ["Original non-goal"],
    personas: [
      { name: "Developer", description: "Original developer persona" },
    ],
    use_cases: [
      { id: "UC1", title: "Original Use Case", description: "Original description" },
    ],
    technical_details: "Original technical details.",
    open_questions: ["Original question"],
  };
}

/**
 * Helper to capture request body sent to the Anthropic API.
 */
function createCapturingApi(): {
  api: MockAnthropicApi;
  getCapturedBody: () => Record<string, unknown> | null;
} {
  let capturedBody: Record<string, unknown> | null = null;

  const api: MockAnthropicApi = {
    post: (_url: string, body: unknown, _headers?: Record<string, string>) => {
      capturedBody = body as Record<string, unknown>;
      // Return a revised spec
      const revisedSpec: SpecDocument = {
        ...createTestSpec(),
        overview: "Revised overview based on feedback.",
      };
      return Promise.resolve(
        new Response(
          JSON.stringify({
            id: "msg_test123",
            type: "message",
            role: "assistant",
            content: [{ type: "text", text: JSON.stringify(revisedSpec) }],
            model: "claude-sonnet-4-20250514",
            stop_reason: "end_turn",
            usage: { input_tokens: 600, output_tokens: 300 },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );
    },
  };

  return { api, getCapturedBody: () => capturedBody };
}

/**
 * Helper to create a mock API that returns a specific revised spec.
 */
function createMockApiWithRevisedSpec(revisedSpec: SpecDocument): MockAnthropicApi {
  return {
    post: (_url: string, _body: unknown, _headers?: Record<string, string>) => {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            id: "msg_test123",
            type: "message",
            role: "assistant",
            content: [{ type: "text", text: JSON.stringify(revisedSpec) }],
            model: "claude-sonnet-4-20250514",
            stop_reason: "end_turn",
            usage: { input_tokens: 600, output_tokens: 300 },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );
    },
  };
}

describe("AnthropicClient - reviseSpec", () => {
  describe("MockAnthropicClient", () => {
    let client: MockAnthropicClient;

    beforeEach(() => {
      client = new MockAnthropicClient();
    });

    it("should return revised spec based on original", async () => {
      const originalSpec = createTestSpec();
      const feedback = "Update the overview";

      const result = await client.reviseSpec(originalSpec, feedback);

      // Mock adds "(revised)" to overview
      assertEquals(result.overview.includes("revised"), true);
      // Other fields preserved
      assertEquals(result.title, originalSpec.title);
      assertEquals(result.goals, originalSpec.goals);
    });

    it("should throw configured error", async () => {
      const error = new Error("Revision API error");
      client.setReviseSpecError(error);

      const originalSpec = createTestSpec();

      await assertRejects(
        () => client.reviseSpec(originalSpec, "any feedback"),
        Error,
        "Revision API error",
      );
    });

    it("should preserve original structure in revision", async () => {
      const originalSpec = createTestSpec();
      const feedback = "Add more details";

      const result = await client.reviseSpec(originalSpec, feedback);

      // All fields should exist
      assertEquals(typeof result.title, "string");
      assertEquals(typeof result.overview, "string");
      assertEquals(typeof result.problem_statement, "string");
      assertEquals(Array.isArray(result.goals), true);
      assertEquals(Array.isArray(result.non_goals), true);
      assertEquals(Array.isArray(result.personas), true);
      assertEquals(Array.isArray(result.use_cases), true);
      assertEquals(typeof result.technical_details, "string");
      assertEquals(Array.isArray(result.open_questions), true);
    });
  });

  describe("AnthropicClientImpl", () => {
    describe("System prompt for revision", () => {
      let client: AnthropicClientImpl;
      let getCapturedBody: () => Record<string, unknown> | null;

      beforeEach(() => {
        const capturing = createCapturingApi();
        getCapturedBody = capturing.getCapturedBody;
        client = new AnthropicClientImpl(capturing.api, "test-api-key");
      });

      it("should use revision-specific system prompt", async () => {
        const originalSpec = createTestSpec();

        await client.reviseSpec(originalSpec, "Update the goals section");

        const body = getCapturedBody();
        const systemPrompt = body?.system as string;

        // Revision prompt should mention revising or updating
        assertEquals(
          systemPrompt.toLowerCase().includes("revis") ||
            systemPrompt.toLowerCase().includes("updat") ||
            systemPrompt.toLowerCase().includes("feedback"),
          true,
        );
      });

      it("should instruct to preserve original structure", async () => {
        const originalSpec = createTestSpec();

        await client.reviseSpec(originalSpec, "Modify the overview");

        const body = getCapturedBody();
        const systemPrompt = body?.system as string;

        assertEquals(
          systemPrompt.toLowerCase().includes("structure") ||
            systemPrompt.toLowerCase().includes("preserve") ||
            systemPrompt.toLowerCase().includes("original"),
          true,
        );
      });

      it("should instruct to modify only relevant sections", async () => {
        const originalSpec = createTestSpec();

        await client.reviseSpec(originalSpec, "Fix problem statement");

        const body = getCapturedBody();
        const systemPrompt = body?.system as string;

        assertEquals(
          systemPrompt.toLowerCase().includes("only") &&
            (systemPrompt.toLowerCase().includes("relevant") ||
              systemPrompt.toLowerCase().includes("modify") ||
              systemPrompt.toLowerCase().includes("section")),
          true,
        );
      });

      it("should instruct to output only JSON", async () => {
        const originalSpec = createTestSpec();

        await client.reviseSpec(originalSpec, "Some feedback");

        const body = getCapturedBody();
        const systemPrompt = body?.system as string;

        assertEquals(
          systemPrompt.toLowerCase().includes("only") &&
            systemPrompt.toLowerCase().includes("json"),
          true,
        );
      });
    });

    describe("User message content", () => {
      let client: AnthropicClientImpl;
      let getCapturedBody: () => Record<string, unknown> | null;

      beforeEach(() => {
        const capturing = createCapturingApi();
        getCapturedBody = capturing.getCapturedBody;
        client = new AnthropicClientImpl(capturing.api, "test-api-key");
      });

      it("should include current spec in user message", async () => {
        const originalSpec = createTestSpec();

        await client.reviseSpec(originalSpec, "Update it");

        const body = getCapturedBody();
        const messages = body?.messages as Array<{ role: string; content: string }>;

        assertEquals(messages.length, 1);
        assertEquals(messages[0].role, "user");
        assertEquals(messages[0].content.includes("Original Feature"), true);
      });

      it("should include feedback in user message", async () => {
        const originalSpec = createTestSpec();
        const feedback = "Please add security requirements to the goals";

        await client.reviseSpec(originalSpec, feedback);

        const body = getCapturedBody();
        const messages = body?.messages as Array<{ role: string; content: string }>;

        assertEquals(messages[0].content.includes(feedback), true);
      });

      it("should include all spec fields in JSON format", async () => {
        const originalSpec = createTestSpec();

        await client.reviseSpec(originalSpec, "Update");

        const body = getCapturedBody();
        const messages = body?.messages as Array<{ role: string; content: string }>;
        const content = messages[0].content;

        // Spec should be in JSON format
        assertEquals(content.includes('"title"'), true);
        assertEquals(content.includes('"overview"'), true);
        assertEquals(content.includes('"goals"'), true);
      });
    });

    describe("Response parsing", () => {
      it("should parse valid revised JSON spec", async () => {
        const revisedSpec: SpecDocument = {
          title: "Updated Feature",
          overview: "Completely new overview based on feedback.",
          problem_statement: "Updated problem statement.",
          goals: ["New goal 1", "New goal 2", "New goal 3"],
          non_goals: ["Removed some", "Added new non-goal"],
          personas: [],
          use_cases: [],
          technical_details: "Updated technical section.",
          open_questions: [],
        };

        const api = createMockApiWithRevisedSpec(revisedSpec);
        const client = new AnthropicClientImpl(api, "test-api-key");

        const originalSpec = createTestSpec();
        const result = await client.reviseSpec(originalSpec, "Major update");

        assertEquals(result.title, "Updated Feature");
        assertEquals(result.overview, "Completely new overview based on feedback.");
        assertEquals(result.goals.length, 3);
      });

      it("should handle spec with only minor changes", async () => {
        const originalSpec = createTestSpec();
        const revisedSpec: SpecDocument = {
          ...originalSpec,
          overview: "Slightly modified overview.",
        };

        const api = createMockApiWithRevisedSpec(revisedSpec);
        const client = new AnthropicClientImpl(api, "test-api-key");

        const result = await client.reviseSpec(originalSpec, "Minor tweak");

        assertEquals(result.overview, "Slightly modified overview.");
        // Other fields unchanged
        assertEquals(result.title, originalSpec.title);
        assertEquals(result.goals, originalSpec.goals);
      });

      it("should handle non-JSON response gracefully", async () => {
        const api: MockAnthropicApi = {
          post: (_url: string, _body: unknown, _headers?: Record<string, string>) => {
            return Promise.resolve(
              new Response(
                JSON.stringify({
                  id: "msg_test",
                  type: "message",
                  role: "assistant",
                  content: [
                    { type: "text", text: "I've updated the spec as requested..." },
                  ],
                  model: "claude-sonnet-4-20250514",
                  stop_reason: "end_turn",
                  usage: { input_tokens: 100, output_tokens: 50 },
                }),
                { status: 200, headers: { "Content-Type": "application/json" } },
              ),
            );
          },
        };

        const client = new AnthropicClientImpl(api, "test-api-key");
        const originalSpec = createTestSpec();

        // Should not throw, should return fallback
        const result = await client.reviseSpec(originalSpec, "Update something");

        assertEquals(typeof result.title, "string");
      });
    });

    describe("Error handling", () => {
      it("should throw AnthropicModelError on 400 response", async () => {
        const api: MockAnthropicApi = {
          post: (_url: string, _body: unknown, _headers?: Record<string, string>) => {
            return Promise.resolve(
              new Response(
                JSON.stringify({ error: { message: "Invalid request" } }),
                { status: 400, headers: { "Content-Type": "application/json" } },
              ),
            );
          },
        };

        const client = new AnthropicClientImpl(api, "test-api-key");
        const originalSpec = createTestSpec();

        await assertRejects(
          () => client.reviseSpec(originalSpec, "Update"),
          AnthropicModelError,
        );
      });

      it("should handle rate limit with retry", async () => {
        let callCount = 0;
        const revisedSpec: SpecDocument = {
          ...createTestSpec(),
          overview: "After retry success.",
        };

        const api: MockAnthropicApi = {
          post: (_url: string, _body: unknown, _headers?: Record<string, string>) => {
            callCount++;
            if (callCount === 1) {
              return Promise.resolve(
                new Response(
                  JSON.stringify({ error: { message: "Rate limited" } }),
                  {
                    status: 429,
                    headers: {
                      "Content-Type": "application/json",
                      "retry-after": "1",
                    },
                  },
                ),
              );
            }
            return Promise.resolve(
              new Response(
                JSON.stringify({
                  id: "msg_test",
                  type: "message",
                  role: "assistant",
                  content: [{ type: "text", text: JSON.stringify(revisedSpec) }],
                  model: "claude-sonnet-4-20250514",
                  stop_reason: "end_turn",
                  usage: { input_tokens: 100, output_tokens: 50 },
                }),
                { status: 200, headers: { "Content-Type": "application/json" } },
              ),
            );
          },
        };

        const client = new AnthropicClientImpl(api, "test-api-key");
        const originalSpec = createTestSpec();

        const result = await client.reviseSpec(originalSpec, "Update");

        assertEquals(result.overview, "After retry success.");
        assertEquals(callCount >= 2, true);
      });
    });
  });
});

describe("Property: reviseSpec Preserves Spec Structure", () => {
  /**
   * Property: reviseSpec MUST return a valid SpecDocument that:
   * - Contains all required fields
   * - Maintains the same structure as input
   * - Only modifies sections relevant to the feedback
   */

  it("should always return spec with all required fields", async () => {
    const revisedSpec: SpecDocument = {
      title: "Revised",
      overview: "Revised overview",
      problem_statement: "Revised problem",
      goals: ["Revised goal"],
      non_goals: [],
      personas: [],
      use_cases: [],
      technical_details: "",
      open_questions: [],
    };

    const api = createMockApiWithRevisedSpec(revisedSpec);
    const client = new AnthropicClientImpl(api, "test-api-key");

    const originalSpec = createTestSpec();
    const result = await client.reviseSpec(originalSpec, "Revise everything");

    // Verify all required fields exist
    assertEquals(typeof result.title, "string");
    assertEquals(typeof result.overview, "string");
    assertEquals(typeof result.problem_statement, "string");
    assertEquals(Array.isArray(result.goals), true);
    assertEquals(Array.isArray(result.non_goals), true);
    assertEquals(Array.isArray(result.personas), true);
    assertEquals(Array.isArray(result.use_cases), true);
    assertEquals(typeof result.technical_details, "string");
    assertEquals(Array.isArray(result.open_questions), true);
  });
});

describe("Property: reviseSpec Incorporates Feedback", () => {
  /**
   * Property: When given feedback, reviseSpec MUST attempt to incorporate it
   * into the relevant section of the spec.
   */

  it("should return different spec when feedback requests changes", async () => {
    const originalSpec = createTestSpec();
    const revisedSpec: SpecDocument = {
      ...originalSpec,
      goals: [...originalSpec.goals, "New security goal from feedback"],
    };

    const api = createMockApiWithRevisedSpec(revisedSpec);
    const client = new AnthropicClientImpl(api, "test-api-key");

    const result = await client.reviseSpec(
      originalSpec,
      "Add a security goal",
    );

    // Goals should be different (more goals added)
    assertEquals(result.goals.length > originalSpec.goals.length, true);
    assertEquals(
      result.goals.some((g) => g.includes("security")),
      true,
    );
  });
});
