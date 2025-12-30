# Task Brief

## From Issue #54

Parent Epic: #42

## Task Description

Deploy the `regent-exploration-service` to GitHub and write end-to-end tests for the complete exploration flow.

**Type**: integration testing

### Implementation Steps

1. Deploy `regent-exploration-service` repository to GitHub
2. Configure all required secrets in the repository
3. Write e2e test: trigger workflow → wait for completion → verify callback
4. Write e2e test: explore various repository types (Node.js, Python, monorepo)
5. Write e2e test: handle workflow timeout (>10 min)
6. Write e2e test: handle invalid target repository
7. Write e2e test: handle callback URL failures
8. Document deployment and configuration process

### E2E Test Scenarios

| Scenario | Expected Outcome |
|----------|------------------|
| Explore Node.js repo | Framework detected, package.json parsed, structure summarized |
| Explore Python repo | Framework detected, pyproject.toml parsed |
| Explore monorepo | Multiple frameworks detected, workspace structure understood |
| Invalid repo (404) | Error callback with appropriate message |
| Private repo (403) | Error callback with access denied message |
| Workflow timeout | Error callback after 10 min, session can continue without context |
| Callback URL down | Workflow completes, error logged, session stuck in initializing |

### Verification Checklist

- [ ] Workflow triggers successfully from ROSI
- [ ] Claude Code CLI produces meaningful exploration output
- [ ] Callback POST received with correct authentication
- [ ] Session transitions from `initializing` to `questioning`
- [ ] Exploration summary posted to Slack thread
- [ ] First question generated using exploration context

### Performance Requirements

- Workflow execution: < 3 min for typical repos (p95)
- Callback delivery: < 5s after workflow completion
- Total exploration time: < 5 min (user expectation set in UI)

## Acceptance Criteria

- Service deployed and operational on GitHub
- All e2e test scenarios pass
- Error handling works for edge cases
- Deployment documented for future maintenance

_Requirements: 2.2, 2.3, 2.4, 2.6, 11.2_

## Issue Discussion

No comments on this issue.

## Codebase Context

### Current Implementation State

#### 1. **Exploration Callback Types** (`src/types/exploration-callback.ts`)
```typescript
// Success callback structure
interface ExplorationCallbackSuccess {
  session_id: string;  // Format: "C1234567890:1234567890.123456"
  status: "success";
  exploration_context: {
    file_tree?: string;
    project_overview?: string;
    architecture_summary?: string;
    relevant_patterns?: string[];
    integration_points?: string[];
    testing_approach?: string;
    key_files?: string[];
    idea_related_code?: IdeaRelatedCode;
  };
}

// Error callback structure
interface ExplorationCallbackError {
  session_id: string;
  status: "error";
  error: {
    message: string;
    code: "CLONE_FAILED" | "INSTALL_FAILED" | "EXPLORATION_FAILED";
  };
}
```

#### 2. **Exploration Handler** (`src/handlers/exploration-handler.ts`)
- Validates Authorization header using constant-time comparison (Bearer token)
- Parses session_id to extract channelId and threadTs
- Loads session from SessionManager
- Routes to either success or error message formatting
- Posts formatted messages to Slack thread via messagingClient
- Returns 200 OK to prevent GitHub Actions retries on unknown sessions
- Implements Property 2.1-2.5 for codebase exploration

Key function signatures:
```typescript
async function handleExplorationCallback(
  request: ExplorationHandlerRequest,
  dependencies: ExplorationHandlerDependencies,
): Promise<ExplorationHandlerResponse>

function validateAuthorizationHeader(header: string | undefined, expectedSecret: string): boolean
```

#### 3. **GitHub Actions Workflow** (`.github/workflows/explore-codebase.yml`)
**Configuration:**
- 10-minute timeout per workflow run
- Concurrency control: prevents multiple explorations for same session_id
- Validates inputs: target_repo format, HTTPS callback_url, session_id format

**Execution steps:**
1. Clone target repository using `git` with credentials from helper
2. Setup Node.js 20
3. Install Claude Code CLI via npm
4. Run `claude --print` with exploration prompt template
5. Parse output (tries JSON extraction, falls back to wrapped output)
6. Send success callback via curl with 3 retries (5s delay between retries)
7. On failure: sends error callback with appropriate code

**Error handling:**
- Step failures logged to GITHUB_OUTPUT
- Callback retries up to 3 times with exponential delay
- Returns exit 1 if callback fails (logs as warning, doesn't retry GHA)

#### 4. **Session Orchestrator** (`src/orchestrators/session-orchestrator.ts`)
- **Methods that trigger exploration:**
  - `handleSlashCommand()` - initiates session creation
  - `startAsyncExploration()` - triggers GitHub Actions workflow
  - `handleExplorationResult()` - processes callback from workflow

- **Workflow:**
  1. Creates session in `Initializing` phase when repo provided
  2. Posts "Exploring codebase..." status message
  3. Calls `githubClient.triggerExploration()` with callback URL
  4. Returns immediately (webhook continues flow)
  5. On callback: transitions to `Questioning` phase, posts first question

#### 5. **Repository Explorer** (`src/explorers/repository-explorer.ts`)
```typescript
interface RepositoryExplorer {
  explore(owner: string, repo: string): Promise<RepositoryContext>;
}
```

### Test Template Reference

**Similar Test Files:**
- `/slackbot/tests/handlers/exploration-handler.test.ts` (470 lines)
- `/slackbot/tests/integration/flow-questioning.test.ts` (528 lines)
- `/slackbot/tests/integration/error-recovery.test.ts`
- `/slackbot/tests/explorers/repository-explorer.test.ts` (422 lines)

**Key Test Patterns:**
- Mock client setup with `MockDatastoreClient`, `MockSessionManager`, `MockGitHubClient`, `MockSlackMessagingClient`
- Session creation helpers with TTL management
- Message verification patterns
- Environment variable management in beforeEach/afterEach

### Project Conventions

**Import Style:**
- Use absolute imports from source root (`../../src/...`)
- Type imports: `import type { InterfaceName }`
- Mock imports grouped together

**Error Handling:**
- Custom error hierarchy: `BaseError` → specific types
- Include isRetryable flag and suggestedAction in errors
- Use type guards for runtime validation

**Test Structure:**
```typescript
import { assertEquals, assertExists, assertRejects } from "@std/assert";
import { afterEach, beforeEach, describe, it } from "@std/testing/bdd";

describe("Feature Name", () => {
  let dependency1: Type1;

  beforeEach(() => {
    dependency1 = new Mock();
  });

  it("should do something", async () => {
    const result = await operation();
    assertEquals(result, expectedValue);
  });
});
```

### Files to Modify

1. **Create end-to-end tests** at `/slackbot/tests/integration/exploration-e2e.test.ts`

### Files to Reference

| File | Purpose |
|------|---------|
| `/slackbot/tests/integration/flow-questioning.test.ts` | Similar integration test pattern |
| `/slackbot/tests/handlers/exploration-handler.test.ts` | Callback handler tests |
| `/slackbot/tests/integration/error-recovery.test.ts` | Error scenario patterns |
| `/slackbot/src/types/exploration-callback.ts` | Callback data structures |
| `/slackbot/src/types/session.ts` | Session data model |
| `/.github/workflows/explore-codebase.yml` | Workflow implementation |

---
*Branch: feature/regent-slack-bot*
*Generated at execution time by Regent*
