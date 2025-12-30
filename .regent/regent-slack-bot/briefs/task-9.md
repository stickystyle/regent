# Task Brief

## From Issue #22

**Task 9**: Implement Slack messaging utilities
**Type**: test-first

- Write tests for postMessage (simple, threaded, error handling)
- Write tests for uploadFile (naming, threading, fallback)
- Write tests for rate limit handling with retry
- Implement Slack client wrapper for chat.postMessage and files.upload
- _Requirements: 1.1, 5.4, 8.2, 8.3_

📋 **Spec Files**: [requirements](https://github.com/stickystyle/regent/blob/main/.regent/regent-slack-bot/requirements.md) • [design](https://github.com/stickystyle/regent/blob/main/.regent/regent-slack-bot/design.md) • [tasks](https://github.com/stickystyle/regent/blob/main/.regent/regent-slack-bot/tasks.md)

### Requirements

**Requirement 1: Session Initialization**
**User Story:** As a team lead, I want to start a brainstorming session with a simple slash command, so that my team can collaboratively develop a spec without leaving Slack.

**Acceptance Criteria:**
> 1. WHEN a user invokes `/brainstorm <idea description>` THEN the system SHALL create a new thread and post an initial message acknowledging the session start.

**Requirement 5: Canvas Creation and Management**
**User Story:** As a team lead, I want the draft spec delivered as a Slack Canvas, so that the team can review it in a familiar format and provide feedback easily.

**Acceptance Criteria:**
> 4. IF Canvas creation fails THEN the system SHALL fall back to uploading `brainstorm.md` as a file attachment to the thread.

**Requirement 8: Error Handling**
**User Story:** As a developer, I want clear and detailed error messages, so that I can quickly understand what went wrong and how to fix it.

**Acceptance Criteria:**
> 2. WHEN a transient error occurs (API timeout, rate limit) THEN the system SHALL retry with exponential backoff up to 3 times before reporting failure.

> 3. WHEN a GitHub API rate limit is exceeded THEN the system SHALL display the reset time and confirm that the user's answer was saved.

### Design Context

**Interfaces**

This task implements Slack API wrappers used by multiple components (Orchestrator, CanvasManager). Key methods:
- `postMessage(channel, thread_ts, text)`: Post message to thread
- `uploadFile(channel, thread_ts, filename, content)`: Upload file as attachment
- Rate limit handling with exponential backoff retry logic

**Correctness Properties**
**Property 11: Retry Logic**
*For any* transient error (timeout, rate limit), *the system should* retry with exponential backoff up to 3 times before reporting failure
**Validates:** Requirements 8.2, 8.6

**Error Handling**
**Slack API Errors:**
- **Trigger**: Canvas creation fails, Slack API rate limits exceeded, or thread history pagination errors
- **Response**: For Canvas failures, automatically fall back to file upload. For rate limits, display the reset time and confirm data was saved
- **Recovery**: Canvas fallback is automatic. Rate limit errors are transient and self-recover

### Task Relationships

- **Depends on**: Task 4 (error handling types and retry logic)
- **Blocks**: Task 7 (slash command handler uses postMessage), Task 10 (Canvas manager uses uploadFile fallback), Task 17 (orchestrator uses messaging)

### Implementation Guidance

- Wrapper should abstract Slack's `chat.postMessage` and `files.upload` APIs with consistent error handling
- Threaded messages: always include `thread_ts` parameter to post in correct thread
- File upload: use meaningful filenames (`brainstorm.md`) and attach to thread using `thread_ts`
- Rate limit handling: parse Slack's `Retry-After` header and implement exponential backoff (max 3 retries)
- Error messages: include rate limit reset time when displaying rate limit errors to users

## Codebase Context

### Current Implementation State

**Existing Slack Client Structure**
The project already has a pattern for Slack client abstraction in `slackbot/src/clients/slack-client.ts`:

- **SlackClient interface** (lines 78-96): Defines contract for Slack API operations
- **SlackThreadMessage interface** (lines 10-43): Represents raw message data from Slack API
- **ThreadMessagesResponse interface** (lines 48-70): Pagination response with `has_more` and cursor
- **MockSlackClient class** (lines 103-171): In-memory mock implementation with configurable responses and pagination simulation

This establishes the dependency injection pattern used throughout the codebase.

**Current Slack Integration Points**
- Manifest at `slackbot/manifest.ts` specifies bot scopes including:
  - `chat:write` (posting messages)
  - `files:write` (uploading files)
  - `files:read` (reading files)
- Using Deno Slack SDK v2.14.3 and Slack API v2.8.0 (from deno.jsonc)

**Error Handling Pattern Already in Place**
Error types in `slackbot/src/errors/types.ts` include:
- **SlackRateLimitError** (lines 110-130): Transient error with `retryAfterSeconds` field
- **SlackCanvasError** (lines 138-140): Transient error for Canvas operation failures
- Both extend **TransientError** which extends **BaseError**
- BaseError has `toSlackMessage()` method (lines 41-51) for formatting errors as Slack messages

**Retry Infrastructure Already in Place**
RetryHandler in `slackbot/src/errors/retry.ts`:
- Exponential backoff with configurable multiplier (default 2x)
- Configurable `maxAttempts` (default 3)
- `onRetry` callback for pre-retry hooks
- Only retries TransientError exceptions
- Tracks `currentAttempt` and `isExhausted` state

### Test Template Reference

**Test File Location & Pattern**: `slackbot/tests/handlers/message-event.test.ts` (397 lines)

**Testing Framework**:
```typescript
import { assertEquals, assertRejects, assertThrows } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
```

**Key Testing Patterns Observed**:

1. **Describe/It Structure**: Nested describe blocks organize tests by functionality
   ```typescript
   describe("handleMessageEvent", () => {
     describe("event routing", () => {
       it("should handle app_mention event in thread", () => { ... });
     });
   });
   ```

2. **Mock Implementations**: Using class-based mocks that implement interfaces
   ```typescript
   // From session-manager.test.ts
   let datastore: MockDatastoreClient;
   beforeEach(() => {
     datastore = new MockDatastoreClient();
     sessionManager = new SessionManager(datastore);
   });
   afterEach(() => {
     datastore.clear();
   });
   ```

3. **Property Tests**: Large test blocks that verify invariants across multiple cases
   - Property 11 (Retry Logic) tests all transient error types with same assertions
   - Tests use loops to verify behavior across input variations

4. **Error Testing Pattern**:
   ```typescript
   assertThrows(
     () => handleMessageEvent(input),
     ValidationError,
     "must be in a thread",
   );
   ```

5. **Async Testing**:
   ```typescript
   const result = await handler.execute(operation);
   assertEquals(result, "success");
   ```

### Project Conventions

**Import Style**:
- Absolute imports from compiled modules: `import { ... } from "../../src/..."`
- SDK imports use full path: `import { DefineDatastore } from "deno-slack-sdk/mod.ts"`
- Type imports: `import type { Message } from "../types/message.ts"`
- Test utilities: `import { describe, it } from "@std/testing/bdd"`

**File Header Comments** (REQUIRED - matches CLAUDE.md instructions):
```typescript
// ABOUTME: [Brief description of file purpose]
// ABOUTME: [What key feature/responsibility]
```
Examples:
- Slack Client: "Interface for Slack API client to enable dependency injection for testing."
- RetryHandler: "RetryHandler with exponential backoff for transient error recovery."

**Error Handling Pattern**:
- All errors extend BaseError (which extends native Error)
- Errors are either TransientError or PermanentError
- All BaseError instances have `toSlackMessage()` method for Slack formatting
- Validation errors thrown with three arguments: `(message, details, suggestedAction)`

**Type Annotations**:
- Strict TypeScript enabled (`"strict": true` in deno.jsonc)
- Return types explicitly annotated on all functions
- Interface properties documented with JSDoc comments
- Example: `retryAfterSeconds: number;` with comment explaining units

**File Organization**:
```
src/
  clients/          # API client abstractions (SlackClient, etc.)
  types/            # Data models and type definitions
  errors/           # Error types and retry logic
  handlers/         # Event/command handlers
  managers/         # Stateful business logic (Session, MessageCache)
  datastores/       # Datastore schema definitions
tests/
  errors/           # Tests for error handling
  handlers/         # Tests for event/command handlers
  managers/         # Tests for managers
  types/            # Tests for data models
```

### Requirements Mapping for Task 9

From `.regent/regent-slack-bot/tasks.md` line 82-87:
```
- [ ] 9. Implement Slack messaging utilities (#22)
  - Write tests for postMessage (simple, threaded, error handling)
  - Write tests for uploadFile (naming, threading, fallback)
  - Write tests for rate limit handling with retry
  - Implement Slack client wrapper for chat.postMessage and files.upload
  - _Requirements: 1.1, 5.4, 8.2, 8.3_
```

**Requirement 1.1**: Slash command acknowledgment - bot must post message acknowledging session start
**Requirement 5.4**: Canvas fallback - "IF Canvas creation fails THEN the system SHALL fall back to uploading `brainstorm.md` as a file attachment to the thread"
**Requirement 8.2**: Transient error retry - "WHEN a transient error occurs (API timeout, rate limit) THEN the system SHALL retry with exponential backoff up to 3 times before reporting failure"
**Requirement 8.3**: Rate limit display - "WHEN a GitHub API rate limit is exceeded THEN the system SHALL display the reset time and confirm that the user's answer was saved"

### Files to Create/Modify

**New File to Create**:
- `slackbot/src/clients/messaging-client.ts`
  - Implement `SlackMessagingClient` interface for dependency injection
  - Implement `postMessage(channelId, threadTs?, text, blocks?)` with optional threading
  - Implement `uploadFile(channelId, threadTs?, filename, content, mimetype)`
  - Implement `MockSlackMessagingClient` for testing
  - Integrate RetryHandler for transient errors
  - Handle SlackRateLimitError with retry-after extraction

**New Test File to Create**:
- `slackbot/tests/clients/messaging-client.test.ts`
  - Test simple message posting (no thread)
  - Test threaded message posting (with thread_ts)
  - Test error handling for rate limits (SlackRateLimitError)
  - Test error handling for network timeouts
  - Test uploadFile with thread reference
  - Test uploadFile filename handling
  - Test fallback behavior (Canvas → file upload)
  - Test retry logic with exponential backoff
  - Test onRetry callback integration

### Files to Reference

1. **`slackbot/src/clients/slack-client.ts`**
   - Shows SlackClient interface pattern to follow
   - MockSlackClient implementation demonstrates mock testing approach
   - Shows use of Promise-based async pattern

2. **`slackbot/src/errors/retry.ts`**
   - RetryHandler class to integrate into messaging client
   - Shows exponential backoff calculation
   - Shows onRetry callback pattern for pre-retry hooks
   - TransientError detection logic

3. **`slackbot/src/errors/types.ts`**
   - SlackRateLimitError for rate limit handling
   - toSlackMessage() pattern for error display in threads
   - Error constructor pattern: `(message, details, suggestedAction)`

4. **`slackbot/tests/handlers/message-event.test.ts`**
   - Test structure and assertion patterns to follow
   - Shows how to structure test suites with describe/it
   - Shows validation error testing with assertThrows

5. **`slackbot/tests/errors/retry.test.ts`**
   - Property test pattern for retry logic (Property 11)
   - Shows retry callback testing with event collection
   - Async test patterns with Promise handling
   - Tests for "onRetry" callback with delays

6. **`slackbot/tests/managers/session-manager.test.ts`**
   - beforeEach/afterEach setup/cleanup pattern
   - Shows mock initialization and state management
   - Shows integration testing of multiple components

7. **`slackbot/manifest.ts`**
   - Shows bot scopes already configured: `chat:write`, `files:write`
   - Reference for what API permissions are available

### Slack SDK Integration Notes

**Version**: Deno Slack SDK v2.14.3, Slack API v2.8.0

**Key Methods to Wrap** (from Slack API):
- `chat.postMessage`: Post message to channel with optional thread_ts
  - Inputs: `channel`, `text` (or `blocks`), `thread_ts` (optional)
  - Response: `ts` (message timestamp), `ok` (boolean)

- `files.upload`: Upload file to channel with optional thread
  - Inputs: `channels` (array), `file` (Buffer), `filename`, `thread_ts` (optional)
  - Response: `file` (with file_id), `ok` (boolean)

**Rate Limit Headers**:
- `Retry-After` header: Seconds to wait before next request
- Extract from error response for SlackRateLimitError construction

## Summary for Implementation

When writing Task 9, you'll be:

1. **Creating a new abstraction layer** for Slack messaging (similar to existing SlackClient for thread fetching)
2. **Using dependency injection** with interfaces to enable mock testing
3. **Integrating existing RetryHandler** for transient error recovery
4. **Following test-first TDD** with comprehensive test coverage before implementation
5. **Using existing error types** (SlackRateLimitError, NetworkTimeoutError) from errors/types.ts
6. **Following established patterns** for mock implementations, test structure, and file organization

The infrastructure for error handling and retry logic is already in place - this task focuses on the messaging API wrapper and its test coverage.

---
*Branch: feature/regent-slack-bot*
*Generated at execution time by Regent*
