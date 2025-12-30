// ABOUTME: Tests for AnthropicClient synthesizeSpec method.
// ABOUTME: Tests conversion of conversation history to structured SpecDocument format.

import { assertEquals, assertRejects } from "@std/assert";
import { beforeEach, describe, it } from "@std/testing/bdd";
import { AnthropicClientImpl, MockAnthropicClient } from "../../src/clients/anthropic-client.ts";
import { AnthropicModelError } from "../../src/errors/types.ts";
import type { Message } from "../../src/types/message.ts";
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
      // Return a valid spec JSON response
      const mockSpec: SpecDocument = {
        title: "Synthesized Feature",
        overview: "A feature synthesized from conversation.",
        problem_statement: "The problem we discussed.",
        goals: ["Goal from conversation"],
        non_goals: ["Non-goal mentioned"],
        personas: [{ name: "User", description: "End user of the feature" }],
        use_cases: [
          { id: "UC1", title: "Main Use Case", description: "Primary workflow" },
        ],
        technical_details: "Technical notes from discussion.",
        open_questions: ["Open question remaining"],
      };
      return Promise.resolve(
        new Response(
          JSON.stringify({
            id: "msg_test123",
            type: "message",
            role: "assistant",
            content: [{ type: "text", text: JSON.stringify(mockSpec) }],
            model: "claude-sonnet-4-20250514",
            stop_reason: "end_turn",
            usage: { input_tokens: 500, output_tokens: 200 },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );
    },
  };

  return { api, getCapturedBody: () => capturedBody };
}

/**
 * Helper to create a mock API that returns a specific spec.
 */
function createMockApiWithSpec(spec: SpecDocument): MockAnthropicApi {
  return {
    post: (_url: string, _body: unknown, _headers?: Record<string, string>) => {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            id: "msg_test123",
            type: "message",
            role: "assistant",
            content: [{ type: "text", text: JSON.stringify(spec) }],
            model: "claude-sonnet-4-20250514",
            stop_reason: "end_turn",
            usage: { input_tokens: 500, output_tokens: 200 },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );
    },
  };
}

/**
 * Helper to create a mock API that returns an error response.
 */
function createErrorApi(status: number, errorMessage: string): MockAnthropicApi {
  return {
    post: (_url: string, _body: unknown, _headers?: Record<string, string>) => {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            error: { message: errorMessage },
          }),
          { status, headers: { "Content-Type": "application/json" } },
        ),
      );
    },
  };
}

