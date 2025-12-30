# Task Brief

## From Issue #16

**Task 8**: Implement event routing and mention parsing
**Type**: test-first

- Write tests for event filtering (app_mention vs message, thread detection)
- Write tests for mention parsing (@regent answer, next, ready, approved)
- Write tests for official answer recording
- Implement event handler with ROSI function signature
- Write property test: **Property 2 - Answer Recording**
- _Requirements: 3.2, 3.3, 3.4, 3.5_

### Requirements

**Requirement 3.2:** WHEN a user posts `@regent <answer text>` in the session thread THEN the system SHALL record the answer and proceed to the next question or phase transition.

**Requirement 3.3:** WHEN a message is posted in the thread without `@regent` mention THEN the system SHALL store the message for context but SHALL NOT respond or treat it as an official answer.

**Requirement 3.4:** WHEN a user posts `@regent next` THEN the system SHALL skip the current question and ask the next one.

**Requirement 3.5:** WHEN a user posts `@regent ready` THEN the system SHALL transition to review phase regardless of current confidence score.

### Design Context

```typescript
interface SessionOrchestrator {
  /** Process @regent mentions and official answers. */
  handleMessage(event: MessageEvent): Promise<void>;
}
```

**Correctness Properties:**
- **Property 2: Answer Recording** - For any message prefixed with `@regent` in a session thread, the system should record the message as an official answer before generating the next question (Validates: Requirements 3.2, 7.4)

### Error Handling

**Session Expiration:**
- When user posts `@regent` in a thread with an expired or missing session record, automatically create a new session record and rebuild context by re-reading the entire thread history from Slack

### Task Relationships

- **Depends on**: Task 6 (MessageCache and history rebuilding), Task 2 (Message model)
- **Blocks**: Task 17 (session orchestration - integrates event handling), Task 18 (question-answer loop)

### Implementation Guidance

- Event handler must use ROSI function signature as defined by Slack's Run On Slack Infrastructure
- Event filtering: distinguish between `app_mention` events (always respond) and `message` events in existing threads (only store for context)
- Thread detection: check if message has `thread_ts` and matches an existing session
- Mention parsing: extract command keywords (answer, next, ready, approved) from text following `@regent`
- Official answer: messages starting with `@regent` should be marked as `is_official_answer: true` in the Message model
- Special commands: `@regent next` skips current question, `@regent ready` forces transition to review phase

---

## Codebase Context

### Current Implementation State

#### ROSI Function Signature Pattern (from Task 7)

The `/brainstorm` slash command from Task 7 provides the pattern for ROSI functions:

**File:** `slackbot/src/handlers/slash-command.ts`

```typescript
// Main handler function signature
export function handleSlashCommand(
  input: SlackSlashCommandInput,
): SlashCommand {
  // Implementation validates then parses
  validateChannel(input.channel_type);
  const { repository, idea } = parseCommand(input.text);
  return {
    idea,
    repository,
    channelId: input.channel_id,
    userId: input.user_id,
    channelType: input.channel_type,
    responseUrl: input.response_url,
  };
}
```

**Key Observation:** The function accepts raw Slack input, validates it, and returns a parsed output object. This is the pattern Task 8 will follow for message events.

#### Message Model

**File:** `slackbot/src/types/message.ts`

```typescript
export interface Message {
  sender: string;              // "bot" or Slack user ID (e.g., "U1234567890")
  text: string;                // Message text content
  timestamp: string;            // Slack message timestamp (e.g., "1234567890.123456")
  is_official_answer: boolean;  // TRUE if text starts with "@regent"
  attachments?: ProcessedAttachment[];
}

export function isOfficialAnswer(text: string): boolean {
  return text.startsWith("@regent");
}
```

**Key Fields for Task 8:**
- `is_official_answer`: Already implemented to detect `@regent` prefix
- `sender`: Tracks who posted the message (for attribution)
- `timestamp`: Needed for threading and history order
- `text`: Contains the actual answer or mention command

#### SessionManager API

**File:** `slackbot/src/managers/session-manager.ts`

Key methods available for Task 8:

```typescript
export class SessionManager {
  // Load existing session by channel and thread
  async loadSession(
    channelId: string,
    threadTs: string,
  ): Promise<Session | null>

  // Update session state (phase, confidence, etc.)
  async updateSession(session: Session): Promise<void>

  // Rebuild session from thread history (fallback for expired sessions)
  async rebuildFromHistory(
    channelId: string,
    threadTs: string,
  ): Promise<Session>
}
```

**Important:** When a session is missing or expired:
- The error handling requirement states: "automatically create a new session record and rebuild context by re-reading the entire thread history from Slack"
- Use `rebuildFromHistory()` which fetches all messages and reconstructs the session

#### MessageCache API

**File:** `slackbot/src/managers/message-cache.ts`

```typescript
export class MessageCache {
  // Get all cached messages for a session
  get(sessionId: string): Message[]

  // Add a message to cache (append to preserve order)
  append(sessionId: string, message: Message): void

  // Remove all messages for a session (when finalized or expired)
  evict(sessionId: string): void
}
```

#### Error Types for Task 8

**File:** `slackbot/src/errors/types.ts`

Available error classes extend from BaseError:
- `ValidationError` (PermanentError) - for invalid mentions or commands
- `SlackRateLimitError` (TransientError) - for rate limit handling
- All errors support `.toSlackMessage()` for formatted error display

---

### Test Template Reference

