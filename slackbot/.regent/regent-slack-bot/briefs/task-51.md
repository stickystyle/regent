# Task Brief

## From Issue #51

Parent Epic: #42

## Task Description

Implement the ROSI webhook handler that receives exploration results from the GitHub Actions
workflow.

**Type**: test-first

### Implementation Steps

1. Write tests for webhook authentication (`CALLBACK_SECRET` validation)
2. Write tests for result parsing (success and error payloads)
3. Write tests for session lookup and update
4. Write tests for continuation flow (post summary → first question)
5. Implement webhook endpoint in Slack app
6. Wire up to SessionOrchestrator.handleExplorationResult()

### Webhook Endpoint

```typescript
// POST /webhook/exploration-complete
interface WebhookRequest {
  headers: {
    "Authorization": `Bearer ${CALLBACK_SECRET}`;
  };
  body: ExplorationCallback;
}
```

### Handler Flow

1. Validate `Authorization` header matches `CALLBACK_SECRET`
2. Parse `ExplorationCallback` from request body
3. Load session by `session_id`
4. If status == "success":
   - Store `exploration_context` in session
   - Update phase to `questioning`
   - Post exploration summary to Slack thread
   - Generate and post first question
5. If status == "error":
   - Post error message to Slack thread
   - Offer to continue without repository context

### Error Handling

- Invalid/missing auth header → 401 Unauthorized
- Unknown session_id → 404 Not Found (log warning)
- Malformed payload → 400 Bad Request

## Acceptance Criteria

- Webhook authenticates using CALLBACK_SECRET
- Exploration results stored in session
- Summary posted to correct Slack thread
- First question generated after successful exploration
- Graceful error handling for failed explorations

_Requirements: 2.3, 2.4, 2.6_

## Issue Discussion

No comments on this issue.

## Codebase Context

### Current Implementation State

#### ExplorationCallback Type (Not Yet Defined)

Based on the GitHub Actions workflow in `.github/workflows/explore-codebase.yml`, the webhook will
receive two possible payloads:

**Success Payload (lines 181-189 of workflow)**:

```typescript
interface ExplorationCallbackSuccess {
  session_id: string;
  status: "success";
  exploration_context: {
    file_tree?: string;
    project_overview?: string;
    architecture_summary?: string;
    relevant_patterns?: string[];
    integration_points?: string[];
    testing_approach?: string;
    key_files?: string[];
    idea_related_code?: {
      summary: string;
      existing_similar_features: string[];
      relevant_files: string[];
      suggested_integration_points: string[];
    };
  };
}
```

**Error Payload (lines 236-248 of workflow)**:

```typescript
interface ExplorationCallbackError {
  session_id: string;
  status: "error";
  error: {
    message: string;
    code: "CLONE_FAILED" | "INSTALL_FAILED" | "EXPLORATION_FAILED";
  };
}
```

#### SessionOrchestrator Current State

**File**: `slackbot/src/orchestrators/session-orchestrator.ts`

- **What exists**: The orchestrator has `handleSlashCommand()` and `runToolLoop()` methods, but **NO
  `handleExplorationResult()` method** exists yet
- **Pattern for exploration**: Lines 99-108 show temporary in-memory caching of exploration context:
  ```typescript
  private repositoryContextCache: Map<string, RepositoryContext>;

  if (repositoryContext) {
    this.repositoryContextCache.set(sessionId, repositoryContext);
  }
  ```
- **Error handling pattern**: Uses typed errors (`ValidationError`, `GitHubAccessError`,
  `BaseError`) with `.toSlackMessage()` for display
- **Message posting pattern**: Uses `messagingClient.postMessage(channelId, threadTs, messageText)`
  to post to threads

#### Session Manager Integration

**File**: `slackbot/src/managers/session-manager.ts`

- `updateSession(session: Session)` exists at line 109+ for persisting session state changes
- Session ID format: `${channelId}:${threadTs}` (see `formatSessionId()` in session.ts)
- Session lookup: Via `datastore.get(sessionId)` in SessionManager
- Phase transition: Can change `session.phase` from `Phase.Questioning` to `Phase.Review` (line 429
  shows pattern)

#### Slack Message Client

**File**: `slackbot/src/clients/messaging-client.ts`

```typescript
interface PostMessageResult {
  ok: boolean;
  ts: string;
  channel: string;
  thread_ts?: string;
}

// Method signature:
postMessage(
  channelId: string,
  threadTs: string | undefined,
  text: string,
  blocks?: unknown[],
): Promise<PostMessageResult>;
```

- **Thread posting**: Pass `threadTs` as second parameter to post to a thread

#### Error Types

**File**: `slackbot/src/errors/types.ts`

Base error hierarchy exists with proper Slack formatting. Key pattern (line 41-51):

