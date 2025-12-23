# Task Brief

## From Issue #23

**Task 11**: Implement GitHub client abstraction layer
**Type**: test-first

- Write tests for authentication (token validation, access checks)
- Write tests for readFile (success, 404, 403, large files)
- Write tests for listDirectory (root, subdirs, filtering)
- Implement GitHubClient with REST API calls
- Write property test: **Property 5 - Repository Access Validation**

### Requirements Summary:
- **Req 2.2**: Read key files including README, package manifests, source directory structure
- **Req 2.4**: Display error when GitHub token lacks access, offer to continue without context
- **Req 10.2**: Only access repositories explicitly specified
- **Req 10.5**: Report access errors and offer to continue without repository context

### Interface to Implement:
```typescript
interface GitHubClient {
  /** Read README, manifests, and directory structure. */
  exploreRepository(owner: string, repo: string): Promise<RepositoryContext>;

  /** Create PR with brainstorm.md in .regent/{spec-name}/ directory. */
  createPullRequest(
    owner: string,
    repo: string,
    spec: SpecDocument,
    threadUrl: string,
    participants: string[]
  ): Promise<string>;

  /** Determine target branch from .regent/config.yml or repo default. */
  getDefaultBranch(owner: string, repo: string): Promise<string>;

  /** Verify token has read/write access to repository. */
  checkAccess(owner: string, repo: string): Promise<boolean>;
}
```

## Codebase Context

### Current Implementation State

**No Existing GitHub Client**
- Create new file: `/Volumes/workingfolder/regent/slackbot/src/clients/github-client.ts`
- Create new test: `/Volumes/workingfolder/regent/slackbot/tests/clients/github-client.test.ts`
- The `/src/clients/` directory already exists with `messaging-client.ts` and `slack-client.ts` as patterns

**Type Definitions (Already Exist)**

RepositoryContext from `/Volumes/workingfolder/regent/slackbot/src/types/repository-context.ts`:
```typescript
export interface RepositoryContext {
  repository: string;           // "owner/repo" format
  framework: Framework;         // Enum: React, NextJS, FastAPI, Django, Express, Deno, Unknown
  patterns: string[];           // Architectural patterns identified
  relevant_files: RelevantFile[]; // Key files with descriptions/content
  structure: string;            // Directory tree summary
}

export interface RelevantFile {
  path: string;
  description: string;
  content?: string;
}
```

SpecDocument from `/Volumes/workingfolder/regent/slackbot/src/types/spec-document.ts`:
```typescript
export interface SpecDocument {
  title: string;
  overview: string;
  problem_statement: string;
  goals: string[];
  non_goals: string[];
  personas: Persona[];
  use_cases: UseCase[];
  technical_details: string;
  open_questions: string[];
}
```

**Existing Error Types** from `/Volumes/workingfolder/regent/slackbot/src/errors/types.ts`:
```typescript
// Transient (retryable)
export class GitHubRateLimitError extends TransientError {
  readonly resetTime: Date;
}

// Permanent (not retryable)
export class GitHubAccessError extends PermanentError {}
```

**HTTP Client Patterns**
- Use native Deno `fetch` API
- Use `RetryHandler` from `/Volumes/workingfolder/regent/slackbot/src/errors/retry.ts` for transient errors
- Outgoing domain `api.github.com` already configured in manifest
- Environment variable: `GITHUB_TOKEN`

### Test Template Reference

**Pattern File**: `/Volumes/workingfolder/regent/slackbot/tests/clients/messaging-client.test.ts`

**Key Patterns**:

1. **File Structure**:
```typescript
// ABOUTME: Two-line header explaining what this test file tests
// ABOUTME: Second line with additional context

import { assertEquals, assertRejects } from "@std/assert";
import { afterEach, beforeEach, describe, it } from "@std/testing/bdd";

describe("ClientName", () => {
  describe("MockImplementation", () => {
    let client: MockClient;

    beforeEach(() => {
      client = new MockClient();
    });

    afterEach(() => {
      client.clear();
    });

    // Tests for mock behavior
  });

  describe("RealImplementation", () => {
    // Tests with mock API object
  });
});

describe("Property N: Property Name", () => {
  // Property-based tests validating design properties
});
```

2. **Mock Client Pattern**:
```typescript
export class MockGitHubClient implements GitHubClient {
  private exploreError: Error | null = null;
  private checkAccessError: Error | null = null;

  setExploreRepositoryError(error: Error): void {
    this.exploreError = error;
  }

  clear(): void {
    this.exploreError = null;
    // Clear all state
  }

  async exploreRepository(owner: string, repo: string): Promise<RepositoryContext> {
    if (this.exploreError) {
      throw this.exploreError;
    }
    // Return mock data
  }
}
```

