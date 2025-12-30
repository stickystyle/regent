# Session 1: Epic Comment CRUD & Approval Handler

## Problem Background

The current Regent Slack Bot design stores spec documents (brainstorm.md, requirements.md, design.md) by committing them to the repository via PR creation. This requires the GitHub PAT to have full `repo` write access, which:

1. **Increases security risk** - A compromised token has write access to the entire codebase
2. **Creates friction** - Organizations are hesitant to grant bots write access to repos
3. **Blurs responsibility** - Bot creates branches/PRs, mixing bot commits with developer commits

### Solution Overview

Store finalized spec documents as comments on a GitHub Epic issue using collapsible `<details>` sections, instead of committing them to the repository via PR.

**Before (finalization):**
```
User approves in Slack → Bot creates PR with .regent/{spec}/brainstorm.md → Merge to repo
```

**After (finalization):**
```
User approves in Slack → Bot creates Epic issue → Bot adds brainstorm.md as comment on Epic
```

### Reference Implementation

- Demo Epic structure: https://github.com/stickystyle/regent/issues/44
- GitHub comment size limit: 65,536 characters (brainstorm.md ~25K chars fits easily)

---

## Session Goals

1. Add Epic comment CRUD methods to GitHubClient
2. Create EpicManager service for spec comment management
3. Update approval handler to create Epic + comment instead of PR
4. Post Epic link to Slack channel after approval

---

## Prerequisites

**None** - This is the first session.

---

## Codebase Context for Planning

### Key Files to Understand

```
slackbot/
├── src/
│   ├── clients/
│   │   └── github-client.ts      # MODIFY: Add comment CRUD methods
│   ├── managers/
│   │   ├── session-manager.ts    # READ: Understand session lifecycle
│   │   └── canvas-manager.ts     # READ: Pattern for manager services
│   ├── handlers/
│   │   └── message-event.ts      # READ: Control command detection
│   ├── types/
│   │   ├── session.ts            # READ: Phase enum (Questioning → Review → Finalized)
│   │   └── message.ts            # READ: Control commands ["next", "ready", "approved"]
│   └── errors/
│       └── types.ts              # READ: Error type patterns
├── tests/
│   ├── clients/
│   │   └── github-client.test.ts # MODIFY: Add tests for new methods
│   └── managers/                 # ADD: epic-manager.test.ts
```

### Current GitHub Client Architecture

The `GitHubClient` interface in `src/clients/github-client.ts` follows this pattern:
- Interface defines contract
- `MockGitHubClient` for testing with error injection
- `GitHubClientImpl` for production with retry logic
- All methods use `RetryHandler` for transient errors

### Current Control Commands

In `src/types/message.ts`, control commands are defined:
```typescript
const controlCommands = ["next", "ready", "approved"];
```

The `@regent approved` command is detected but **not yet handled** - this session implements that handler.

### Session Phase Transitions

```typescript
enum Phase {
  Questioning = "questioning",  // Initial - Claude asks questions
  Review = "review",           // Team reviews Canvas
  Finalized = "finalized"      // Spec complete (NOT YET IMPLEMENTED)
}
```

---

## Task List

### Task 1: Add GitHub Issue Comment Types

**Goal:** Define TypeScript types for GitHub issue comment API responses.

**Files:**
- `src/types/github.ts` (NEW)

**Acceptance Criteria:**
- [ ] `GitHubComment` type with: id, body, created_at, updated_at, user
- [ ] `CreateCommentResponse` type
- [ ] `UpdateCommentResponse` type
- [ ] Types exported from `src/types/index.ts`

---

### Task 2: Add Comment CRUD to GitHubClient Interface

**Goal:** Extend GitHubClient interface with comment operations.

**Files:**
- `src/clients/github-client.ts`

**Methods to Add:**
```typescript
interface GitHubClient {
  // Existing methods...

  // NEW: Issue operations
  createIssue(owner: string, repo: string, title: string, body: string, labels?: string[]): Promise<{ number: number; url: string }>;
  getIssue(owner: string, repo: string, issueNumber: number): Promise<GitHubIssue>;

  // NEW: Comment operations
  getIssueComments(owner: string, repo: string, issueNumber: number): Promise<GitHubComment[]>;
  createIssueComment(owner: string, repo: string, issueNumber: number, body: string): Promise<GitHubComment>;
  updateIssueComment(owner: string, repo: string, commentId: number, body: string): Promise<GitHubComment>;
}
```

**Acceptance Criteria:**
- [ ] Interface updated with new method signatures
- [ ] MockGitHubClient implements all new methods (returns mock data)
- [ ] MockGitHubClient supports error injection for new methods

---

### Task 3: Implement Comment CRUD in GitHubClientImpl

**Goal:** Implement the comment CRUD methods with proper error handling and retry logic.

**Files:**
- `src/clients/github-client.ts`

**GitHub API Endpoints:**
- `GET /repos/{owner}/{repo}/issues/{issue_number}/comments`
- `POST /repos/{owner}/{repo}/issues/{issue_number}/comments`
- `PATCH /repos/{owner}/{repo}/issues/comments/{comment_id}`
- `POST /repos/{owner}/{repo}/issues` (create issue)
- `GET /repos/{owner}/{repo}/issues/{issue_number}` (get issue)

**Acceptance Criteria:**
- [ ] All methods wrapped in RetryHandler for transient errors
- [ ] Proper error types thrown (GitHubAccessError, GitHubRateLimitError)
- [ ] Pagination handled for getIssueComments (issues can have many comments)

