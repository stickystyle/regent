# Task Brief

## From Issue #49

Parent Epic: #42

## Task Description

Implement the session finalization flow, including GitHub Epic creation when a repository is configured.

**Type**: test-first

### Implementation Steps

- Write tests for approval detection (conversational intent: "approved", "looks good", "ship it")
- Write tests for Epic creation (with repo configured)
- Write tests for spec comment creation (brainstorm.md as collapsible comment)
- Write tests for completion without repo (Canvas/file only)
- Write tests for Epic URL posting to Slack
- Implement finalization flow in SessionOrchestrator

### Finalization Flow

1. Detect approval intent from user
2. Transition session to finalized phase
3. If repo configured:
   - Create Epic issue with regent:epic label
   - Add brainstorm spec as collapsible comment
   - Post Epic URL to Slack
4. If no repo:
   - Mark session complete
   - Inform user Canvas/file is available

### Epic Structure

- Title: "Epic: {spec-name}"
- Labels: regent, regent:epic, spec:{spec-name}
- Body: Summary and spec links
- Comment: Collapsible brainstorm.md

## Acceptance Criteria

- Approval detected through conversational intent
- Epic created with correct labels and structure
- Spec stored as collapsible comment with marker
- Epic URL posted for workflow continuation

_Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6_

## Issue Discussion

No comments on this issue.

## Codebase Context

### Current Implementation State

**SessionOrchestrator** (`slackbot/src/orchestrators/session-orchestrator.ts`)
- Already implements approval detection: `isApprovalIntent()` method (lines 998-1037)
  - Checks for phrases: "approve", "approved", "lgtm", "looks good", "ship it"
  - Handles negation words: "not", "don't", "do not", "never", "n't"
  - Uses substring matching with 30-char context window for negation detection
  - Returns `boolean`

- Has `handleReviewFeedback()` method (lines 963-984) that:
  - Accepts session, feedback text, userId, messageTs
  - Calls `isApprovalIntent()` to check feedback
  - Routes to `handleApproval()` or `handleRevisionFeedback()` based on result
  - Currently, `handleApproval()` (lines 1046-1057) only posts acknowledgment: *"Spec approved! Ready for finalization."*

- Has `transitionToReviewPhase()` (lines 865-896) that synthesizes spec and creates Canvas

**Finalization Handler** (`slackbot/src/handlers/finalization-handler.ts`) - ALREADY EXISTS
- Exports `handleFinalization()` function that:
  1. Loads session from SessionManager
  2. Validates: phase === Review, repository configured, canvas_id exists
  3. Gets Canvas content
  4. Parses owner/repo and extracts title/summary from spec
  5. Creates Epic via EpicManager
  6. Adds brainstorm as collapsible comment (spec type: "brainstorm")
  7. Updates Canvas with Epic URL prepended
  8. Updates session to Phase.Finalized with epic_number, epic_url, spec_comment_ids
  9. Posts confirmation to Slack
  - Returns `FinalizationResult` with success boolean, epicUrl, error

- Helper functions already exist:
  - `parseRepository(repo_string)` → {owner, repo} with ValidationError handling
  - `extractSpecTitle(markdown)` → title or "Brainstorm Specification" default
  - `extractSpecSummary(markdown)` → first non-heading paragraph (truncated to 200 chars)
  - `formatErrorForSlack(error)` → formatted Slack message using BaseError.toSlackMessage()

**EpicManager** (`slackbot/src/managers/epic-manager.ts`)
- Interface methods:
  - `createEpic(owner, repo, title, summary)` → Promise<{number, url}>
  - `addSpecComment(owner, repo, epicNumber, specType, content)` → Promise<number> (comment ID)
  - `updateSpecComment(owner, repo, commentId, specType, content)` → Promise<void>
  - `getSpecContent(owner, repo, epicNumber, specType)` → Promise<string | null>
  - `getSpecComments(owner, repo, epicNumber)` → Promise<Map<SpecType, {commentId, content}>>

