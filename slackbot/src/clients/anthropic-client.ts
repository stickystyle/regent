// ABOUTME: Anthropic Messages API client for conversation continuation and spec synthesis.
// ABOUTME: Implements Property 8.6 (retry on API errors) and Property 3.1/3.6 (questioning phase).

import {
  AnthropicInputError,
  AnthropicModelError,
  AnthropicRateLimitError,
  NetworkTimeoutError,
} from "../errors/types.ts";
import type { Message } from "../types/message.ts";
import type { RepositoryContext } from "../types/repository-context.ts";
import type { SpecDocument } from "../types/spec-document.ts";

/**
 * Default model version for Anthropic API requests.
 */
const DEFAULT_MODEL = "claude-sonnet-4-20250514";

/**
 * Extract text content from Anthropic response.
 *
 * @param response - Anthropic API response message
 * @returns Concatenated text from all text blocks
 */
function extractTextContent(response: AnthropicMessage): string {
  const textBlocks = response.content.filter((block) => block.type === "text");
  return textBlocks.map((block) => block.text || "").join("\n");
}

/**
 * Clamp confidence score to valid range (0-100).
 *
 * @param value - Raw confidence value
 * @returns Clamped value between 0 and 100
 */
function clampConfidence(value: number): number {
  return Math.min(100, Math.max(0, value));
}

/**
 * Parse confidence score from text using regex patterns.
 *
 * Looks for patterns like:
 * - "I'm X% confident" or "I am X% confident"
 * - "X% confident"
 * - "confidence: X%" or "confidence: X"
 *
 * @param text - Text to parse for confidence patterns
 * @returns Confidence score (0-100), or 0 if not found
 */
