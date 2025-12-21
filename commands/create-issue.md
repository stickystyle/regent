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

## Phase 1: Find Next Task

1. Read `.regent/{spec-name}/tasks.md`
2. Find the first unchecked task: `- [ ]` that does NOT already have an issue link (e.g., `(#42)`)
3. If all tasks are complete or have issues, inform the user

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

## Phase 3: Extract Spec-Only Brief (REQUIRED - Use Subagent)

**Important**: Use a subagent to extract the brief. This keeps your main context clean.

Use the Task tool with these parameters:

```
subagent_type: "general-purpose"
model: "sonnet"
description: "Extract spec brief for issue"
prompt: |
  You are a specification parser. Read implementation specs and extract a focused brief for creating a GitHub issue.

  IMPORTANT: Do NOT read source code files. Only read spec files. This keeps the issue content stable.

  ## Spec File URLs (for linking in the issue)

  - requirements_url: {requirements_url}
  - design_url: {design_url}
  - tasks_url: {tasks_url}

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

  5. **Identify task relationships**: Note which prior tasks this depends on and which later tasks depend on it.

  6. **Analyze task type**: Determine the task type:
     - If this is a TEST task: note which later task implements the feature being tested
     - If this is an IMPLEMENTATION task: note which earlier test task this should make pass

  ## Output Format

  You will be given these spec file URLs to include in the output:
  - requirements_url: GitHub URL to requirements.md
  - design_url: GitHub URL to design.md
  - tasks_url: GitHub URL to tasks.md

  Return the brief in this exact markdown format:

  ---
  ## Overview

  **Task {N}**: {task title from tasks.md}
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

  ## Task Relationships

  > 📄 *All tasks: [{spec-name}/tasks.md]({tasks_url})*

  - **Depends on**: {prior task numbers, if any}
  - **Blocks**: {later task numbers that depend on this, if any}
  - **TDD pair**: {e.g., "Task 29 implements the feature this test validates"}

  ## Implementation Guidance

  {Any specific guidance from design.md relevant to this task}
  {For test tasks: note what behavior to test and expected failure modes}
  {For implementation tasks: note which tests should pass after}

  ---
  *Generated by [Regent](https://github.com/anthropics/regent) • Spec: {spec-name}*
  ---

  ## Important Rules
  - Extract text VERBATIM - do not summarize or paraphrase requirements
  - Include ALL referenced requirements, not just some
  - Do NOT read source code files - only spec files
  - Do NOT include implementation details like file paths or current function signatures
  - Keep the brief focused on WHAT to build, not HOW (that comes at execution time)
```

## Phase 4: Create GitHub Issue

1. Create the issue:
   ```bash
   gh issue create \
     --title "Task {N}: {task title}" \
     --body "{brief from subagent}" \
     --label "regent" \
     --label "spec:{spec-name}"
   ```

2. Capture the issue number from the output

3. If labels don't exist, create them first:
   ```bash
   gh label create "regent" --description "Managed by Regent" --color "6f42c1" --force
   gh label create "spec:{spec-name}" --description "Spec: {spec-name}" --color "0366d6" --force
   ```

## Phase 5: Update tasks.md

1. Add the issue link to the task line in `tasks.md`:
   - Before: `- [ ] 1. Task title`
   - After: `- [ ] 1. Task title (#42)`

2. Report to user:
   ```
   Created issue #{N}: Task {X}: {title}
   URL: {issue URL}

   Labels: regent, spec:{spec-name}

   Run /regent:create-issue to create the next issue, or
   Run /regent:execute-issue {N} to implement this task.
   ```

## Notes

- Issues contain only spec-derived content (requirements, design, properties)
- No source code references that could become stale
- Both LLM and human developers can work from these issues
- Codebase exploration happens at execution time via `/regent:execute-issue`
