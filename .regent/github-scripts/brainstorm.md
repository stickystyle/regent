# GitHub Integration Scripts for Regent Plugin

## Problem Statement

Claude Code agents and commands in the regent plugin currently interact with GitHub by constructing `gh` CLI commands directly in their prompts. This causes two problems:

1. **LLM Hallucination**: The LLM occasionally gets `gh` CLI syntax wrong (especially complex `gh api` calls), causing command failures
2. **Prompt Bloat**: Commands and agents must include detailed instructions about `gh` CLI usage, consuming tokens and adding maintenance burden

The regent plugin's `create-issue` and `execute-issue` commands are the primary affected parties, as they perform complex GitHub operations including issue creation, label management, dependency tracking, and pull request management.

## Goals

- Provide deterministic, simplified interfaces for GitHub operations
- Eliminate LLM hallucination on `gh` CLI syntax
- Reduce prompt bloat by replacing detailed `gh` CLI instructions with concise script documentation
- Standardize JSON output format for consistent, easy parsing
- Maintain token efficiency through minimal, structured responses

## Non-Goals

- **Not replacing `git` operations** - Only wrapping `gh` CLI commands, not `git` commands
- **Not user-facing utilities** - Scripts are exclusively for LLM consumption, not human use
- **No debug/verbose modes** - No `--help` flags or debug output (documentation lives in skills/prompts)
- **No automated testing initially** - Validation through dogfooding in actual plugin usage
- **Not a complete rewrite** - Incremental migration starting with `create-issue` and `execute-issue`

## User Personas

### Claude Code LLM
- **Role**: AI agent executing regent plugin commands
- **Technical Level**: Expert at following precise instructions, but prone to syntax hallucination on complex CLI
- **Needs**: Simple, consistent interfaces with predictable JSON output
- **Pain Points**: Complex `gh api` syntax, multi-step operations, verbose output parsing

### Regent Plugin Commands
- **Role**: Command orchestrators (`create-issue.md`, `execute-issue.md`)
- **Technical Level**: Defined through markdown prompt engineering
- **Needs**: Reliable GitHub operations without bloated inline `gh` documentation
- **Pain Points**: Maintaining detailed `gh` CLI usage examples, handling errors from malformed commands

### Plugin Developers (Ryan)
- **Role**: Maintains and extends regent plugin
- **Technical Level**: Expert
- **Needs**: Easy-to-understand script interfaces, minimal maintenance
- **Pain Points**: Debugging LLM hallucinations, keeping `gh` documentation current across commands

## Use Cases

### UC1: Create GitHub Issue with Labels
- **Actor**: Claude Code (via `create-issue` command)
- **Trigger**: User runs `/regent:create-issue {N}` for a task
- **Flow**:
  1. Script validates required arguments (`--title`, `--body`, `--label`)
  2. Constructs `gh issue create` command with proper flags
  3. Executes command and captures output
  4. Parses response and returns JSON with issue number and URL
- **Outcome**: `{"number": 42, "url": "https://github.com/owner/repo/issues/42"}`
- **Error Cases**:
  - Missing required argument: `{"error": "missing required --title", "code": "missing_argument"}`
  - Invalid label format: `{"error": "label cannot contain spaces", "code": "validation_failed"}`
  - `gh` command failure: `{"error": "authentication required", "code": "gh_error"}`

### UC2: Set Issue Blocker Dependencies
- **Actor**: Claude Code (via `create-issue` command)
- **Trigger**: Creating sequential tasks where Task N is blocked by Task N-1
- **Flow**:
  1. Script receives `--issue {N}` and `--blocker {N-1}`
  2. Calls `gh api repos/:owner/:repo/issues/{blocker}` to get blocker's internal ID
  3. Calls `gh api -X POST repos/:owner/:repo/issues/{issue}/dependencies/blocked_by` with JSON body
  4. Returns success confirmation
- **Outcome**: `{"issue": 42, "blocker": 41, "status": "set"}`
- **Error Cases**:
  - Blocker issue doesn't exist: `{"error": "blocker issue 41 not found", "code": "not_found"}`
  - API call fails: `{"error": "failed to set dependency", "code": "api_error"}`

### UC3: Create Pull Request with Formatted Body
- **Actor**: Claude Code (via `execute-issue` command)
- **Trigger**: First task in spec completes, needs to create draft PR
- **Flow**:
  1. Script receives `--title`, `--body` (multi-line), and `--draft` flag
  2. Validates inputs and constructs `gh pr create` command
  3. Handles multi-line body content properly (heredoc or escaping)
  4. Returns PR number and URL