```typescript
toSlackMessage(): string {
  const lines = [
    `:warning: *${this.message}*`,
    "",
    `*Error Type:* ${this.type}`,
    `*Details:* ${this.details}`,
    `*Suggested Action:* ${this.suggestedAction}`,
  ];
  return lines.join("\n");
}
```

Authentication/Authorization errors:

- No existing error type for invalid Authorization header → will need to implement as
  `ValidationError` or new type

#### Session Persistence

**File**: `slackbot/src/datastores/sessions.ts`

Session schema includes fields that will need updating:

- `session_id`: primary key (already set from `--repo` initialization)
- `phase`: needs transition from initial phase to `questioning` after exploration
- `repository`: already stored during session creation
- All other metadata already structured

---

### Test Template Reference

#### Similar Test File: `slackbot/tests/handlers/finalization-handler.test.ts`

**Key Patterns**:

1. **Test structure using BDD** (lines 1-35):
   ```typescript
   import { beforeEach, describe, it } from "@std/testing/bdd";
   import { assertEquals, assertThrows } from "@std/assert";

   describe("Feature Name", () => {
     let mockDatastore: TestDatastoreClient;
     let sessionManager: SessionManager;

     beforeEach(() => {
       mockDatastore = new TestDatastoreClient();
       sessionManager = new SessionManager(mockDatastore);
     });
   });
   ```

2. **Mock datastore setup** (lines 24-33):
   ```typescript
   class TestDatastoreClient extends MockDatastoreClient {
     setSession(session: Session): void {
       this.put(session);
     }

     async getSession(sessionId: string): Promise<Session | undefined> {
       const result = await this.get(sessionId);
       return result.item;
     }
   }
   ```

3. **Testing error conditions**:
   ```typescript
   assertThrows(
     () => parseRepository("invalid"),
     ValidationError,
     "Invalid repository format",
   );
   ```

#### Handler Test Pattern: `slackbot/tests/handlers/slash-command.test.ts`

Tests follow function → describe structure (lines 13-135):

- Test one function at a time with nested describe blocks
- Use descriptive `it()` labels explaining the scenario
- Use `assertEquals()` for assertions on outputs
- Use `assertThrows()` with error type and message assertions

#### Mock Messaging Client

**File**: `slackbot/tests/clients/messaging-client.test.ts` (lines 36-90)

```typescript
describe("MockSlackMessagingClient", () => {
  let client: MockSlackMessagingClient;

  beforeEach(() => {
    client = new MockSlackMessagingClient();
  });

  afterEach(() => {
    client.clear();
  });

  it("should post threaded message with thread_ts", async () => {
    const result = await client.postMessage(
      "C1234567890",
      "1234567890.123456",
      "Reply in thread",
    );

    assertEquals(result.ok, true);
    assertEquals(result.thread_ts, "1234567890.123456");
  });
});
```

The mock client supports:

- `.setPostMessageError(error)` to inject failures
- `.clear()` for test cleanup
- `postMessage()` returns `PostMessageResult`

---

### Project Conventions

#### Import Style

From `slash-command.ts` (lines 4-5):

```typescript
import { ValidationError } from "../errors/types.ts";
import type { SlackSlashCommandInput, SlashCommand } from "../types/slash-command.ts";
```

- Use `import` for actual code, `import type` for TypeScript interfaces
- Use relative paths with `.ts` extension
- Group imports by category (errors, types, clients, managers)

#### Error Handling

From `session-orchestrator.ts` (lines 173-188):

```typescript
try {
  // operation
} catch (error) {
  if (error instanceof ValidationError) {
    await this.postValidationError(command, threadTs, error);
    return null;
  }

  if (error instanceof GitHubAccessError) {
    await this.postExplorationError(command, threadTs, error);
    return null;
  }

  // Re-throw unexpected errors
  throw error;
}
```

- Use instanceof checks for typed errors
- Post user-friendly error messages to Slack
- Re-throw unexpected errors
- Handle errors gracefully without crashing

#### Type Hints and Function Documentation

From `session-manager.ts` (lines 67-82):

```typescript
/**
 * Create a new session record with TTL.
 *
 * @param channelId - Slack channel ID
 * @param threadTs - Slack thread timestamp
 * @param repo - GitHub repository in owner/repo format
 * @param userId - Slack user ID of the initiator
 * @returns The created session
 * @throws Error if session already exists
 */
async createSession(
  channelId: string,
  threadTs: string,
  repo: string,
  userId: string,
): Promise<Session>
```

- Full JSDoc comments with @param, @returns, @throws
- Type annotations on all parameters and return values
- Parameter names match documentation

#### Session ID Format

From `session.ts` (lines 127-129):

```typescript
export function formatSessionId(channelId: string, threadTs: string): string {
  return `${channelId}:${threadTs}`;
}
```

- Session IDs are composite: `{channel_id}:{thread_ts}`
- Always use the `formatSessionId()` helper function
- Parse by splitting on `:` and destructuring: `const [channelId, threadTs] = session_id.split(":")`

---

### Files to Modify

