# Task Brief

## From Issue #67

Parent Epic: #56

## Task Description

Ensure webhook URLs are never exposed in logs or messages:
- Write tests for log sanitization (webhook URLs never logged)
- Write tests for message sanitization (webhook URLs never in Slack messages)
- Review all logging statements and message formatting
- Write property test: **Property 3 - Webhook URL Secrecy**

## Acceptance Criteria

- No function logs contain webhook URLs
- No error messages contain webhook URLs
- No Slack messages contain webhook URLs
- Documentation examples use placeholder URLs, not real ones
- Property test scans all output for URL patterns

## Requirements Traceability

- Requirement 8: Webhook URL Security

## Issue Discussion

No comments on this issue.

## Codebase Context

### Current Implementation State

**Exploration Callback Architecture:**

The webhook-based exploration callback is fully implemented across these files:

1. **Trigger Definition** (`slackbot/triggers/exploration-callback.ts`):
   - Lines 21-22: Documents webhook URL format: `https://hooks.slack.com/triggers/<team_id>/<trigger_id>/<secret>`
   - Creates HTTPS webhook endpoint that receives POST from GitHub Actions

2. **Handler Function** (`slackbot/src/handlers/exploration-handler.ts`):
   - Lines 110-136: `formatExplorationSummary()` formats exploration results safely (no URLs)
   - Lines 145-157: `formatExplorationError()` formats errors safely (no URLs)
   - Lines 176-259: `handleExplorationCallback()` main handler with validation and message posting
   - Lines 183-188: Validates Bearer token authorization (NOT URL-based)
   - Lines 242-247: Posts formatted messages to Slack thread

3. **ROSI Function** (`slackbot/functions/exploration-callback.ts`):
   - Lines 164-210: Sets up dependencies including `callbackSecret`
   - Lines 212-215: `console.warn()` if CALLBACK_SECRET env var not set (does NOT log the value)
   - Line 251: `console.error()` for handler errors (need to verify error content)
   - No webhook URL logging in normal flow

4. **Session Orchestrator** (`slackbot/src/orchestrators/session-orchestrator.ts`):
   - Line 136: Comment documents webhook URL is in GitHub secret, not passed through code
   - Lines 147-150: Posts "Exploring codebase..." message (safe)

5. **GitHub Client** (`slackbot/src/clients/github-client.ts`):
   - Lines 1399-1429: `triggerExploration()` dispatches to workflow
   - Line 1391: Comment notes webhook URL in GitHub secret (not included in dispatch)
   - Does NOT pass webhook URL - it's stored separately in GitHub

6. **Environment Config** (`slackbot/.env.example`):
   - Lines 22-24: `EXPLORATION_CALLBACK_URL` documented with placeholder example

### Test Template Reference

**Property Test Pattern** (`slackbot/tests/properties/exploration-callback.property.test.ts`):
- **File Size**: 390 lines
- **Testing Framework**: `@std/testing/bdd` with `fast-check@3`
- **Structure**:
  - Lines 21-30: Extended test datastore client with helpers
  - Lines 35-41: Arbitrary generators (`fc.record()` for objects, `fc.string()` for strings)
  - Lines 53-97: Setup/teardown with state reset
  - Lines 99-145+: Properties using `await fc.assert(fc.asyncProperty(...))`
  - State cleared between runs: `mockDatastore.clear()`, `messagingClient.clear()`

**Key Patterns**:
```typescript
// Generators
const explorationContextArb = fc.record({
  project_overview: fc.string({ minLength: 0, maxLength: 1000 }),
  // ...
});

// Property assertions
await fc.assert(
  fc.asyncProperty(explorationContextArb, async (context) => {
    mockDatastore.clear();
    messagingClient.clear();
    // ... test logic
  }),
  { numRuns: 50 },
);
```

### Project Conventions

