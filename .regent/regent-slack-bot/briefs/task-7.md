# Task Brief

## From Issue #15

**Task 7**: Implement slash command handler
**Type**: test-first

- Write tests for command parsing (--repo flag, idea extraction)
- Write tests for channel validation (reject DMs, accept public/private)
- Write tests for command flow (session creation, acknowledgment message)
- Implement slash command handler with ROSI function signature
- _Requirements: 1.1, 1.2, 1.3, 1.4_

### Interfaces

```typescript
interface SessionOrchestrator {
  /** Process /brainstorm command and initialize session. */
  handleSlashCommand(command: SlashCommand): Promise<void>;
}
```

### Error Handling
**Invalid Input:**
- **Trigger**: User provides invalid repository format, invokes `/brainstorm` in a DM, or provides malformed slash command
- **Response**: Display specific error message explaining the validation failure and the correct format/usage
- **Recovery**: User corrects input and retries command

### Implementation Guidance

- Slash command handler must use ROSI function signature as defined by Slack's Run On Slack Infrastructure
- Command parsing must extract optional `--repo owner/repo` flag and the remaining text as the idea description
- Channel validation: reject DM channels (type: 'im'), accept public ('channel') and private ('group') channels
- Initial message should be posted in a new thread, creating the thread timestamp that becomes part of the session ID

**Depends on**: Task 5 (SessionManager), Task 2 (Session model)

## Codebase Context

# Codebase Context: Task 7 - Implement Slash Command Handler

## Current Implementation State

### Session Model (Task 2)
**Location:** `/Volumes/workingfolder/regent/slackbot/src/types/session.ts`

The Session type is fully implemented with:
- **Composite ID format:** `{channel_id}:{thread_ts}` (e.g., `"C1234567890:1234567890.123456"`)
- **Phase enum:** `Questioning`, `Review`, `Finalized`
- **Required fields:** `session_id`, `phase`, `initiator_user_id`, `confidence_score`, `created_at`, `ttl`
- **Optional fields:** `repository`, `canvas_id`
- **Helper function:** `formatSessionId(channelId: string, threadTs: string): string`

```typescript
export interface Session {
  session_id: string;           // Channel ID:Thread TS
  repository?: string;          // "owner/repo" format
  phase: Phase;                 // Questioning | Review | Finalized
  initiator_user_id: string;   // Slack user ID
  canvas_id?: string;          // Set during review phase
  confidence_score: number;    // 0-100%
  created_at: string;          // ISO 8601
  ttl: string;                 // ISO 8601, 30 days from created_at
}

export enum Phase {
  Questioning = "questioning",
  Review = "review",
  Finalized = "finalized",
}
```

### SessionManager (Task 5)
**Location:** `/Volumes/workingfolder/regent/slackbot/src/managers/session-manager.ts`

The SessionManager is fully implemented with:

**Constructor:**
```typescript
constructor(
  datastore: DatastoreClient,
  getCurrentTime?: () => Date,
  slackClient?: SlackClient,
  messageCache?: MessageCache,
)
```

**Key Methods:**
```typescript
async createSession(
  channelId: string,
  threadTs: string,
  repo: string,
  userId: string,
): Promise<Session>
  // Creates session with TTL = 30 days
  // Throws error if session already exists
  // Converts empty string repo to undefined

async loadSession(
  channelId: string,
  threadTs: string,
): Promise<Session | null>
  // Returns null if not found or expired
  // Checks TTL at application level

async updateSession(session: Session): Promise<void>
  // Preserves created_at and ttl
  // Throws error if session doesn't exist

async rebuildFromHistory(
  channelId: string,
  threadTs: string,
): Promise<Session>
  // Fetches thread messages with pagination
  // Finds initiator from first @regent mention
  // Detects phase by looking for Canvas blocks
  // Populates MessageCache with all messages
```

### Message Types
**Location:** `/Volumes/workingfolder/regent/slackbot/src/types/message.ts`