#### 1. `slackbot/src/types/index.ts`

- **Change**: Add export for new `ExplorationCallback` type (to be defined in separate file or here)
- **Rationale**: Make the type available throughout the application

#### 2. `slackbot/src/orchestrators/session-orchestrator.ts`

- **Change**: Add `handleExplorationResult()` method
- **Signature**:
  ```typescript
  async handleExplorationResult(callback: ExplorationCallback): Promise<void>
  ```
- **Implementation flow** (per design.md lines 160-177):
  1. Load session by `session_id`
  2. If status == "success": store exploration_context, update phase, post summary, generate first
     question
  3. If status == "error": post error message, offer to continue without context
- **Rationale**: This is the handler that receives webhook callbacks and continues the flow

#### 3. Create new file: `slackbot/src/handlers/exploration-handler.ts`

- **Purpose**: HTTP webhook handler for exploration callback
- **Responsibilities**:
  1. Validate Authorization header against CALLBACK_SECRET
  2. Parse and validate ExplorationCallback payload
  3. Route to SessionOrchestrator.handleExplorationResult()
- **Pattern**: Similar to `finalization-handler.ts` structure

#### 4. Create new file: `slackbot/tests/handlers/exploration-handler.test.ts`

- **Test coverage**:
  1. Authentication validation (valid/invalid/missing Authorization header)
  2. Payload parsing (success and error payloads)
  3. Session lookup and update
  4. Message posting to thread
  5. Continuation flow (exploration summary → first question)

#### 5. Create new file: `slackbot/tests/orchestrators/exploration-result.test.ts`

- **Test coverage**: `SessionOrchestrator.handleExplorationResult()` method
  1. Success case: update session, post summary, generate question
  2. Error case: post error message, offer to continue
  3. Session not found (404 scenario)
  4. Repository context caching

---

### Files to Reference

#### Type Definitions

**`slackbot/src/types/session.ts`**

- Defines `Session` interface with all fields needed for exploration storage
- Defines `Phase` enum (Questioning, Review, Finalized)
- Shows how to format session IDs

**`slackbot/src/types/repository-context.ts`**

- Defines `RepositoryContext` interface (what exploration returns)
- Will be stored in session during webhook handling
- Contains: framework, patterns, relevant_files, structure

#### Error Types

**`slackbot/src/errors/types.ts`**

- Defines error hierarchy and `.toSlackMessage()` pattern
- For webhook auth failures: use `ValidationError` for 400/401 cases

#### Session Management

**`slackbot/src/managers/session-manager.ts`**

- Shows how to load and update sessions
- Patterns for phase transitions
- Error handling for missing sessions

#### Message Client

**`slackbot/src/clients/messaging-client.ts`**

- Interface for posting messages to threads
- Shows signature for `postMessage(channelId, threadTs, text)`

#### Existing Handlers

**`slackbot/src/handlers/finalization-handler.ts`**

- Reference for handler structure and error handling patterns
- Shows how to validate state and post messages

**`slackbot/src/handlers/slash-command.ts`**

- Shows input validation patterns
- Shows how to throw ValidationError for invalid input

#### GitHub Actions Workflow

**`.github/workflows/explore-codebase.yml`**

- Lines 181-189: Success callback payload structure
- Lines 236-248: Error callback payload structure
- Lines 199, 258: Authorization header format (`Authorization: Bearer $CALLBACK_SECRET`)

#### Test Examples

**`slackbot/tests/handlers/finalization-handler.test.ts`**

- BDD test structure patterns
- Mock setup and teardown
- Handler testing patterns

**`slackbot/tests/clients/messaging-client.test.ts`**

- Mock client usage patterns
- Threaded message test examples

---

### Implementation Notes

1. **Webhook Authentication**: The Authorization header will be `Bearer ${CALLBACK_SECRET}`.
   Validate by comparing the token part to an environment variable or configured secret.

2. **Exploration Context Integration**: The exploration results need to be converted from the GitHub
   Actions response format to a `RepositoryContext` object that matches the type used elsewhere in
   the app.

3. **Thread Identification**: Extract `channelId` and `threadTs` by splitting the `session_id` on
   `:` to get the proper destination for Slack messages.

4. **Error Recovery**: If a session is not found (404), log a warning but don't crash. The webhook
   should still return 2xx success to prevent GitHub Actions retries.

5. **Message Format**: Follow the pattern from `SessionOrchestrator.postExplorationSummary()` (lines
   220-247) for formatting the exploration summary message.

6. **Test Data**: Create fixture sessions with proper format and phase before running handler tests.
   Use `TestDatastoreClient` to pre-populate sessions.

7. **File Structure**: Tests should be organized as:
   - `tests/handlers/exploration-handler.test.ts` for webhook handler logic
   - `tests/orchestrators/exploration-result.test.ts` for session orchestrator method logic

---

_Branch: feature/regent-slack-bot_ _Generated at execution time by Regent_