function parseConfidenceFromText(text: string): number {
  // Pattern 1: "I'm X% confident" or "I am X% confident"
  const imConfidentPattern = /I(?:'m| am)\s+(\d+)%\s+confident/i;
  const match1 = text.match(imConfidentPattern);
  if (match1) {
    return clampConfidence(parseInt(match1[1], 10));
  }

  // Pattern 2: "X% confident"
  const percentConfidentPattern = /(\d+)%\s+confident/i;
  const match2 = text.match(percentConfidentPattern);
  if (match2) {
    return clampConfidence(parseInt(match2[1], 10));
  }

  // Pattern 3: "confidence: X%" or "confidence: X"
  const confidenceColonPattern = /confidence:\s*(\d+)%?/i;
  const match3 = text.match(confidenceColonPattern);
  if (match3) {
    return clampConfidence(parseInt(match3[1], 10));
  }

  return 0;
}

/**
 * Response from Claude containing the next question and confidence score.
 */
export interface QuestionResponse {
  /** The question text from Claude */
  question: string;

  /** Claude's self-assessed confidence score (0-100) */
  confidence_score: number;
}

/**
 * Content block in an Anthropic API response.
 */
export interface AnthropicContentBlock {
  /** Content type: "text" or "tool_use" */
  type: string;

  /** Text content (only present when type is "text") */
  text?: string;

  /** Tool use ID (only present when type is "tool_use") */
  id?: string;

  /** Tool name (only present when type is "tool_use") */
  name?: string;

  /** Tool input (only present when type is "tool_use") */
  input?: unknown;
}

/**
 * Anthropic API response message structure.
 */
export interface AnthropicMessage {
  /** Array of content blocks in the response */
  content: AnthropicContentBlock[];

  /** Reason the response stopped: "end_turn", "max_tokens", or "tool_use" */
  stop_reason: string;

  /** Token usage statistics */
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

/**
 * AnthropicClient abstracts Anthropic Messages API operations for brainstorming.
 *
 * This interface enables dependency injection, allowing tests to use mock
 * implementations while production code uses the real Anthropic API client.
 */
export interface AnthropicClient {
  /**
   * Generate next question based on conversation history.
   *
   * @param messages - Conversation history (user and bot messages)
   * @param repoContext - Optional repository context for contextual questions
   * @returns Question response with text and confidence score
   */
  continueConversation(
    messages: Message[],
    repoContext: RepositoryContext | null,
  ): Promise<QuestionResponse>;

  /**
   * Convert conversation into structured brainstorm.md format.
   *
   * @param messages - Complete conversation history
   * @returns Structured spec document
   */
  synthesizeSpec(messages: Message[]): Promise<SpecDocument>;

  /**
   * Update spec based on review feedback.
   *
   * @param spec - Current spec document
   * @param feedback - User feedback for revision
   * @returns Revised spec document
   */
  reviseSpec(spec: SpecDocument, feedback: string): Promise<SpecDocument>;

  /**
   * Parse Claude's self-assessed confidence (0-100%).
   *
   * Looks for patterns like:
   * - "I'm X% confident"
   * - "X% confident"
   * - "confidence: X%"
   *
   * @param response - Anthropic API response message
   * @returns Confidence score (0-100), or 0 if not found
   */
  extractConfidenceScore(response: AnthropicMessage): number;
}

/**
 * Mock Anthropic client for testing.
 *
 * Provides configurable responses and error injection for testing retry logic.
 */
export class MockAnthropicClient implements AnthropicClient {
  private continueConversationError: Error | null = null;
  private synthesizeSpecError: Error | null = null;
  private reviseSpecError: Error | null = null;

  private nextQuestionResponse: QuestionResponse | null = null;
  private nextSpecResponse: SpecDocument | null = null;

  private conversationHistory: Array<{
    messages: Message[];
    context: RepositoryContext | null;
  }> = [];

  /**
   * Configure an error to be thrown by continueConversation.
   *
   * @param error - Error to throw on next continueConversation call
   */
  setContinueConversationError(error: Error): void {
    this.continueConversationError = error;
  }

  /**
   * Configure an error to be thrown by synthesizeSpec.
   *
   * @param error - Error to throw on next synthesizeSpec call
   */
  setSynthesizeSpecError(error: Error): void {
    this.synthesizeSpecError = error;
  }

  /**
   * Configure an error to be thrown by reviseSpec.
   *
   * @param error - Error to throw on next reviseSpec call
   */
  setReviseSpecError(error: Error): void {
    this.reviseSpecError = error;
  }

  /**
   * Configure the next question response to return.
   *
   * @param response - Question response to return on next continueConversation call
   */
  setNextQuestionResponse(response: QuestionResponse): void {
    this.nextQuestionResponse = response;
  }

  /**
   * Configure the next spec response to return.
   *
   * @param spec - Spec document to return on next synthesizeSpec call
   */
  setNextSpecResponse(spec: SpecDocument): void {
    this.nextSpecResponse = spec;
  }

  /**
   * Get all recorded conversation history.
   *
   * @returns Array of recorded conversations
   */
  getConversationHistory(): Array<{
    messages: Message[];
    context: RepositoryContext | null;
  }> {
    return [...this.conversationHistory];
  }

  /**
   * Clear all configured errors, responses, and recorded operations.
   */
  clear(): void {
    this.continueConversationError = null;
    this.synthesizeSpecError = null;
    this.reviseSpecError = null;
    this.nextQuestionResponse = null;
    this.nextSpecResponse = null;
    this.conversationHistory = [];
  }

  continueConversation(
    messages: Message[],
    repoContext: RepositoryContext | null,
  ): Promise<QuestionResponse> {
    if (this.continueConversationError !== null) {
      return Promise.reject(this.continueConversationError);
    }

    // Record the conversation
    this.conversationHistory.push({ messages, context: repoContext });

    // Return configured response or default
    if (this.nextQuestionResponse !== null) {
      const response = this.nextQuestionResponse;
      this.nextQuestionResponse = null;
      return Promise.resolve(response);
    }

    return Promise.resolve({
      question: "What specific features would you like to include in this implementation?",
      confidence_score: 50,
    });
  }

  synthesizeSpec(messages: Message[]): Promise<SpecDocument> {
    if (this.synthesizeSpecError !== null) {
      return Promise.reject(this.synthesizeSpecError);
    }

    // Return configured response or default
    if (this.nextSpecResponse !== null) {
      const response = this.nextSpecResponse;
      this.nextSpecResponse = null;
      return Promise.resolve(response);
    }

    // Generate a default spec based on the first message
    const firstMessage = messages.find((m) => m.sender !== "bot");
    const title = firstMessage?.text.slice(0, 50) || "Untitled Feature";

    return Promise.resolve({
      title,
      overview: "Feature overview based on conversation",
      problem_statement: "Problem identified during brainstorming",
      goals: ["Primary goal"],
      non_goals: [],
      personas: [],
      use_cases: [],
      technical_details: "",
      open_questions: [],
    });
  }

  reviseSpec(spec: SpecDocument, _feedback: string): Promise<SpecDocument> {
    if (this.reviseSpecError !== null) {
      return Promise.reject(this.reviseSpecError);
    }

    // Return a copy of the spec (simulating revision)
    return Promise.resolve({
      ...spec,
      overview: spec.overview + " (revised)",
    });
  }

  extractConfidenceScore(response: AnthropicMessage): number {
    const text = extractTextContent(response);
    return parseConfidenceFromText(text);
  }
}

/**
 * Real implementation of AnthropicClient that integrates with Anthropic Messages API.
 *
 * Wraps API calls with retry logic for transient errors (Property 8.6).
 * Ensures single question per turn (Property 3.1) via system prompt.
 * Extracts confidence scores for phase transition (Property 3.6).
 */
export class AnthropicClientImpl implements AnthropicClient {
  private readonly baseUrl = "https://api.anthropic.com/v1/messages";
  private readonly model: string;

  /**
   * Create a new Anthropic client.
   *
   * @param anthropicApi - Anthropic API object with post method
   * @param apiKey - Anthropic API key
   * @param _retryConfig - Optional retry configuration (unused, kept for API compatibility)
   * @param model - Optional model identifier (defaults to claude-sonnet-4-20250514)
   */
  constructor(
    private readonly anthropicApi: {
      post: (
        url: string,
        body: unknown,
        headers?: Record<string, string>,
      ) => Promise<Response>;
    },
    private readonly apiKey: string,
    _retryConfig?: Record<string, unknown>,
    model?: string,
  ) {
    this.model = model ?? DEFAULT_MODEL;
    // Rate-limit-aware retry is handled internally by executeWithRateLimitAwareRetry
  }

  /**
   * Get standard headers for Anthropic API requests.
   */
  private getHeaders(): Record<string, string> {
    return {
      "x-api-key": this.apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    };
  }

  /**
   * Build system prompt for questioning phase.
   *
   * @param repoContext - Optional repository context
   * @returns System prompt string
   */
  private buildQuestioningSystemPrompt(repoContext: RepositoryContext | null): string {
    const basePrompt =
      `You are a senior software architect helping a team brainstorm a feature specification.

Your role is to ask exactly ONE clarifying question per turn to gather requirements. Focus on:
- Understanding the problem being solved
- Identifying user needs and personas
- Clarifying technical constraints
- Exploring edge cases and error scenarios

CRITICAL RULES:
1. Ask exactly ONE question per response
2. Make questions specific and actionable
3. Build on previous answers
4. After each question, provide your confidence score

At the end of each response, include your confidence assessment:
"I'm X% confident we have enough detail to create the spec."

Start at low confidence (20-40%) and increase as you gather more detail.
When you reach 95% or higher, the spec is ready for review.`;

    if (repoContext) {
      const contextSection = `

REPOSITORY CONTEXT:
- Repository: ${repoContext.repository}
- Framework: ${repoContext.framework}
- Patterns: ${repoContext.patterns.join(", ") || "None detected"}
- Structure:
${repoContext.structure}

Consider this existing codebase when asking questions about integration and compatibility.`;

      return basePrompt + contextSection;
    }

    return basePrompt;
  }

  /**
   * Build system prompt for spec synthesis.
   *
   * @returns System prompt string
   */
  private buildSynthesisSystemPrompt(): string {
    return `You are a senior software architect synthesizing a brainstorm conversation into a structured specification document.

Analyze the conversation and create a JSON object with this exact structure:

{
  "title": "Feature title",
  "overview": "High-level summary",
  "problem_statement": "What problem this solves",
  "goals": ["Goal 1", "Goal 2"],
  "non_goals": ["What's out of scope"],
  "personas": [{"name": "Persona name", "description": "Description"}],
  "use_cases": [{"id": "UC1", "title": "Title", "description": "Description"}],
  "technical_details": "Technical implementation notes",
  "open_questions": ["Remaining questions"]
}

RULES:
1. Extract information directly from the conversation
2. Be comprehensive but concise
3. Output ONLY the JSON object, no other text
4. Ensure all fields are present (use empty arrays/strings if no data)`;
  }

  /**
   * Build system prompt for spec revision.
   *
   * @returns System prompt string
   */
  private buildRevisionSystemPrompt(): string {
    return `You are a senior software architect revising a specification based on feedback.

You will receive:
1. The current specification as JSON
2. User feedback for revision

Update the specification to address the feedback and output the revised JSON.

RULES:
1. Preserve the original structure
2. Only modify sections relevant to the feedback
3. Output ONLY the JSON object, no other text
4. Ensure all fields are present`;
  }

  /**
   * Convert Message array to Anthropic API messages format.
   *
   * Includes attachment content when present, appending it to the message text.
   *
   * @param messages - Array of Message objects
   * @returns Array of Anthropic API message objects
   */
  private formatMessages(messages: Message[]): Array<{ role: string; content: string }> {
    return messages.map((msg) => ({
      role: msg.sender === "bot" ? "assistant" : "user",
      content: this.formatMessageContent(msg),
    }));
  }

  /**
   * Format message content including any attachments.
   *
   * @param message - Message object
   * @returns Formatted content string
   */
  private formatMessageContent(message: Message): string {
    if (!message.attachments || message.attachments.length === 0) {
      return message.text;
    }

    const attachmentParts = message.attachments.map((attachment) => {
      return `\n\n---\nAttachment: ${attachment.filename} (${attachment.mimetype})\n${attachment.content}`;
    });

    return message.text + attachmentParts.join("");
  }

  /**
   * Handle Anthropic API response, throwing appropriate errors for non-2xx responses.
   *
   * @param response - Fetch Response object
   * @returns The response if successful
   * @throws AnthropicRateLimitError for 429 responses
   * @throws AnthropicModelError for 400 responses (validation errors)
   * @throws AnthropicInputError for context length errors
   * @throws NetworkTimeoutError for 5xx responses
   */
  private async handleResponse(response: Response): Promise<AnthropicMessage> {
    if (response.ok) {
      const data = await response.json();
      return {
        content: data.content,
        stop_reason: data.stop_reason,
        usage: data.usage,
      };
    }

    const errorData = await response.json().catch(() => ({}));
    const errorMessage = errorData.error?.message || "Unknown error";

    if (response.status === 429) {
      const retryAfter = parseInt(response.headers.get("retry-after") || "60", 10);
      throw new AnthropicRateLimitError(
        "Rate limit exceeded",
        errorMessage,
        "Wait and retry automatically",
        retryAfter,
      );
    }

    if (response.status === 400) {
      // Check for context length error
      if (errorMessage.includes("context_length") || errorMessage.includes("too long")) {
        throw new AnthropicInputError(
          "Input too large",
          errorMessage,
          "Reduce conversation length or context size",
        );
      }

      throw new AnthropicModelError(
        "Request rejected",
        errorMessage,
        "Modify the request and try again",
      );
    }

    if (response.status >= 500) {
      throw new NetworkTimeoutError(
        "Server error",
        `Anthropic API returned HTTP ${response.status}: ${errorMessage}`,
        "Retry the request",
      );
    }

    throw new AnthropicModelError(
      "API error",
      `HTTP ${response.status}: ${errorMessage}`,
      "Check the request and try again",
    );
  }

  /**
   * Execute an operation with retry logic that respects rate limit retry-after headers.
   *
   * When an AnthropicRateLimitError is caught, uses its retryAfterSeconds value
   * as the delay before retrying, rather than the standard exponential backoff.
   *
   * @param operation - Function to execute
   * @returns The result of the operation
   * @throws The last error if all retries are exhausted
   */
  private async executeWithRateLimitAwareRetry<T>(
    operation: () => Promise<T>,
  ): Promise<T> {
    let lastError: Error | undefined;
    let attempt = 0;
    const maxAttempts = 3;

    while (attempt < maxAttempts) {
      attempt++;

      // Apply delay before retry attempts (not the first attempt)
      if (attempt > 1 && lastError) {
        let delayMs: number;

        // Use retry-after from rate limit error if available
        if (lastError instanceof AnthropicRateLimitError) {
          delayMs = lastError.retryAfterSeconds * 1000;
        } else {
          // Fallback to exponential backoff for other transient errors
          delayMs = 1000 * Math.pow(2, attempt - 2);
        }

        await this.sleep(delayMs);
      }

      try {
        return await operation();
      } catch (error) {
        if (!(error instanceof Error)) {
          throw error;
        }

        lastError = error;

        // Only retry transient errors (rate limit, network timeout)
        if (
          !(error instanceof AnthropicRateLimitError) &&
          !(error instanceof NetworkTimeoutError)
        ) {
          throw error;
        }

        // Continue to next attempt if we haven't exhausted retries
        if (attempt >= maxAttempts) {
          throw error;
        }
      }
    }

    // Should not reach here, but TypeScript needs this
    throw lastError;
  }

  /**
   * Sleep for the specified duration.
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async continueConversation(
    messages: Message[],
    repoContext: RepositoryContext | null,
  ): Promise<QuestionResponse> {
    return await this.executeWithRateLimitAwareRetry(async () => {
      const requestBody = {
        model: this.model,
        max_tokens: 1024,
        system: this.buildQuestioningSystemPrompt(repoContext),
        messages: this.formatMessages(messages),
      };

      const response = await this.anthropicApi.post(
        this.baseUrl,
        requestBody,
        this.getHeaders(),
      );

      const anthropicResponse = await this.handleResponse(response);
      const text = extractTextContent(anthropicResponse);

      return {
        question: text,
        confidence_score: this.extractConfidenceScore(anthropicResponse),
      };
    });
  }

  async synthesizeSpec(messages: Message[]): Promise<SpecDocument> {
    return await this.executeWithRateLimitAwareRetry(async () => {
      const requestBody = {
        model: this.model,
        max_tokens: 4096,
        system: this.buildSynthesisSystemPrompt(),
        messages: this.formatMessages(messages),
      };

      const response = await this.anthropicApi.post(
        this.baseUrl,
        requestBody,
        this.getHeaders(),
      );

      const anthropicResponse = await this.handleResponse(response);
      const text = extractTextContent(anthropicResponse);

      return this.parseSpecDocument(text);
    });
  }

  async reviseSpec(spec: SpecDocument, feedback: string): Promise<SpecDocument> {
    return await this.executeWithRateLimitAwareRetry(async () => {
      const requestBody = {
        model: this.model,
        max_tokens: 4096,
        system: this.buildRevisionSystemPrompt(),
        messages: [
          {
            role: "user",
            content: `Current specification:\n${
              JSON.stringify(spec, null, 2)
            }\n\nFeedback:\n${feedback}`,
          },
        ],
      };

      const response = await this.anthropicApi.post(
        this.baseUrl,
        requestBody,
        this.getHeaders(),
      );

      const anthropicResponse = await this.handleResponse(response);
      const text = extractTextContent(anthropicResponse);

      return this.parseSpecDocument(text);
    });
  }

  extractConfidenceScore(response: AnthropicMessage): number {
    const text = extractTextContent(response);
    return parseConfidenceFromText(text);
  }

  /**
   * Parse spec document from JSON string.
   */
  private parseSpecDocument(text: string): SpecDocument {
    try {
      const parsed = JSON.parse(text);
      return {
        title: parsed.title || "Untitled",
        overview: parsed.overview || "",
        problem_statement: parsed.problem_statement || "",
        goals: parsed.goals || [],
        non_goals: parsed.non_goals || [],
        personas: parsed.personas || [],
        use_cases: parsed.use_cases || [],
        technical_details: parsed.technical_details || "",
        open_questions: parsed.open_questions || [],
      };
    } catch (_error) {
      // If JSON parsing fails, try to extract from markdown or return defaults
      return {
        title: "Untitled",
        overview: text.slice(0, 500),
        problem_statement: "",
        goals: [],
        non_goals: [],
        personas: [],
        use_cases: [],
        technical_details: "",
        open_questions: [],
      };
    }
  }
}
