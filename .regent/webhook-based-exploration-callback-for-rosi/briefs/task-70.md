# Task Brief

## From Issue #70

Parent Epic: #56

## Task Description

Write comprehensive integration tests for the complete feature:
- Test complete callback flow (webhook POST -> storage -> summary -> question)
- Test timeout flow (session stuck >5 min -> timeout message)
- Test error recovery (callback failure -> retry -> success)
- Test backwards compatibility (old sessions without exploration_data)
- Test concurrent callbacks (multiple sessions in Initializing)
- Create `tests/integration/exploration-callback.test.ts`

## Acceptance Criteria

- Integration test for happy path: callback received, stored, summary posted, question sent
- Integration test for timeout: session ages past 5 min, timeout message posted
- Integration test for retry: first callback fails, second succeeds
- Integration test for backwards compat: pre-existing session works without exploration_data
- Integration test for concurrency: multiple sessions receive callbacks without interference
- All tests pass in CI

## Requirements Traceability

- All Requirements (1-10)

## Codebase Context

### Current Implementation State

#### Exploration Callback Workflow (webhook POST entry point)
**File:** `slackbot/workflows/exploration-callback-workflow.ts`

- Routes incoming webhook data from GitHub Actions to `ExplorationCallbackFunction`
- Input parameters: `channel_id`, `thread_ts`, `exploration_data` (JSON string)
- No business logic - acts as a bridge between webhook and function

#### Exploration Callback Function (ROSI function wrapper)
**File:** `slackbot/functions/exploration-callback.ts`

**Key Function Signatures:**
```typescript
export function parseExplorationData(jsonString: string): ExplorationCallback
export const ExplorationCallbackFunction = DefineFunction({...})
export default SlackFunction(
  ExplorationCallbackFunction,
  async ({ inputs, client, env }) => {...}
)
```

**Function Behavior:**
- Validates JSON parsing of `exploration_data`
- Validates `session_id` matches `channel_id:thread_ts` format
- Creates `DatastoreClient` adapter from Slack SDK client
- Calls `handleExplorationCallback()` from handler
- Returns `{ success: boolean, error_message?: string }`

#### Exploration Callback Handler (core logic)
**File:** `slackbot/src/handlers/exploration-handler.ts`

**Key Function:**
```typescript
export async function handleExplorationCallback(
  request: ExplorationHandlerRequest,
  dependencies: ExplorationHandlerDependencies,
): Promise<ExplorationHandlerResponse>
```

**Handler Flow:**
1. Validates Authorization header using `validateAuthorizationHeader()` (constant-time comparison)
2. Parses session_id to extract channelId and threadTs
3. Loads session from SessionManager
4. Validates session is in `Initializing` phase
5. Validates payload size (100KB limit)
6. Stores `exploration_data` in session
7. Transitions session to `Questioning` phase
8. Posts summary message (success or error)
9. Calls orchestrator.generateFirstQuestion() if available

**Error Handling:**
- 401: Missing/invalid Authorization header
- 400: Invalid session_id format, session not in Initializing, payload too large
- 404: Session not found
- 200: Success (even if message posting fails)

#### Exploration Timeout Check Workflow (scheduled trigger)
**File:** `slackbot/workflows/exploration-timeout-workflow.ts`

- Invoked hourly by scheduled trigger

#### Exploration Timeout Function
**File:** `slackbot/functions/exploration-timeout-check.ts`

**Key Constants:**
```typescript
export const TIMEOUT_MINUTES = 5
export function isSessionTimedOut(session: Session, now: Date): boolean
```

**Timeout Function Behavior:**
- Queries all sessions in `Initializing` phase
- Checks each session's `created_at` timestamp
- Posts timeout message if session > 5 minutes old
- **Does NOT modify session state** (allows callback to still complete)
- Returns counts: `{ success: boolean, sessions_checked: number, timeouts_posted: number }`

#### SessionOrchestrator's handleExplorationResult
**File:** `slackbot/src/orchestrators/session-orchestrator.ts`

**Key Method:**
```typescript
async handleExplorationResult(callback: ExplorationCallback): Promise<void>
```

**Flow:**
1. Parses session_id to extract channelId and threadTs
2. Loads session from SessionManager
3. If success:
   - Converts exploration context to RepositoryContext
   - Caches context for future use
   - Posts exploration summary
   - Transitions to Questioning phase
   - Generates first question with context
