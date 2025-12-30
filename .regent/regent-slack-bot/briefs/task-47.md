# Task Brief

## From Issue #47

Parent Epic: #42

## Task Description

Implement the session initialization flow in SessionOrchestrator, including repository exploration when --repo is specified.

**Type**: test-first

### Implementation Steps

- Write tests for handleSlashCommand (acknowledgment, session creation)
- Write tests for repository exploration trigger (--repo flag)
- Write tests for exploration summary posting
- Write tests for first question generation
- Write tests for exploration error handling (access denied, repo not found)
- Implement initialization flow in SessionOrchestrator

### Flow

1. Receive /brainstorm command
2. Create session record
3. Post acknowledgment message
4. If --repo specified:
   - Post "Exploring codebase..." status
   - Call GitHubClient.exploreRepository()
   - Post exploration summary
5. Generate and post first question

### Error Handling

- If repo exploration fails: offer to continue without repo context
- If session creation fails: report error with suggested action

## Acceptance Criteria

- Session initialized with correct metadata
- Repository exploration triggered when --repo provided
- Exploration summary posted before first question
- Graceful fallback when exploration fails

_Requirements: 1.1, 1.2, 2.1, 2.4_

## Issue Discussion

No comments on this issue.

## Codebase Context

### Current Implementation State

**Session Slash Command Handler** (`slackbot/src/handlers/slash-command.ts`)
- Already fully implemented with parsing and validation
- Function signatures:
  ```typescript
  export function handleSlashCommand(input: SlackSlashCommandInput): SlashCommand
  export function parseCommand(text: string): { repository?: string; idea: string }
  export function validateChannel(channelType: string): void
  ```
- Validates channel type (rejects DMs, accepts channel/group)
- Parses `--repo owner/repo idea text` format
- Extracts repository, idea, channelId, userId, channelType, responseUrl
- Throws `ValidationError` for invalid repo format or channel type

**Session Data Model** (`slackbot/src/types/session.ts`)
- Defines `Session` interface with all fields (session_id, repository, phase, initiator_user_id, canvas_id, confidence_score, created_at, ttl, epic_number, epic_url, spec_comment_ids)
- Defines `Phase` enum (Questioning, Review, Finalized)
- Helper function: `formatSessionId(channelId: string, threadTs: string): string` returns `{channelId}:{threadTs}`

**Session Manager** (`slackbot/src/managers/session-manager.ts`)
- Already implemented with these key methods:
  ```typescript
  async createSession(channelId, threadTs, repo, userId): Promise<Session>
  async loadSession(channelId, threadTs): Promise<Session | null>
  async updateSession(session): Promise<void>
  async rebuildFromHistory(channelId, threadTs): Promise<Session>
  async canPivotToContinue(session, epicManager): Promise<PivotCheckResult>
  async resumeSession(session): Promise<Session>
  ```
- Handles TTL enforcement (30 days), duplicate prevention, phase transitions
- Returns undefined for repository if empty string is passed
- Sets phase to Phase.Questioning on creation, confidence_score to 0
- Creates ISO 8601 timestamps for created_at and ttl

**GitHub Client** (`slackbot/src/clients/github-client.ts`)
- Interface `GitHubClient` defines:
  ```typescript
  async exploreRepository(owner: string, repo: string): Promise<RepositoryContext>
  async checkAccess(owner: string, repo: string): Promise<boolean>
  async getDefaultBranch(owner: string, repo: string): Promise<string>
  // ... plus issue/comment CRUD methods
  ```
- Implementation `GitHubClientImpl` with RetryHandler
- MockGitHubClient for testing with:
  - `setExploreRepositoryError(error)` - configure error injection
  - `exploreRepository()` - returns RepositoryContext with README, framework, patterns, files, structure
  - `clear()` - reset state

**Repository Explorer** (`slackbot/src/explorers/repository-explorer.ts`)
- Interface `RepositoryExplorer` with:
  ```typescript
  async explore(owner: string, repo: string): Promise<RepositoryContext>
  ```