- **Outcome**: `{"number": 15, "url": "https://github.com/owner/repo/pull/15", "state": "draft"}`
- **Error Cases**:
  - PR already exists: `{"error": "PR already exists for this branch", "code": "already_exists"}`
  - No commits to base: `{"error": "no commits between base and head", "code": "no_changes"}`

### UC4: Update PR Body (Check Off Task)
- **Actor**: Claude Code (via `execute-issue` command)
- **Trigger**: Task completes, need to update PR checklist
- **Flow**:
  1. First calls `gh-pr-view.sh {N} --json body` to get current body
  2. LLM modifies body content (updates checklist)
  3. Calls `gh-pr-edit.sh {N} --body "{updated}"` to save changes
  4. Returns confirmation
- **Outcome**: `{"number": 15, "updated": true}`
- **Error Cases**:
  - PR not found: `{"error": "PR 15 not found", "code": "not_found"}`

### UC5: List PRs for Feature Branch
- **Actor**: Claude Code (via `execute-issue` command)
- **Trigger**: Need to check if PR already exists for `feature/{spec-name}`
- **Flow**:
  1. Script receives `--head "feature/spec-name"` and `--state open`
  2. Calls `gh pr list` with filters
  3. Returns array of matching PRs (or empty array)
- **Outcome**: `{"prs": [{"number": 15, "title": "Spec Title", "state": "draft"}]}`
- **Error Cases**: `{"prs": []}` (no errors, empty result is valid)

## Technical Context

### Existing Systems
- **gh CLI**: GitHub's official CLI tool (required dependency)
- **git**: Repository operations (not being replaced)
- **Regent Plugin**: Claude Code plugin for spec-driven development
  - `plugin/commands/create-issue.md` - Orchestrates issue creation workflow
  - `plugin/commands/execute-issue.md` - Orchestrates task execution and PR management
  - `plugin/agents/` - Specialized agents (not currently using `gh` directly)

