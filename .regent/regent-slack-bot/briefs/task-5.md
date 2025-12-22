# Task Brief

## From Issue #38

## Overview

**Task 5**: Implement SessionManager with Slack Datastore
**Type**: test-first

- Write tests for createSession (TTL, duplicate prevention, repo storage)
- Write tests for loadSession (existing, missing, expired handling)
- Write tests for updateSession (phase transitions, confidence updates)
- Implement SessionManager with Slack Datastore client
- Write property test: **Property 9 - TTL Enforcement**

## Requirements

### Requirement 1: Session Initialization
**User Story:** As a team lead, I want to start a brainstorming session with a simple slash command, so that my team can collaboratively develop a spec without leaving Slack.

**Acceptance Criteria:**
> 5. WHEN a session is created THEN the system SHALL store a session record containing: session ID, repository (if provided), phase (`questioning`), initiator user ID, creation timestamp, and TTL (30 days from creation).

### Requirement 3: Question-Answer Workflow
**User Story:** As a team member, I want the bot to ask one question at a time, so that the team can focus discussion and provide thoughtful answers without feeling overwhelmed.

**Acceptance Criteria:**
> 6. WHEN Claude's confidence score reaches 95% or higher THEN the system SHALL transition to review phase and create a draft Canvas.

### Requirement 5: Canvas Creation and Management
**User Story:** As a team lead, I want the draft spec delivered as a Slack Canvas, so that the team can review it in a familiar format and provide feedback easily.

**Acceptance Criteria:**
> 1. WHEN transitioning to review phase THEN the system SHALL create a Slack Canvas containing the structured spec document.

### Requirement 7: Session Persistence and Resumption
**User Story:** As a busy developer, I want to resume a brainstorming session after interruptions, so that work isn't lost when the team gets pulled into other priorities.

**Acceptance Criteria:**
> 1. WHEN a session is created THEN the system SHALL set a TTL of 30 days from the creation timestamp.
> 2. WHEN a session record expires (TTL exceeded) THEN the system SHALL allow the record to be deleted.

## Design Context

### SessionManager Interface (from design.md lines 213-230)

```typescript
interface SessionManager {
  /** Create new session record with TTL. */
  createSession(channelId: string, threadTs: string, repo: string, userId: string): Promise<Session>;

  /** Load session from datastore or rebuild from thread history. */
  loadSession(channelId: string, threadTs: string): Promise<Session>;

  /** Persist session state changes. */
  updateSession(session: Session): Promise<void>;

  /** Add message to cache and update session. */
  appendMessage(session: Session, message: Message): Promise<void>;

  /** Recreate session by re-reading entire Slack thread. */
  rebuildFromHistory(channelId: string, threadTs: string): Promise<Session>;
}
```

### MessageCache Interface (from design.md lines 339-348)

```typescript
interface MessageCache {
  /** Retrieve cached messages for session. */
  get(sessionId: string): Message[];

  /** Add message to session cache. */
  append(sessionId: string, message: Message): void;

  /** Clear cache for expired or finalized session. */
  evict(sessionId: string): void;
}
```

### Property 9: TTL Enforcement
*For any* session record, *the system should* set TTL to creation timestamp plus 30 days and allow deletion after expiration
**Validates:** Requirements 7.1, 7.2

## Codebase Context

### Current Implementation State

#### Session Model (slackbot/src/types/session.ts)
```typescript
export enum Phase {
  Questioning = "questioning",
  Review = "review",
  Finalized = "finalized",
}

export interface Session {
  session_id: string;           // Format: {channel_id}:{thread_ts}
  repository?: string;          // Optional owner/repo format
  phase: Phase;                 // Current phase
  initiator_user_id: string;    // Slack user ID
  canvas_id?: string;           // Slack Canvas ID (set during review)
  confidence_score: number;     // 0-100
  created_at: string;           // ISO 8601
  ttl: string;                  // ISO 8601 (created_at + 30 days)
}

export function formatSessionId(channelId: string, threadTs: string): string {
  return `${channelId}:${threadTs}`;
}
```

#### Message Model (slackbot/src/types/message.ts)
```typescript
export interface Message {
  sender: string;               // "bot" or Slack user ID
  text: string;                 // Message content
  timestamp: string;            // Slack message timestamp
  is_official_answer: boolean;  // @regent-prefixed messages
  attachments?: ProcessedAttachment[];
}

export function isOfficialAnswer(text: string): boolean {
  return text.trim().toLowerCase().startsWith("@regent");
}
```

#### Error Types (slackbot/src/errors/)
- TransientError: GitHubRateLimitError, SlackRateLimitError, SlackCanvasError, AnthropicRateLimitError, NetworkTimeoutError
- PermanentError: GitHubAccessError, AnthropicModelError, AnthropicInputError, ValidationError
- RetryHandler with exponential backoff (3 max attempts)

