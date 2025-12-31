# Task Brief

## From Issue #62

Parent Epic: #56

## Task Description

Extend SessionOrchestrator to handle exploration callbacks:
- Write tests for handleExplorationResult (success and error paths)
- Write tests for exploration context conversion (ExplorationContext to RepositoryContext)
- Write tests for summary message formatting (all context fields)
- Write tests for first question generation after callback
- Update SessionOrchestrator.handleExplorationResult implementation
- Write property test: **Property 6 - Phase Progression**

## Acceptance Criteria

- handleExplorationResult processes both success and error callbacks
- ExplorationContext converts correctly to RepositoryContext format
- Summary message includes file/directory counts from exploration
- First brainstorm question is generated and posted after success
- Session transitions to Questioning phase after successful processing

## Requirements Traceability

- Requirement 4: Exploration Data Storage
- Requirement 5: User Feedback on Success

## Issue Discussion

No comments on this issue.

## Codebase Context

### Current Implementation State

#### SessionOrchestrator.handleExplorationResult (Lines 645-859)

**Function Signature:**
```typescript
async handleExplorationResult(callback: ExplorationCallback): Promise<void>
```

**Current Flow:**
1. Parses `session_id` using `parseSessionId()` to extract `channelId` and `threadTs`
2. Loads session from `SessionManager`
3. Routes to either success or error handler using `isExplorationSuccess()` type guard

**Success Handler** (lines 696-727):
- Converts `ExplorationContext` to `RepositoryContext` via `convertExplorationContext()`
- Caches context in `repositoryContextCache` map
- Formats and posts summary message via `formatExplorationSummaryFromCallback()`
- Ensures phase is `Questioning`
- Calls `generateFirstQuestionFromCallback()`

**Error Handler** (lines 834-859):
- Formats error message with `:warning:` emoji, error message, and error code
- Transitions to `Questioning` phase
- Calls `generateFirstQuestionFromCallback()` with `null` context

**Context Conversion** (lines 736-755):
- Maps `key_files` array to `RelevantFile[]` with empty descriptions
- Sets `framework` to `Framework.Unknown` (needs enhancement: could detect from patterns)
- Extracts `relevant_patterns` and `file_tree`

### Validation Finding: Most Work Already Done

The spec validator identified that most implementation is already complete:

| Task Item | Status |
|-----------|--------|
| Tests for handleExplorationResult (success path) | DONE |
| Tests for handleExplorationResult (error path) | DONE |
| Tests for exploration context conversion | DONE |
| Tests for summary message formatting | DONE |
| Tests for first question generation after callback | DONE |
| SessionOrchestrator.handleExplorationResult implementation | DONE |
| Property 6 test | **NOT DONE** |

### Remaining Work

1. **Add explicit Property 6 property test** in `exploration-callback.property.test.ts`
   - Property 6: Phase Progression - "*If* a callback is successfully processed for session S in Initializing state, *then* session S SHALL transition to Questioning state"
   - Validates Requirements 4.3, 5.3

2. **Fix integration gap**: The exploration callback handler stores `exploration_data` but does NOT invoke SessionOrchestrator to generate the first brainstorm question. The summary message is posted but no first question follows.

### Property Test Template Reference

**File:** `tests/properties/exploration-callback.property.test.ts`

**Key Patterns:**
```typescript
it("SHALL only process callbacks for sessions with phase=Initializing", async () => {
  await fc.assert(
    fc.asyncProperty(phaseArb, async (phase) => {
      // Reset state between runs
      mockDatastore.clear();
      messagingClient.clear();

      const session = createSession(phase);
      mockDatastore.setSession(session);

      const request: ExplorationHandlerRequest = {
        authorizationHeader: `Bearer ${callbackSecret}`,
        body: createSuccessCallback({ project_overview: "Test project" }),
      };

      const response = await handleExplorationCallback(request, dependencies);

      if (phase === Phase.Initializing) {
        assertEquals(response.status, 200);
        assertEquals(response.ok, true);
      } else {
        assertEquals(response.status, 400);
        assertEquals(response.ok, false);
      }
    }),
    { numRuns: 100 },
  );
});
```

### Files to Modify

1. `tests/properties/exploration-callback.property.test.ts` - Add Property 6 test
2. `src/handlers/exploration-handler.ts` - Invoke orchestrator for first question generation

### Files to Reference

- `src/orchestrators/session-orchestrator.ts` - handleExplorationResult implementation
- `src/types/session.ts` - Phase enum, Session interface
- `src/types/exploration-callback.ts` - ExplorationCallback types
- `tests/orchestrators/exploration-result.test.ts` - Existing test patterns

---
*Branch: feature/webhook-based-exploration-callback-for-rosi*
*Generated at execution time by Regent*