**Test File Locations:**
- Task 7 slash command: `slackbot/tests/handlers/slash-command.test.ts`
- Task 2 message model: `slackbot/tests/types/message.test.ts`
- Task 6 message cache: `slackbot/tests/managers/message-cache.test.ts`
- Task 5 session manager: `slackbot/tests/managers/session-manager.test.ts`

**Test Structure Pattern** (from slash-command.test.ts):

```typescript
import { assertEquals, assertThrows } from "@std/assert";
import { describe, it } from "@std/testing/bdd";

describe("functionName", () => {
  describe("sub-feature or scenario", () => {
    it("should do something specific", () => {
      // Arrange
      const input = { /* test data */ };

      // Act
      const result = functionUnderTest(input);

      // Assert
      assertEquals(result.property, expectedValue);
    });

    it("should throw error on invalid input", () => {
      assertThrows(
        () => functionUnderTest(invalidInput),
        ErrorClass,
        "error message substring",
      );
    });
  });
});
```

**Fixture Pattern** (from MessageCache Tests):

```typescript
describe("MessageCache", () => {
  let cache: MessageCache;

  beforeEach(() => {
    cache = new MessageCache();
  });

  afterEach(() => {
    cache.clear();
  });

  // ... tests here
});
```

**Property Test Pattern** (from SessionManager):

```typescript
describe("Property 9: TTL Enforcement", () => {
  it("should set TTL to creation timestamp plus 30 days for any creation time", async () => {
    // Tests for the property
  });
});
```

---

### Project Conventions

**Import Style:**

```typescript
// Type imports
import type { Session } from "../types/session.ts";
import type { Message } from "../types/message.ts";

// Value imports
import { ValidationError } from "../errors/types.ts";
import { MessageCache } from "../managers/message-cache.ts";

// Standard library
import { assertEquals, assertThrows } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
```

**Error Handling Pattern:**

All handlers throw specific error types that extend `BaseError`:

```typescript
export function validateChannel(channelType: string): void {
  const allowedTypes = ["channel", "group"];
  const dmTypes = ["im", "mpim"];

  if (dmTypes.includes(channelType)) {
    throw new ValidationError(
      "Cannot use /brainstorm in direct messages",
      `This command is only available in channels. Channel type: ${channelType}`,
      "Please use /brainstorm in a channel instead",
    );
  }
}
```

**Type Annotation Style:**

Strong typing is enforced:

```typescript
// Return types always specified
export function parseCommand(text: string): { repository?: string; idea: string }

// All parameters typed
async createSession(
  channelId: string,
  threadTs: string,
  repo: string,
  userId: string,
): Promise<Session>
```

**File Organization:**

```
slackbot/
├── src/
│   ├── types/              # Data models (message.ts, session.ts, etc.)
│   ├── managers/           # Business logic (session-manager.ts, message-cache.ts)
│   ├── handlers/           # ROSI function handlers (slash-command.ts)
│   ├── clients/            # External API clients (slack-client.ts)
│   ├── errors/             # Error types (types.ts, retry.ts)
│   └── mod.ts              # Re-exports public APIs
│
├── tests/
│   ├── types/              # Tests for data models
│   ├── managers/           # Tests for business logic
│   ├── handlers/           # Tests for handlers
│   └── errors/             # Tests for error handling
```

---

### Files to Create/Modify

**Primary Files for Task 8:**

1. **`slackbot/src/handlers/message-event.ts`** (NEW)
   - Main event handler for message and app_mention events
   - ROSI function signature pattern (similar to slash-command.ts)
   - Functions needed:
     - `parseMessageEvent()` - Extract message type (app_mention vs message), thread ID, sender, text
     - `isMentionCommand()` - Detect @regent prefix with command
     - `extractCommand()` - Parse mention commands (next, ready, approved)
     - `handleMessageEvent()` - Main async handler

2. **`slackbot/tests/handlers/message-event.test.ts`** (NEW)
   - Test suite for event routing and mention parsing
   - Tests needed per requirements 3.2, 3.3, 3.4, 3.5:
     - Event filtering (app_mention vs message, thread detection)
     - Mention parsing (@regent answer, next, ready, approved)
     - Official answer recording
     - Property 2 - Answer Recording

**Reference Files** (Don't Modify):

- `slackbot/src/types/message.ts` - Message interface and `isOfficialAnswer()`
- `slackbot/src/types/session.ts` - Session interface and `formatSessionId()`
- `slackbot/src/managers/session-manager.ts` - SessionManager API
- `slackbot/src/managers/message-cache.ts` - MessageCache API
- `slackbot/src/errors/types.ts` - Error types for validation
- `slackbot/src/handlers/slash-command.ts` - ROSI function pattern

---

### Expected Test Categories

Based on Task 7's test structure, Task 8 tests should cover:

1. **Event Filtering**
   - Identify app_mention vs regular message
   - Detect thread vs channel root
   - Extract channel ID and thread timestamp

2. **Mention Parsing**
   - Parse `@regent <answer text>` format
   - Extract `@regent next` command
   - Extract `@regent ready` command
   - Extract `@regent approved` command (if applicable)

3. **Official Answer Recording**
   - Create Message object with `is_official_answer: true`
   - Store in MessageCache via `append()`
   - Update session state if needed

4. **Session Management**
   - Load existing session
   - Handle missing session → rebuild from history
   - Handle expired session → rebuild from history

5. **Property 2 - Answer Recording**
   - Verify all @regent mentions record answers
   - Verify non-@regent messages stored for context but don't trigger recording

---
*Branch: feature/regent-slack-bot*
*Generated at execution time by Regent*