- Implementation delegates to GitHubClient
- Returns context with repository name, Framework enum, patterns array, relevant_files array, structure string

**Error Types** (`slackbot/src/errors/types.ts`)
- Base class `BaseError` with `type`, `isRetryable`, `details`, `suggestedAction`, `toSlackMessage()`
- Permanent errors: `ValidationError`, `GitHubAccessError`, `AnthropicModelError`, `AnthropicInputError`
- Transient errors: `NetworkTimeoutError`, `GitHubRateLimitError`, `SlackRateLimitError`, `AnthropicRateLimitError`

**Slack Messaging Client** (`slackbot/src/clients/messaging-client.ts`)
- Interface `SlackMessagingClient` defines:
  ```typescript
  async postMessage(channelId, threadTs?, text, blocks?): Promise<PostMessageResult>
  async uploadFile(channelId, threadTs?, filename, content, contentType?): Promise<UploadFileResult>
  ```
- Returns PostMessageResult with {ok, ts, channel, thread_ts?}

**Anthropic Client** (`slackbot/src/clients/anthropic-client.ts`)
- Interface `AnthropicClient` defines:
  ```typescript
  async generateFirstQuestion(repositoryContext?: RepositoryContext, idea?: string): Promise<QuestionResponse>
  async continueConversation(messages: Message[], repositoryContext?: RepositoryContext): Promise<QuestionResponse>
  ```
- `QuestionResponse` contains `question` (string) and `confidence_score` (number)

### Test Template Reference

**Test Patterns** (from `slash-command.test.ts`)

File structure:
```typescript
import { assertEquals, assertThrows } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import { ValidationError } from "../../src/errors/types.ts";
import { handleSlashCommand, parseCommand, validateChannel } from "...";

describe("handleSlashCommand", () => {
  describe("command parsing integration", () => {
    it("should parse repo flag from slash command", () => {
      const command = {
        text: "--repo owner/repo build feature",
        channel_id: "C1234567890",
        user_id: "U1234567890",
        channel_type: "channel",
        response_url: "https://hooks.slack.com/commands/123/456",
      };
      const result = handleSlashCommand(command);
      assertEquals(result.repository, "owner/repo");
    });

    it("should reject DM channels", () => {
      const command = { channel_type: "im", ... };
      assertThrows(
        () => handleSlashCommand(command),
        ValidationError,
        "direct messages",
      );
    });
  });
});
```

**Mock Configuration Pattern** (from `repository-explorer.test.ts`)

```typescript
class ConfigurableMockGitHubClient extends MockGitHubClient {
  setExploreRepositoryResult(context: RepositoryContext): void { ... }
}

describe("RepositoryExplorer", () => {
  let explorer: RepositoryExplorer;
  let mockClient: ConfigurableMockGitHubClient;

  beforeEach(() => {
    mockClient = new ConfigurableMockGitHubClient();
    explorer = new RepositoryExplorerImpl(mockClient);
  });

  it("should throw GitHubAccessError on 403 access denied", async () => {
    const error = new GitHubAccessError("Access denied", "...", "...");
    mockClient.setExploreRepositoryError(error);
    await assertRejects(
      () => explorer.explore("owner", "repo"),
      GitHubAccessError,
    );
  });
});
```

**Session Manager Test Pattern** (from `session-manager.test.ts`)

```typescript
describe("SessionManager", () => {
  let datastore: MockDatastoreClient;
  let sessionManager: SessionManager;

  beforeEach(() => {
    datastore = new MockDatastoreClient();
    sessionManager = new SessionManager(datastore);
  });

  it("should create a session with correct session ID format", async () => {
    const session = await sessionManager.createSession(
      "C1234567890",
      "1234567890.123456",
      "owner/repo",
      "U1234567890",
    );
    assertEquals(session.session_id, "C1234567890:1234567890.123456");
    assertEquals(session.phase, Phase.Questioning);
    assertEquals(session.confidence_score, 0);
    assertEquals(session.repository, "owner/repo");
  });
});
```

