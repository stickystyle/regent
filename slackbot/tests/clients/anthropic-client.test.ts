// ABOUTME: Tests for Anthropic client with conversation continuation and spec synthesis.
// ABOUTME: Validates request formatting, response parsing, confidence extraction, and retry logic.

import { assertEquals, assertRejects } from "@std/assert";
import { afterEach, beforeEach, describe, it } from "@std/testing/bdd";
import { AnthropicClientImpl, MockAnthropicClient } from "../../src/clients/anthropic-client.ts";
import type { Message } from "../../src/types/message.ts";
import { Framework } from "../../src/types/repository-context.ts";
import type { RepositoryContext } from "../../src/types/repository-context.ts";
import type { SpecDocument } from "../../src/types/spec-document.ts";
import {
  AnthropicInputError,
  AnthropicModelError,
  AnthropicRateLimitError,
  NetworkTimeoutError,
} from "../../src/errors/types.ts";

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
 * Helper to create a mock Response object for Anthropic API responses.
 */
function createMockResponse(
  content: string,
  stopReason: string = "end_turn",
  inputTokens: number = 100,
  outputTokens: number = 50,
): Response {
  const body = JSON.stringify({
    id: "msg_test123",
    type: "message",
    role: "assistant",
    content: [{ type: "text", text: content }],
    model: "claude-sonnet-4-20250514",
    stop_reason: stopReason,
    usage: {
      input_tokens: inputTokens,
      output_tokens: outputTokens,
    },
  });

  return new Response(body, {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * Helper to create a mock error Response.
 */
function createErrorResponse(
  status: number,
  errorType: string,
  message: string,
  retryAfter?: number,
): Response {
  const body = JSON.stringify({
    type: "error",
    error: {
      type: errorType,
      message: message,
    },
  });

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (retryAfter !== undefined) {
    headers["retry-after"] = String(retryAfter);
  }

  return new Response(body, { status, headers });
}

describe("AnthropicClient", () => {
  describe("MockAnthropicClient", () => {
    let client: MockAnthropicClient;

    beforeEach(() => {
      client = new MockAnthropicClient();
    });

    afterEach(() => {
      client.clear();
    });

    describe("continueConversation", () => {
      it("should return default question response", async () => {
        const messages: Message[] = [
          { sender: "U123", text: "I want to build a login feature", timestamp: "123.456" },
        ];
        const context: RepositoryContext = {
          repository: "owner/repo",
          framework: Framework.React,
          patterns: [],
          relevant_files: [],
          structure: "",
        };

        const response = await client.continueConversation(messages, context);

        assertEquals(typeof response.question, "string");
        assertEquals(response.question.length > 0, true);
        assertEquals(typeof response.confidence_score, "number");
        assertEquals(response.confidence_score >= 0 && response.confidence_score <= 100, true);
      });

      it("should throw configured error", async () => {
        const error = new AnthropicRateLimitError(
          "Rate limited",
          "Too many requests",
          "Wait and retry",
          60,
        );
        client.setContinueConversationError(error);

        const messages: Message[] = [
          { sender: "U123", text: "Test message", timestamp: "123.456" },
        ];

        await assertRejects(
          () => client.continueConversation(messages, null),
          AnthropicRateLimitError,
        );
      });

      it("should allow configuring custom response", async () => {
        client.setNextQuestionResponse({
          question: "Custom question?",
          confidence_score: 75,
        });

        const messages: Message[] = [
          { sender: "U123", text: "Test", timestamp: "123.456" },
        ];

        const response = await client.continueConversation(messages, null);

        assertEquals(response.question, "Custom question?");
        assertEquals(response.confidence_score, 75);
      });
    });

    describe("synthesizeSpec", () => {
      it("should return default spec document", async () => {
        const messages: Message[] = [
          { sender: "U123", text: "Build a login feature", timestamp: "123.456" },
          { sender: "bot", text: "What authentication method?", timestamp: "123.457" },
          { sender: "U123", text: "OAuth2 with Google", timestamp: "123.458" },
        ];

        const spec = await client.synthesizeSpec(messages);

        assertEquals(typeof spec.title, "string");
        assertEquals(spec.title.length > 0, true);
        assertEquals(typeof spec.overview, "string");
        assertEquals(Array.isArray(spec.goals), true);
      });

      it("should throw configured error", async () => {
        const error = new AnthropicModelError(
          "Model error",
          "Content policy violation",
          "Modify prompt",
        );
        client.setSynthesizeSpecError(error);

        const messages: Message[] = [
          { sender: "U123", text: "Test", timestamp: "123.456" },
        ];

        await assertRejects(
          () => client.synthesizeSpec(messages),
          AnthropicModelError,
        );
      });

      it("should allow configuring custom spec response", async () => {
        const customSpec: SpecDocument = {
          title: "Custom Feature",
          overview: "Custom overview",
          problem_statement: "Custom problem",
          goals: ["Custom goal"],
          non_goals: [],
          personas: [],
          use_cases: [],
          technical_details: "",
          open_questions: [],
        };
        client.setNextSpecResponse(customSpec);

        const messages: Message[] = [
          { sender: "U123", text: "Test", timestamp: "123.456" },
        ];

        const spec = await client.synthesizeSpec(messages);

        assertEquals(spec.title, "Custom Feature");
        assertEquals(spec.overview, "Custom overview");
      });
    });

    describe("reviseSpec", () => {
      it("should return revised spec document", async () => {
        const originalSpec: SpecDocument = {
          title: "Original Feature",
          overview: "Original overview",
          problem_statement: "Original problem",
          goals: ["Original goal"],
          non_goals: [],
          personas: [],
          use_cases: [],
          technical_details: "",
          open_questions: [],
        };

        const revisedSpec = await client.reviseSpec(originalSpec, "Add more goals");

        assertEquals(typeof revisedSpec.title, "string");
        assertEquals(Array.isArray(revisedSpec.goals), true);
      });

      it("should throw configured error", async () => {
        const error = new AnthropicInputError(
          "Input too large",
          "Context exceeds limit",
          "Reduce context size",
        );
        client.setReviseSpecError(error);

        const spec: SpecDocument = {
          title: "Test",
          overview: "",
          problem_statement: "",
          goals: [],
          non_goals: [],
          personas: [],
          use_cases: [],
          technical_details: "",
          open_questions: [],
        };

        await assertRejects(
          () => client.reviseSpec(spec, "Feedback"),
          AnthropicInputError,
        );
      });
    });

    describe("extractConfidenceScore", () => {
      it("should extract confidence from I'm X% confident pattern", () => {
        const response = {
          content: [{ type: "text", text: "I'm 85% confident we have enough detail." }],
          stop_reason: "end_turn",
          usage: { input_tokens: 100, output_tokens: 50 },
        };

        const score = client.extractConfidenceScore(response);

        assertEquals(score, 85);
      });

      it("should extract confidence from X% confident pattern", () => {
        const response = {
          content: [{ type: "text", text: "Based on the discussion, 90% confident." }],
          stop_reason: "end_turn",
          usage: { input_tokens: 100, output_tokens: 50 },
        };

        const score = client.extractConfidenceScore(response);

        assertEquals(score, 90);
      });

      it("should extract confidence from confidence: X% pattern", () => {
        const response = {
          content: [{ type: "text", text: "My confidence: 75% for this spec." }],
          stop_reason: "end_turn",
          usage: { input_tokens: 100, output_tokens: 50 },
        };

        const score = client.extractConfidenceScore(response);

        assertEquals(score, 75);
      });

      it("should return 0 when no confidence pattern found", () => {
        const response = {
          content: [{ type: "text", text: "What is your authentication requirement?" }],
          stop_reason: "end_turn",
          usage: { input_tokens: 100, output_tokens: 50 },
        };

        const score = client.extractConfidenceScore(response);

        assertEquals(score, 0);
      });

      it("should handle empty content array", () => {
        const response = {
          content: [],
          stop_reason: "end_turn",
          usage: { input_tokens: 100, output_tokens: 0 },
        };

        const score = client.extractConfidenceScore(response);

        assertEquals(score, 0);
      });

      it("should handle non-text content blocks", () => {
        const response = {
          content: [{ type: "tool_use", id: "tool_123", name: "test", input: {} }],
          stop_reason: "tool_use",
          usage: { input_tokens: 100, output_tokens: 50 },
        };

        const score = client.extractConfidenceScore(response);

        assertEquals(score, 0);
      });

      it("should clamp confidence to 0-100 range", () => {
        const responseOver = {
          content: [{ type: "text", text: "I'm 150% confident!" }],
          stop_reason: "end_turn",
          usage: { input_tokens: 100, output_tokens: 50 },
        };

        assertEquals(client.extractConfidenceScore(responseOver), 100);
      });

      it("should extract exactly 95% confidence (review threshold)", () => {
        // Requirement 3.6: WHEN Claude's confidence score reaches 95% or higher
        // THEN the system SHALL transition to review phase.
        const response = {
          content: [{
            type: "text",
            text:
              "I believe we have covered all the key aspects. I'm 95% confident we have enough detail to create the spec.",
          }],
          stop_reason: "end_turn",
          usage: { input_tokens: 100, output_tokens: 50 },
        };

        const score = client.extractConfidenceScore(response);

        assertEquals(score, 95);
        assertEquals(score >= 95, true, "Score should meet 95% threshold for review phase");
      });

      it("should extract confidence above 95% (exceeds review threshold)", () => {
        // Requirement 3.6: WHEN Claude's confidence score reaches 95% or higher
        // THEN the system SHALL transition to review phase.
        const response = {
          content: [{
            type: "text",
            text:
              "The requirements are very clear and comprehensive. I'm 98% confident we have enough detail.",
          }],
          stop_reason: "end_turn",
          usage: { input_tokens: 100, output_tokens: 50 },
        };

        const score = client.extractConfidenceScore(response);

        assertEquals(score, 98);
        assertEquals(score >= 95, true, "Score should exceed 95% threshold for review phase");
      });
    });

    describe("Mock state management", () => {
      it("should clear all configured errors", async () => {
        client.setContinueConversationError(
          new NetworkTimeoutError("Test", "Test", "Test"),
        );
        client.setSynthesizeSpecError(
          new AnthropicModelError("Test", "Test", "Test"),
        );
        client.clear();

        // Should succeed after clear
        const messages: Message[] = [
          { sender: "U123", text: "Test", timestamp: "123.456" },
        ];
        await client.continueConversation(messages, null);
        await client.synthesizeSpec(messages);
      });

      it("should record conversation history", async () => {
        const messages: Message[] = [
          { sender: "U123", text: "Test message", timestamp: "123.456" },
        ];
        const context: RepositoryContext = {
          repository: "owner/repo",
          framework: Framework.React,
          patterns: [],
          relevant_files: [],
          structure: "",
        };

        await client.continueConversation(messages, context);

        const history = client.getConversationHistory();
        assertEquals(history.length, 1);
        assertEquals(history[0].messages, messages);
        assertEquals(history[0].context, context);
      });
    });
  });

  describe("AnthropicClientImpl", () => {
    describe("Request formatting", () => {
      it("should format messages array correctly", async () => {
        let capturedBody: unknown = null;

        const mockApi: MockAnthropicApi = {
          post: async (_url: string, body: unknown, _headers?: Record<string, string>) => {
            capturedBody = body;
            return createMockResponse(
              "What authentication method would you prefer? I'm 50% confident.",
            );
          },
        };

        const client = new AnthropicClientImpl(mockApi, "test-api-key");
        const messages: Message[] = [
          { sender: "U123", text: "I want to build a login feature", timestamp: "123.456" },
          { sender: "bot", text: "What type of login?", timestamp: "123.457" },
          { sender: "U456", text: "OAuth2 please", timestamp: "123.458" },
        ];

        await client.continueConversation(messages, null);

        const body = capturedBody as Record<string, unknown>;
        assertEquals(body.model, "claude-sonnet-4-20250514");
        assertEquals(typeof body.max_tokens, "number");
        assertEquals(typeof body.system, "string");
        assertEquals(Array.isArray(body.messages), true);

        const apiMessages = body.messages as Array<{ role: string; content: string }>;
        assertEquals(apiMessages.length, 3);
        assertEquals(apiMessages[0].role, "user");
        assertEquals(apiMessages[1].role, "assistant");
        assertEquals(apiMessages[2].role, "user");
      });

      it("should include attachment content in message", async () => {
        let capturedBody: unknown = null;

        const mockApi: MockAnthropicApi = {
          post: async (_url: string, body: unknown, _headers?: Record<string, string>) => {
            capturedBody = body;
            return createMockResponse("Question about the spec? I'm 50% confident.");
          },
        };

        const client = new AnthropicClientImpl(mockApi, "test-api-key");
        const messages: Message[] = [
          {
            sender: "U123",
            text: "Here is my existing spec",
            timestamp: "123.456",
            attachments: [
              {
                file_id: "F123",
                filename: "spec.md",
                mimetype: "text/markdown",
                content: "# Existing Spec\n\nThis is the current specification.",
              },
            ],
          },
        ];

        await client.continueConversation(messages, null);

        const body = capturedBody as Record<string, unknown>;
        const apiMessages = body.messages as Array<{ role: string; content: string }>;
        assertEquals(apiMessages.length, 1);
        assertEquals(apiMessages[0].content.includes("Here is my existing spec"), true);
        assertEquals(apiMessages[0].content.includes("spec.md"), true);
        assertEquals(apiMessages[0].content.includes("text/markdown"), true);
        assertEquals(apiMessages[0].content.includes("# Existing Spec"), true);
        assertEquals(apiMessages[0].content.includes("This is the current specification."), true);
      });

      it("should include multiple attachments in message", async () => {
        let capturedBody: unknown = null;

        const mockApi: MockAnthropicApi = {
          post: async (_url: string, body: unknown, _headers?: Record<string, string>) => {
            capturedBody = body;
            return createMockResponse("Question? I'm 50% confident.");
          },
        };

        const client = new AnthropicClientImpl(mockApi, "test-api-key");
        const messages: Message[] = [
          {
            sender: "U123",
            text: "Here are my files",
            timestamp: "123.456",
            attachments: [
              {
                file_id: "F123",
                filename: "spec.md",
                mimetype: "text/markdown",
                content: "# Spec content",
              },
              {
                file_id: "F456",
                filename: "readme.txt",
                mimetype: "text/plain",
                content: "Readme content",
              },
            ],
          },
        ];

        await client.continueConversation(messages, null);

        const body = capturedBody as Record<string, unknown>;
        const apiMessages = body.messages as Array<{ role: string; content: string }>;
        const content = apiMessages[0].content;
        assertEquals(content.includes("spec.md"), true);
        assertEquals(content.includes("readme.txt"), true);
        assertEquals(content.includes("# Spec content"), true);
        assertEquals(content.includes("Readme content"), true);
      });

      it("should include system prompt", async () => {
        let capturedBody: unknown = null;

        const mockApi: MockAnthropicApi = {
          post: async (_url: string, body: unknown, _headers?: Record<string, string>) => {
            capturedBody = body;
            return createMockResponse("Question? I'm 50% confident.");
          },
        };

        const client = new AnthropicClientImpl(mockApi, "test-api-key");
        const messages: Message[] = [
          { sender: "U123", text: "Test", timestamp: "123.456" },
        ];

        await client.continueConversation(messages, null);

        const body = capturedBody as Record<string, unknown>;
        assertEquals(typeof body.system, "string");
        assertEquals((body.system as string).length > 0, true);
      });

      it("should include repository context in system prompt when provided", async () => {
        let capturedBody: unknown = null;

        const mockApi: MockAnthropicApi = {
          post: async (_url: string, body: unknown, _headers?: Record<string, string>) => {
            capturedBody = body;
            return createMockResponse("Question about React? I'm 50% confident.");
          },
        };

        const client = new AnthropicClientImpl(mockApi, "test-api-key");
        const messages: Message[] = [
          { sender: "U123", text: "Test", timestamp: "123.456" },
        ];
        const context: RepositoryContext = {
          repository: "owner/my-react-app",
          framework: Framework.React,
          patterns: ["Component pattern"],
          relevant_files: [{ path: "src/App.tsx", description: "Main app" }],
          structure: "src/\n  components/",
        };

        await client.continueConversation(messages, context);

        const body = capturedBody as Record<string, unknown>;
        const systemPrompt = body.system as string;
        assertEquals(systemPrompt.includes("owner/my-react-app"), true);
        assertEquals(systemPrompt.includes("react"), true);
      });

      it("should set correct authorization header", async () => {
        let capturedHeaders: Record<string, string> | undefined = undefined;

        const mockApi: MockAnthropicApi = {
          post: async (
            _url: string,
            _body: unknown,
            headers?: Record<string, string>,
          ) => {
            capturedHeaders = headers;
            return createMockResponse("Question? I'm 50% confident.");
          },
        };

        const client = new AnthropicClientImpl(mockApi, "sk-test-key-123");
        const messages: Message[] = [
          { sender: "U123", text: "Test", timestamp: "123.456" },
        ];

        await client.continueConversation(messages, null);

        assertEquals(capturedHeaders?.["x-api-key"], "sk-test-key-123");
        assertEquals(capturedHeaders?.["anthropic-version"], "2023-06-01");
        assertEquals(capturedHeaders?.["content-type"], "application/json");
      });
    });

    describe("Response parsing", () => {
      it("should extract question text from response", async () => {
        const mockApi: MockAnthropicApi = {
          post: async () => {
            return createMockResponse(
              "What authentication provider would you like to use? I'm 60% confident we have enough detail.",
            );
          },
        };

        const client = new AnthropicClientImpl(mockApi, "test-api-key");
        const messages: Message[] = [
          { sender: "U123", text: "Build login", timestamp: "123.456" },
        ];

        const response = await client.continueConversation(messages, null);

        assertEquals(response.question.includes("authentication"), true);
        assertEquals(response.confidence_score, 60);
      });

      it("should handle response with no confidence score", async () => {
        const mockApi: MockAnthropicApi = {
          post: async () => {
            return createMockResponse(
              "What is your preferred database?",
            );
          },
        };

        const client = new AnthropicClientImpl(mockApi, "test-api-key");
        const messages: Message[] = [
          { sender: "U123", text: "Build feature", timestamp: "123.456" },
        ];

        const response = await client.continueConversation(messages, null);

        assertEquals(response.question, "What is your preferred database?");
        assertEquals(response.confidence_score, 0);
      });
    });

    describe("Error handling", () => {
      it("should throw AnthropicRateLimitError for 429 response", async () => {
        const mockApi: MockAnthropicApi = {
          post: async () => {
            return createErrorResponse(429, "rate_limit_error", "Rate limit exceeded", 60);
          },
        };

        const client = new AnthropicClientImpl(mockApi, "test-api-key", { maxAttempts: 1 });
        const messages: Message[] = [
          { sender: "U123", text: "Test", timestamp: "123.456" },
        ];

        await assertRejects(
          () => client.continueConversation(messages, null),
          AnthropicRateLimitError,
        );
      });

      it("should throw AnthropicModelError for model refusal", async () => {
        const mockApi: MockAnthropicApi = {
          post: async () => {
            return createErrorResponse(400, "invalid_request_error", "Content policy violation");
          },
        };

        const client = new AnthropicClientImpl(mockApi, "test-api-key");
        const messages: Message[] = [
          { sender: "U123", text: "Test", timestamp: "123.456" },
        ];

        await assertRejects(
          () => client.continueConversation(messages, null),
          AnthropicModelError,
        );
      });

      it("should throw AnthropicInputError for context too large", async () => {
        const mockApi: MockAnthropicApi = {
          post: async () => {
            return createErrorResponse(400, "invalid_request_error", "context_length_exceeded");
          },
        };

        const client = new AnthropicClientImpl(mockApi, "test-api-key");
        const messages: Message[] = [
          { sender: "U123", text: "Test", timestamp: "123.456" },
        ];

        await assertRejects(
          () => client.continueConversation(messages, null),
          AnthropicInputError,
        );
      });

      it("should throw NetworkTimeoutError for 5xx response", async () => {
        const mockApi: MockAnthropicApi = {
          post: async () => {
            return createErrorResponse(500, "server_error", "Internal server error");
          },
        };

        const client = new AnthropicClientImpl(mockApi, "test-api-key", { maxAttempts: 1 });
        const messages: Message[] = [
          { sender: "U123", text: "Test", timestamp: "123.456" },
        ];

        await assertRejects(
          () => client.continueConversation(messages, null),
          NetworkTimeoutError,
        );
      });
    });

    describe("Retry behavior", () => {
      it("should retry transient errors", async () => {
        let callCount = 0;

        const mockApi: MockAnthropicApi = {
          post: async () => {
            callCount++;
            if (callCount < 3) {
              return createErrorResponse(500, "server_error", "Internal error");
            }
            return createMockResponse("Question? I'm 50% confident.");
          },
        };

        const client = new AnthropicClientImpl(mockApi, "test-api-key", {
          maxAttempts: 3,
          baseDelayMs: 1, // Very short delay for tests
        });
        const messages: Message[] = [
          { sender: "U123", text: "Test", timestamp: "123.456" },
        ];

        const response = await client.continueConversation(messages, null);

        assertEquals(callCount, 3);
        assertEquals(typeof response.question, "string");
      });

      it("should not retry permanent errors", async () => {
        let callCount = 0;

        const mockApi: MockAnthropicApi = {
          post: async () => {
            callCount++;
            return createErrorResponse(400, "invalid_request_error", "Invalid input");
          },
        };

        const client = new AnthropicClientImpl(mockApi, "test-api-key", { maxAttempts: 3 });
        const messages: Message[] = [
          { sender: "U123", text: "Test", timestamp: "123.456" },
        ];

        await assertRejects(
          () => client.continueConversation(messages, null),
          AnthropicModelError,
        );

        assertEquals(callCount, 1);
      });

      it("should exhaust retries for persistent transient errors", async () => {
        let callCount = 0;

        const mockApi: MockAnthropicApi = {
          post: async () => {
            callCount++;
            return createErrorResponse(500, "server_error", "Always failing");
          },
        };

        const client = new AnthropicClientImpl(mockApi, "test-api-key", {
          maxAttempts: 3,
          baseDelayMs: 1,
        });
        const messages: Message[] = [
          { sender: "U123", text: "Test", timestamp: "123.456" },
        ];

        await assertRejects(
          () => client.continueConversation(messages, null),
          NetworkTimeoutError,
        );

        assertEquals(callCount, 3);
      });

      it("should retry rate limit errors using retry-after header", async () => {
        let callCount = 0;
        const callTimestamps: number[] = [];

        const mockApi: MockAnthropicApi = {
          post: async () => {
            callCount++;
            callTimestamps.push(Date.now());
            if (callCount < 2) {
              // Return 429 with 1 second retry-after
              return createErrorResponse(429, "rate_limit_error", "Rate limited", 1);
            }
            return createMockResponse("Question? I'm 50% confident.");
          },
        };

        const client = new AnthropicClientImpl(mockApi, "test-api-key");
        const messages: Message[] = [
          { sender: "U123", text: "Test", timestamp: "123.456" },
        ];

        const response = await client.continueConversation(messages, null);

        assertEquals(callCount, 2);
        assertEquals(typeof response.question, "string");

        // Verify that there was a delay between calls (at least 900ms for 1 second retry-after)
        if (callTimestamps.length >= 2) {
          const delayMs = callTimestamps[1] - callTimestamps[0];
          assertEquals(
            delayMs >= 900,
            true,
            `Expected delay of ~1000ms from retry-after header, got ${delayMs}ms`,
          );
        }
      });

      it("should capture retry-after header value in AnthropicRateLimitError", async () => {
        const mockApi: MockAnthropicApi = {
          post: async () => {
            // Return 429 with specific retry-after value
            return createErrorResponse(429, "rate_limit_error", "Rate limited", 30);
          },
        };

        // Create client that won't retry
        const client = new AnthropicClientImpl(mockApi, "test-api-key");
        const messages: Message[] = [
          { sender: "U123", text: "Test", timestamp: "123.456" },
        ];

        try {
          await client.continueConversation(messages, null);
          // Should not reach here
          assertEquals(true, false, "Expected AnthropicRateLimitError to be thrown");
        } catch (error) {
          if (error instanceof AnthropicRateLimitError) {
            assertEquals(error.retryAfterSeconds, 30);
          } else {
            throw error;
          }
        }
      });
    });

    describe("synthesizeSpec", () => {
      it("should generate spec document from conversation", async () => {
        const mockSpec: SpecDocument = {
          title: "User Authentication",
          overview: "OAuth2-based login system",
          problem_statement: "Users need secure login",
          goals: ["Implement OAuth2", "Support Google login"],
          non_goals: ["Password reset flow"],
          personas: [{ name: "End User", description: "Regular app user" }],
          use_cases: [{ id: "UC1", title: "Login", description: "User logs in via Google" }],
          technical_details: "Use passport.js for OAuth",
          open_questions: ["Which OAuth providers?"],
        };

        const mockApi: MockAnthropicApi = {
          post: async () => {
            return createMockResponse(JSON.stringify(mockSpec));
          },
        };

        const client = new AnthropicClientImpl(mockApi, "test-api-key");
        const messages: Message[] = [
          { sender: "U123", text: "Build login", timestamp: "123.456" },
          { sender: "bot", text: "What auth?", timestamp: "123.457" },
          { sender: "U123", text: "OAuth2 with Google", timestamp: "123.458" },
        ];

        const spec = await client.synthesizeSpec(messages);

        assertEquals(spec.title, "User Authentication");
        assertEquals(spec.goals.length, 2);
      });
    });

    describe("reviseSpec", () => {
      it("should revise spec based on feedback", async () => {
        const revisedSpec: SpecDocument = {
          title: "User Authentication",
          overview: "OAuth2-based login system with MFA",
          problem_statement: "Users need secure login with MFA",
          goals: ["Implement OAuth2", "Support Google login", "Add MFA support"],
          non_goals: ["Password reset flow"],
          personas: [{ name: "End User", description: "Regular app user" }],
          use_cases: [{ id: "UC1", title: "Login", description: "User logs in via Google" }],
          technical_details: "Use passport.js for OAuth",
          open_questions: [],
        };

        const mockApi: MockAnthropicApi = {
          post: async () => {
            return createMockResponse(JSON.stringify(revisedSpec));
          },
        };

        const client = new AnthropicClientImpl(mockApi, "test-api-key");
        const originalSpec: SpecDocument = {
          title: "User Authentication",
          overview: "OAuth2-based login system",
          problem_statement: "Users need secure login",
          goals: ["Implement OAuth2", "Support Google login"],
          non_goals: ["Password reset flow"],
          personas: [],
          use_cases: [],
          technical_details: "",
          open_questions: ["Should we add MFA?"],
        };

        const spec = await client.reviseSpec(originalSpec, "Add MFA support to the goals");

        assertEquals(spec.goals.length, 3);
        assertEquals(spec.goals.includes("Add MFA support"), true);
        assertEquals(spec.open_questions.length, 0);
      });
    });
  });
});
