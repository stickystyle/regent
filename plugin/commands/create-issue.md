---
description: Create a GitHub issue for the next task from tasks.md
---

# Create GitHub Issue

Create a GitHub issue from the next incomplete task, containing only spec-derived content (no stale code references).

## Prerequisites

1. Check that `.regent/` directory exists
2. Find the spec to work on:
   - If only one spec directory exists in `.regent/`, use it
   - If multiple exist, use the most recently modified (check file timestamps)
   - If ambiguous, ask the user which spec to work on
3. Verify `tasks.md` exists in `.regent/{spec-name}/`
   - If not, tell user to run `/regent:plan` first
4. Verify this is a Git repository with a GitHub remote
   - Run `gh repo view` to confirm

## Phase 1: Find Next Task and Epic

1. Read `.regent/{spec-name}/tasks.md`
2. Extract the epic issue number from the header (line starting with `Epic: #`)
   - If no epic found, tell user to run `/regent:plan` first (epic should have been created)
3. Find the first unchecked task: `- [ ]` that does NOT already have an issue link (e.g., `(#42)`)
4. If all tasks are complete or have issues, inform the user

## Phase 2: Get Repository Info

Get the GitHub repo URL for constructing spec file links:

```bash
gh repo view --json url,defaultBranchRef --jq '"\(.url) \(.defaultBranchRef.name)"'
```

This gives you the base URL and default branch (e.g., `https://github.com/owner/repo main`).

Construct spec file URLs:
- `{repo-url}/blob/{branch}/.regent/{spec-name}/requirements.md`
- `{repo-url}/blob/{branch}/.regent/{spec-name}/design.md`
- `{repo-url}/blob/{branch}/.regent/{spec-name}/tasks.md`

## Phase 3: Ensure Labels Exist

Before creating any issues, ensure the required labels exist. This happens once per command invocation:

```bash
gh label create "regent" --description "Managed by Regent" --color "6f42c1" --force
gh label create "spec:{spec-name}" --description "Spec: {spec-name}" --color "0366d6" --force
```