describe("AnthropicClient - synthesizeSpec", () => {
  describe("MockAnthropicClient", () => {
    let client: MockAnthropicClient;

    beforeEach(() => {
      client = new MockAnthropicClient();
    });

    it("should return default spec when no response configured", async () => {
      const messages: Message[] = [
        { sender: "U123", text: "Build a login feature", timestamp: "123.456" },
      ];

      const result = await client.synthesizeSpec(messages);

      assertEquals(typeof result.title, "string");
      assertEquals(typeof result.overview, "string");
      assertEquals(Array.isArray(result.goals), true);
    });

    it("should return configured spec response", async () => {
      const testSpec: SpecDocument = {
        title: "Custom Test Feature",
        overview: "Custom overview text.",
        problem_statement: "Custom problem statement.",
        goals: ["Custom goal 1", "Custom goal 2"],
        non_goals: ["Custom non-goal"],
        personas: [],
        use_cases: [],
        technical_details: "Custom technical details.",
        open_questions: [],
      };

      client.setNextSpecResponse(testSpec);

      const messages: Message[] = [
        { sender: "U123", text: "Any message", timestamp: "123.456" },
      ];

      const result = await client.synthesizeSpec(messages);

      assertEquals(result.title, "Custom Test Feature");
      assertEquals(result.overview, "Custom overview text.");
      assertEquals(result.goals.length, 2);
    });

    it("should throw configured error", async () => {
      const error = new Error("Synthesis API error");
      client.setSynthesizeSpecError(error);

      const messages: Message[] = [
        { sender: "U123", text: "Build something", timestamp: "123.456" },
      ];

      await assertRejects(
        () => client.synthesizeSpec(messages),
        Error,
        "Synthesis API error",
      );
    });

    it("should clear spec response after returning it once", async () => {
      const testSpec: SpecDocument = {
        title: "One-time Spec",
        overview: "Test",
        problem_statement: "Test",
        goals: [],
        non_goals: [],
        personas: [],
        use_cases: [],
        technical_details: "",
        open_questions: [],
      };

      client.setNextSpecResponse(testSpec);

      const messages: Message[] = [
        { sender: "U123", text: "First call", timestamp: "123.456" },
      ];

      const result1 = await client.synthesizeSpec(messages);
      assertEquals(result1.title, "One-time Spec");

      // Second call should return default
      const result2 = await client.synthesizeSpec(messages);
      assertEquals(result2.title !== "One-time Spec", true);
    });
  });

  describe("AnthropicClientImpl", () => {
    describe("System prompt for synthesis", () => {
      let client: AnthropicClientImpl;
      let getCapturedBody: () => Record<string, unknown> | null;

      beforeEach(() => {
        const capturing = createCapturingApi();
        getCapturedBody = capturing.getCapturedBody;
        client = new AnthropicClientImpl(capturing.api, "test-api-key");
      });

      it("should use synthesis-specific system prompt", async () => {
        const messages: Message[] = [
          { sender: "U123", text: "Build a feature", timestamp: "123.456" },
          { sender: "bot", text: "What's the purpose?", timestamp: "123.457" },
          { sender: "U123", text: "User management", timestamp: "123.458" },
        ];

        await client.synthesizeSpec(messages);

        const body = getCapturedBody();
        const systemPrompt = body?.system as string;

        // Synthesis prompt should be different from questioning prompt
        assertEquals(systemPrompt.includes("synthesiz"), true);
      });

      it("should instruct to output JSON format", async () => {
        const messages: Message[] = [
          { sender: "U123", text: "Build a feature", timestamp: "123.456" },
        ];

        await client.synthesizeSpec(messages);

        const body = getCapturedBody();
        const systemPrompt = body?.system as string;

        assertEquals(systemPrompt.toLowerCase().includes("json"), true);
      });

      it("should specify all required SpecDocument fields", async () => {
        const messages: Message[] = [
          { sender: "U123", text: "Build a feature", timestamp: "123.456" },
        ];

        await client.synthesizeSpec(messages);

        const body = getCapturedBody();
        const systemPrompt = body?.system as string;

        assertEquals(systemPrompt.includes("title"), true);
        assertEquals(systemPrompt.includes("overview"), true);
        assertEquals(systemPrompt.includes("problem"), true);
        assertEquals(systemPrompt.includes("goals"), true);
      });

      it("should include all conversation messages", async () => {
        const messages: Message[] = [
          { sender: "U123", text: "First user message", timestamp: "123.456" },
          { sender: "bot", text: "First bot response", timestamp: "123.457" },
          { sender: "U123", text: "Second user message", timestamp: "123.458" },
          { sender: "bot", text: "Second bot response", timestamp: "123.459" },
        ];

        await client.synthesizeSpec(messages);

        const body = getCapturedBody();
        const apiMessages = body?.messages as Array<{ role: string; content: string }>;

        // All 4 messages should be included
        assertEquals(apiMessages.length, 4);
      });
    });

    describe("Response parsing", () => {
      it("should parse valid JSON spec from response", async () => {
        const expectedSpec: SpecDocument = {
          title: "Parsed Feature",
          overview: "Parsed overview.",
          problem_statement: "Parsed problem.",
          goals: ["Parsed goal"],
          non_goals: [],
          personas: [],
          use_cases: [],
          technical_details: "",
          open_questions: [],
        };

        const api = createMockApiWithSpec(expectedSpec);
        const client = new AnthropicClientImpl(api, "test-api-key");

        const messages: Message[] = [
          { sender: "U123", text: "Build something", timestamp: "123.456" },
        ];

        const result = await client.synthesizeSpec(messages);

        assertEquals(result.title, "Parsed Feature");
        assertEquals(result.overview, "Parsed overview.");
        assertEquals(result.goals[0], "Parsed goal");
      });

      it("should handle spec with all fields populated", async () => {
        const fullSpec: SpecDocument = {
          title: "Full Feature",
          overview: "Complete overview with all fields.",
          problem_statement: "The complete problem statement.",
          goals: ["Goal 1", "Goal 2", "Goal 3"],
          non_goals: ["Non-goal 1", "Non-goal 2"],
          personas: [
            { name: "Admin", description: "System administrator" },
            { name: "User", description: "Regular user" },
          ],
          use_cases: [
            { id: "UC1", title: "Login", description: "User logs in" },
            { id: "UC2", title: "Dashboard", description: "User views dashboard" },
          ],
          technical_details: "Uses REST API with OAuth2.",
          open_questions: ["How to handle rate limiting?"],
        };

        const api = createMockApiWithSpec(fullSpec);
        const client = new AnthropicClientImpl(api, "test-api-key");

        const messages: Message[] = [
          { sender: "U123", text: "Build something", timestamp: "123.456" },
        ];

        const result = await client.synthesizeSpec(messages);

        assertEquals(result.title, "Full Feature");
        assertEquals(result.goals.length, 3);
        assertEquals(result.personas.length, 2);
        assertEquals(result.use_cases.length, 2);
        assertEquals(result.open_questions.length, 1);
      });

      it("should provide defaults for missing fields", async () => {
        // Spec with only some fields
        const partialSpec = {
          title: "Partial Feature",
          overview: "Only some fields.",
        };

        const api: MockAnthropicApi = {
          post: (_url: string, _body: unknown, _headers?: Record<string, string>) => {
            return Promise.resolve(
              new Response(
                JSON.stringify({
                  id: "msg_test",
                  type: "message",
                  role: "assistant",
                  content: [{ type: "text", text: JSON.stringify(partialSpec) }],
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

        const messages: Message[] = [
          { sender: "U123", text: "Build something", timestamp: "123.456" },
        ];

        const result = await client.synthesizeSpec(messages);

        assertEquals(result.title, "Partial Feature");
        assertEquals(result.overview, "Only some fields.");
        // Missing fields should have defaults
        assertEquals(Array.isArray(result.goals), true);
        assertEquals(Array.isArray(result.non_goals), true);
        assertEquals(Array.isArray(result.personas), true);
        assertEquals(Array.isArray(result.use_cases), true);
        assertEquals(typeof result.problem_statement, "string");
        assertEquals(typeof result.technical_details, "string");
        assertEquals(Array.isArray(result.open_questions), true);
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
                    { type: "text", text: "Here is my analysis of the conversation..." },
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

        const messages: Message[] = [
          { sender: "U123", text: "Build something", timestamp: "123.456" },
        ];

        // Should not throw, should return a fallback spec
        const result = await client.synthesizeSpec(messages);

        assertEquals(typeof result.title, "string");
        assertEquals(typeof result.overview, "string");
      });
    });

    describe("Error handling", () => {
      it("should throw AnthropicModelError on 400 response", async () => {
        const api = createErrorApi(400, "Invalid request format");
        const client = new AnthropicClientImpl(api, "test-api-key");

        const messages: Message[] = [
          { sender: "U123", text: "Build something", timestamp: "123.456" },
        ];

        await assertRejects(
          () => client.synthesizeSpec(messages),
          AnthropicModelError,
        );
      });

      it("should handle rate limit with retry", async () => {
        let callCount = 0;
        const validSpec: SpecDocument = {
          title: "After Retry",
          overview: "Spec after rate limit retry.",
          problem_statement: "",
          goals: [],
          non_goals: [],
          personas: [],
          use_cases: [],
          technical_details: "",
          open_questions: [],
        };

        const api: MockAnthropicApi = {
          post: (_url: string, _body: unknown, _headers?: Record<string, string>) => {
            callCount++;
            if (callCount === 1) {
              // First call returns 429
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
            // Subsequent calls succeed
            return Promise.resolve(
              new Response(
                JSON.stringify({
                  id: "msg_test",
                  type: "message",
                  role: "assistant",
                  content: [{ type: "text", text: JSON.stringify(validSpec) }],
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

        const messages: Message[] = [
          { sender: "U123", text: "Build something", timestamp: "123.456" },
        ];

        const result = await client.synthesizeSpec(messages);

        assertEquals(result.title, "After Retry");
        assertEquals(callCount >= 2, true);
      });
    });
  });
});

describe("Property: Spec Synthesis Produces Valid SpecDocument", () => {
  /**
   * Property: synthesizeSpec MUST return a valid SpecDocument with:
   * - title (non-empty string)
   * - overview (string)
   * - problem_statement (string)
   * - goals (array)
   * - non_goals (array)
   * - personas (array)
   * - use_cases (array)
   * - technical_details (string)
   * - open_questions (array)
   */

  it("should always return spec with all required fields", async () => {
    const api = createMockApiWithSpec({
      title: "Valid Spec",
      overview: "Test",
      problem_statement: "Test",
      goals: [],
      non_goals: [],
      personas: [],
      use_cases: [],
      technical_details: "",
      open_questions: [],
    });
    const client = new AnthropicClientImpl(api, "test-api-key");

    const messages: Message[] = [
      { sender: "U123", text: "Build a feature", timestamp: "123.456" },
    ];

    const result = await client.synthesizeSpec(messages);

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