3. **Real Implementation with Mock API**:
```typescript
interface MockGitHubApi {
  get: (url: string, headers?: Record<string, string>) => Promise<Response>;
  post: (url: string, body: unknown, headers?: Record<string, string>) => Promise<Response>;
}

describe("GitHubClientImpl with RetryHandler", () => {
  let mockApi: MockGitHubApi;
  let client: GitHubClientImpl;

  beforeEach(() => {
    mockApi = {
      get: (url) => Promise.resolve(new Response(JSON.stringify({...}))),
      post: (url, body) => Promise.resolve(new Response(JSON.stringify({...}))),
    };
    client = new GitHubClientImpl(mockApi, "test-token");
  });
});
```

4. **Retry Logic Tests**:
```typescript
it("should retry on transient errors", async () => {
  let attempts = 0;
  mockApi.get = () => {
    attempts++;
    if (attempts < 2) {
      throw new NetworkTimeoutError("Timeout", "Test", "Retry");
    }
    return Promise.resolve(new Response("success"));
  };

  const result = await client.checkAccess("owner", "repo");
  assertEquals(attempts, 2);
});
```

5. **Error Injection Tests**:
```typescript
it("should throw GitHubAccessError on 403", async () => {
  mockApi.get = () => Promise.resolve(new Response("Forbidden", { status: 403 }));

  await assertRejects(
    () => client.checkAccess("owner", "repo"),
    GitHubAccessError,
  );
});
```

### Project Conventions

**Import Style**:
```typescript
// Standard library imports first
import { assertEquals, assertRejects } from "@std/assert";
import { describe, it } from "@std/testing/bdd";

// Project imports grouped by category (errors, types, clients)
import { GitHubAccessError, GitHubRateLimitError } from "../../src/errors/types.ts";
import { RepositoryContext } from "../../src/types/repository-context.ts";
import { GitHubClient, MockGitHubClient } from "../../src/clients/github-client.ts";
```

**Error Handling Pattern**:
- All errors extend `BaseError` hierarchy
- Transient errors (retryable): `GitHubRateLimitError`, `NetworkTimeoutError`
- Permanent errors (not retryable): `GitHubAccessError`, `ValidationError`
- RetryHandler automatically retries transient errors 3 times with exponential backoff

**Type Annotation Style**:
- Explicit return types on all public methods
- Interface definitions for all public contracts
- `readonly` for class properties that shouldn't change

**Async/Await Pattern**:
- All async operations use `async/await` (no `.then()` chains)

**ABOUTME Headers**:
```typescript
// ABOUTME: <What this file does in one sentence>
// ABOUTME: <Additional context or key responsibility>
```

### GitHub API Integration Notes

**REST API Endpoints to Use**:
```
GET /repos/:owner/:repo - Repository info (default branch)
GET /repos/:owner/:repo/contents/:path - Read files/list directories
POST /repos/:owner/:repo/pulls - Create pull request
GET /repos/:owner/:repo/contents/.regent/config.yml - Read config
```

**Authentication**:
```typescript
headers: {
  "Authorization": `Bearer ${token}`,
  "Accept": "application/vnd.github.v3+json"
}
```

**Response Handling**:
- 200: Success
- 403: GitHubAccessError (permanent - no retry)
- 404: File/repo not found
- 429: GitHubRateLimitError (transient - retry with rate limit reset time)
- 5xx: NetworkTimeoutError (transient - retry)

### Files to Reference

**Required Reading**:
1. `/Volumes/workingfolder/regent/slackbot/src/types/repository-context.ts` - Data model for exploration results
2. `/Volumes/workingfolder/regent/slackbot/src/types/spec-document.ts` - Spec document format
3. `/Volumes/workingfolder/regent/slackbot/src/errors/types.ts` - Error types hierarchy
4. `/Volumes/workingfolder/regent/slackbot/src/errors/retry.ts` - RetryHandler implementation

**Pattern References**:
5. `/Volumes/workingfolder/regent/slackbot/src/clients/messaging-client.ts` - Client implementation pattern
6. `/Volumes/workingfolder/regent/slackbot/tests/clients/messaging-client.test.ts` - Test pattern

---
*Branch: feature/regent-slack-bot*
*Generated at execution time by Regent*