### Test Template Reference

**Test Framework:** Deno with `@std/testing/bdd` and `@std/assert`

**Key Patterns from existing tests:**
```typescript
import { assertEquals, assertExists, assertRejects } from "@std/assert";
import { describe, it } from "@std/testing/bdd";

describe("ComponentName", () => {
  describe("Method/Feature", () => {
    it("should do expected behavior", () => {
      // Arrange
      // Act
      // Assert
      assertEquals(actual, expected);
    });
  });
});
```

**Property Test Pattern (from retry.test.ts):**
```typescript
describe("Property 11: Retry Logic", () => {
  it("should retry exactly 3 times for any transient error", async () => {
    const errorFactories = [
      () => new NetworkTimeoutError(...),
      // ... all transient error types
    ];

    for (const createError of errorFactories) {
      let attempts = 0;
      const handler = new RetryHandler({ maxAttempts: 3, baseDelayMs: 1, multiplier: 2 });

      await assertRejects(
        () => handler.execute(() => {
          attempts++;
          throw createError();
        }),
      );

      assertEquals(attempts, 3, `Expected 3 attempts for ${createError().type}`);
    }
  });
});
```

### Slack Datastore Patterns

**Define Datastore:**
```typescript
import { DefineDatastore, Schema } from "deno-slack-sdk/mod.ts";

export const SessionsDatastore = DefineDatastore({
  name: "sessions",
  attributes: {
    id: { type: Schema.types.string },
    // ... other fields
  },
  primary_key: "id",
});
```

**Register in Manifest:**
```typescript
import { Manifest } from "deno-slack-sdk/mod.ts";
import { SessionsDatastore } from "./datastores.ts";

export default Manifest({
  // ...
  datastores: [SessionsDatastore],
  botScopes: [
    // ... existing scopes
    "datastore:read",
    "datastore:write",
  ],
});
```

**Use in Function:**
```typescript
// Put (create/update)
const putResp = await client.apps.datastore.put({
  datastore: "sessions",
  item: { id: sessionId, ... },
});

// Get
const getResp = await client.apps.datastore.get({
  datastore: "sessions",
  id: sessionId,
});

// Query
const queryResp = await client.apps.datastore.query({
  datastore: "sessions",
  expression: "#channel = :channel",
  expression_attributes: { "#channel": "channel_id" },
  expression_values: { ":channel": channelId },
});

// Delete
const deleteResp = await client.apps.datastore.delete({
  datastore: "sessions",
  id: sessionId,
});
```

### Project Conventions

- **ABOUTME headers**: All files must start with 2-line ABOUTME comment
- **Import style**: Explicit `.ts` extensions, JSR packages for std lib
- **Test files**: `tests/{path}/{name}.test.ts` mirroring `src/` structure
- **Exports**: Central index files re-export public types
- **Error handling**: Use custom error types from `src/errors/`

### Files to Create

1. **slackbot/src/datastores/sessions.ts** - Datastore definition
2. **slackbot/src/datastores/index.ts** - Export datastore
3. **slackbot/src/managers/session-manager.ts** - SessionManager implementation
4. **slackbot/src/managers/message-cache.ts** - MessageCache implementation
5. **slackbot/src/managers/index.ts** - Export managers
6. **slackbot/tests/managers/session-manager.test.ts** - SessionManager tests
7. **slackbot/tests/managers/message-cache.test.ts** - MessageCache tests

### Files to Modify

1. **slackbot/manifest.ts** - Add datastore registration and scopes
2. **slackbot/src/mod.ts** - Add manager exports

## Task Relationships

- **Depends on**: Task 2 (Session and Message data models) - COMPLETE
- **Depends on**: Task 4 (Error handling and retry logic) - COMPLETE
- **Blocks**: Tasks 6, 7, 8, 17, 18, 19 (all session orchestration tasks)

## Implementation Guidance

Follow TDD approach:
1. Write tests for createSession:
   - Verify TTL is set to created_at + 30 days
   - Verify duplicate prevention (same channel_id + thread_ts)
   - Verify repository is stored correctly (optional field)
   - Verify initial phase is "questioning"
   - Verify initial confidence_score is 0
2. Write tests for loadSession:
   - Verify existing session is loaded correctly
   - Verify missing session returns null or throws
   - Verify expired session handling
3. Write tests for updateSession:
   - Verify phase transitions are persisted
   - Verify confidence score updates are saved
   - Verify canvas_id is stored when set
   - Verify created_at and ttl are unchanged
4. Implement SessionManager with Slack Datastore client
5. Write property test: generate sessions with random creation times, verify TTL is always exactly 30 days from creation

**Note on Testing Datastore:** Since Slack Datastore is only available at runtime on Slack infrastructure, tests should use a mock/fake datastore client that can be injected via dependency injection.

---
*Branch: feature/regent-slack-bot*
*Generated at execution time by Regent*