**Import Style:**
```typescript
import { assertEquals, assertExists } from "@std/assert";
import { describe, it, beforeEach, afterEach } from "@std/testing/bdd";
import fc from "npm:fast-check@3";
import { MockSlackMessagingClient } from "../../src/clients/messaging-client.ts";
```

**Error Handling:**
- Custom error types inherit from `BaseError`
- Error messages should NOT include raw URLs or full request data
- Exceptions caught and logged carefully (no secrets in logs)

**Type Annotations:**
- Explicit return types: `Promise<void>`, `Promise<ExplorationHandlerResponse>`
- Union types for variants: `ExplorationCallback = Success | Error`
- Type guards as functions: `isExplorationSuccess()`, `isExplorationError()`

**Mock Client Pattern:**
```typescript
export class MockSlackMessagingClient implements SlackMessagingClient {
  private messages: Array<{ channel: string; text: string; thread_ts?: string }> = [];

  async postMessage(channelId: string, threadTs: string | undefined, text: string) {
    this.messages.push({ channel: channelId, text, thread_ts: threadTs });
    return { ok: true, ts: "1234567890.123456", channel: channelId };
  }

  getMessages() { return [...this.messages]; }
  clear() { this.messages = []; }
}
```

### Files to Create

**New Test File:**
- **`slackbot/tests/properties/webhook-secrecy.property.test.ts`**
  - Property 3: Webhook URL Secrecy tests
  - Test that webhook URLs never appear in:
    - Console logs (`console.log`, `console.warn`, `console.error`)
    - Slack messages (via `MockSlackMessagingClient.postMessage()`)
    - Error responses from handler
    - Exception messages

### Files to Reference

- **Type Definitions**: `slackbot/src/types/exploration-callback.ts`
- **Handler Code**: `slackbot/src/handlers/exploration-handler.ts` (lines 110-259)
- **Existing Property Tests**: `slackbot/tests/properties/exploration-callback.property.test.ts` (Properties 1, 2, 4, 6, 8)
- **Mock Clients**: `slackbot/src/clients/messaging-client.ts` (MockSlackMessagingClient)

### Acceptance Criteria Implementation

**Criterion 1: No function logs contain webhook URLs**
- Verify `console.warn()` at line 214 doesn't log the secret value
- Verify `console.error()` at line 251 error message is sanitized
- Test that error objects don't contain full request URLs

**Criterion 2: No error messages contain webhook URLs**
- Test `handleExplorationCallback()` error responses (lines 185, 198, 209, 218, 232)
- All error strings should not include `https://` patterns
- Verify error messages only contain semantic error codes, not URLs

**Criterion 3: No Slack messages contain webhook URLs**
- Capture all messages via `messagingClient.getMessages()`
- Test `formatExplorationSummary()` output (lines 110-136)
- Test `formatExplorationError()` output (lines 145-157)
- Verify no message text includes webhook patterns

**Criterion 4: Documentation uses placeholder URLs**
- `.env.example` uses `your_callback_url_here` (verified - line 24)
- Comments document GitHub secret storage, not real URLs
- Deployment docs show placeholder format

**Criterion 5: Property test scans for URL patterns**
- Use regex: `/https:\/\/hooks\.slack\.com\/triggers\/[a-zA-Z0-9_-]+\/[a-zA-Z0-9_-]+\/[a-zA-Z0-9_-]+/`
- Property: For ANY exploration callback, NO output (logs/messages) matches URL patterns
- Test with various payload sizes and error codes

### Key Testing Insights

1. **Webhook URL Storage**: Located in GitHub Actions secret (`SLACK_WEBHOOK_TRIGGER_URL`), NOT in ROSI environment or code
2. **Authorization Method**: Uses Bearer token (`CALLBACK_SECRET`), not URL-based auth
3. **Message Formatting**: Already safe - uses only fields from `exploration_context`, not URLs
4. **Logging Risk**: Primary risk is exception handling - need to verify error messages are clean

---
*Branch: feature/webhook-based-exploration-callback-for-rosi*
*Generated at execution time by Regent*
