# Task Brief

## From Issue #19

## Overview

**Task 18**: Implement question-answer loop with tool use
**Type**: implementation

- Write tests for tool loop execution (single tool, multiple tools, no tools)
- Write tests for system prompt building (per phase, with/without repo)
- Write tests for message history formatting (thread context, attachments)
- Implement tool loop with Anthropic Messages API
- Write property test: **Property 3 - Single Question Rule**
- _Requirements: 2.3, 2.5, 3.1, 3.2, 3.3_

## Requirements

### Requirement 2: Codebase Exploration
**User Story:** As a senior developer, I want the bot to understand our existing codebase, so that it asks contextually relevant questions and suggests patterns consistent with our architecture.

**Acceptance Criteria:**
> 3. WHEN exploration completes THEN the system SHALL post a summary of findings (framework, patterns, relevant existing code) before asking the first question.
> 5. WHILE in questioning phase with a repository configured THEN the system SHALL reference relevant existing code in questions when applicable.

### Requirement 3: Question-Answer Workflow
**User Story:** As a team member, I want the bot to ask one question at a time, so that the team can focus discussion and provide thoughtful answers without feeling overwhelmed.

**Acceptance Criteria:**
> 1. WHILE in questioning phase THEN the system SHALL ask exactly one question per turn.
> 2. WHEN a user posts a message mentioning `@regent` in the session thread THEN the system SHALL process the message and respond appropriately based on conversational context.
> 3. WHEN a message is posted in the thread without `@regent` mention THEN the system SHALL store the message for context but SHALL NOT respond.

## Design Context

### Conversational Interaction Model

The bot uses a **conversational approach**. All `@regent` messages are sent to the LLM as part of the conversation. The LLM:
- Understands answers from context (no special "official answer" marking)
- Interprets intent naturally ("let's move on" = skip question)
- Decides appropriate responses based on conversation flow

There is no distinction between "official answers" and other messages - all thread context is available to the LLM.

### Interfaces

```typescript
interface SessionOrchestrator {
  /** Execute Claude Messages API tool loop until response ready. */
  runToolLoop(session: Session, userInput: string): Promise<Response>;
}

interface AnthropicClient {
  /** Generate next question based on conversation history. */
  continueConversation(messages: Message[], repoContext: RepositoryContext): Promise<QuestionResponse>;

  /** Parse Claude's self-assessed confidence (0-100%). */
  extractConfidenceScore(response: AnthropicMessage): number;
}
```

### Correctness Properties

**Property 3: Single Question Rule**
*For any* response in questioning phase, *the system should* ask exactly one question unless transitioning to review phase
**Validates:** Requirements 3.1, 3.6

## Issue Discussion

**@stickystyle** (a few hours ago):
> Of note about the "Conversational Interaction Model", the LLM should be able to handle all this logic on it's own, without "guidance" by us.

## Codebase Context

### Current Implementation State

#### AnthropicClient (task-14 completed)

**File:** `slackbot/src/clients/anthropic-client.ts`

**Current Function Signatures:**

```typescript
interface AnthropicClient {
  continueConversation(
    messages: Message[],
    repoContext: RepositoryContext | null,
  ): Promise<QuestionResponse>;

  synthesizeSpec(messages: Message[]): Promise<SpecDocument>;

  reviseSpec(spec: SpecDocument, feedback: string): Promise<SpecDocument>;

  extractConfidenceScore(response: AnthropicMessage): number;
}

interface QuestionResponse {
  question: string;
  confidence_score: number;
}

interface AnthropicMessage {
  content: AnthropicContentBlock[];
  stop_reason: string;
  usage: { input_tokens: number; output_tokens: number };
}

interface AnthropicContentBlock {
  type: string;           // "text" or "tool_use"
  text?: string;          // for text blocks
  id?: string;            // for tool_use blocks
  name?: string;          // for tool_use blocks
  input?: unknown;        // for tool_use blocks
}
```

**Current Implementation Notes:**
- `continueConversation()` already wraps with `executeWithRateLimitAwareRetry()`
- System prompt for questioning phase explicitly instructs "Ask exactly ONE question per turn"
- Confidence score extraction uses regex patterns (supporting "I'm X% confident", "X% confident", "confidence: X%")
- Message formatting includes attachment content appended to text
- Error handling via `handleResponse()` with specific error types thrown
- Uses `POST https://api.anthropic.com/v1/messages` with model defaulting to "claude-sonnet-4-20250514"

**Integration Points:**
- Called by SessionOrchestrator in `generateAndPostFirstQuestion()`
- Takes Message[] array with sender tracking (user ID or "bot")
- Returns question + confidence for phase transitions

#### SessionOrchestrator (current/task-17 completed)

**File:** `slackbot/src/orchestrators/session-orchestrator.ts`

**Current Scope:**
- Handles `/brainstorm` command initialization flow
- Creates session record, explores repository (if --repo flag), generates first question
- Methods:
  - `handleSlashCommand(command: SlashCommand, threadTs: string): Promise<void>`
  - `generateAndPostFirstQuestion()` - calls AnthropicClient.continueConversation()

**Missing for Task 19:**
- No `runToolLoop()` method (will need to be added)
- No message history iteration logic
- No tool execution flow
- No phase transition logic based on confidence scores

#### Message Type

**File:** `slackbot/src/types/message.ts`