- EpicManagerImpl uses GitHubClient:
  - Creates issue with "[Epic]" prefix and "epic" label
  - Stores specs as collapsible comments with markers: `<!-- REGENT_SPEC:{type} -->`
  - Uses formatSpecComment() to wrap content in `<details><summary>emoji description</summary>content</details>`

- MockEpicManager for testing with error injection, call recording, and state tracking

**Canvas Manager** (`slackbot/src/managers/canvas-manager.ts`)
- Interface methods:
  - `createCanvas(spec, threadTs, channelId)` → Promise<string> (canvas ID)
  - `updateCanvas(canvasId, spec)` → Promise<void>
  - `updateCanvasContent(canvasId, content)` → Promise<void> (raw markdown update)
  - `getCanvasContent(canvasId)` → Promise<string>
  - `formatForCanvas(spec)` → string

**Session Type** (`slackbot/src/types/session.ts`)
- Phase enum: Initializing, Questioning, Review, Finalized
- Session interface includes:
  - repository?: string (owner/repo format)
  - canvas_id?: string (set during review phase)
  - epic_number?: number (set during finalization)
  - epic_url?: string (set during finalization)
  - spec_comment_ids?: {brainstorm?, requirements?, design?} (comment IDs on Epic)

### Test Template Reference

**Location**: `slackbot/tests/handlers/finalization-handler.test.ts`
- Uses Deno testing framework (@std/testing/bdd, @std/assert)
- Pattern: describe() for test suites, it() for individual tests
- beforeEach/afterEach for setup/teardown with .clear() methods on mocks

**Test Mock Fixtures**:
```typescript
// Extended TestDatastoreClient helper
class TestDatastoreClient extends MockDatastoreClient {
  setSession(session: Session): void {
    this.put(session);
  }
  async getSession(sessionId: string): Promise<Session | undefined> {
    const result = await this.get(sessionId);
    return result.item;
  }
}

// Dependencies setup pattern
const dependencies: FinalizationDependencies = {
  sessionManager,
  canvasManager,
  epicManager,
  messagingClient,
};
```

**Key Assertions**:
- `assertEquals(actual, expected)` for equality checks
- `assertThrows(fn, ErrorType, message)` for error validation
- Mock state queries: `.getCreatedEpics()`, `.getAddedComments()`, `.getPostedMessages()`

### Project Conventions

**Import Style**:
```typescript
// Type imports separated
import type { SomeInterface } from "./path.ts";
import { concreteClass, function } from "./path.ts";
```

**Error Handling Patterns**:
```typescript
// BaseError and subclasses
if (error instanceof BaseError) {
  message = error.toSlackMessage();
}
throw new ValidationError(title, details, suggestedAction);
```

**Type Hints**: Explicit types for function parameters and returns

### Files to Modify

**`slackbot/src/orchestrators/session-orchestrator.ts`**
- Modify `handleApproval()` method (currently lines 1046-1057) to:
  - Call `handleFinalization()` from the finalization handler
  - Pass required dependencies (need to add to orchestrator constructor)
  - Handle finalization result (success/error)
  - Handle case where no repo is configured (mark complete without Epic)

### Files to Reference

**For Testing**:
- `slackbot/tests/handlers/finalization-handler.test.ts` - Complete test suite
- `slackbot/tests/integration/finalization.test.ts` - Integration tests
- `slackbot/tests/managers/epic-manager.test.ts` - Epic manager tests

**For Implementation Reference**:
- `slackbot/src/handlers/finalization-handler.ts` - Finalization logic (READY TO USE)
- `slackbot/src/managers/epic-manager.ts` - Epic creation with markers
- `slackbot/src/clients/github-client.ts` - GitHub issue/comment APIs

### Key Takeaway

The finalization handler is already fully implemented and tested. The task focuses on:
1. **Writing tests** for SessionOrchestrator.handleApproval() integration:
   - Approval detection tests (already has isApprovalIntent but needs handleApproval tests)
   - Epic creation via handleFinalization()
   - Completion without repo configured (Canvas/file only)
2. **Implementing** the handleApproval() method to wire together the flow

---
*Branch: feature/regent-slack-bot*
*Generated at execution time by Regent*
