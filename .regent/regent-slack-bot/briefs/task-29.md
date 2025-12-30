# Task Brief

## From Issue #29

**Task 23**: Implement and test session isolation for concurrent sessions
**Type**: test-first

- Write tests for concurrent sessions in different threads
- Write tests for concurrent sessions in same channel
- Write tests for session ID uniqueness
- Verify no state leakage between sessions
- Write property test: **Property 1 - Session Isolation**
- _Requirements: 9.1, 9.2, 9.3, 9.4_

### Requirements

**Requirement 9: Concurrent Session Handling**
User Story: As a workspace admin, I want multiple teams to brainstorm simultaneously, so that the bot scales across our organization.

**Acceptance Criteria:**
1. The system SHALL support multiple concurrent brainstorming sessions across different channels in the same workspace.
2. The system SHALL support multiple concurrent brainstorming sessions in different threads within the same channel.
3. WHEN processing a message THEN the system SHALL identify the correct session using the channel ID and thread timestamp combination.
4. The system SHALL isolate session state such that actions in one session do not affect other sessions.

### Design Context

**Session Model:**
Sessions are identified by the combination of channel ID and thread timestamp, ensuring uniqueness across concurrent sessions.

**Key Attributes:**
- `session_id`: Composite key `{channel_id}:{thread_ts}`
- Cached messages scoped to session
- No shared state between sessions

**Correctness Properties:**
**Property 1: Session Isolation**
*For any* two concurrent sessions in different threads, *there should be* no shared state or cross-contamination of messages
**Validates:** Requirements 9.1, 9.3, 9.4

### Task Relationships

- **Depends on**: 5, 6, 17
- **Blocks**: 24

## Issue Discussion

No comments.

## Codebase Context

### Current Implementation State

**Session ID Format**: `{channel_id}:{thread_ts}` (e.g., `C1234567890:1234567890.123456`)

**Source**: `/Volumes/workingfolder/regent/slackbot/src/types/session.ts` (lines 130-132)

```typescript
export function formatSessionId(channelId: string, threadTs: string): string {
  return `${channelId}:${threadTs}`;
}
```

**Key Facts**:
- Sessions are uniquely identified by composite key of Slack channel ID + thread timestamp
- Session ID is immutable once created
- The format string is simple and cannot produce collisions
- `parseSessionId()` function (lines 151-171) can reverse the ID into components

**Session Interface** (from `slackbot/src/types/session.ts`):
```typescript
export interface Session {
  session_id: string;              // Composite identifier
  repository?: string;              // Optional owner/repo
  phase: Phase;                     // Enum: Initializing, Questioning, Review, Finalized
  initiator_user_id: string;        // Slack user ID
  canvas_id?: string;               // Set during review phase
  confidence_score: number;         // 0-100%
  created_at: string;               // ISO 8601 timestamp
  ttl: string;                      // ISO 8601 expiration (created_at + 30 days)
  epic_number?: number;             // GitHub issue number (finalization)
  epic_url?: string;                // GitHub issue URL
  spec_comment_ids?: {              // Comment IDs for spec updates
    brainstorm?: number;
    requirements?: number;
    design?: number;
  };
}
```

**SessionManager Key Methods** (from `slackbot/src/managers/session-manager.ts`):
- `createSession` - Validates no duplicate session exists, sets initial phase to Questioning
- `loadSession` - Retrieves session by sessionId with TTL check
- `updateSession` - Updates session fields while preserving immutable fields

### Test Template Reference

**Similar Test File**: `slackbot/tests/managers/session-manager.test.ts`

**Key Patterns**:
- Uses `MockDatastoreClient` for datastore operations
- `beforeEach` creates fresh datastore and manager
- `afterEach` calls `datastore.clear()`
- Nested `describe` blocks for organization

**Existing Session Isolation Tests** (lines 164-198):
```typescript
it("should create independent sessions in different channels", async () => {
  const sessionManager = new SessionManager(datastore);
  const channelId1 = "C1234567890";
  const channelId2 = "C0987654321";
  const threadTs = "1234567890.123456";
  const userId = "U1234567890";

  const session1 = await sessionManager.createSession(
    channelId1,
    threadTs,
    userId,
  );
  const session2 = await sessionManager.createSession(
    channelId2,
    threadTs,
    userId,
  );

  assertEquals(session1.session_id !== session2.session_id, true);
  assertExists(session1);
  assertExists(session2);
});

it("should create independent sessions in different threads in the same channel", async () => {
  const sessionManager = new SessionManager(datastore);
  const channelId = "C1234567890";
  const threadTs1 = "1234567890.123456";
  const threadTs2 = "1234567890.654321";
  const userId = "U1234567890";

  const session1 = await sessionManager.createSession(
    channelId,
    threadTs1,
    userId,
  );
  const session2 = await sessionManager.createSession(
    channelId,
    threadTs2,
    userId,
  );

  assertEquals(session1.session_id !== session2.session_id, true);
  assertExists(session1);
  assertExists(session2);
});
```

### Project Test Conventions

**Imports**:
```typescript
import { assertEquals, assertExists, assertRejects } from "@std/assert";
import { afterEach, beforeEach, describe, it } from "@std/testing/bdd";
```

**Assertion Style**:
- `assertEquals(value, expected)` - Primary assertion
- `assertExists(value)` - Existence check with type narrowing
- `assertRejects(promise, ErrorType, message)` - Error testing

### Files to Modify

- `slackbot/tests/managers/session-manager.test.ts` - Add Property 1: Session Isolation tests

### Files to Reference

- `slackbot/src/managers/session-manager.ts` - Implementation under test
- `slackbot/src/types/session.ts` - Session interface and helpers
- `slackbot/src/managers/datastore-client.ts` - MockDatastoreClient implementation

---
*Branch: feature/regent-slack-bot*
*Generated at execution time by Regent*
