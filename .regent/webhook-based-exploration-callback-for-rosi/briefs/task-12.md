# Task Brief

## From Issue #68

Parent Epic: #56

## Task Description

Update configuration to support webhook callback URL:
- Write tests for EXPLORATION_CALLBACK_URL validation (required for repo exploration)
- Add EXPLORATION_CALLBACK_URL to environment variable documentation
- Update startAsyncExploration to use EXPLORATION_CALLBACK_URL

## Acceptance Criteria

- EXPLORATION_CALLBACK_URL is documented as required environment variable
- startAsyncExploration passes callback URL to GitHub Actions dispatch
- Validation fails gracefully if URL not configured
- Error message guides user to configure the URL

## Requirements Traceability

- Requirement 8: Webhook URL Security
- Requirement 9: Deployment Documentation

## Codebase Context

### Current Implementation State

**Key Files:**

1. **`slackbot/src/orchestrators/session-orchestrator.ts` (lines 142-170)**
   - `startAsyncExploration()` currently calls `githubClient.triggerExploration()` with:
     - `targetRepo`: the repository to explore
     - `idea`: the brainstorm idea
     - `sessionId`: channel_id:thread_ts format
   - **Current limitation**: No webhook callback URL is passed to the GitHub Actions dispatch

2. **`slackbot/src/clients/github-client.ts` (lines 1399-1430)**
   - `GitHubClientImpl.triggerExploration()` uses workflow_dispatch API
   - Payload contains only: `target_repo`, `idea`, `session_id`
   - The webhook URL is **NOT currently being passed** - it's stored in GitHub secrets

3. **`.github/workflows/explore-codebase.yml`**
   - Uses `SLACK_WEBHOOK_TRIGGER_URL` secret (lines 38, 148, 261)
   - The workflow validates the URL is set and uses HTTPS
   - This is a GitHub Actions secret, NOT accessible to the Slack app

4. **`slackbot/.env.example` (line 24)**
   - Currently documents `EXPLORATION_CALLBACK_URL` as the callback URL
   - BUT it's not being used in the actual implementation yet

### Key Discovery

The GitHub Actions workflow currently relies on **`SLACK_WEBHOOK_TRIGGER_URL` secret** to know where to POST results. The Slack app never communicates this URL to GitHub - it's configured separately.

For this task, we need to:
1. Make `EXPLORATION_CALLBACK_URL` a **required** Slack app environment variable
2. **Pass it from the Slack app to GitHub Actions** in the workflow_dispatch payload
3. **Update the GitHub workflow** to use the passed URL instead of relying solely on the secret

### Test Template Reference

**File**: `slackbot/tests/deployment/environment-validation.test.ts`

```typescript
// Pattern 1: Test helper function
export function validateEnvironment(
  requiredVars: readonly string[],
): { valid: boolean; missing: string[] } {
  const missing: string[] = [];
  for (const varName of requiredVars) {
    const value = Deno.env.get(varName);
    if (value === undefined || value.trim() === "") {
      missing.push(varName);
    }
  }
  return { valid: missing.length === 0, missing };
}

// Pattern 2: Test structure (beforeEach/afterEach with env cleanup)
beforeEach(() => {
  originalEnv.set(varName, Deno.env.get(varName));
});

afterEach(() => {
  if (value !== undefined) {
    Deno.env.set(varName, value);
  } else {
    Deno.env.delete(varName);
  }
});

// Pattern 3: Individual test cases
it("should return invalid when VAR_NAME is missing", () => {
  Deno.env.delete("VAR_NAME");
  const result = validateEnvironment(REQUIRED_ENV_VARS);
  assertEquals(result.missing.includes("VAR_NAME"), true);
});
```

### Project Conventions

- **Environment Variable Access:** Read via `Deno.env.get(varName)` in tests
- **Validation:** Check for `undefined` AND empty strings (`.trim() === ""`)
- **Error Handling:** Use `BaseError` subclasses with `suggestedAction` for user guidance
- **Import Style:** Deno imports first, then local imports

### Files to Modify

1. **`slackbot/tests/deployment/environment-validation.test.ts`**
   - Add `EXPLORATION_CALLBACK_URL` to `REQUIRED_ENV_VARS` const
   - Add test case for the new variable

2. **`slackbot/src/clients/github-client.ts`**
   - Update `GitHubClient` interface - add callback_url parameter to `triggerExploration()`
   - Update `MockGitHubClient.triggerExploration()`
   - Update `GitHubClientImpl.triggerExploration()` - include URL in workflow_dispatch payload

3. **`slackbot/src/orchestrators/session-orchestrator.ts`**
   - Update `startAsyncExploration()` to read and pass `EXPLORATION_CALLBACK_URL`

4. **`.github/workflows/explore-codebase.yml`**
   - Update workflow_dispatch inputs to receive `callback_url`
   - Use the dispatched parameter instead of `secrets.SLACK_WEBHOOK_TRIGGER_URL`

5. **`slackbot/.env.example`**
   - Update documentation for `EXPLORATION_CALLBACK_URL` to mark it as required

### Files to Reference

1. **`slackbot/tests/orchestrators/session-orchestrator-initialization.test.ts`**
   - Test structure for async initialization flow
   - How to assert on `getTriggerExplorationCalls()` records

2. **`slackbot/src/handlers/exploration-handler.ts`**
   - Validation pattern for required config
   - Authorization header validation pattern

3. **`slackbot/tests/properties/webhook-secrecy.property.test.ts`**
   - Property tests for ensuring URL secrecy

---
*Branch: feature/webhook-based-exploration-callback-for-rosi*
*Generated at execution time by Regent*
