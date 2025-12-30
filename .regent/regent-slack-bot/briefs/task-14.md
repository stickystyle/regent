# Task Brief

## From Issue #30

**Task 14**: Implement Anthropic Messages API client
**Type**: test-first

- Write tests for request formatting (messages, system prompt, tools)
- Write tests for response parsing (content, tool use, stop reason)
- Write tests for confidence score extraction
- Implement AnthropicClient with retry logic

### Requirements

**Requirement 3.1**: WHILE in questioning phase THEN the system SHALL ask exactly one question per turn.

**Requirement 3.6**: WHEN Claude's confidence score reaches 95% or higher THEN the system SHALL transition to review phase and create a draft Canvas.

**Requirement 8.6**: WHEN the Anthropic API returns an error THEN the system SHALL save any pending user input and retry automatically.

### Interfaces

```typescript
interface AnthropicClient {
  /** Generate next question based on conversation history. */
  continueConversation(messages: Message[], repoContext: RepositoryContext): Promise<QuestionResponse>;

  /** Convert conversation into structured brainstorm.md format. */
  synthesizeSpec(messages: Message[]): Promise<SpecDocument>;

  /** Update spec based on review feedback. */
  reviseSpec(spec: SpecDocument, feedback: string): Promise<SpecDocument>;

  /** Parse Claude's self-assessed confidence (0-100%). */
  extractConfidenceScore(response: AnthropicMessage): number;
}
```

### Implementation Details

The AnthropicClient should:
- Use the Messages API (not the Agent SDK) for full control over tool use
- Format messages array with user and assistant turns
- Include system prompt with phase-specific instructions (questioning vs review)
- Parse responses to extract both the question text and confidence score
- Implement exponential backoff retry for transient errors (up to 3 attempts)

Confidence score extraction should look for Claude's self-assessment in the response, typically expressed as "I'm X% confident we have enough detail to create the spec."

### Retry Handling

- Rate limits (429): Respect retry-after header
- Timeouts (408): Exponential backoff
- Server errors (500-599): Exponential backoff
- Model errors: Save input and report to user

## Codebase Context

### Current Implementation State

**Type Definitions (Already Exist)**

**File: `slackbot/src/types/message.ts`**
- `Message` interface: sender, text, timestamp, attachments
- `ProcessedAttachment` interface: file_id, filename, mimetype, content
- Helper functions: `isOfficialAnswer()`, `isAnswerCommand()`

**File: `slackbot/src/types/repository-context.ts`**
- `RepositoryContext` interface: repository, framework, patterns, relevant_files, structure
- `Framework` enum: React, NextJS, FastAPI, Django, Express, Deno, Unknown
- `RelevantFile` interface: path, description, content

**File: `slackbot/src/types/spec-document.ts`**
- `SpecDocument` interface: title, overview, problem_statement, goals, non_goals, personas, use_cases, technical_details, open_questions
- `toMarkdown(doc: SpecDocument)` function: converts spec to Regent brainstorm.md format

**File: `slackbot/src/errors/types.ts`**
- `BaseError` abstract class with `type`, `isRetryable`, `details`, `suggestedAction`, `toSlackMessage()`
- `TransientError` abstract class (isRetryable = true)
- `PermanentError` abstract class (isRetryable = false)
- Specific errors: `AnthropicRateLimitError`, `AnthropicModelError`, `AnthropicInputError`, `NetworkTimeoutError`

**File: `slackbot/src/errors/retry.ts`**
- `RetryConfig` interface: maxAttempts, baseDelayMs, multiplier, onRetry callback
- `DEFAULT_RETRY_CONFIG`: maxAttempts=3, baseDelayMs=1000, multiplier=2
- `calculateBackoffDelay(attempt, config)`: exponential backoff calculation
- `RetryHandler` class: executes operations with exponential backoff retry

### Client Pattern Reference

**File: `slackbot/src/clients/github-client.ts`**

**Interface Pattern:**
```typescript
export interface GitHubClient {
  exploreRepository(owner: string, repo: string): Promise<RepositoryContext>;
  createPullRequest(owner: string, repo: string, spec: SpecDocument, ...): Promise<string>;
  // ... more methods
}
```

**Implementation Pattern (GitHubClientImpl):**
```typescript
export class GitHubClientImpl implements GitHubClient {
  private readonly retryHandler: RetryHandler;
  private readonly baseUrl = "https://api.github.com";

  constructor(
    private readonly githubApi: { get, post, patch },
    private readonly token: string,
    retryConfig?: Partial<RetryConfig>,
  ) {
    this.retryHandler = new RetryHandler(retryConfig);
  }

  async someMethod(...): Promise<T> {
    return await this.retryHandler.execute(async () => {
      // API call wrapped in retry handler
    });
  }
}
```

**Mock Pattern (MockGitHubClient):**
```typescript
export class MockGitHubClient implements GitHubClient {
  private exploreError: Error | null = null;
  setExploreRepositoryError(error: Error): void { ... }
  clear(): void { ... }

  async exploreRepository(...): Promise<RepositoryContext> {
    if (this.exploreError !== null) {
      return Promise.reject(this.exploreError);
    }
    return Promise.resolve({ /* mock response */ });
  }
}
```

### Test Patterns

**File: `slackbot/tests/clients/github-client.test.ts`**

```typescript
import { assertEquals, assertRejects } from "@std/assert";
import { afterEach, beforeEach, describe, it } from "@std/testing/bdd";

describe("GitHubClient", () => {
  describe("MockGitHubClient", () => {
    let client: MockGitHubClient;

    beforeEach(() => {
      client = new MockGitHubClient();
    });

    afterEach(() => {
      client.clear();
    });

    it("should return expected value", async () => {
      const result = await client.someMethod();
      assertEquals(result, expected);
    });

    it("should throw configured error", async () => {
      const error = new SomeError(...);
      client.setSomeError(error);
      await assertRejects(
        () => client.someMethod(),
        SomeError,
      );
    });
  });
});
```

### Project Conventions

**File Header:**
```typescript
// ABOUTME: [Brief description of file purpose]
// ABOUTME: [Additional detail or context]
```

**TypeScript Style:**
- `"strict": true`
- Line width: 100 characters
- Semicolons required
- Double quotes for strings

**Test Command:**
```bash
deno test --allow-read --allow-net
```

### Additional Types Needed

1. **QuestionResponse**
   - `question: string` - The question text from Claude
   - `confidence_score: number` - Claude's confidence (0-100)

2. **AnthropicMessage**
   - Response structure from Anthropic Messages API
   - Contains content, usage, stop_reason fields

### Files to Create

1. **`slackbot/src/clients/anthropic-client.ts`**
   - AnthropicClient interface definition
   - MockAnthropicClient class (for tests)
   - AnthropicClientImpl class (real implementation)

2. **`slackbot/tests/clients/anthropic-client.test.ts`**
   - Tests for request formatting
   - Tests for response parsing
   - Tests for confidence score extraction
   - Tests for retry logic

### Files to Reference

- `slackbot/src/errors/retry.ts` - RetryHandler pattern
- `slackbot/src/errors/types.ts` - Error hierarchy
- `slackbot/src/clients/github-client.ts` - Client implementation pattern
- `slackbot/tests/clients/github-client.test.ts` - Test pattern reference

---
*Branch: feature/regent-slack-bot*
*Generated at execution time by Regent*
