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
   - If not, proceed to Phase 1.5 to download specs from Epic

## Phase 1.5: Epic Detection and Spec Download

If the local spec directory does not exist, attempt to download specs from the parent Epic.

1. **Get spec name from task issue labels:**
   ```bash
   SPEC_NAME=$(gh issue view {N} --json labels \
     --jq '.labels[] | select(.name | startswith("spec:")) | .name | sub("spec:"; "")')
   ```

2. **Find parent Epic with same spec label:**
   ```bash
   EPIC=$(gh issue list --label "regent:epic" --label "spec:${SPEC_NAME}" \
     --json number --jq '.[0].number')
   ```

3. **If Epic found, use the fetch script:**
   ```bash
   eval "$(plugin/scripts/fetch-epic-specs.sh ${EPIC})"
   ```

   This downloads all specs (brainstorm, requirements, design) in minimal API calls.

   Report to user:
   ```
   Downloaded specs from Epic #${EPIC} to .regent/${SPEC_NAME}/
   ```

4. **If no Epic found:**
   - Warn user: "Could not find parent Epic for spec '${SPEC_NAME}'. Specs are not available locally."
   - Ask user if they want to proceed anyway (the task may still be implementable from issue context alone)

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

## Phase 5: Implementation (REQUIRED - Use Subagent)

On confirmation, implement the task using specialized agents.

**Important**: You MUST delegate implementation to a specialized agent using the Task tool. Do NOT implement code directly in the main context.

### Selecting the Right Agent

Determine the primary technology from the spec directory (look for `deno.json`, `package.json`, `pyproject.toml`, `cdk.json`, etc.) and select accordingly:

| Project Technology | Agent (subagent_type) |
|-------------------|----------------------|
| Python (pyproject.toml, requirements.txt) | `regent-python-engineer` |
| TypeScript/JavaScript (deno.json, package.json, tsconfig.json) | `regent-typescript-engineer` |
| AWS CDK (cdk.json) | `regent-cdk-architect` |
| Other languages (Go, Rust, Java, etc.) | `regent-engineer` |

**Note**: All agents handle TDD workflow (test-first tasks). Select based on **language**, not task type.

### Implementation Invocation

Use the Task tool with these parameters:

```
subagent_type: "{appropriate-agent-from-table}"
description: "Implement task {N}: {brief title}"
prompt: |
  Read `.regent/{spec-name}/briefs/task-{N}.md` for full context on what to implement.

  ## Task Summary

  {paste the task title and key points from the brief}

  ## What to Do

  {For test tasks}:
  1. Write the test file following project conventions
  2. Use patterns from the Template Reference section of the brief
  3. Run the test to confirm it fails (TDD red phase)
  4. If the test passes unexpectedly, investigate

  {For implementation tasks}:
  1. Implement the code following the interfaces from design.md exactly
  2. Run related tests to verify (TDD green phase)
  3. Refactor if needed while keeping tests green

  ## Implementation Guidelines

  - Follow existing code patterns in the project
  - Use the interfaces exactly as defined in the Design Context
  - Add appropriate error handling
  - Include docstrings and type hints
  - Keep changes focused on the single task

  ## Output

  Report what files were created/modified and the test results.
```

## Phase 6: Code Review (REQUIRED - Use Subagent)

After implementation, you MUST run the code-reviewer agent.

### Code Review Invocation

Use the Task tool with these parameters:

```
subagent_type: "regent-code-reviewer"
description: "Review task {N} implementation"
prompt: |
  Review the code changes made for Task {N}.

  Read `.regent/{spec-name}/briefs/task-{N}.md` for context on what was implemented.

  Focus on:
  - Code quality and maintainability
  - Security vulnerabilities
  - Adherence to the design from design.md
  - Proper error handling
  - Test coverage adequacy
  - Consistency with project patterns

  Provide your review in the standard format with Critical Issues, Warnings, and Suggestions.
```

### Code Review Loop

1. **Evaluate the review results**:
   - If the review passes with no Critical Issues → proceed to Phase 7
   - If issues identified → continue to step 2

