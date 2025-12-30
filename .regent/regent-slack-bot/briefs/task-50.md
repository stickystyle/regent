# Task Brief

## From Issue #50

Parent Epic: #42

## Task Description

Create the GitHub Actions workflow for deep codebase exploration **in this repo** (simplified from original plan to create a separate repo - we'll keep everything in-repo for development/dogfooding).

**Type**: test-first

### Implementation Steps

1. Create `.github/workflows/explore-codebase.yml` workflow in this repo:
   - Accepts `workflow_dispatch` with inputs: `target_repo`, `idea`, `callback_url`, `session_id`
   - Clones target repository using `REPO_ACCESS_TOKEN` secret
   - Installs Claude Code CLI
   - Runs exploration prompt with `claude --print`
   - POSTs results to callback URL with `CALLBACK_SECRET` auth
3. Create `prompts/exploration.md` template
4. Configure repository secrets: `ANTHROPIC_API_KEY`, `REPO_ACCESS_TOKEN`, `CALLBACK_SECRET`
5. Write tests for workflow execution (can use act or mock)

### Workflow Inputs

| Parameter | Description | Required |
|-----------|-------------|----------|
| `target_repo` | Repository to explore (`owner/repo`) | Yes |
| `idea` | The idea/feature being brainstormed | Yes |
| `callback_url` | ROSI webhook URL to POST results | Yes |
| `session_id` | Session ID for correlation | Yes |

### Callback POST Format

```typescript
interface ExplorationCallback {
  session_id: string;
  status: "success" | "error";
  exploration_context?: {
    project_overview: string;
    architecture_summary: string;
    relevant_patterns: string[];
    integration_points: string[];
    testing_approach: string;
    key_files: string[];
  };
  error?: { message: string; code: string; };
}
```

## Acceptance Criteria

- Repository created with proper workflow file
- Workflow triggers successfully via `workflow_dispatch`
- Claude Code CLI runs exploration and returns structured results
- Results POSTed to callback URL with proper authentication
- Timeout set to 10 minutes for workflow

_Requirements: 2.2, 2.3, 2.6_

## Issue Discussion

No comments on this issue.

## Codebase Context

### Design Architecture

The `regent-exploration-service` is a central GitHub repository that solves the ROSI 60-second timeout constraint. It hosts a GitHub Actions workflow that:

1. **Receives** `workflow_dispatch` triggers from the slackbot with these inputs:
   - `target_repo` - Repository to explore (owner/repo format)
   - `idea` - The feature/problem being brainstormed (used to focus analysis)
   - `callback_url` - ROSI webhook URL to POST results
   - `session_id` - Correlates results back to the session

2. **Executes** deep codebase exploration (1-3 minutes, no timeout constraints):
   - Clones the target repository
   - Installs Claude Code CLI globally
   - Runs exploration prompt through `claude --print`
   - Captures structured analysis results

3. **Reports** results back via webhook:
   - POSTs to the callback URL with `Authorization: Bearer {CALLBACK_SECRET}`
   - Includes `session_id`, `status` ("success"|"error"), and `exploration_context`
   - Enables slackbot to continue the Q&A flow with codebase context

### Requirements Context

**Requirement 2.2 - Deep Codebase Analysis:**
> WHEN exploring a repository THEN the system SHALL trigger a GitHub Actions workflow asynchronously to perform deep codebase analysis using Claude Code CLI; this exploration may take 1-3 minutes to complete.

**Requirement 2.3 - Webhook Results Processing:**
> WHEN the GitHub Actions exploration workflow completes THEN the system SHALL receive results via webhook callback and post a summary of findings (framework, patterns, relevant existing code) before asking the first question.

### Integration Points

The `SessionOrchestrator` initiates exploration during `/brainstorm` command handling:

1. **Session Creation**: Creates a session record via `SessionManager.createSession()`
2. **Trigger Check**: If `command.repository` is provided, calls `exploreRepositoryWithErrorHandling()`
3. **User Notification**: Posts "Exploring codebase... (this may take a few minutes)" to Slack
4. **Async Dispatch**: Calls `GitHubClient.exploreRepository()` which delegates to GitHub Actions

The slackbot receives results via webhook at `POST /webhook/exploration-complete`:
- Validates `Authorization: Bearer {CALLBACK_SECRET}` header
- Extracts `session_id`, `status`, `exploration_context`
- Calls `SessionOrchestrator.handleExplorationResult()`

### Files to Create (in this repo)

```
regent/
├── .github/
│   ├── workflows/
│   │   └── explore-codebase.yml          # GitHub Actions workflow definition
│   └── prompts/
│       └── exploration.md                 # Claude Code exploration prompt

# Secrets to configure in stickystyle/regent repo settings:
# - REPO_ACCESS_TOKEN: GitHub PAT with repo:read access to target repos
# - ANTHROPIC_API_KEY: Anthropic API key for Claude Code CLI
# - CALLBACK_SECRET: Shared secret for webhook authentication
```

### Workflow Structure

The `explore-codebase.yml` should:
1. **Trigger**: `workflow_dispatch` with four required inputs
2. **Environment Setup**:
   - Check out self (exploration-service repo)
   - Clone target repository using `REPO_ACCESS_TOKEN`
3. **Claude Code CLI Setup**:
   - Install Node.js
   - `npm install -g @anthropic-ai/claude-code`
4. **Run Exploration**:
   - Use `claude --print` with exploration.md prompt
   - Include `--context "Idea: {idea}"` to focus analysis
5. **Error Handling**:
   - Catch errors during clone, install, exploration
   - POST error response with status: "error" and error details
6. **Webhook Callback**:
   - Parse exploration results
   - POST to callback_url with Bearer token auth

### Exploration Prompt Template

The `prompts/exploration.md` should guide Claude Code to provide:
1. Project Overview - What is this project, frameworks, languages?
2. Architecture Summary - Key directories, entry points, main components
3. Relevant Patterns - Design patterns, conventions, abstractions
4. Integration Points - APIs, services, databases, external dependencies
5. Testing Approach - Test structure, frameworks, conventions

Output should match the `ExplorationCallback` interface.

### Key Design Decisions

1. **Separated Repository**: Standalone repo (not in monorepo) for:
   - Different deployment lifecycle
   - Can be shared across multiple Regent installations
   - Cleaner permission boundaries

2. **Webhook Callback Pattern**: Results POST back rather than polling:
   - Enables immediate continuation
   - Aligns with async pattern of GitHub Actions

3. **Claude Code CLI**: Uses `claude --print` rather than SDK:
   - Exploration is "run once, get results"
   - Simpler subprocess invocation in GitHub Actions

4. **Bearer Token Auth**: `Authorization: Bearer {CALLBACK_SECRET}`:
   - Simple shared secret model
   - CALLBACK_SECRET generated and shared between repos

---
*Branch: feature/regent-slack-bot*
*Generated at execution time by Regent*