Note: The `--force` flag ensures this is idempotent (won't fail if labels already exist).

## Phase 4: Find Blocker Issue (If Applicable)

Before creating the issue, determine if this task should be blocked by the previous task:

1. If this is Task 1, there's no blocker
2. Otherwise, find the previous task's GitHub issue number:
   ```bash
   PREV_TASK_NUM=$((N - 1))
   BLOCKER_ISSUE=$(grep "^- \[.\] ${PREV_TASK_NUM}\." .regent/{spec-name}/tasks.md | grep -o "#[0-9]\+" | tr -d '#')
   ```

3. If `BLOCKER_ISSUE` is found, you'll use it in the next phase
4. Note: The epic issue number was extracted in Phase 1

## Phase 5: Extract Brief and Create Issue (REQUIRED - Use Subagent)

**Important**: Use a subagent to both extract the brief AND create the GitHub issue. This keeps your main context clean and is especially important when creating issues in bulk.

Use the Task tool with these parameters:

```
subagent_type: "general-purpose"
model: "sonnet"
description: "Extract brief and create issue"
prompt: |
  You are a specification parser and GitHub issue creator. Read implementation specs, extract a focused brief, and create a GitHub issue as a sub-issue of the epic.

  IMPORTANT: Do NOT read source code files. Only read spec files. This keeps the issue content stable.

  ## Spec File URLs (for linking in the issue)

  - requirements_url: {requirements_url}
  - design_url: {design_url}
  - tasks_url: {tasks_url}

  ## Task Metadata

  - task_number: {N}
  - epic_issue: {EPIC_ISSUE}
  - blocker_issue: {BLOCKER_ISSUE or "none"}

  ## Your Tasks

  1. Read spec files and extract the brief
  2. Create the GitHub issue with the brief
  3. Return the issue number

  ## Files to Read

  Read these files from .regent/{spec-name}/:
  1. tasks.md
  2. requirements.md
  3. design.md

  ## Extraction Steps

  1. **Find the target task**: Task number {N} in tasks.md.

  2. **Parse requirement references**: Tasks have references like `_Requirements: 5.3, 8.1_`. This notation means:
     - "5.3" = Requirement 5, Acceptance Criterion 3
     - "8.1" = Requirement 8, Acceptance Criterion 1
     Parse these correctly - they are NOT decimal numbers.

  3. **Extract requirements verbatim**: For each referenced requirement, extract the EXACT text of:
     - The requirement's user story
     - The specific acceptance criterion(s) referenced

  4. **Find relevant design context**: Based on the task description and requirements, extract:
     - Relevant component interfaces (code blocks)
     - Related "Correctness Properties" from the design doc
     - Error handling patterns if applicable
     - Any data models or schemas mentioned

  5. **Analyze task type**: Determine the task type:
     - test-first: TDD task where tests are written before implementation
     - implementation: Building functionality (includes tests as part of TDD workflow)
     - infrastructure: Setup, config, tooling tasks

  ## Brief Format

  Create the brief in this exact markdown format:

  ---
  ## Overview

  **Type**: {test-first | implementation | infrastructure}

  {task description and bullet points from tasks.md}

  📋 **Spec Files**: [requirements]({requirements_url}) • [design]({design_url}) • [tasks]({tasks_url})

  ## Requirements

  > 📄 *Full requirements: [{spec-name}/requirements.md]({requirements_url})*

  ### Requirement {X}: {title}
  **User Story:** {exact user story text}

  **Acceptance Criteria:**
  > {criterion number}. {exact criterion text, quoted}

  [Repeat for each referenced requirement]

  ## Design Context

  > 📄 *Full design: [{spec-name}/design.md]({design_url})*

  ### Interfaces
  {relevant code blocks from design.md}

  ### Correctness Properties
  {list relevant properties with their numbers and text}

  ### Error Handling
  {any relevant error patterns from design.md}

  ### Data Models
  {relevant models from design.md if applicable}

  ## Implementation Guidance

  {Any specific guidance from design.md relevant to this task}
  {For test tasks: note what behavior to test and expected failure modes}
  {For implementation tasks: note what functionality to build}

  ---
  *Generated by [Regent](https://github.com/stickystyle/regent) • Spec: {spec-name}*
  ---

  ## Creating the GitHub Issue

  After extracting the brief, create the GitHub issue using the brief you extracted:

  ```bash
  NEW_ISSUE=$(gh issue create \
    --title "{task title}" \
    --body "{the brief you created above}" \
    --label "regent" \
    --label "spec:{spec-name}" \
    | grep -o '[0-9]\+$')
  ```

  This captures the new issue number (e.g., "42").

  **IMPORTANT**: The title should be just the task title (e.g., "Implement SessionManager with Slack Datastore"), NOT prefixed with "Task N:".

  ## Linking as Sub-Issue of Epic

  Link the new issue as a sub-issue of the epic:

  ```bash
  # Get the node IDs for both issues
  EPIC_NODE_ID=$(gh api repos/:owner/:repo/issues/{epic_issue} --jq '.node_id')
  NEW_NODE_ID=$(gh api repos/:owner/:repo/issues/${NEW_ISSUE} --jq '.node_id')

  # Link as sub-issue using GraphQL
  gh api graphql -f query='
    mutation {
      addSubIssue(input: {issueId: "'"${EPIC_NODE_ID}"'", subIssueId: "'"${NEW_NODE_ID}"'"}) {
        issue { number }
        subIssue { number }
      }
    }
  '
  ```

  ## Setting the Blocker Dependency (If Applicable)

  If blocker_issue has a value (not "none"), set the dependency using the GitHub REST API:

  1. First, get the issue ID of the blocker issue:
     ```bash
     BLOCKER_ID=$(gh api repos/:owner/:repo/issues/{blocker_issue} --jq '.id')
     ```

  2. Then, set the dependency (NEW_ISSUE is blocked by BLOCKER_ISSUE):
     ```bash
     gh api -X POST repos/:owner/:repo/issues/${NEW_ISSUE}/dependencies/blocked_by \
       --input - <<< "{\"issue_id\":${BLOCKER_ID}}"
     ```

  Return the issue number (the value of NEW_ISSUE)

  ## Important Rules
  - Extract text VERBATIM - do not summarize or paraphrase requirements
  - Include ALL referenced requirements, not just some
  - Do NOT read source code files - only spec files
  - Do NOT include implementation details like file paths or current function signatures
  - Keep the brief focused on WHAT to build, not HOW (that comes at execution time)
  - CREATE THE ISSUE - don't just extract the brief and return it to the main context
  - Return only the issue number (e.g., "42") so the main context can update tasks.md
```

## Phase 6: Update tasks.md

1. The subagent will return the issue number (e.g., "42")

2. Add the issue link to the task line in `tasks.md`:
   - Before: `- [ ] 1. Task title`
   - After: `- [ ] 1. Task title (#42)`

3. Report to user:
   ```
   Created issue #{issue-number}: {title}
   URL: https://github.com/{owner}/{repo}/issues/{issue-number}

   Epic: #{epic-issue-number}
   Labels: regent, spec:{spec-name}
   {If blocker exists: "Blocked by: #{blocker-issue-number}"}

   Run /regent:create-issue to create the next issue, or
   Run /regent:execute-issue {issue-number} to implement this task.
   ```

## Notes

- Issues contain only spec-derived content (requirements, design, properties)
- No source code references that could become stale
- Both LLM and human developers can work from these issues
- Codebase exploration happens at execution time via `/regent:execute-issue`
- **Issue dependencies**: Task N is automatically marked as blocked by Task N-1 (if N-1 has an issue), enforcing the sequential order from tasks.md using GitHub's native dependency feature
