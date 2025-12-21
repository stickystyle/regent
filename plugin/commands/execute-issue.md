---
description: Implement a task from a GitHub issue
---

# Execute Issue

Implement a task from a GitHub issue, exploring the codebase fresh and creating a PR.

## Usage

```
/regent:execute-issue {issue-number}
/regent:execute-issue {issue-url}
```

## Prerequisites

1. Verify this is a Git repository with a GitHub remote
2. Parse the issue number from the argument
3. Fetch the issue and validate it has the `regent` label

## Phase 1: Fetch Issue Context

1. Get issue details:
   ```bash
   gh issue view {N} --json number,title,body,labels
   ```

2. Parse the spec name from labels (find label matching `spec:*`)

3. If no `regent` label, warn user this may not be a Regent-managed issue

4. Verify `.regent/{spec-name}/` exists locally
   - If not, ask user if they want to proceed anyway

## Phase 2: Branch Setup

1. Ensure working directory is clean:
   ```bash
   git status --porcelain
   ```
   - If dirty, ask user to commit or stash changes

2. Fetch latest from remote:
   ```bash
   git fetch origin
   ```

3. Create and checkout branch from main/master:
   ```bash
   git checkout -b {spec-name}/task-{N} origin/main
   ```
   - Or `origin/master` if that's the default branch

4. Link branch to issue (development branch):
   ```bash
   gh api graphql -f query='
     mutation {
       createLinkedBranch(input: {
         issueId: "{issue-node-id}",
         name: "{spec-name}/task-{N}",
         oid: "{current-commit-sha}"
       }) {
         linkedBranch { id }
       }
     }
   '
   ```
   - Note: This may fail if the repo doesn't support linked branches; that's okay, continue anyway

## Phase 3: Explore Codebase (REQUIRED - Use Subagent)

**Important**: NOW we explore the codebase to get fresh, current references.

Use the Task tool with these parameters:

```
subagent_type: "Explore"
description: "Explore codebase for task {N}"
prompt: |
  Explore the codebase to gather current implementation context for this task.

  ## Task Context (from GitHub Issue)

  {paste the issue body here}

  ## What to Find

  1. **Current implementation state**: For files this task will modify or test:
     - Read the actual source files
     - Document current function signatures
     - Note current error handling (or lack thereof)
     - Identify integration points with other components

  2. **Test patterns**: If this is a test task:
     - Search for similar existing tests in the project
     - Identify the most relevant test file to use as a pattern
     - Extract key structural patterns (fixtures, parameterization, assertion styles)

  3. **Related code**: Find code that:
     - Implements similar functionality
     - Will be called by or call the new code
     - Uses the same patterns we need to follow

  4. **Project conventions**: Note:
     - Import patterns
     - Error handling patterns
     - Logging patterns
     - Type annotation style

  ## Output Format

  Return a "Codebase Context" document with:

  ### Current Implementation State
  [Relevant code snippets from actual source files]
  - Function signatures that will be tested/modified
  - Current error handling patterns (or note their absence)
  - Integration points

  ### Test Template Reference (for test tasks)
  - **Similar Test File**: [path]
  - **Key Patterns**: [fixtures, parameterization, assertions]
  - **Code Example**: [representative snippet]

  ### Project Conventions
  - Import style: [observations]
  - Error handling: [patterns]
  - Type hints: [style]

  ### Files to Modify
  - [file path]: [what changes needed]

  ### Files to Reference
  - [file path]: [why relevant]
```

## Phase 4: Create Local Brief

Combine the issue content with codebase exploration into a full task brief.

1. Create briefs directory if needed: `.regent/{spec-name}/briefs/`

2. Save to `.regent/{spec-name}/briefs/task-{N}.md`:
   ```markdown
   # Task Brief

   ## From Issue #{N}

   {issue body content}

   ## Codebase Context

   {output from Explore subagent}

   ---
   *Branch: {spec-name}/task-{N}*
   *Generated at execution time by Regent*
   ```

3. Present the combined brief to the user

Ask: "Ready to proceed with Task {N}: {Title}?"

Wait for confirmation before continuing.

## Phase 5: Implementation

On confirmation, implement the task using specialized agents.

**Important**: When invoking agents, tell them to read `.regent/{spec-name}/briefs/task-{N}.md` for full context.

### Selecting the Right Agent

| Task Type | Agent |
|-----------|-------|
| Python backend code | regent-python-engineer |
| AWS CDK infrastructure | regent-cdk-architect |
| Test writing | regent-test-engineer |
| Code review (after significant changes) | regent-code-reviewer |

### For Test Tasks

1. Write the test file following project conventions
2. Use patterns from the Template Reference section of the brief
3. Run the test to confirm it fails (TDD red phase)
4. If the test passes unexpectedly, investigate

### For Implementation Tasks

1. Implement the code following the interfaces from design.md exactly
2. Run related tests to verify (TDD green phase)
3. Refactor if needed while keeping tests green

### Implementation Guidelines

- Follow existing code patterns in the project
- Use the interfaces exactly as defined in the issue's Design Context
- Add appropriate error handling
- Include docstrings and type hints
- Keep changes focused on the single task

## Phase 6: Code Review (REQUIRED)

After implementation, you MUST run the code-reviewer agent.

### Code Review Loop

1. **Invoke the code-reviewer agent**:
   - Use the Task tool with `subagent_type: "regent-code-reviewer"`
   - Tell it to review the changes made for Task {N}
   - Point it to `.regent/{spec-name}/briefs/task-{N}.md` for context

2. **Evaluate the review results**:
   - If the review passes → proceed to Phase 7
   - If issues identified → fix with the same implementation agent, then re-review

## Phase 7: Verification

After code review passes:

1. Run all related tests
2. Check for linting/type errors
3. Review the changes against the requirements from the brief

If tests fail:
- Analyze the failure
- Fix the issue (using the same implementation agent)
- Re-run code review if changes were significant
- Re-run tests

## Phase 8: Mark Complete and Commit

Once verified:

1. Update `tasks.md`: Change `- [ ]` to `- [x]` for this task

2. Stage and commit all changes:
   ```bash
   git add -A
   git commit -m "feat({spec-name}): implement task {N} - {title}

   {brief summary of changes}

   Closes #{issue-number}"
   ```

3. Push the branch:
   ```bash
   git push -u origin {spec-name}/task-{N}
   ```

## Phase 9: Create Pull Request

1. Create the PR:
   ```bash
   gh pr create \
     --title "Task {N}: {title}" \
     --body "$(cat <<'EOF'
   ## Summary

   {summary of what was implemented}

   ## Changes

   - {file1}: {what changed}
   - {file2}: {what changed}

   ## Testing

   - {test results summary}
   - All tests passing: {yes/no}

   ## Requirements Satisfied

   {list the requirement references from the issue}

   ---
   Closes #{issue-number}

   *Implemented via Regent*
   EOF
   )"
   ```

2. Report to user:
   ```
   Task {N} complete: {title}

   Branch: {spec-name}/task-{N}
   PR: {pr-url}
   Closes: #{issue-number}

   Changes:
   - {file1}: {what changed}
   - {file2}: {what changed}

   Tests: {X passing}

   The PR is ready for review and merge.
   ```

## Principles

- **Fresh context**: Codebase is explored at execution time, not planning time
- **Clean Git workflow**: Branch per task, PR for review
- **Traceability**: Issue → Branch → PR → Merge
- **TDD**: Tests first, then implementation

## If Unclear

Ask the user before implementing. Do not make assumptions about:
- Security-critical behavior
- Data validation requirements
- Error handling strategies
- Integration with external systems