### Technology Stack
- **Language**: Bash (ubiquitous on macOS/Linux)
- **Dependencies**: `gh` CLI (wraps it, doesn't replace)
- **Output Format**: JSON to stdout
- **Error Handling**: Non-zero exit codes + JSON error messages

### Repository Structure
```
plugin/
  scripts/           # New directory for GitHub wrapper scripts
    gh-repo-view.sh
    gh-label-create.sh
    gh-issue-create.sh
    gh-issue-view.sh
    gh-issue-close.sh
    gh-pr-list.sh
    gh-pr-create.sh
    gh-pr-view.sh
    gh-pr-edit.sh
    gh-pr-comment.sh
    gh-pr-ready.sh
    gh-api-set-blocker.sh
    gh-api.sh
  commands/          # Existing commands (will be updated)
  agents/            # Existing agents
```

### Scale Expectations
- **Usage**: One-off operations during spec development workflow
- **Performance**: Not critical (human-in-loop workflow)
- **Concurrency**: Single-threaded, sequential operations

## Constraints

### Technical Constraints
- **Must wrap `gh` CLI exclusively** - No direct GitHub API calls, leverage existing `gh` auth and repo detection
- **JSON output to stdout only** - Every script returns JSON (success or error)
- **Non-zero exit codes for errors** - Follow Unix conventions while maintaining JSON output
- **Repository context from git remote** - Scripts assume `gh` detects repo from current directory
- **Pre-flight validation required** - Validate inputs before calling `gh` to avoid confusing error messages
- **Standalone scripts** - No shared library/common.sh, each script is self-contained

### Business Constraints
- **Incremental migration** - Start with `create-issue` and `execute-issue` only
- **Dogfooding validation** - No automated tests initially, fix issues through real usage
- **Minimal documentation** - Inline in command prompts, no `--help` flags

### Development Constraints
- **No new dependencies** - Just bash and `gh` (already required)
- **No build step** - Scripts are executable bash files
- **Backward compatibility not required** - New scripts, not replacing existing interfaces

## Assumptions

### Environment Assumptions
- `gh` CLI is installed and available on PATH
- User is authenticated with `gh` (via `gh auth login`)
- Scripts are executed in a git repository with a GitHub remote
- Bash is available (macOS/Linux default)

### Workflow Assumptions
- Scripts are called by Claude Code LLM, not humans directly
- Repository context is always current working directory
- Errors will be surfaced to LLM for handling (retry, ask user, abort)
- Multi-line input (bodies, comments) will be properly escaped by LLM

### Migration Assumptions
- Only `create-issue.md` and `execute-issue.md` will be updated initially
- Other commands continue using direct `gh` calls
- Future migration can happen incrementally as needed

## Success Criteria

### Implementation Complete
- [ ] All 13 scripts implemented and executable in `plugin/scripts/`
- [ ] Each script validates required arguments before calling `gh`
- [ ] Each script returns JSON to stdout (success or error)
- [ ] Each script uses proper exit codes (0 for success, non-zero for errors)

### Documentation Complete
- [ ] `create-issue.md` updated with inline script documentation
- [ ] `execute-issue.md` updated with inline script documentation
- [ ] Script usage examples included for each operation in commands

### Migration Complete
- [ ] `create-issue.md` uses all relevant scripts (no direct `gh` calls)
- [ ] `execute-issue.md` uses all relevant scripts (no direct `gh` calls)
- [ ] Commands are shorter/simpler than before (prompt bloat reduced)

### Validation Complete
- [ ] Successfully created issue via `create-issue` command using scripts
- [ ] Successfully set blocker dependency using `gh-api-set-blocker.sh`
- [ ] Successfully created PR via `execute-issue` command using scripts
- [ ] Successfully updated PR body to check off completed tasks
- [ ] No LLM hallucination errors on GitHub operations during dogfooding

### Quality Metrics
- [ ] Prompt size reduction: Commands using scripts are at least 20% shorter
- [ ] Error clarity: LLM can distinguish script validation errors from `gh` errors
- [ ] Token efficiency: JSON responses contain only essential fields

## Script Specifications

### Simple Operations (Mirror Current Usage)

#### 1. gh-repo-view.sh
**Purpose**: Get repository information
**Usage**: `gh-repo-view.sh [--json FIELDS]`
**Output**: `{"url": "https://github.com/owner/repo", "defaultBranch": "main"}`
**Current equivalent**: `gh repo view --json url,defaultBranchRef --jq '...'`

#### 2. gh-label-create.sh
**Purpose**: Create label (idempotent)
**Usage**: `gh-label-create.sh --name NAME --description DESC --color COLOR [--force]`
**Output**: `{"name": "regent", "color": "6f42c1", "description": "Managed by Regent"}`
**Validation**: Color must be 6-char hex (no # prefix), name cannot contain spaces
**Current equivalent**: `gh label create "regent" --description "..." --color "6f42c1" --force`

#### 3. gh-issue-create.sh
**Purpose**: Create issue
**Usage**: `gh-issue-create.sh --title TITLE --body BODY --label LABEL [--label LABEL ...]`
**Output**: `{"number": 42, "url": "https://github.com/owner/repo/issues/42"}`
**Validation**: Title and body required, at least one label recommended
**Current equivalent**: `gh issue create --title "..." --body "..." --label "regent" --label "spec:foo"`

#### 4. gh-issue-view.sh
**Purpose**: Get issue details
**Usage**: `gh-issue-view.sh NUMBER [--json FIELDS]`
**Output**: `{"number": 42, "title": "Task 1: ...", "body": "...", "labels": ["regent", "spec:foo"]}`
**Current equivalent**: `gh issue view 42 --json number,title,body,labels`

#### 5. gh-issue-close.sh
**Purpose**: Close issue with comment
**Usage**: `gh-issue-close.sh NUMBER --comment COMMENT`
**Output**: `{"number": 42, "state": "closed"}`
**Validation**: Number required, comment required
**Current equivalent**: `gh issue close 42 --comment "✅ Task completed..."`

#### 6. gh-pr-list.sh
**Purpose**: List pull requests
**Usage**: `gh-pr-list.sh [--head BRANCH] [--state STATE]`
**Output**: `{"prs": [{"number": 15, "title": "...", "state": "draft"}]}`
**Current equivalent**: `gh pr list --head "feature/foo" --state open --json number --jq '.[0].number'`

#### 7. gh-pr-create.sh
**Purpose**: Create pull request
**Usage**: `gh-pr-create.sh --title TITLE --body BODY [--draft]`
**Output**: `{"number": 15, "url": "https://github.com/owner/repo/pull/15", "state": "draft"}`
**Validation**: Title and body required
**Current equivalent**: `gh pr create --title "..." --body "$(cat <<'EOF' ... EOF)" --draft`

#### 8. gh-pr-view.sh
**Purpose**: Get PR details
**Usage**: `gh-pr-view.sh NUMBER [--json FIELDS]`
**Output**: `{"number": 15, "title": "...", "body": "...", "state": "draft"}`
**Current equivalent**: `gh pr view 15 --json body --jq '.body'`

#### 9. gh-pr-edit.sh
**Purpose**: Edit PR (typically body updates)
**Usage**: `gh-pr-edit.sh NUMBER --body BODY`
**Output**: `{"number": 15, "updated": true}`
**Current equivalent**: `gh pr edit 15 --body "..."`

#### 10. gh-pr-comment.sh
**Purpose**: Add comment to PR
**Usage**: `gh-pr-comment.sh NUMBER --body COMMENT`
**Output**: `{"number": 15, "comment_id": 123456}`
**Current equivalent**: `gh pr comment 15 --body "✅ **Task 1 complete**: ..."`

#### 11. gh-pr-ready.sh
**Purpose**: Mark draft PR as ready for review
**Usage**: `gh-pr-ready.sh NUMBER`
**Output**: `{"number": 15, "state": "open"}`
**Current equivalent**: `gh pr ready 15`

### Complex Operations (Simplified Interfaces)

#### 12. gh-api-set-blocker.sh
**Purpose**: Set issue blocking dependency (wraps 2-step API call)
**Usage**: `gh-api-set-blocker.sh --issue NUMBER --blocker NUMBER`
**Output**: `{"issue": 42, "blocker": 41, "status": "set"}`
**Current equivalent**:
```bash
BLOCKER_ID=$(gh api repos/:owner/:repo/issues/41 --jq '.id')
gh api -X POST repos/:owner/:repo/issues/42/dependencies/blocked_by --input - <<< "{\"issue_id\":${BLOCKER_ID}}"
```

#### 13. gh-api.sh
**Purpose**: General-purpose API wrapper for other cases
**Usage**: `gh-api.sh METHOD ENDPOINT [--input JSON]`
**Output**: `{...}` (raw API response)
**Example**: `gh-api.sh GET repos/:owner/:repo/issues/42`
**Current equivalent**: `gh api repos/:owner/:repo/issues/42 --jq '.id'`

## Error Handling

### Error Response Format
All errors return JSON to stdout with non-zero exit code:
```json
{
  "error": "human-readable error message",
  "code": "machine_readable_error_code"
}
```

### Error Code Conventions
- `missing_argument` - Required argument not provided
- `validation_failed` - Input validation failed (format, constraints)
- `gh_error` - Error from `gh` CLI itself
- `not_found` - Resource doesn't exist (issue, PR, repo)
- `already_exists` - Resource already exists (duplicate creation)
- `api_error` - GitHub API call failed
- `auth_error` - Authentication/permission issue

### Validation Rules
Scripts perform pre-flight validation:
1. **Required arguments**: Check all required flags are present
2. **Format validation**:
   - Label names: No spaces
   - Colors: 6-char hex without # prefix
   - Numbers: Positive integers
3. **Mutual exclusivity**: If applicable (e.g., `--body` vs `--body-file`)

### Error Message Quality
- **Be specific**: "missing required --title" not "invalid arguments"
- **Be actionable**: "label cannot contain spaces" not "invalid label"
- **Preserve `gh` errors**: If `gh` fails, include its message in error field

## Migration Plan

### Phase 1: Implementation (Week 1)
1. Create `plugin/scripts/` directory
2. Implement all 13 scripts with validation and JSON output
3. Manual testing of each script in isolation

### Phase 2: Documentation (Week 1)
1. Update `create-issue.md` with inline script documentation
2. Update `execute-issue.md` with inline script documentation
3. Add usage examples for each script used

### Phase 3: Migration (Week 1-2)
1. Update `create-issue.md` to use scripts (replace all `gh` calls)
2. Update `execute-issue.md` to use scripts (replace all `gh` calls)
3. Remove old `gh` CLI instructions from command prompts

### Phase 4: Dogfooding (Week 2+)
1. Use updated commands in real spec development
2. Identify and fix issues as they arise
3. Refine error messages and validation based on LLM behavior

### Phase 5: Future Migration (TBD)
1. Consider migrating other commands if they start using `gh`
2. Consider adding more specialized scripts if patterns emerge

## Open Questions

_None - all questions resolved during brainstorming session._

## References

- Current implementation: `plugin/commands/create-issue.md`
- Current implementation: `plugin/commands/execute-issue.md`
- GitHub CLI documentation: https://cli.github.com/manual/
- Regent plugin structure: `CLAUDE.md` in repo root
