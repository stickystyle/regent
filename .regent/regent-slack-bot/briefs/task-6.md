# Task Brief

## From Issue #13

**Task 6**: Implement MessageCache and thread history rebuilding
**Type**: test-first

- Write tests for MessageCache (get, append, evict)
- Implement in-memory MessageCache with session scoping
- Write tests for rebuildFromHistory (pagination, official answer detection, phase inference)
- Implement history rebuild with Slack conversations.replies API
- Write property test: **Property 6 - Session Resumption Completeness**
- _Requirements: 7.3, 7.4, 7.5_

### Requirements

> 3. WHEN a user posts `@regent` in a thread with an expired or missing session record THEN the system SHALL create a new session record and re-read the entire thread history to rebuild context.

> 4. WHEN rebuilding context from thread history THEN the system SHALL handle Slack API pagination for threads with 100+ messages.

> 5. WHEN resuming a session THEN the system SHALL infer the appropriate phase (questioning or review) from the thread history and continue accordingly.

### Interface to Implement

```typescript
interface SessionManager {
  /** Recreate session by re-reading entire Slack thread. */
  rebuildFromHistory(channelId: string, threadTs: string): Promise<Session>;
}
```

### Correctness Properties

**Property 6: Session Resumption Completeness**
*For any* session resumed after expiration, *the system should* rebuild the complete conversation history from Slack thread before responding
**Validates:** Requirements 7.3, 7.4, 7.5

### Error Handling

**Session Expiration:**
- **Trigger**: User posts `@regent` in a thread where the session record has expired (TTL exceeded) or never existed
- **Response**: Automatically create a new session record and rebuild context by re-reading the entire thread history from Slack
- **Recovery**: Automatic recovery through history rebuild. If thread is too large (pagination fails), display error and suggest starting a new session

### Implementation Guidance

- MessageCache is in-memory only and scoped per session using session ID (`{channel_id}:{thread_ts}`)
- History rebuild must handle Slack pagination for threads with 100+ messages using the conversations.replies API
- Official answer detection: messages prefixed with `@regent` should be marked as `is_official_answer: true`
- Phase inference: check for Canvas creation in thread to determine if session is in review phase

## Codebase Context

### Current Implementation State

**MessageCache (Already Complete)**
- `/slackbot/src/managers/message-cache.ts`: Full implementation exists
  - `get(sessionId): Message[]` - Returns cached messages
  - `append(sessionId, message): void` - Adds message to cache
  - `evict(sessionId): void` - Clears session cache
  - `clear(): void` - Clears all cached sessions
- `/slackbot/tests/managers/message-cache.test.ts`: Comprehensive tests exist

**SessionManager (Needs rebuildFromHistory)**
- `/slackbot/src/managers/session-manager.ts`: Current methods:
  - `createSession(channelId, threadTs, repo, userId): Promise<Session>`
  - `loadSession(channelId, threadTs): Promise<Session | null>`
  - `updateSession(session): Promise<void>`
- Missing: `rebuildFromHistory(channelId, threadTs): Promise<Session>`

**Session and Message Types**
- `Session` interface in `/slackbot/src/types/session.ts`:
  - `session_id`, `repository?`, `phase`, `initiator_user_id`, `canvas_id?`, `confidence_score`, `created_at`, `ttl`
  - `formatSessionId(channelId, threadTs)` helper
  - `Phase` enum: Questioning, Review, Finalized
- `Message` interface in `/slackbot/src/types/message.ts`:
  - `sender`, `text`, `timestamp`, `is_official_answer`, `attachments?`
  - `isOfficialAnswer(text)` helper

**DatastoreClient**
- `/slackbot/src/managers/datastore-client.ts`:
  - `put(session)`, `get(sessionId)`, `delete(sessionId)`
  - `MockDatastoreClient` for testing

### What Needs to Be Implemented

1. **SlackClient Interface** - Abstract Slack API calls for testing
   - `fetchThreadMessages(channelId, threadTs, cursor?): Promise<{messages, nextCursor?}>`
   - Mock implementation for tests

2. **rebuildFromHistory Method** in SessionManager:
   - Fetch all messages from Slack thread using pagination
   - Parse messages to detect:
     - First `@regent` mention (initiator)
     - Canvas creation (phase = Review)
     - Official answers (`@regent` prefix)
   - Create new session record if none exists
   - Populate MessageCache with conversation history
   - Return session with inferred phase

3. **Tests for rebuildFromHistory**:
   - Basic history rebuild
   - Pagination handling (100+ messages)
   - Official answer detection
   - Phase inference (Questioning vs Review)
   - Property 6: Session Resumption Completeness

### Test Template Reference

**Pattern from session-manager.test.ts**:
```typescript
import { assertEquals, assertExists, assertRejects } from "@std/assert";
import { afterEach, beforeEach, describe, it } from "@std/testing/bdd";

describe("SessionManager", () => {
  let datastore: MockDatastoreClient;
  let sessionManager: SessionManager;

  beforeEach(() => {
    datastore = new MockDatastoreClient();
    sessionManager = new SessionManager(datastore);
  });

  afterEach(() => {
    datastore.clear();
  });

  describe("operation", () => {
    it("should handle specific case", async () => {
      // Arrange
      // Act
      // Assert
      assertEquals(result, expected);
    });
  });
});
```

### Files to Modify
- `/slackbot/src/managers/session-manager.ts` - Add rebuildFromHistory method
- `/slackbot/tests/managers/session-manager.test.ts` - Add tests for rebuildFromHistory

### Files to Create
- `/slackbot/src/clients/slack-client.ts` - SlackClient interface + mock for testing

### Project Conventions
- Import style: relative paths with `.ts` extension
- Error handling: structured error classes (BaseError, TransientError, PermanentError)
- Type annotations: full strict TypeScript
- ABOUTME 2-line comment at file top
- 100-char line width, double quotes, semicolons

---
*Branch: feature/regent-slack-bot*
*Generated at execution time by Regent*