### Project Conventions

**File Headers:**
```typescript
// ABOUTME: [Brief description of what the file does]
// ABOUTME: [Additional context about patterns or properties it implements]
```

**Import Style:**
- Type imports: `import type { SomeType } from "..."`
- Value imports: `import { someFunction } from "..."`
- Relative paths with `.ts` extension: `import { Handler } from "../handlers/handler.ts"`

**Error Handling Pattern:**
```typescript
// Throw ValidationError for input validation
throw new ValidationError(
  "Title for error",
  "Detailed explanation of what went wrong",
  "What user should do to resolve",
);

// Throw domain-specific errors
throw new GitHubAccessError(...);
```

**Async/Promise Style:**
- Use `async/await` with explicit `Promise<T>` return types
- Use `await this.retryHandler.execute(async () => { ... })` for retryable operations
- Return values from async functions with proper types

**Type Hints:**
- Strict TypeScript mode enabled
- All function parameters and returns have explicit types
- Interfaces use `interface` keyword for object types
- Enums use `enum` keyword

**Testing Style:**
- Use `@std/testing/bdd` with `describe` and `it`
- Use `@std/assert` with `assertEquals`, `assertThrows`, `assertRejects`, `assertExists`
- Use `beforeEach` and `afterEach` for setup/teardown
- Mock objects inherit from base classes and implement interfaces
- Test names are descriptive sentences starting with "should"

### Files to Create

1. **`slackbot/src/orchestrators/session-orchestrator.ts`** (new)
   - SessionOrchestrator class to manage session initialization
   - Method: `handleSlashCommand(command: SlashCommand, threadTs: string): Promise<void>`
   - Coordinates: SessionManager (create), GitHubClient (explore), AnthropicClient (question), messaging (post)
   - Handles errors: repo access denied, repo not found, session creation failure

2. **`slackbot/tests/orchestrators/session-orchestrator.test.ts`** (new)
   - Tests for acknowledgment posting
   - Tests for session creation
   - Tests for repository exploration when --repo flag present
   - Tests for exploration summary posting
   - Tests for first question generation
   - Tests for error cases: access denied, repo not found

### Files to Reference

- `slackbot/src/managers/session-manager.ts` - Used for `createSession()`
- `slackbot/src/clients/github-client.ts` - Used for `exploreRepository()`
- `slackbot/src/clients/anthropic-client.ts` - Used for `generateFirstQuestion()`
- `slackbot/src/clients/messaging-client.ts` - Used for `postMessage()`
- `slackbot/src/explorers/repository-explorer.ts` - Wraps GitHub client exploration
- `slackbot/src/handlers/slash-command.ts` - Parses command (already fully implemented)
- `slackbot/src/types/session.ts` - Session model and Phase enum

### Integration Points

1. **With SessionManager:**
   - Call `createSession(channelId, threadTs, repository, userId)` after parsing slash command
   - Repository comes from parsed SlashCommand or empty string if not provided

2. **With GitHubClient (for exploration):**
   - Call `exploreRepository(owner, repo)` when --repo flag is present
   - Parse owner/repo from session.repository string
   - Handle `GitHubAccessError` (403 - permission) gracefully
   - Returns `RepositoryContext` with framework, patterns, relevant_files, structure

3. **With AnthropicClient (for first question):**
   - Call `generateFirstQuestion(repositoryContext?, idea?)`
   - Pass repository context if exploration succeeded
   - Returns `QuestionResponse` with question and confidence_score

4. **With SlackMessagingClient (for posting):**
   - Post acknowledgment: `postMessage(channelId, threadTs, text)`
   - Post status during exploration: `postMessage(channelId, threadTs, "Exploring codebase...")`
   - Post exploration summary: `postMessage(channelId, threadTs, summaryText)`
   - Post first question: `postMessage(channelId, threadTs, question)`
   - All messages go to same thread in same channel

---
*Branch: feature/regent-slack-bot*
*Generated at execution time by Regent*