4. If error:
   - Posts error message
   - Transitions to Questioning phase
   - Generates first question without context

### Test Template Reference

**Similar Test File:** `slackbot/tests/integration/exploration-e2e.test.ts`

This is the most comprehensive test file (1002 lines) covering:
- Complete workflow: slash command → callback → session update
- Multiple repository types (Node.js, Python, monorepo)
- Error scenarios (404, 403, timeout)
- Callback authentication validation
- Message ordering verification

**Key Test Patterns:**
```typescript
import { assertEquals, assertExists } from "@std/assert";
import { afterEach, beforeEach, describe, it } from "@std/testing/bdd";

describe("Feature Name", () => {
  let sessionManager: SessionManager;
  let datastoreClient: MockDatastoreClient;
  let messagingClient: MockSlackMessagingClient;
  let orchestrator: SessionOrchestrator;

  const channelId = "C1234567890";
  const threadTs = "1234567890.123456";
  const userId = "U1234567890";
  const sessionId = formatSessionId(channelId, threadTs);

  beforeEach(() => {
    datastoreClient = new MockDatastoreClient();
    sessionManager = new SessionManager(datastoreClient);
    // Initialize other clients...
  });

  afterEach(() => {
    datastoreClient.clear();
    // Clear other clients...
  });
});
```

### Project Conventions

#### Import Style
```typescript
// Standard library imports first
import { assertEquals, assertExists } from "@std/assert";
import { afterEach, beforeEach, describe, it } from "@std/testing/bdd";

// Application imports organized by directory
import { MockAnthropicClient } from "../../src/clients/anthropic-client.ts";
import { SessionManager } from "../../src/managers/session-manager.ts";
import { SessionOrchestrator } from "../../src/orchestrators/session-orchestrator.ts";
import type { ExplorationCallback } from "../../src/types/exploration-callback.ts";
```

### Files to Reference

1. **SessionOrchestrator:** `slackbot/src/orchestrators/session-orchestrator.ts`
   - Method: `handleExplorationResult()`
   - Method: `handleExplorationSuccess()`
   - Method: `handleExplorationFailure()`

2. **ExplorationHandler:** `slackbot/src/handlers/exploration-handler.ts`
   - Function: `handleExplorationCallback()`
   - Function: `validateAuthorizationHeader()`

3. **ExplorationTimeoutFunction:** `slackbot/functions/exploration-timeout-check.ts`
   - Function: `isSessionTimedOut()`

4. **Exploration Types:** `slackbot/src/types/exploration-callback.ts`
   - ExplorationCallback union type
   - Type guards: `isExplorationSuccess()`, `isExplorationError()`

5. **Integration Test Examples:**
   - `slackbot/tests/integration/exploration-e2e.test.ts`
   - `slackbot/tests/integration/error-recovery.test.ts`
   - `slackbot/tests/integration/concurrent-sessions.test.ts`

### Integration Test Coverage Requirements

**1. Complete callback flow (webhook POST → storage → summary → question)**
- Setup session in Initializing phase
- Call handleExplorationCallback with valid auth
- Verify session transitions to Questioning
- Verify exploration_data stored
- Verify summary message posted
- Verify first question generated

**2. Timeout flow (session stuck >5 min → timeout message)**
- Create session in Initializing, backdate created_at > 5 minutes
- Call isSessionTimedOut() directly
- Verify timeout message posted to thread
- Verify session remains in Initializing (can still receive callback)

**3. Error recovery (callback failure → retry → success)**
- First callback attempt fails with auth error or invalid payload
- Session remains in Initializing
- Second callback attempt succeeds
- Verify recovery path works

**4. Backwards compatibility (old sessions without exploration_data)**
- Load existing session without exploration_data field
- Post first question anyway (no context)
- Verify session still functions

**5. Concurrent callbacks (multiple sessions in Initializing)**
- Create 3+ sessions in Initializing phase
- Send callbacks for each simultaneously
- Verify each session transitions independently
- Verify no state cross-contamination

**6. Error scenarios:**
- Callback with missing session (404)
- Callback with invalid auth (401)
- Callback for session not in Initializing phase (400)
- Callback with oversized payload (400)
- Callback with invalid session_id format (400)

---
*Branch: feature/webhook-based-exploration-callback-for-rosi*
*Generated at execution time by Regent*
