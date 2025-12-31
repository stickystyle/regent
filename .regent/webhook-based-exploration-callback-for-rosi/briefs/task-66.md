# Task Brief

## From Issue #66

Parent Epic: #56

## Task Description

Update GitHub Actions exploration workflow to POST results to webhook:
- Write tests for webhook URL environment variable (required, validation)
- Write tests for callback payload construction (channel_id, thread_ts, exploration_data)
- Write tests for retry logic (5s, 10s delays, max 3 attempts)
- Write tests for success detection (stop retrying on 2xx)
- Update `.github/workflows/explore-codebase.yml` to POST to webhook

## Acceptance Criteria

- Workflow reads SLACK_WEBHOOK_TRIGGER_URL from GitHub secrets
- Constructs flat JSON payload with channel_id, thread_ts, stringified exploration_data
- POSTs to webhook URL after exploration completes
- Retries on 5xx or network timeout: wait 5s, retry, wait 10s, retry
- Stops retrying after 3 total attempts
- Stops retrying immediately on 2xx success
- Fails workflow run if all attempts fail

## Requirements Traceability

- Requirement 2: Callback Payload Reception
- Requirement 6: GitHub Actions Retry Logic

## Issue Discussion

No comments on issue.

## Codebase Context

### Current Implementation State

The workflow (`/Volumes/workingfolder/regent/.github/workflows/explore-codebase.yml`) has partial webhook callback implementation (lines 137-210):

**Current structure:**
- Input parameters: `target_repo`, `idea`, `callback_url` (passed as workflow input), `session_id`
- Validation step (lines 37-62): Validates HTTPS callback_url, target_repo format, and session_id
- Exploration step (lines 106-135): Runs Claude Code CLI against target repo
- Success callback (lines 137-210): Sends POST to callback_url with retry logic
- Error callback (lines 212-269): Sends error POST to callback_url with retry logic

**Current retry implementation (lines 193-207):**
```bash
MAX_RETRIES=3
RETRY_DELAY=5
for i in $(seq 1 $MAX_RETRIES); do
  if curl -X POST "$CALLBACK_URL" ... --fail --silent --show-error --max-time 30; then
    exit 0
  fi
  echo "Callback attempt $i failed, retrying in ${RETRY_DELAY}s..."
  sleep $RETRY_DELAY
done
```

**Issues to address:**
1. Retry delay is constant 5s (needs 5s, then 10s pattern)
2. No explicit HTTP 2xx detection - relies on `--fail` flag
3. No detection of 5xx or network timeouts vs other errors
4. Uses `callback_url` input instead of `SLACK_WEBHOOK_TRIGGER_URL` secret
5. Payload uses session_id; needs to split to channel_id + thread_ts per spec

### Test Patterns in Codebase

**Test Framework**: Deno built-in test runner with `@std/testing/bdd`
- BDD syntax: `describe()`, `it()`, `beforeEach()`, `afterEach()`
- Assertions: `assertEquals()`, `assertExists()`, `assertThrows()`, `assertRejects()`

**Relevant test files:**
1. `tests/errors/retry.test.ts` - Shows retry logic testing with timing validation
2. `tests/deployment/environment-validation.test.ts` - Tests env var validation
3. `tests/functions/exploration-callback.test.ts` - Tests callback input structure

### Files to Modify

1. **`.github/workflows/explore-codebase.yml`**
   - Update input parameters to use SLACK_WEBHOOK_TRIGGER_URL secret
   - Update validation step for webhook URL
   - Update retry delays: 1st=0s, 2nd=5s, 3rd=10s
   - Update payload to use channel_id and thread_ts fields
   - Ensure proper 2xx/5xx detection

### Files to Reference

- `slackbot/src/types/exploration-callback.ts` - Callback payload structure
- `slackbot/src/handlers/exploration-handler.ts` - How webhook is consumed
- `slackbot/src/errors/retry.ts` - Retry pattern reference

### Key Points

1. The workflow already has retry logic but with constant delays
2. Payload needs to change from `session_id` to separate `channel_id` + `thread_ts`
3. Webhook URL should come from secrets, not workflow inputs
4. Testing GitHub Actions workflows is done via integration tests, not unit tests

---
*Branch: feature/webhook-based-exploration-callback-for-rosi*
*Generated at execution time by Regent*
