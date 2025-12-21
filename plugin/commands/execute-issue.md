---
description: Implement a task from a GitHub issue
---

# Execute Issue

Implement a task from a GitHub issue, working on a shared feature branch with a single PR for the spec.

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

## Phase 2: Feature Branch Setup

1. Ensure working directory is clean:
   ```bash
   git status --porcelain
   ```
   - If dirty, ask user to commit or stash changes

2. Fetch latest from remote:
   ```bash
   git fetch origin
   ```

3. Get the default branch name:
   ```bash
   gh repo view --json defaultBranchRef --jq '.defaultBranchRef.name'
   ```

4. Check if feature branch exists and set up accordingly:
   ```bash
   if git show-ref --verify --quiet refs/remotes/origin/feature/{spec-name}; then
     # Feature branch exists - check it out and update
     git checkout feature/{spec-name}
     git pull origin feature/{spec-name}
   else
     # First task for this spec - create feature branch from default branch
     git checkout -b feature/{spec-name} origin/{default-branch}
     git push -u origin feature/{spec-name}
   fi
   ```

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
   *Branch: feature/{spec-name}*
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

## Phase 8: Commit and Push

Once verified:

1. Update `tasks.md`: Change `- [ ]` to `- [x]` for this task

2. Stage and commit all changes:
   ```bash
   git add -A
   git commit -m "feat({spec-name}): task {N} - {title}

   {brief summary of changes}

   Closes #{issue-number}"
   ```

3. Push to the feature branch:
   ```bash
   git push origin feature/{spec-name}
   ```

## Phase 9: Pull Request Management

### Check for Existing PR

```bash
PR_NUMBER=$(gh pr list --head "feature/{spec-name}" --state open --json number --jq '.[0].number')
```

### If No PR Exists (First Task)

1. Read `tasks.md` to get all tasks for the PR body

2. Create a draft PR:
   ```bash
   gh pr create \
     --title "{Spec Title}" \
     --body "$(cat <<'EOF'
   ## Overview

   {Brief description from the spec's brainstorm.md or requirements.md}

   ## Tasks

   - [x] Task {N}: {title} (#issue-number)
   - [ ] Task {N+1}: {title} (#issue-number)
   - [ ] Task {N+2}: {title} (#issue-number)
   ...

   ## Requirements

   See [{spec-name}/requirements.md]({requirements-url})

   ## Design

   See [{spec-name}/design.md]({design-url})

   ---
   *Managed by [Regent](https://github.com/stickystyle/regent)*
   EOF
   )" \
     --draft
   ```

3. Capture the new PR number for reporting

### If PR Already Exists (Subsequent Tasks)

1. Get current PR body:
   ```bash
   gh pr view $PR_NUMBER --json body --jq '.body'
   ```

2. Update the task checkbox in the PR body:
   - Find the line matching `- [ ] Task {N}:`
   - Replace with `- [x] Task {N}:`

3. Update the PR:
   ```bash
   gh pr edit $PR_NUMBER --body "{updated body}"
   ```

4. Add a comment noting completion:
   ```bash
   gh pr comment $PR_NUMBER --body "✅ **Task {N} complete**: {title}

   Commit: {commit-sha}
   Issue: #{issue-number} (will close on merge)"
   ```

## Phase 10: Report Completion

Report to user:
```
Task {N} complete: {title}

Branch: feature/{spec-name}
Commit: {commit-sha}
Issue: #{issue-number} (closes on merge)
PR: {pr-url}

Progress: {X}/{total} tasks complete

{If all tasks complete}:
All tasks complete! The PR is ready to be marked as "Ready for Review".
Run: gh pr ready {pr-number}
```

## Principles

- **Shared branch**: All tasks for a spec work on `feature/{spec-name}`
- **Single PR**: One PR per spec, updated as tasks complete
- **Fresh context**: Codebase is explored at execution time, not planning time
- **Incremental progress**: Tasks can build on each other without waiting for merges
- **Traceability**: Issues close automatically when PR merges (via commit messages)
- **TDD**: Tests first, then implementation

## If Unclear

Ask the user before implementing. Do not make assumptions about:
- Security-critical behavior
- Data validation requirements
- Error handling strategies
- Integration with external systems
