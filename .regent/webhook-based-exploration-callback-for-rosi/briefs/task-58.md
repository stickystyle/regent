# Task Brief

## From Issue #58

Parent Epic: #56

## Task Description

Extend the Session datastore schema to support exploration data:
- Write tests for Session schema with exploration_data field (optional, JSON string)
- Add exploration_data attribute to SessionsDatastore definition
- Write tests for backwards compatibility (sessions without exploration_data)
- Update datastore schema in `src/datastores/sessions.ts`
- Write property test: **Property 7 - Backwards Compatibility**

## Acceptance Criteria

- exploration_data field is optional (nullable)
- Field accepts JSON strings up to 100KB
- Existing sessions without exploration_data continue to work
- Property test validates backwards compatibility invariant

## Requirements Traceability

- Requirement 4: Exploration Data Storage
- Requirement 10: Backwards Compatibility

## Issue Discussion

No comments on this issue.

## Codebase Context

### Current Implementation State

#### Session TypeScript Type (src/types/session.ts)

The `Session` interface currently defines these fields:

```typescript
export interface Session {
  session_id: string;                    // Required: "channel:thread" format
  repository?: string;                   // Optional: "owner/repo" format
  phase: Phase;                          // Required: "questioning"|"review"|"finalized"|"initializing"
  initiator_user_id: string;            // Required: Slack user ID
  canvas_id?: string;                   // Optional: Slack Canvas ID (set during review)
  confidence_score: number;             // Required: 0-100
  created_at: string;                   // Required: ISO 8601 timestamp
  ttl: string;                          // Required: ISO 8601 timestamp (created_at + 30 days)
  epic_number?: number;                 // Optional: GitHub issue number
  epic_url?: string;                    // Optional: Full GitHub issue URL
  spec_comment_ids?: {                  // Optional: Comment IDs for spec types
    brainstorm?: number;
    requirements?: number;
    design?: number;
  };
}
```

#### SessionsDatastore Schema (src/datastores/sessions.ts)

The Slack Datastore definition currently includes:

```typescript
export const SessionsDatastore = DefineDatastore({
  name: "sessions",
  primary_key: "session_id",
  attributes: {
    session_id: { type: Schema.types.string },
    repository: { type: Schema.types.string },
    phase: { type: Schema.types.string },
    initiator_user_id: { type: Schema.types.string },
    canvas_id: { type: Schema.types.string },
    confidence_score: { type: Schema.types.number },
    created_at: { type: Schema.types.string },
    ttl: { type: Schema.types.string },
    epic_number: { type: Schema.types.number },
    epic_url: { type: Schema.types.string },
    spec_comment_ids: { type: Schema.types.string },
  },
});
```

**Key Pattern**: Complex object fields like `spec_comment_ids` are stored as `Schema.types.string` (JSON serialized), not nested objects.

### Test Template Reference

#### Key Test Patterns in slackbot/tests/types/session.test.ts

**1. Optional Field Pattern (lines 86-98)**
```typescript
it("should allow optional repository field", () => {
  const session: Session = {
    session_id: "C1234567890:1234567890.123456",
    repository: "owner/repo",
    phase: Phase.Questioning,
    initiator_user_id: "U1234567890",
    confidence_score: 50,
    created_at: new Date().toISOString(),
    ttl: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  };
  assertEquals(session.repository, "owner/repo");
});
```

**2. Backwards Compatibility Pattern (lines 114-126)**
```typescript
it("should work without optional fields", () => {
  const session: Session = {
    session_id: "C1234567890:1234567890.123456",
    phase: Phase.Questioning,
    initiator_user_id: "U1234567890",
    confidence_score: 0,
    created_at: new Date().toISOString(),
    ttl: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  };
  assertEquals(session.repository, undefined);
  assertEquals(session.canvas_id, undefined);
});
```

#### Key Test Patterns in slackbot/tests/managers/session-manager.test.ts

**Property Test Pattern (lines 444-555) - Property 9: TTL Enforcement**
```typescript
describe("Property 9: TTL Enforcement", () => {
  it("should set TTL to creation timestamp plus 30 days for any creation time", async () => {
    const testCases = [
      new Date("2025-01-01T00:00:00.000Z"),
      new Date("2025-02-15T12:30:45.123Z"),
      // ... more test cases
    ];

    for (const testTime of testCases) {
      const datastore = new MockDatastoreClient(testTime);
      const manager = new SessionManager(datastore, () => testTime);

      const session = await manager.createSession(/* ... */);

      const createdAt = new Date(session.created_at);
      const ttl = new Date(session.ttl);
      const daysDiff = (ttl.getTime() - createdAt.getTime()) / (24 * 60 * 60 * 1000);

      assertEquals(daysDiff, 30);
    }
  });
});
```

### Project Conventions

#### Import Patterns

```typescript
// Standard library assertions
import { assertEquals, assertExists, assertRejects } from "@std/assert";
import { afterEach, beforeEach, describe, it } from "@std/testing/bdd";

// Project types
import { Phase, Session, formatSessionId } from "../../src/types/session.ts";

// Project implementations
import { SessionManager } from "../../src/managers/session-manager.ts";
import { MockDatastoreClient } from "../../src/managers/datastore-client.ts";
```

#### Comment Style

All files start with ABOUTME comments (2 lines, each starting with "ABOUTME: "):
```typescript
// ABOUTME: Tests for Session data model validating composite ID, phase transitions, and TTL.
// ABOUTME: Ensures Session type meets requirements for session initialization and persistence.
```

### Files to Modify

1. **slackbot/src/types/session.ts**
   - Add `exploration_data?: string;` to Session interface

2. **slackbot/src/datastores/sessions.ts**
   - Add `exploration_data: { type: Schema.types.string }` to SessionsDatastore.attributes

3. **slackbot/tests/types/session.test.ts** (NEW TESTS)
   - Add tests for exploration_data field with valid JSON strings
   - Add backwards compatibility test (sessions without exploration_data)

4. **slackbot/tests/managers/session-manager.test.ts** (NEW TESTS)
   - Add Property 7 test for backwards compatibility

### Key Implementation Constraints

1. **Datastore Field Type**: Use `Schema.types.string` for JSON storage
2. **Nullable**: Field should be optional (`exploration_data?: string` in interface)
3. **Backwards Compatibility**: Must support loading sessions created before field existed
4. **JSON String Storage**: Store as stringified JSON (not object)
5. **Size Limit**: Document 100KB constraint in JSDoc comments

---
*Branch: feature/webhook-based-exploration-callback-for-rosi*
*Generated at execution time by Regent*