```typescript
export interface Message {
  sender: string;              // "bot" or Slack user ID
  text: string;               // Message text
  timestamp: string;          // Slack message timestamp
  is_official_answer: boolean; // true if starts with "@regent"
  attachments?: ProcessedAttachment[];
}

export function isOfficialAnswer(text: string): boolean {
  return text.startsWith("@regent");
}
```

### Error Types
**Location:** `/Volumes/workingfolder/regent/slackbot/src/errors/types.ts`

Available for validation errors:
```typescript
export class ValidationError extends PermanentError {
  readonly type = "ValidationError";
  // Constructor: (message: string, details: string, suggestedAction: string)
}

// BaseError provides toSlackMessage() method for formatting errors
```

All errors extend `BaseError` with:
```typescript
abstract class BaseError extends Error {
  abstract readonly type: string;
  abstract readonly isRetryable: boolean;
  readonly details: string;
  readonly suggestedAction: string;
  toSlackMessage(): string;  // Formats for Slack mrkdwn
}
```

### MessageCache
**Location:** `/Volumes/workingfolder/regent/slackbot/src/managers/message-cache.ts`

```typescript
export class MessageCache {
  get(sessionId: string): Message[]
  append(sessionId: string, message: Message): void
  evict(sessionId: string): void
  clear(): void  // For testing
}
```

### DatastoreClient Interface
**Location:** `/Volumes/workingfolder/regent/slackbot/src/managers/datastore-client.ts`

```typescript
export interface DatastoreClient {
  put(session: Session): Promise<DatastoreResponse<Session>>;
  get(sessionId: string): Promise<DatastoreResponse<Session>>;
  delete(sessionId: string): Promise<DatastoreResponse<void>>;
}

export interface DatastoreResponse<T> {
  ok: boolean;
  item?: T;
  error?: string;
}
```

## Test Template Reference

### Similar Test File
**Path:** `/Volumes/workingfolder/regent/slackbot/tests/managers/session-manager.test.ts`

This is a comprehensive test suite showing all patterns needed for Task 7.

### Key Patterns Observed

**1. Test Structure:**
```typescript
import { assertEquals, assertExists, assertRejects } from "@std/assert";
import { afterEach, beforeEach, describe, it } from "@std/testing/bdd";

describe("ComponentName", () => {
  let datastore: MockDatastoreClient;

  beforeEach(() => {
    datastore = new MockDatastoreClient();
  });

  afterEach(() => {
    datastore.clear();
  });

  describe("methodName", () => {
    it("should test specific behavior", async () => {
      // Arrange
      const input = "value";

      // Act
      const result = await sessionManager.createSession(...);

      // Assert
      assertEquals(result.property, expectedValue);
    });
  });
});
```

**2. Assertion Patterns:**
- `assertEquals(actual, expected)` - basic equality
- `assertExists(value)` - checks value is not null/undefined
- `assertRejects(() => promise, ErrorClass, messageMatch)` - async error testing

**3. Mock Setup:**
- Create mock datastore/clients in `beforeEach`
- Clear state in `afterEach`
- Set test time via `datastore.setCurrentTime(date)` for TTL testing

**4. Async/await:** All tests use `async/await` pattern, not promises

## Project Conventions

### Import Style
```typescript
// Deno-style imports with full paths
import type { SlackClient } from "../clients/slack-client.ts";
import { SessionManager } from "../managers/session-manager.ts";
import type { Session } from "../types/session.ts";

// Standard library from JSR
import { assertEquals } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
```

### Error Handling Pattern
```typescript
// Throw domain-specific errors (ValidationError, etc.)
throw new ValidationError(
  "Invalid repository format",
  "Format must be owner/repo, got: xyz",
  "Please use the format owner/repo and try again"
);

// Access error metadata via .toSlackMessage() for Slack display
const slackMsg = error.toSlackMessage();
```

### Type Annotations
- All function parameters typed explicitly
- Return types specified (e.g., `Promise<Session>`, `Promise<void>`)
- Interfaces used for contracts, classes for implementations
- Optional fields use `?:` syntax

### File Header Comment
```typescript
// ABOUTME: Brief description of what the file does.
// ABOUTME: Second line of description if needed.
```