---

### Task 4: Write Tests for Comment CRUD

**Goal:** Comprehensive test coverage for new GitHub client methods.

**Files:**
- `tests/clients/github-client.test.ts`

**Test Cases:**
- [ ] createIssue: Success returns issue number and URL
- [ ] createIssue: 401/403 throws GitHubAccessError
- [ ] createIssue: 422 throws GitHubAccessError (validation failed)
- [ ] getIssue: Success returns issue data
- [ ] getIssue: 404 throws appropriate error
- [ ] getIssueComments: Success returns array of comments
- [ ] getIssueComments: Handles pagination
- [ ] createIssueComment: Success returns comment with ID
- [ ] updateIssueComment: Success returns updated comment
- [ ] All methods: 429 throws GitHubRateLimitError
- [ ] All methods: 5xx triggers retry

---

### Task 5: Create EpicManager Service

**Goal:** Higher-level service for managing spec documents on Epic issues.

**Files:**
- `src/managers/epic-manager.ts` (NEW)

**Interface:**
```typescript
interface EpicManager {
  // Create Epic issue with summary body
  createEpic(owner: string, repo: string, title: string, summary: string): Promise<{ number: number; url: string }>;

  // Add spec document as collapsible comment
  addSpecComment(owner: string, repo: string, epicNumber: number, specType: SpecType, content: string): Promise<number>; // returns commentId

  // Update existing spec comment
  updateSpecComment(owner: string, repo: string, commentId: number, specType: SpecType, content: string): Promise<void>;

  // Get spec content from Epic (finds comment by marker)
  getSpecContent(owner: string, repo: string, epicNumber: number, specType: SpecType): Promise<string | null>;

  // Get all spec comments from Epic
  getSpecComments(owner: string, repo: string, epicNumber: number): Promise<Map<SpecType, { commentId: number; content: string }>>;
}

type SpecType = "brainstorm" | "requirements" | "design";
```

**Comment Format:**
```markdown
<!-- REGENT_SPEC:brainstorm -->
<details>
<summary>📋 Brainstorm Specification</summary>

{content}

</details>
```

**Acceptance Criteria:**
- [ ] Uses marker comments (`<!-- REGENT_SPEC:{type} -->`) to identify spec comments
- [ ] Formats content with collapsible `<details>` wrapper
- [ ] getSpecContent parses marker to find correct comment
- [ ] Depends on GitHubClient (dependency injection)

---

### Task 6: Write Tests for EpicManager

**Goal:** Test EpicManager with MockGitHubClient.

**Files:**
- `tests/managers/epic-manager.test.ts` (NEW)

**Test Cases:**
- [ ] createEpic: Creates issue with correct title and body
- [ ] addSpecComment: Creates comment with correct marker and format
- [ ] addSpecComment: Returns comment ID
- [ ] updateSpecComment: Updates comment preserving marker
- [ ] getSpecContent: Finds comment by marker and extracts content
- [ ] getSpecContent: Returns null if not found
- [ ] getSpecComments: Returns map of all spec types found
- [ ] Comment format: Includes collapsible details wrapper

---

### Task 7: Create Finalization Handler

**Goal:** Handle `@regent approved` command to create Epic and post spec.

**Files:**
- `src/handlers/finalization-handler.ts` (NEW)
- `src/handlers/message-event.ts` (MODIFY to route approved command)

**Flow:**
1. Detect `@regent approved` in thread
2. Load session from SessionManager
3. Verify session is in Review phase
4. Get Canvas content (spec document)
5. Create Epic issue via EpicManager
6. Add brainstorm.md as comment on Epic
7. Transition session to Finalized phase
8. Post Epic link to Slack channel

**Acceptance Criteria:**
- [ ] Only works when session is in Review phase
- [ ] Creates Epic with title from spec
- [ ] Adds brainstorm as collapsible comment
- [ ] Transitions session to Finalized
- [ ] Posts confirmation message with Epic URL to Slack
- [ ] Handles errors gracefully (posts error to Slack)

---

### Task 8: Write Tests for Finalization Handler

**Goal:** Test finalization flow with mocks.

**Files:**
- `tests/handlers/finalization-handler.test.ts` (NEW)

**Test Cases:**
- [ ] Success: Creates Epic and comment, transitions session
- [ ] Wrong phase: Returns error if not in Review phase
- [ ] No session: Returns error if session not found
- [ ] GitHub error: Posts error message to Slack
- [ ] Message posted: Confirmation includes Epic URL

---

### Task 9: Integration Test

**Goal:** End-to-end test of approval flow.

**Files:**
- `tests/integration/finalization.test.ts` (NEW)

**Test Cases:**
- [ ] Full flow: approved command → Epic created → comment added → session finalized → Slack notified

---

## Success Criteria

- [ ] `@regent approved` command creates GitHub Epic (not PR)
- [ ] Brainstorm spec is stored as collapsible comment on Epic
- [ ] Epic URL is posted to Slack channel after approval
- [ ] Session transitions to Finalized phase
- [ ] All new code has >90% test coverage
- [ ] Existing tests still pass
- [ ] Bot PAT only needs `repo:read` + `issues:write` (not full `repo` write)

---

## Out of Scope (Future Sessions)

- Plugin command updates (`--epic` flag) → Session 2
- Session resumption for pivots → Session 2
- Pivot reconciliation → Session 3
- Removing PR creation workflow → Session 4
