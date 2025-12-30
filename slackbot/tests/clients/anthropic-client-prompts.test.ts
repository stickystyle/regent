// ABOUTME: Tests for phase-specific system prompts in AnthropicClient.
// ABOUTME: Validates questioning, synthesis, and revision prompts per Regent plugin patterns.

import { assertEquals } from "@std/assert";
import { beforeEach, describe, it } from "@std/testing/bdd";
import { AnthropicClientImpl } from "../../src/clients/anthropic-client.ts";
import { Framework } from "../../src/types/repository-context.ts";
import type { RepositoryContext } from "../../src/types/repository-context.ts";
import type { Message } from "../../src/types/message.ts";

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
      return Promise.resolve(
        new Response(
          JSON.stringify({
            id: "msg_test123",
            type: "message",
            role: "assistant",
            content: [{ type: "text", text: "Question? I'm 50% confident." }],
            model: "claude-sonnet-4-20250514",
            stop_reason: "end_turn",
            usage: { input_tokens: 100, output_tokens: 50 },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );
    },
  };

  return { api, getCapturedBody: () => capturedBody };
}

/**
 * Helper to create mock response with specific JSON content.
 */
function createJsonResponse(jsonContent: unknown): Response {
  return new Response(
    JSON.stringify({
      id: "msg_test123",
      type: "message",
      role: "assistant",
      content: [{ type: "text", text: JSON.stringify(jsonContent) }],
      model: "claude-sonnet-4-20250514",
      stop_reason: "end_turn",
      usage: { input_tokens: 100, output_tokens: 50 },
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

describe("AnthropicClient System Prompts", () => {
  describe("Questioning Phase Prompt", () => {
    describe("without repository context", () => {
      let client: AnthropicClientImpl;
      let getCapturedBody: () => Record<string, unknown> | null;

      beforeEach(() => {
        const capturing = createCapturingApi();
        getCapturedBody = capturing.getCapturedBody;
        client = new AnthropicClientImpl(capturing.api, "test-api-key");
      });

      it("should instruct Claude to ask exactly ONE question per turn", async () => {
        const messages: Message[] = [
          { sender: "U123", text: "I want to build a login feature", timestamp: "123.456" },
        ];

        await client.continueConversation(messages, null);

        const body = getCapturedBody();
        const systemPrompt = body?.system as string;
        assertEquals(systemPrompt.toLowerCase().includes("one question"), true);
        assertEquals(
          systemPrompt.toLowerCase().includes("exactly one") ||
            systemPrompt.toLowerCase().includes("one question per"),
          true,
        );
      });

      it("should instruct Claude to track confidence score toward 95% threshold", async () => {
        const messages: Message[] = [
          { sender: "U123", text: "Build a feature", timestamp: "123.456" },
        ];

        await client.continueConversation(messages, null);

        const body = getCapturedBody();
        const systemPrompt = body?.system as string;
        assertEquals(systemPrompt.includes("confidence"), true);
        assertEquals(
          systemPrompt.includes("95%") || systemPrompt.includes("95 percent"),
          true,
        );
      });

      it("should instruct Claude to start at low confidence (20-40%)", async () => {
        const messages: Message[] = [
          { sender: "U123", text: "Build a feature", timestamp: "123.456" },
        ];

        await client.continueConversation(messages, null);

        const body = getCapturedBody();
        const systemPrompt = body?.system as string;
        // Should mention starting at low confidence
        assertEquals(
          systemPrompt.toLowerCase().includes("low confidence") ||
            systemPrompt.includes("20-40%") ||
            systemPrompt.includes("20%") ||
            (systemPrompt.includes("Start at") && systemPrompt.includes("confidence")),
          true,
        );
      });

      it("should specify confidence reporting format", async () => {
        const messages: Message[] = [
          { sender: "U123", text: "Build a feature", timestamp: "123.456" },
        ];

        await client.continueConversation(messages, null);

        const body = getCapturedBody();
        const systemPrompt = body?.system as string;
        // Should indicate how to report confidence (e.g., "I'm X% confident")
        assertEquals(
          systemPrompt.includes("%") && systemPrompt.includes("confident"),
          true,
        );
      });

      it("should NOT include repository context section when no repo provided", async () => {
        const messages: Message[] = [
          { sender: "U123", text: "Build a feature", timestamp: "123.456" },
        ];

        await client.continueConversation(messages, null);

        const body = getCapturedBody();
        const systemPrompt = body?.system as string;
        assertEquals(systemPrompt.includes("REPOSITORY CONTEXT"), false);
      });
    });

    describe("with repository context", () => {
      let client: AnthropicClientImpl;
      let getCapturedBody: () => Record<string, unknown> | null;

      beforeEach(() => {
        const capturing = createCapturingApi();
        getCapturedBody = capturing.getCapturedBody;
        client = new AnthropicClientImpl(capturing.api, "test-api-key");
      });

      it("should include repository name in system prompt", async () => {
        const messages: Message[] = [
          { sender: "U123", text: "Add a feature", timestamp: "123.456" },
        ];
        const context: RepositoryContext = {
          repository: "acme/backend-api",
          framework: Framework.FastAPI,
          patterns: [],
          relevant_files: [],
          structure: "",
        };

        await client.continueConversation(messages, context);

        const body = getCapturedBody();
        const systemPrompt = body?.system as string;
        assertEquals(systemPrompt.includes("acme/backend-api"), true);
      });

      it("should include framework information in system prompt", async () => {
        const messages: Message[] = [
          { sender: "U123", text: "Add a feature", timestamp: "123.456" },
        ];
        const context: RepositoryContext = {
          repository: "acme/frontend",
          framework: Framework.React,
          patterns: [],
          relevant_files: [],
          structure: "",
        };

        await client.continueConversation(messages, context);

        const body = getCapturedBody();
        const systemPrompt = body?.system as string;
        // Framework should be mentioned (case-insensitive since it's an enum value)
        assertEquals(systemPrompt.toLowerCase().includes("react"), true);
      });

      it("should include detected patterns when present", async () => {
        const messages: Message[] = [
          { sender: "U123", text: "Add a feature", timestamp: "123.456" },
        ];
        const context: RepositoryContext = {
          repository: "acme/app",
          framework: Framework.Express,
          patterns: ["Repository pattern", "Dependency injection"],
          relevant_files: [],
          structure: "",
        };

        await client.continueConversation(messages, context);

        const body = getCapturedBody();
        const systemPrompt = body?.system as string;
        assertEquals(systemPrompt.includes("Repository pattern"), true);
        assertEquals(systemPrompt.includes("Dependency injection"), true);
      });

      it("should include project structure when provided", async () => {
        const messages: Message[] = [
          { sender: "U123", text: "Add a feature", timestamp: "123.456" },
        ];
        const context: RepositoryContext = {
          repository: "acme/app",
          framework: Framework.Deno,
          patterns: [],
          relevant_files: [],
          structure: "src/\n  components/\n  utils/",
        };

        await client.continueConversation(messages, context);

        const body = getCapturedBody();
        const systemPrompt = body?.system as string;
        assertEquals(systemPrompt.includes("src/"), true);
        assertEquals(systemPrompt.includes("components/"), true);
      });

      it("should instruct Claude to reference existing patterns", async () => {
        const messages: Message[] = [
          { sender: "U123", text: "Add a feature", timestamp: "123.456" },
        ];
        const context: RepositoryContext = {
          repository: "acme/app",
          framework: Framework.NextJS,
          patterns: ["API routes pattern"],
          relevant_files: [],
          structure: "",
        };

        await client.continueConversation(messages, context);

        const body = getCapturedBody();
        const systemPrompt = body?.system as string;
        // Should instruct to consider/reference existing codebase
        assertEquals(
          systemPrompt.toLowerCase().includes("existing") ||
            systemPrompt.toLowerCase().includes("codebase") ||
            systemPrompt.toLowerCase().includes("integration") ||
            systemPrompt.toLowerCase().includes("consider"),
          true,
        );
      });

      it("should handle empty patterns gracefully", async () => {
        const messages: Message[] = [
          { sender: "U123", text: "Add a feature", timestamp: "123.456" },
        ];
        const context: RepositoryContext = {
          repository: "acme/new-project",
          framework: Framework.Unknown,
          patterns: [],
          relevant_files: [],
          structure: "",
        };

        await client.continueConversation(messages, context);

        const body = getCapturedBody();
        const systemPrompt = body?.system as string;
        // Should still include repository context section
        assertEquals(systemPrompt.includes("REPOSITORY CONTEXT"), true);
        assertEquals(systemPrompt.includes("acme/new-project"), true);
      });
    });
  });

  describe("Synthesis Phase Prompt", () => {
    let client: AnthropicClientImpl;
    let getCapturedBody: () => Record<string, unknown> | null;

    beforeEach(() => {
      let capturedBody: Record<string, unknown> | null = null;

      const api: MockAnthropicApi = {
        post: (_url: string, body: unknown, _headers?: Record<string, string>) => {
          capturedBody = body as Record<string, unknown>;
          const mockSpec = {
            title: "Test Feature",
            overview: "Test overview",
            problem_statement: "Test problem",
            goals: ["Goal 1"],
            non_goals: [],
            personas: [],
            use_cases: [],
            technical_details: "",
            open_questions: [],
          };
          return Promise.resolve(createJsonResponse(mockSpec));
        },
      };

      getCapturedBody = () => capturedBody;
      client = new AnthropicClientImpl(api, "test-api-key");
    });

    it("should instruct Claude to synthesize conversation into spec document", async () => {
      const messages: Message[] = [
        { sender: "U123", text: "Build login", timestamp: "123.456" },
        { sender: "bot", text: "What auth method?", timestamp: "123.457" },
        { sender: "U123", text: "OAuth2", timestamp: "123.458" },
      ];

      await client.synthesizeSpec(messages);

      const body = getCapturedBody();
      const systemPrompt = body?.system as string;
      assertEquals(
        systemPrompt.toLowerCase().includes("synthesize") ||
          systemPrompt.toLowerCase().includes("synthesizing") ||
          systemPrompt.toLowerCase().includes("spec"),
        true,
      );
    });

    it("should specify required JSON structure with all Regent fields", async () => {
      const messages: Message[] = [
        { sender: "U123", text: "Build feature", timestamp: "123.456" },
      ];

      await client.synthesizeSpec(messages);

      const body = getCapturedBody();
      const systemPrompt = body?.system as string;
      // Must specify all required Regent brainstorm.md fields
      assertEquals(systemPrompt.includes("title"), true);
      assertEquals(systemPrompt.includes("overview"), true);
      assertEquals(systemPrompt.includes("problem"), true);
      assertEquals(systemPrompt.includes("goals"), true);
      assertEquals(systemPrompt.includes("non_goals") || systemPrompt.includes("non-goals"), true);
      assertEquals(systemPrompt.includes("personas"), true);
      assertEquals(systemPrompt.includes("use_cases") || systemPrompt.includes("use cases"), true);
    });

    it("should instruct to output ONLY JSON", async () => {
      const messages: Message[] = [
        { sender: "U123", text: "Build feature", timestamp: "123.456" },
      ];

      await client.synthesizeSpec(messages);

      const body = getCapturedBody();
      const systemPrompt = body?.system as string;
      assertEquals(
        systemPrompt.toLowerCase().includes("only") &&
          systemPrompt.toLowerCase().includes("json"),
        true,
      );
    });

    it("should instruct to extract information from conversation", async () => {
      const messages: Message[] = [
        { sender: "U123", text: "Build feature", timestamp: "123.456" },
      ];

      await client.synthesizeSpec(messages);

      const body = getCapturedBody();
      const systemPrompt = body?.system as string;
      assertEquals(
        systemPrompt.toLowerCase().includes("extract") ||
          systemPrompt.toLowerCase().includes("conversation"),
        true,
      );
    });

    it("should instruct to handle empty fields with defaults", async () => {
      const messages: Message[] = [
        { sender: "U123", text: "Build feature", timestamp: "123.456" },
      ];

      await client.synthesizeSpec(messages);

      const body = getCapturedBody();
      const systemPrompt = body?.system as string;
      assertEquals(
        systemPrompt.toLowerCase().includes("empty") ||
          systemPrompt.toLowerCase().includes("all fields"),
        true,
      );
    });
  });

  describe("Revision Phase Prompt", () => {
    let client: AnthropicClientImpl;
    let getCapturedBody: () => Record<string, unknown> | null;

    beforeEach(() => {
      let capturedBody: Record<string, unknown> | null = null;

      const api: MockAnthropicApi = {
        post: (_url: string, body: unknown, _headers?: Record<string, string>) => {
          capturedBody = body as Record<string, unknown>;
          const revisedSpec = {
            title: "Revised Feature",
            overview: "Revised overview",
            problem_statement: "Revised problem",
            goals: ["Revised goal"],
            non_goals: [],
            personas: [],
            use_cases: [],
            technical_details: "",
            open_questions: [],
          };
          return Promise.resolve(createJsonResponse(revisedSpec));
        },
      };

      getCapturedBody = () => capturedBody;
      client = new AnthropicClientImpl(api, "test-api-key");
    });

    it("should instruct Claude to incorporate feedback", async () => {
      const originalSpec = {
        title: "Original",
        overview: "Original overview",
        problem_statement: "",
        goals: [],
        non_goals: [],
        personas: [],
        use_cases: [],
        technical_details: "",
        open_questions: [],
      };

      await client.reviseSpec(originalSpec, "Add more detail to goals");

      const body = getCapturedBody();
      const systemPrompt = body?.system as string;
      assertEquals(
        systemPrompt.toLowerCase().includes("feedback") ||
          systemPrompt.toLowerCase().includes("revise") ||
          systemPrompt.toLowerCase().includes("revision"),
        true,
      );
    });

    it("should instruct to preserve original structure", async () => {
      const originalSpec = {
        title: "Original",
        overview: "Original overview",
        problem_statement: "",
        goals: [],
        non_goals: [],
        personas: [],
        use_cases: [],
        technical_details: "",
        open_questions: [],
      };

      await client.reviseSpec(originalSpec, "Update overview");

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
      const originalSpec = {
        title: "Original",
        overview: "Original overview",
        problem_statement: "",
        goals: [],
        non_goals: [],
        personas: [],
        use_cases: [],
        technical_details: "",
        open_questions: [],
      };

      await client.reviseSpec(originalSpec, "Fix the problem statement");

      const body = getCapturedBody();
      const systemPrompt = body?.system as string;
      assertEquals(
        systemPrompt.toLowerCase().includes("only") &&
          (systemPrompt.toLowerCase().includes("relevant") ||
            systemPrompt.toLowerCase().includes("sections") ||
            systemPrompt.toLowerCase().includes("modify")),
        true,
      );
    });

    it("should instruct to output ONLY JSON", async () => {
      const originalSpec = {
        title: "Original",
        overview: "Original overview",
        problem_statement: "",
        goals: [],
        non_goals: [],
        personas: [],
        use_cases: [],
        technical_details: "",
        open_questions: [],
      };

      await client.reviseSpec(originalSpec, "Some feedback");

      const body = getCapturedBody();
      const systemPrompt = body?.system as string;
      assertEquals(
        systemPrompt.toLowerCase().includes("only") &&
          systemPrompt.toLowerCase().includes("json"),
        true,
      );
    });

    it("should include current spec and feedback in user message", async () => {
      const originalSpec = {
        title: "Test Feature",
        overview: "Test overview",
        problem_statement: "",
        goals: ["Goal 1"],
        non_goals: [],
        personas: [],
        use_cases: [],
        technical_details: "",
        open_questions: [],
      };
      const feedback = "Please add more goals related to security";

      await client.reviseSpec(originalSpec, feedback);

      const body = getCapturedBody();
      const messages = body?.messages as Array<{ role: string; content: string }>;
      assertEquals(messages.length, 1);
      assertEquals(messages[0].role, "user");
      // User message should contain the current spec
      assertEquals(messages[0].content.includes("Test Feature"), true);
      assertEquals(messages[0].content.includes("Goal 1"), true);
      // User message should contain the feedback
      assertEquals(messages[0].content.includes(feedback), true);
    });
  });

  describe("Codebase Context Formatting", () => {
    let client: AnthropicClientImpl;
    let getCapturedBody: () => Record<string, unknown> | null;

    beforeEach(() => {
      const capturing = createCapturingApi();
      getCapturedBody = capturing.getCapturedBody;
      client = new AnthropicClientImpl(capturing.api, "test-api-key");
    });

    it("should format repository context as distinct section", async () => {
      const messages: Message[] = [
        { sender: "U123", text: "Build feature", timestamp: "123.456" },
      ];
      const context: RepositoryContext = {
        repository: "acme/app",
        framework: Framework.React,
        patterns: [],
        relevant_files: [],
        structure: "",
      };

      await client.continueConversation(messages, context);

      const body = getCapturedBody();
      const systemPrompt = body?.system as string;
      assertEquals(systemPrompt.includes("REPOSITORY CONTEXT"), true);
    });

    it("should include all context fields in the section", async () => {
      const messages: Message[] = [
        { sender: "U123", text: "Build feature", timestamp: "123.456" },
      ];
      const context: RepositoryContext = {
        repository: "myorg/myrepo",
        framework: Framework.Django,
        patterns: ["MVT pattern", "Class-based views"],
        relevant_files: [
          { path: "models.py", description: "Database models" },
        ],
        structure: "app/\n  models/\n  views/",
      };

      await client.continueConversation(messages, context);

      const body = getCapturedBody();
      const systemPrompt = body?.system as string;
      // Repository name
      assertEquals(systemPrompt.includes("myorg/myrepo"), true);
      // Framework (case-insensitive enum value)
      assertEquals(systemPrompt.toLowerCase().includes("django"), true);
      // Patterns
      assertEquals(systemPrompt.includes("MVT pattern"), true);
      assertEquals(systemPrompt.includes("Class-based views"), true);
      // Structure
      assertEquals(systemPrompt.includes("app/"), true);
      assertEquals(systemPrompt.includes("models/"), true);
    });

    it("should join multiple patterns with appropriate separator", async () => {
      const messages: Message[] = [
        { sender: "U123", text: "Build feature", timestamp: "123.456" },
      ];
      const context: RepositoryContext = {
        repository: "acme/app",
        framework: Framework.Express,
        patterns: ["MVC", "Middleware chain", "Route handlers"],
        relevant_files: [],
        structure: "",
      };

      await client.continueConversation(messages, context);

      const body = getCapturedBody();
      const systemPrompt = body?.system as string;
      // Patterns should appear together (separated by comma or similar)
      assertEquals(systemPrompt.includes("MVC"), true);
      assertEquals(systemPrompt.includes("Middleware chain"), true);
      assertEquals(systemPrompt.includes("Route handlers"), true);
    });

    it("should handle context with no patterns gracefully", async () => {
      const messages: Message[] = [
        { sender: "U123", text: "Build feature", timestamp: "123.456" },
      ];
      const context: RepositoryContext = {
        repository: "acme/new-project",
        framework: Framework.Unknown,
        patterns: [],
        relevant_files: [],
        structure: "",
      };

      await client.continueConversation(messages, context);

      const body = getCapturedBody();
      const systemPrompt = body?.system as string;
      // Should include "None detected" or similar for empty patterns
      assertEquals(
        systemPrompt.includes("None") || systemPrompt.includes("none"),
        true,
      );
    });
  });

  describe("Prompt Coverage Areas (from brainstorm.md)", () => {
    let client: AnthropicClientImpl;
    let getCapturedBody: () => Record<string, unknown> | null;

    beforeEach(() => {
      const capturing = createCapturingApi();
      getCapturedBody = capturing.getCapturedBody;
      client = new AnthropicClientImpl(capturing.api, "test-api-key");
    });

    it("should reference key coverage areas for questioning", async () => {
      const messages: Message[] = [
        { sender: "U123", text: "Build a feature", timestamp: "123.456" },
      ];

      await client.continueConversation(messages, null);

      const body = getCapturedBody();
      const systemPrompt = (body?.system as string).toLowerCase();
      // Should mention key areas from brainstorm.md Phase 2
      const coverageAreas = [
        "problem",
        "goal",
        "persona",
        "user",
        "technical",
        "constraint",
        "edge case",
      ];
      const mentionedAreas = coverageAreas.filter((area) => systemPrompt.includes(area));
      // At least some coverage areas should be mentioned
      assertEquals(
        mentionedAreas.length >= 3,
        true,
        `Expected at least 3 coverage areas, found: ${mentionedAreas.join(", ")}`,
      );
    });

    it("should instruct to build on previous answers", async () => {
      const messages: Message[] = [
        { sender: "U123", text: "Build a feature", timestamp: "123.456" },
      ];

      await client.continueConversation(messages, null);

      const body = getCapturedBody();
      const systemPrompt = (body?.system as string).toLowerCase();
      assertEquals(
        systemPrompt.includes("build on") ||
          systemPrompt.includes("previous") ||
          systemPrompt.includes("earlier"),
        true,
      );
    });

    it("should instruct to make questions specific and actionable", async () => {
      const messages: Message[] = [
        { sender: "U123", text: "Build a feature", timestamp: "123.456" },
      ];

      await client.continueConversation(messages, null);

      const body = getCapturedBody();
      const systemPrompt = (body?.system as string).toLowerCase();
      assertEquals(
        systemPrompt.includes("specific") || systemPrompt.includes("actionable"),
        true,
      );
    });
  });
});