### Test File Naming
- Located in `tests/` directory matching `src/` structure
- Named `{component}.test.ts` (e.g., `session-manager.test.ts`)
- Describe blocks organize tests hierarchically

## Design Context from Requirements

### Slash Command Requirements (Requirement 1)
From `/Volumes/workingfolder/regent/.regent/regent-slack-bot/requirements.md`:

1. **Format:** `/brainstorm [--repo owner/repo] <idea description>`
2. **Validation:**
   - Reject in DMs (channel type: 'im')
   - Accept in public channels (type: 'channel')
   - Accept in private channels (type: 'group')
3. **Processing:**
   - Parse optional `--repo` flag
   - Extract remaining text as idea
   - Create session with channel ID + thread timestamp
   - Post acknowledgment message in new thread

### Session Initialization Flow
From design.md:
1. SessionOrchestrator receives SlashCommand
2. Calls `sessionManager.createSession(channelId, threadTs, repo, userId)`
3. Posts acknowledgment in thread
4. If repo specified, explores codebase before first question

## Files to Modify

### 1. Create Slash Command Handler Test File
**File:** `/Volumes/workingfolder/regent/slackbot/tests/handlers/slash-command.test.ts` (NEW)
- Write tests for command parsing (repo flag extraction, idea text)
- Write tests for channel validation (DM rejection, channel/group acceptance)
- Write tests for session creation integration
- Write tests for acknowledgment message handling

### 2. Create Slash Command Handler Implementation
**File:** `/Volumes/workingfolder/regent/slackbot/src/handlers/slash-command.ts` (NEW)
- Implement slash command parsing function
- Implement channel type validation
- Implement handler function with ROSI signature
- Export for use by SessionOrchestrator

### 3. Create Types for Slash Command
**File:** `/Volumes/workingfolder/regent/slackbot/src/types/index.ts` (MODIFY)
- Add SlashCommand interface export
- Add MessageEvent interface export (for Task 8)

**File:** `/Volumes/workingfolder/regent/slackbot/src/types/slash-command.ts` (NEW)
- Define SlashCommand interface with: `idea`, `repository?`, `channelId`, `threadTs`, `userId`, `channelType`

## Files to Reference

### Slack ROSI Documentation Patterns
- **Manifest:** `/Volumes/workingfolder/regent/slackbot/manifest.ts` - shows required scopes:
  - `commands` (for slash command handling)
  - `chat:write` (for posting messages)
  - `datastore:read`, `datastore:write` (for SessionManager)

### Testing Infrastructure
- **Test runner config:** `/Volumes/workingfolder/regent/slackbot/deno.jsonc`
  - Tests run with: `deno test --allow-read --allow-net`
  - Import maps for @std/assert and @std/testing/bdd

### Existing Test Examples
- **Session tests:** `/Volumes/workingfolder/regent/slackbot/tests/managers/session-manager.test.ts` (1168 lines)
  - Shows comprehensive test coverage patterns
  - Shows Arrange/Act/Assert structure
  - Shows mock client usage

### Integration Points
- **SessionManager:** Already has `createSession()` method ready to call
- **MessageCache:** Already exists for storing messages
- **Error types:** `ValidationError` already defined for validation failures

---

## Summary

**Task 7 dependencies are complete:**
- ✅ Session model (Task 2) - fully implemented
- ✅ SessionManager (Task 5) - fully implemented
- ✅ Error types - validation errors ready
- ✅ Testing infrastructure - Deno test runner configured

**What needs to be created for Task 7:**
1. SlashCommand type definition
2. Command parsing logic (--repo flag extraction)
3. Channel validation logic (reject DMs, accept channels/groups)
4. Tests for all three components above
5. ROSI function handler with proper signature

**Key integration points:**
- Call `sessionManager.createSession()` after parsing and validation
- Post acknowledgment message to Slack thread
- Handle SessionManager errors and convert to ValidationError for display
- Use SlackClient.postMessage() for acknowledgment (to be implemented in Task 9)

---
*Branch: feature/regent-slack-bot*
*Generated at execution time by Regent*
