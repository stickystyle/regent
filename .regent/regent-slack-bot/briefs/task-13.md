# Task Brief

## From Issue #28

**Task 13**: Implement PR creation workflow
**Type**: implementation

- Write tests for readConfig (parse .regent/config.yml, defaults)
- Write tests for branch creation (naming, base branch)
- Write tests for file commit (path .regent/{spec-name}/brainstorm.md)
- Write tests for PR creation (title, description, metadata)
- Implement full PR creation flow
- Write property test: **Property 8 - PR Creation Conditional**

### Requirements

**Requirement 6.2: Session Finalization - PR Creation with Repo**
> GIVEN a session has a repository configured WHEN the session is finalized THEN the system SHALL create a pull request containing `.regent/{spec-name}/brainstorm.md`.

**Requirement 6.3: Session Finalization - Target Branch Configuration**
> WHEN creating a PR THEN the system SHALL read the target branch from `.regent/config.yml` in the repository if it exists, otherwise use the repository's default branch.

**Requirement 6.4: Session Finalization - PR Metadata**
> WHEN creating a PR THEN the system SHALL include in the description: a link to the original Slack thread, list of participants, and summary of key decisions.

**Requirement 6.5: Session Finalization - No Repo Configured**
> GIVEN a session has no repository configured WHEN the session is finalized THEN the system SHALL mark the session complete and inform the user the Canvas/file is available for manual use.

### Design Interface

```typescript
interface GitHubClient {
  /** Create PR with brainstorm.md in .regent/{spec-name}/ directory. */
  createPullRequest(
    owner: string,
    repo: string,
    spec: SpecDocument,
    threadUrl: string,
    participants: string[],
  ): Promise<string>;

  /** Determine target branch from .regent/config.yml or repo default. */
  getDefaultBranch(owner: string, repo: string): Promise<string>;
}
```

### Correctness Property

**Property 8: PR Creation Conditional**
*If* a session is finalized and has a repository configured, *then* the system must create a pull request; otherwise it must only mark the session complete
**Validates:** Requirements 6.2, 6.5

## Codebase Context

### Current Implementation State

The GitHubClient interface and GitHubClientImpl are already partially implemented in `slackbot/src/clients/github-client.ts`:

**`createPullRequest` method (lines 400-491):**
1. Reads default branch via `getDefaultBranch()` (checks `.regent/config.yml` first, falls back to repo default)
2. Creates branch name as `brainstorm/{spec-name}` using kebab-case conversion
3. Formats brainstorm.md with all spec document content via `formatBrainstormMarkdown()` helper
4. Creates branch reference via GitHub API with GET `/git/refs/heads/{base}`
5. Commits brainstorm.md to `.regent/{spec-name}/brainstorm.md`
6. Creates PR with metadata including thread URL and participant list
7. All wrapped in RetryHandler for transient error recovery

**`getDefaultBranch()` implementation (lines 324-351):**
- Reads `.regent/config.yml` if present
- Parses `target_branch: value` from YAML
- Falls back to repository default_branch from API
- Wrapped in RetryHandler with exponential backoff

**`formatBrainstormMarkdown()` helper (lines 501-564):**
- Formats the SpecDocument into markdown
- Title as H1, metadata section, all spec sections

### Test Template Reference

**Test File:** `slackbot/tests/clients/github-client.test.ts`

**Key Patterns:**

1. **Fixture Setup:**
```typescript
describe("GitHubClientImpl with RetryHandler", () => {
  let mockApi: MockGitHubApi;
  let client: GitHubClientImpl;

  beforeEach(() => {
    mockApi = {
      get: (_url: string) => Promise.resolve(new Response(...)),
      post: (_url: string, _body: unknown) => Promise.resolve(new Response(...)),
    };
    client = new GitHubClientImpl(mockApi, "test-token");
  });
});
```

2. **Mock API Pattern:**
```typescript
interface MockGitHubApi {
  get: (url: string, headers?: Record<string, string>) => Promise<Response>;
  post: (url: string, body: unknown, headers?: Record<string, string>) => Promise<Response>;
}
```

3. **URL Matching for Conditional Responses:**
```typescript
mockApi.get = (url: string) => {
  if (url.includes(".regent/config.yml")) {
    // Return config response
  }
  if (url.includes("/git/refs/heads/")) {
    // Return ref response
  }
  return Promise.resolve(new Response("Not Found", { status: 404 }));
};
```

4. **Capturing Request Data:**
```typescript
let capturedPrBody: unknown;
mockApi.post = (url: string, body: unknown) => {
  if (url.includes("/pulls")) {
    capturedPrBody = body;
  }
  return Promise.resolve(...);
};
```

5. **Assertions:**
```typescript
import { assertEquals, assertRejects } from "@std/assert";
assertEquals(branch, "main");
await assertRejects(() => client.createPullRequest(...), GitHubAccessError, "Error message");
```

### Existing Test Coverage

The test file already has comprehensive tests for `createPullRequest` (lines 653-987):
- Basic PR creation with brainstorm.md
- Kebab-case naming for branch/directory
- Retry on transient errors
- Access error handling
- 422 validation error handling

### Error Handling Patterns

From `src/errors/types.ts`:

**Permanent Errors (non-retryable):**
```typescript
export class GitHubAccessError extends PermanentError {
  readonly type = "GitHubAccessError";
}
```

**Transient Errors (retryable):**
```typescript
export class NetworkTimeoutError extends TransientError {
  readonly type = "NetworkTimeoutError";
}
```

### Files to Modify

**`slackbot/tests/clients/github-client.test.ts`:**
1. Test suite for `readConfig()` - config.yml parsing, defaults
2. Tests for branch creation logic - kebab-case, naming pattern
3. Tests for file commit logic - path, encoding, commit message
4. Tests for PR creation - title format, metadata, body structure
5. Property 8 tests - conditional PR creation

### Files to Reference

- `slackbot/src/types/spec-document.ts` - SpecDocument interface
- `slackbot/src/errors/retry.ts` - RetryHandler patterns
- `slackbot/src/errors/types.ts` - Error hierarchy

---
*Branch: feature/regent-slack-bot*
*Generated at execution time by Regent*