2. **Fix issues using the SAME implementation agent (Use Subagent)**:
   - You MUST delegate fixes to the same agent type that did the original implementation
   - Do NOT fix code directly in the main context
   - Use the Task tool:

   ```
   subagent_type: "{same-agent-as-phase-5}"
   description: "Fix review issues for task {N}"
   prompt: |
     Read `.regent/{spec-name}/briefs/task-{N}.md` for the original task context.

     ## Code Review Feedback

     {paste the code review results here}

     ## What to Do

     Address all Critical Issues and Warnings identified in the review.
     Make the minimal changes needed to resolve each issue.
     Run tests after making changes to ensure nothing is broken.

     ## Output

     Report what changes were made to address each issue.
   ```

3. **Re-run code review**:
   - After fixes are applied, invoke `regent-code-reviewer` again (same syntax as above)
   - Repeat steps 1-3 until the review passes

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

## Phase 7.5: Human Review (REQUIRED)

**STOP HERE** - Do not proceed to commit until the user confirms.

Present a summary of the work completed:
```
Task {N} implementation complete: {title}

Changes made:
- {list modified files}
- {summary of key changes}

Tests: {pass/fail status}
Code review: Passed

Ready to commit and close issue #{issue-number}?
```

**Wait for user confirmation** before proceeding to Phase 8.

If the user requests changes:
- Go back to Phase 5 (Implementation) with the requested modifications
- Re-run code review (Phase 6) and verification (Phase 7)
- Return here for another confirmation

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

4. Close the issue (since we're using a single feature branch, we close manually):
   ```bash
   gh issue close {issue-number} --comment "✅ Task completed and merged to feature/{spec-name}

   Commit: $(git rev-parse HEAD)

   The changes will be included in the spec's pull request."
   ```

## Phase 9: Pull Request Management (First Task Only)

Check if a PR already exists for the feature branch:

```bash
gh pr list --head "feature/{spec-name}" --state open --json number --jq '.[0].number'
```

**If a PR already exists**: Skip to Phase 10. No PR management needed.

**If no PR exists** (this is the first task for this spec):

1. Get epic issue number from `tasks.md` header (line starting with `Epic: #`)

2. Get repo URL:
   ```bash
   gh repo view --json url --jq '.url'
   ```

3. Create a draft PR:
   ```bash
   gh pr create \
     --title "{Spec Title}" \
     --body "$(cat <<'EOF'
   ## Overview

   {Brief description from the spec's brainstorm.md or requirements.md}

   ## Progress

   Track implementation progress via the epic issue: #{epic-number}

   ## Spec Documents

   - [Requirements]({repo-url}/blob/feature/{spec-name}/.regent/{spec-name}/requirements.md)
   - [Design]({repo-url}/blob/feature/{spec-name}/.regent/{spec-name}/design.md)
   - [Tasks]({repo-url}/blob/feature/{spec-name}/.regent/{spec-name}/tasks.md)

   ---
   *Managed by [Regent](https://github.com/stickystyle/regent)*
   EOF
   )" \
     --draft
   ```

4. Report the new PR URL to the user

## Phase 10: Report Completion

Report to user:
```
Task {N} complete: {title}

Branch: feature/{spec-name}
Issue: #{issue-number} (closed)
```

If this was the first task (PR was just created), include:
```
PR: {pr-url} (draft)
```

If all tasks in `tasks.md` are now complete (all `- [x]`), add:
```
All tasks complete! The PR is ready to be marked as "Ready for Review".
Run: gh pr ready
```

## Principles

- **Shared branch**: All tasks for a spec work on `feature/{spec-name}`
- **Single PR**: One PR per spec, links to epic for progress tracking
- **Epic tracking**: Task progress is visible via epic issue sub-issues
- **Fresh context**: Codebase is explored at execution time, not planning time
- **Incremental progress**: Tasks can build on each other without waiting for merges
- **Traceability**: Issues close when task is pushed to feature branch
- **TDD**: Tests first, then implementation

## If Unclear

Ask the user before implementing. Do not make assumptions about:
- Security-critical behavior
- Data validation requirements
- Error handling strategies
- Integration with external systems