```typescript
interface Message {
  sender: string;                    // "bot" or user ID "U..."
  text: string;
  timestamp: string;                 // Slack message timestamp
  attachments?: ProcessedAttachment[];
}

interface ProcessedAttachment {
  file_id: string;
  filename: string;
  mimetype: string;
  content: string;
}
```

#### Session Type

**File:** `slackbot/src/types/session.ts`

```typescript
enum Phase {
  Questioning = "questioning",
  Review = "review",
  Finalized = "finalized",
}

interface Session {
  session_id: string;                // "C1234567890:1234567890.123456"
  repository?: string;               // "owner/repo"
  phase: Phase;
  initiator_user_id: string;         // "U..."
  canvas_id?: string;
  confidence_score: number;          // 0-100, updated per tool loop iteration
  created_at: string;                // ISO 8601
  ttl: string;                       // created_at + 30 days
  epic_number?: number;
  epic_url?: string;
  spec_comment_ids?: { brainstorm?: number; requirements?: number; design?: number };
}
```

### Test Template Reference

#### Test File Pattern

**Similar Test Files:**
- `slackbot/tests/clients/anthropic-client.test.ts` (950 lines)
- `slackbot/tests/clients/anthropic-client-prompts.test.ts` (751 lines)
- `slackbot/tests/orchestrators/session-orchestrator.test.ts` (partial, 250+ lines)

#### Key Test Patterns

**BDD Structure:**
```typescript
import { assertEquals, assertRejects, assertExists } from "@std/assert";
import { afterEach, beforeEach, describe, it } from "@std/testing/bdd";

describe("Feature", () => {
  let client: SomeClient;

  beforeEach(() => {
    client = new SomeClient();
  });

  afterEach(() => {
    client.clear();
  });

  describe("specific operation", () => {
    it("should behave in this way", async () => {
      // Arrange: setup
      const input = { /* ... */ };

      // Act: execute
      const result = await client.someMethod(input);

      // Assert: verify
      assertEquals(result.field, expectedValue);
    });
  });
});
```

**Mock Response Helpers:**
```typescript
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
    usage: { input_tokens: inputTokens, output_tokens: outputTokens },
  });
  return new Response(body, {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
```

**Capturing API Pattern:**
```typescript
function createCapturingApi(): {
  api: MockAnthropicApi;
  getCapturedBody: () => Record<string, unknown> | null;
} {
  let capturedBody: Record<string, unknown> | null = null;
  const api: MockAnthropicApi = {
    post: (_url: string, body: unknown) => {
      capturedBody = body as Record<string, unknown>;
      return Promise.resolve(/* response */);
    },
  };
  return { api, getCapturedBody: () => capturedBody };
}
```

### Project Conventions

#### Import Style
- Type imports: `import type { X } from "..."`
- Value imports: `import { X } from "..."`
- Explicit imports (no wildcard imports)
- Standard library: `@std/assert`, `@std/testing/bdd`

#### Error Handling
- All errors extend `BaseError` abstract base
- Two hierarchies: `TransientError` (retryable) vs `PermanentError` (not retryable)
- Errors have: `message`, `type`, `details`, `suggestedAction`, `isRetryable`
- Method: `toSlackMessage()` for formatted Slack display

#### File Header Comments
Each file must start with:
```typescript
// ABOUTME: [One line description]
// ABOUTME: [Additional context/responsibility]
```

### Files to Modify

#### 1. `slackbot/src/orchestrators/session-orchestrator.ts`

**What changes needed:**
- Add `runToolLoop(session: Session, userMessage: string): Promise<void>` method
- Implement loop that:
  - Builds message history from session + user message
  - Calls `AnthropicClient.continueConversation()`
  - Posts Claude's question to Slack thread
  - Updates session.confidence_score
  - Checks if confidence >= 95% to trigger phase transition
- Add message formatting logic

#### 2. `slackbot/src/clients/anthropic-client.ts`

**What changes needed:**
- Potentially extend `continueConversation()` to handle tool loop (or create separate method)
- Tool definitions (if any tools are used for codebase search)
- Update system prompt to include tool definitions

#### 3. Test files

**Create:**
- `slackbot/tests/orchestrators/session-orchestrator-tool-loop.test.ts`

**Should test:**
- Tool loop execution (single tool, multiple tools, no tools)
- System prompt building (per phase, with/without repo)
- Message history formatting (thread context, attachments)
- Property 3 - Single Question Rule

### Files to Reference

- `slackbot/src/types/message.ts` - Message data model
- `slackbot/src/types/session.ts` - Session phases and confidence_score
- `slackbot/src/types/repository-context.ts` - Context passed to Claude
- `slackbot/src/errors/types.ts` - Error hierarchy
- `.regent/regent-slack-bot/design.md` - Full architecture
- `.regent/regent-slack-bot/requirements.md` - All requirements

### Key Design Insights

**Tool Loop Flow (from design document):**
1. Build message array with user answer + attachment content
2. Call `continueConversation(messages, repoContext)`
3. Check `stop_reason` in response:
   - `"tool_use"` → execute tool, add result to history, loop
   - `"end_turn"` → extract question, post to Slack, wait for user answer
4. Extract confidence score from Claude's text
5. If confidence >= 95%, trigger phase transition to "review"

**Important Note from Stakeholder:**
The LLM should handle conversation logic on its own without guidance from us. The system prompt should be minimal and trust Claude to understand context naturally.

---
*Branch: feature/regent-slack-bot*
*Generated at execution time by Regent*
