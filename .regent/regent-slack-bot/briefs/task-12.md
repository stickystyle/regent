# Task Brief

## From Issue #25

**Task 12**: Implement repository exploration
**Type**: implementation

- Write tests for explore (README detection, manifest parsing, structure summary)
- Write tests for framework detection (React, FastAPI, Next.js, etc.)
- Write tests for error handling (missing files, private repos)
- Implement RepositoryExplorer with GitHub client integration

### Requirements

#### Requirement 2.1: Codebase Exploration - Initiation
> WHEN a session is created with `--repo owner/repo` THEN the system SHALL post a status message indicating codebase exploration is in progress.

#### Requirement 2.2: Codebase Exploration - File Reading
> WHEN exploring a repository THEN the system SHALL read key files including README, package manifests (package.json, pyproject.toml), and source directory structure.

#### Requirement 2.3: Codebase Exploration - Summary
> WHEN exploration completes THEN the system SHALL post a summary of findings (framework, patterns, relevant existing code) before asking the first question.

#### Requirement 2.4: Codebase Exploration - Error Handling
> WHEN the GitHub token lacks access to the specified repository THEN the system SHALL display an error message and offer to continue without repository context.

#### Requirement 2.5: Codebase Exploration - Question Context
> WHILE in questioning phase with a repository configured THEN the system SHALL reference relevant existing code in questions when applicable.

### Design Interface

```typescript
interface RepositoryContext {
  /** Detected framework (React, FastAPI, etc.) */
  framework: string;

  /** Identified architectural patterns */
  patterns: string[];

  /** Key files referenced in questions */
  relevant_files: string[];

  /** Directory layout summary */
  structure: string;
}
```

### Task Relationships
- **Depends on**: Task 11 (GitHub client abstraction layer)
- **Blocks**: Task 18 (question-answer loop with tool use)

### Implementation Guidance

Framework detection should support common ecosystems:
- JavaScript/TypeScript: React, Next.js, Vue, Angular (from package.json)
- Python: FastAPI, Django, Flask (from pyproject.toml or requirements.txt)
- Go: module name from go.mod
- Rust: crate name from Cargo.toml

Error handling should gracefully degrade when files are missing rather than failing entirely.

## Codebase Context

### GitHub Client (Task 11 Implementation) ✓

The GitHub client abstraction is fully implemented in `slackbot/src/clients/github-client.ts`.

#### GitHubClient Interface
```typescript
export interface GitHubClient {
  exploreRepository(owner: string, repo: string): Promise<RepositoryContext>;
  createPullRequest(owner: string, repo: string, spec: SpecDocument, threadUrl: string, participants: string[]): Promise<string>;
  getDefaultBranch(owner: string, repo: string): Promise<string>;
  checkAccess(owner: string, repo: string): Promise<boolean>;
}
```

#### Key Implementation Details
- Framework detection already implemented in `GitHubClientImpl.detectFramework()`
- Supports: package.json (Next.js, React, Express), pyproject.toml (FastAPI, Django), deno.json/jsonc (Deno)
- Directory structure limited to first 5 items with "... (N more)" indicator
- All file reads wrapped in try-catch to silently skip missing files
- RetryHandler wraps operations for transient error recovery

#### Available Implementations
- **`MockGitHubClient`**: For testing - configurable mock responses with error injection
- **`GitHubClientImpl`**: Production implementation using GitHub REST API

### Type Definitions (Already Exist)

Location: `slackbot/src/types/repository-context.ts`

```typescript
export interface RepositoryContext {
  repository: string;           // "owner/repo"
  framework: Framework;         // Enum: React, NextJS, FastAPI, Django, Express, Deno, Unknown
  patterns: string[];           // Architectural patterns found
  relevant_files: RelevantFile[]; // Key files with optional content
  structure: string;            // Directory tree summary
}

export interface RelevantFile {
  path: string;
  description: string;
  content?: string;
}

export enum Framework {
  React = "react",
  NextJS = "nextjs",
  FastAPI = "fastapi",
  Django = "django",
  Express = "express",
  Deno = "deno",
  Unknown = "unknown",
}
```

### Test Patterns

**Test Framework & Imports**
```typescript
import { assertEquals, assertExists, assertRejects, assertInstanceOf } from "@std/assert";
import { afterEach, beforeEach, describe, it } from "@std/testing/bdd";
```

**Key Pattern**: Tests use `MockGitHubClient` with error injection:
```typescript
mockClient.setExploreRepositoryError(new GitHubAccessError(...));
await assertRejects(() => mockClient.exploreRepository(...), GitHubAccessError);
```

### Error Handling

Error hierarchy in `slackbot/src/errors/types.ts`:
- `TransientError` (retryable): GitHubRateLimitError, NetworkTimeoutError
- `PermanentError` (not retryable): GitHubAccessError, ValidationError

### Files to Create

1. **`tests/explorers/repository-explorer.test.ts`** - Test file for RepositoryExplorer
2. **`src/explorers/repository-explorer.ts`** - RepositoryExplorer implementation
3. **`src/explorers/index.ts`** - Re-exports for explorer module

### Files to Reference

- `slackbot/src/clients/github-client.ts` - GitHubClient with full exploration logic
- `slackbot/tests/clients/github-client.test.ts` - Test patterns (990 lines)
- `slackbot/src/types/repository-context.ts` - RepositoryContext types
- `slackbot/src/errors/types.ts` - Error hierarchy
- `slackbot/src/errors/retry.ts` - RetryHandler

### Key Insight

**The GitHubClient already implements `exploreRepository()`** with full framework detection, README extraction, and directory structure building. The RepositoryExplorer should:
1. Wrap GitHubClient.exploreRepository() with additional processing
2. Enhance pattern detection beyond framework
3. Add additional relevant files discovery
4. Provide retry logic for the exploration operation
5. Format output for use by other components

---
*Branch: feature/regent-slack-bot*
*Generated at execution time by Regent*
