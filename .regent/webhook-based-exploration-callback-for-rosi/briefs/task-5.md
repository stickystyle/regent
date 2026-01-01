# Task Brief

## From Issue #61

Parent Epic: #56

## Task Description

Implement the core callback function that processes exploration results:
- Write tests for session validation (exists, phase=Initializing)
- Write tests for payload validation (required fields, malformed JSON, size limits)
- Write tests for exploration data storage (parse, store, update phase)
- Write tests for error responses (404, 400, 500 status codes)
- Implement callback function in `functions/exploration-callback.ts`
- Write property test: **Property 1 - Session State Transition Safety**
- Write property test: **Property 2 - Exploration Data Durability**
- Write property test: **Property 4 - Retry Idempotence**
- Write property test: **Property 8 - Callback Payload Size Limit**

## Acceptance Criteria

- Returns 404 for non-existent sessions
- Returns 400 for sessions not in Initializing state
- Returns 400 for missing required fields or malformed JSON
- Returns 200 and processes callback for valid requests
- Parses and stores exploration_data in session
- Transitions session from Initializing to Questioning
- Accepts payloads up to 100KB
- Rejects duplicate callbacks (already processed sessions)

## Requirements Traceability

- Requirement 2: Callback Payload Reception
- Requirement 3: Session Validation
- Requirement 4: Exploration Data Storage
- Requirement 6: GitHub Actions Retry Logic

## Issue Discussion

No discussion comments.

## Codebase Context

### Current Implementation State

**Files Present:**

1. **`slackbot/functions/exploration-callback.ts`** (262 lines)
   - ROSI function definition for the webhook handler
   - Contains `parseExplorationData()` function that validates JSON and required fields
   - Defines `ExplorationCallbackFunction` with Slack SDK Schema
   - SlackFunction handler (lines 162-261) wraps the core handler
   - Delegates to `handleExplorationCallback()` from exploration-handler.ts

2. **`slackbot/src/handlers/exploration-handler.ts`** (218 lines)
   - Pure HTTP handler (no Slack SDK dependencies)
   - `handleExplorationCallback()` - coordinates the full callback workflow
   - `validateAuthorizationHeader()` - uses `timingSafeEqual` for constant-time comparison
   - Currently returns 200 for non-existent sessions (prevents GitHub Actions retries)
   - **MISSING**: Session phase validation (Initializing state check)
   - **MISSING**: exploration_data persistence to session datastore

**Key Function Signatures:**

```typescript
// Function input/output validation
export function parseExplorationData(jsonString: string): ExplorationCallback;

// Authentication validation
export function validateAuthorizationHeader(
  header: string | undefined,
  expectedSecret: string,
): boolean;

// Main handler
export async function handleExplorationCallback(
  request: ExplorationHandlerRequest,
  dependencies: ExplorationHandlerDependencies,
): Promise<ExplorationHandlerResponse>;
```

**Integration Points:**

- `SessionManager.loadSession()`: Loads session by `channelId:threadTs`
- `SessionManager.updateSession()`: Persists session changes
- `SessionOrchestrator.handleExplorationResult()`: Dispatches to success/failure handling
- `SlackMessagingClient.postMessage()`: Posts messages to thread

### Missing Implementation Gaps

Based on validation analysis:

| Acceptance Criteria | Status | Notes |
|---------------------|--------|-------|
| Returns 404 for non-existent sessions | CONFLICT | Current impl returns 200 intentionally |
| Returns 400 for sessions not in Initializing state | MISSING | No phase check exists |
| Returns 400 for missing required fields | DONE | parseExplorationData validates |
| Returns 200 and processes valid requests | DONE | Basic flow works |
| Parses and stores exploration_data | PARTIAL | Parsed but not persisted to datastore |
| Transitions Initializing to Questioning | PARTIAL | Logic exists in orchestrator |
| Accepts payloads up to 100KB | MISSING | No validation |
| Rejects duplicate callbacks | MISSING | No idempotency check |
| Property tests (1, 2, 4, 8) | MISSING | Not implemented |

### Test Template Reference

**Most Relevant Test File:** `tests/handlers/exploration-handler.test.ts`
- Uses `describe/it` from `@std/testing/bdd`
- Uses `assertEquals/assertExists` from `@std/assert`
- Pattern: `beforeEach/afterEach` with mock setup/cleanup

**Helper Fixtures Pattern:**
```typescript
class TestDatastoreClient extends MockDatastoreClient {
  setSession(session: Session): void;
  async getSession(sessionId: string): Promise<Session | undefined>;
}

const createValidSession = (): Session => ({...});
const createSuccessCallback = (): ExplorationCallbackSuccess => ({...});
```

**Assertion Style:**
```typescript
assertEquals(response.status, 401);
assertEquals(response.error, "Unauthorized: Missing or invalid Authorization header");
assertExists(session);
```

### Project Conventions

**Import Style:**
- Absolute imports from `src/` subdirectories
- Type imports use `import type` syntax

**Error Handling:**
- Class hierarchy: `BaseError` → `TransientError`/`PermanentError` → specific types
- No exceptions for expected validation failures (return error response)

**Response Objects:**
```typescript
interface ExplorationHandlerResponse {
  status: number;      // HTTP status
  ok: boolean;         // Success flag
  error?: string;      // Error message if failed
  message?: string;    // Informational message
}
```

### Files to Modify

1. **`slackbot/src/handlers/exploration-handler.ts`**
   - Add session phase validation (Initializing check)
   - Add payload size validation (100KB limit)
   - Change session not found response (200 → 404 per spec)
   - Add exploration_data persistence to session

2. **`slackbot/tests/handlers/exploration-handler.test.ts`**
   - Add tests for phase validation
   - Add tests for payload size limits
   - Add tests for error responses

3. **New File:** `slackbot/tests/properties/exploration-callback.property.test.ts`
   - Property 1: Session State Transition Safety
   - Property 2: Exploration Data Durability
   - Property 4: Retry Idempotence
   - Property 8: Callback Payload Size Limit

### Files to Reference

- `slackbot/src/types/exploration-callback.ts` - Callback type definitions
- `slackbot/src/types/session.ts` - Session interface with Phase enum
- `slackbot/src/managers/session-manager.ts` - loadSession/updateSession methods
- `slackbot/src/orchestrators/session-orchestrator.ts` - handleExplorationResult()

---
*Branch: feature/webhook-based-exploration-callback-for-rosi*
*Generated at execution time by Regent*
