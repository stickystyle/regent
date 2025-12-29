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

## Phase 1: Initialization (Script-Based)

Run the initialization script to handle all mechanical setup:

```bash
plugin/scripts/init-execute-issue.sh {issue-number-or-url}
```

This script handles:
- Fetching issue details (number, title, body, labels, comments)
- Extracting spec name from labels
- Finding and downloading specs from parent Epic
- Validating spec hash
- Git branch setup (stash if needed, fetch, checkout/create feature branch)
- Creating `.regent/{spec-name}/briefs/` directory

The script outputs structured data including:
- `ISSUE_NUM`, `ISSUE_TITLE`, `ISSUE_BODY_FILE`, `COMMENTS_FILE`
- `SPEC_NAME`, `SPEC_DIR`, `BRIEFS_DIR`, `EPIC_NUM`
- `HASH_STATUS` (valid|missing|mismatch), `HASH_MESSAGE`
- `BRANCH`, `BRANCH_ACTION` (created|switched|already_on), `STASHED`

### Report initialization results to user:

```
Task #{ISSUE_NUM}: {ISSUE_TITLE}

Specs: Downloaded from Epic #{EPIC_NUM} to {SPEC_DIR}/
Branch: {BRANCH} ({BRANCH_ACTION})
{if STASHED: "Stashed local changes"}

Hash: {HASH_MESSAGE}
```

### Handle hash mismatch (only case requiring Claude interaction)

If `HASH_STATUS="mismatch"`, invoke validation:

```
subagent_type: "regent-spec-validator"
description: "Validate task against updated specs"
prompt: |
  Validate whether this task is still valid given the updated spec documents.

  ## Task Brief (from Issue #{N})

  {read ISSUE_BODY_FILE}

  ## Current Spec Documents

  {read SPEC_DIR/requirements.md}
  {read SPEC_DIR/design.md}

  ## Your Task

  Analyze whether this task is still valid given the updated specs. Look for:

  1. **Obsolete functionality**: Does the task implement something no longer required?
  2. **Missing functionality**: Do updated specs require additional work not in this task?
  3. **Conflicts**: Does the task contradict any updated spec requirements or design?
  4. **Scope changes**: Has the scope of this task changed based on updated specs?

  ## Output Format

  **Recommendation**: PROCEED | UPDATE_TASK | ABORT
  **Analysis**: {List specific issues or confirmations}
```

Based on recommendation:
- **PROCEED**: Continue to Phase 2
- **UPDATE_TASK**: Ask user to choose: proceed anyway, abort and update issue, or abort
- **ABORT**: Ask user to confirm abort or proceed anyway (not recommended)

If user aborts:
```
Execution aborted.

Next steps:
1. Review the spec changes in Epic #{EPIC_NUM}
2. Update this issue if needed: gh issue edit {N} --body "..."
3. Or re-run /regent:plan --epic ${EPIC_NUM} to regenerate tasks
```

## Phase 2: Explore Codebase (REQUIRED - Use Subagent)

**Important**: NOW we explore the codebase to get fresh, current references.

Use the Task tool with these parameters:

```
subagent_type: "Explore"
description: "Explore codebase for task {N}"
prompt: |
  Explore the codebase to gather current implementation context for this task.

  ## Task Context (from GitHub Issue)

  {read ISSUE_BODY_FILE}

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

## Phase 3: Create Local Brief

Combine the issue content with codebase exploration into a full task brief.

Save to `{BRIEFS_DIR}/task-{N}.md`:
   ```markdown
   # Task Brief

   ## From Issue #{N}

   {issue body content}

   ## Issue Discussion

   {If comments exist, include them chronologically:}

   **@{author}** ({relative time}):
   > {comment body}

   {If no comments, omit this section entirely}

   ## Codebase Context

   {output from Explore subagent}

   ---
   *Branch: feature/{spec-name}*
   *Generated at execution time by Regent*
   ```

Present the combined brief to the user.

Ask: "Ready to proceed with Task {N}: {Title}?"

Wait for confirmation before continuing.

## Phase 4: Implementation (REQUIRED - Use Subagent)

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

## Phase 5: Code Review (REQUIRED - Use Subagent)

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
   - If the review passes with no Critical Issues → proceed to Phase 6
   - If issues identified → continue to step 2

2. **Fix issues using the SAME implementation agent (Use Subagent)**:
   - You MUST delegate fixes to the same agent type that did the original implementation
   - Do NOT fix code directly in the main context
   - Use the Task tool:

   ```
   subagent_type: "{same-agent-as-phase-4}"
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

## Phase 6: Verification

After code review passes:

1. Run all related tests
2. Check for linting/type errors
3. Review the changes against the requirements from the brief

If tests fail:
- Analyze the failure
- Fix the issue (using the same implementation agent)
- Re-run code review if changes were significant
- Re-run tests

## Phase 6.5: Human Review (REQUIRED)

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

**Wait for user confirmation** before proceeding to Phase 7.

If the user requests changes:
- Go back to Phase 4 (Implementation) with the requested modifications
- Re-run code review (Phase 5) and verification (Phase 6)
- Return here for another confirmation

## Phase 7: Commit and Push

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

## Phase 8: Report Completion

Report to user:
```
Task {N} complete: {title}

Branch: feature/{spec-name}
Issue: #{issue-number} (closed)
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
