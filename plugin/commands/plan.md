---
description: Generate TDD-ordered implementation tasks from design
---

# Plan Implementation

Generate a TDD-ordered implementation task list from the design document.

## Usage

```
/regent:plan [--epic N]
```

- `--epic N`: GitHub Epic issue number to fetch specs from and create child task issues under

## Arguments

- `--epic N` (optional): The GitHub issue number of an existing Epic. When provided:
  - Specs (brainstorm, requirements, design) are downloaded from the Epic
  - Task issues are created as children of the Epic (instead of creating a new Epic)
  - No tasks.md file is created locally (child issues ARE the tasks)

## Phase 0: Fetch Epic Data (when --epic N provided)

If the `--epic N` argument is provided, run the optimized fetch script that performs all validation, spec download, and child issue detection in minimal API calls:

```bash
eval "$(plugin/scripts/fetch-epic-specs.sh {N})"
```

This script:
1. Validates the Epic exists and has the `regent:epic` label
2. Extracts the spec name from the Epic title
3. Downloads all spec comments (brainstorm, requirements, design) in ONE API call
4. Writes specs to `.regent/{spec-name}/` directory
5. Fetches child issues in ONE API call (filtering out the Epic itself)

**Variables set by the script:**
- `SPEC_NAME` - kebab-case name derived from Epic title
- `EPIC_NUM` - the Epic issue number
- `OWNER` / `REPO` - repository owner and name
- `SPECS_DIR` - path to local spec directory (`.regent/{spec-name}`)
- `CHILD_ISSUES_FILE` - path to JSON file containing child issues
- `CHILD_COUNT` - number of existing child issues (excluding Epic)

**Error handling:** The script exits with an error message if:
- Epic issue not found
- Epic missing `regent:epic` label
- Requirements or design spec not found on Epic

**Reconciliation mode:**
- If `CHILD_COUNT > 0`: Set flag for reconciliation mode (will run Phases 4.5-5.5)
- If `CHILD_COUNT = 0`: Continue normal flow (skip reconciliation phases)

## Prerequisites (when --epic N not provided)

1. Check that `.regent/` directory exists
2. Find the spec to work on:
   - If only one spec directory exists in `.regent/`, use it
   - If multiple exist, use the most recently modified (check file timestamps)
   - If ambiguous, ask the user which spec to work on
3. Verify both `requirements.md` and `design.md` exist in `.regent/{spec-name}/`
   - If not, tell user which phase to complete first

## Process

### Phase 1: Analyze Design

1. Read `.regent/{spec-name}/design.md`
2. Also read `.regent/{spec-name}/requirements.md` for traceability
3. Identify:
   - Components that need to be implemented
   - Interfaces and their dependencies
   - Correctness properties that need tests
   - Data models to create
   - Integration points

### Phase 2: Minimal Clarification

At this stage, fewer questions should be needed. Only ask about:
- Ambiguous implementation priorities
- Technology choices not specified in design
- Test framework preferences if not clear

Gather any clarifications before proceeding.

### Phase 3: Generate Task List

**CRITICAL**: Invoke the `regent-tasks-writer` agent to format the task list.

Pass to the agent:
- The full content of `design.md`
- The full content of `requirements.md`
- Any clarifications gathered in Phase 2

The agent will return a properly formatted TDD-ordered task list. Do NOT generate the task list yourself — the agent ensures consistent formatting.

### Phase 4: Present for Review

Present the task list returned by `regent-tasks-writer` to the user.

Ask: "Does this task breakdown look correct? Any tasks to add or reorder?"

If the user requests changes, either:
- Make minor adjustments directly, OR
- Re-invoke `regent-tasks-writer` with updated guidance

### Phase 4.5: Reconciliation Analysis (when existing child issues found)

**Only execute if `CHILD_COUNT > 0` was set in Phase 0.**

Load existing child issues from `$CHILD_ISSUES_FILE` (JSON array with number, title, state, body, labels).

Compare existing child issues against the new task list from regent-tasks-writer.

#### Categorization Rules

For each existing issue and new task, determine:

1. **KEEP_COMPLETED**: Existing issue is CLOSED and semantically matches a new task
   - The issue stays closed, represents completed work
   - Mark the matching new task as "covered"

2. **KEEP_OPEN**: Existing issue is OPEN and semantically matches a new task
   - Keep the open issue, work can continue
   - Mark the matching new task as "covered"

3. **CLOSE_OBSOLETE**: Existing issue (open or closed) has NO semantic match in new task list
   - Will be closed with explanation comment

4. **CREATE_NEW**: New task has NO semantic match in existing issues
   - Will create a new issue

5. **UNCERTAIN**: Borderline semantic match where you're not confident
   - Example: "Implement GitHub client" vs "Implement GitHub issue API client"
   - Will ask user to decide

#### Semantic Matching Guidelines

When comparing titles:
- Ignore "Task N:" prefixes
- Consider synonyms ("implement" = "create" = "add" = "build")
- Consider partial matches ("GitHub client" is related to "GitHub issue API client")
- Consider word order doesn't matter ("user authentication" = "authentication for users")
- Be conservative - when in doubt, categorize as UNCERTAIN

**Note:** The UPDATE category is derived during Phase 4.7 when users choose "Update description" for UNCERTAIN matches. It is not assigned during initial categorization.

### Phase 4.6: Present Reconciliation Summary

Present the analysis using this format:

```
═══════════════════════════════════════════════════════════════
                    PLAN RECONCILIATION
═══════════════════════════════════════════════════════════════

✓ KEEP (completed, still relevant):
  • #{number} {title}

→ KEEP (open, still relevant):
  • #{number} {title}
    └─ Matches: "{new task title}"

✗ CLOSE AS OBSOLETE:
  • #{number} {title}
    └─ Reason: No matching task in updated plan

+ CREATE NEW:
  • {new task title}

? NEED YOUR INPUT:
  • #{number} "{existing title}"
    └─ Possibly matches: "{new task title}"

═══════════════════════════════════════════════════════════════
```

### Phase 4.7: Resolve Uncertain Matches

For each issue in the UNCERTAIN category, use the AskUserQuestion tool:

**Question**: "How should we handle issue #{number} '{existing title}'?"
**Header**: "Issue #{N}"
**multiSelect**: false
**Options**:
1. label: "Keep as-is", description: "This issue matches the new task '{new task}', keep it unchanged"
2. label: "Update description", description: "Same issue, but update the body to reflect new task requirements"
3. label: "Close and recreate", description: "Close this issue and create a fresh one for '{new task}'"

Based on user response:
- "Keep as-is" → Move to KEEP_OPEN category
- "Update description" → Add to UPDATE category (new category for modified issues)
- "Close and recreate" → Add to CLOSE_OBSOLETE and CREATE_NEW categories

Repeat for each uncertain match before proceeding.

### Phase 4.8: Final Confirmation

Present the complete action summary:

```
═══════════════════════════════════════════════════════════════
                    RECONCILIATION PLAN
═══════════════════════════════════════════════════════════════

Actions to take:

  CLOSE ({count} issues):
    • #{number} - {title}

  UPDATE ({count} issues):
    • #{number} - will update description

  CREATE ({count} new issues):
    • {new task title}

  NO CHANGE ({count} issues):
    • #{number} - {title}

═══════════════════════════════════════════════════════════════
```

Use AskUserQuestion tool:

**Question**: "Proceed with this reconciliation plan?"
**Header**: "Confirm"
**multiSelect**: false
**Options**:
1. label: "Yes, execute", description: "Apply all changes: close obsolete issues, create new ones, update descriptions"
2. label: "No, abort", description: "Cancel reconciliation, no changes will be made"

If "No, abort": Stop execution and inform user: "Reconciliation aborted. No changes were made."
If "Yes, execute": Continue to Phase 5.5.

### Phase 5: Finalization

On approval:

**If `--epic N` was NOT provided:**
1. Write to `.regent/{spec-name}/tasks.md`
2. Proceed to Phase 6: Create Epic Issue

**If `--epic N` was provided:**
1. Do NOT write tasks.md locally (child issues ARE the tasks)
2. Skip Phase 6 (Epic already exists)
3. If reconciliation was performed: Proceed to Phase 5.5
4. Otherwise: Proceed to Phase 6.5: Create Task Issues

### Phase 5.5: Execute Reconciliation (when confirmed)

**Only execute if user confirmed in Phase 4.8.**

#### Error Handling

If any `gh` command fails during reconciliation:
1. Stop execution immediately
2. Report which operations completed and which failed
3. Provide a list of remaining operations so the user can retry manually or re-run reconciliation

**Note:** Placeholder values like `{number}`, `{epic_number}`, and `{updated task description}` should be substituted with actual values before command execution.

#### Close Obsolete Issues

For each issue in CLOSE_OBSOLETE category:

```bash
gh issue close {number} --comment "$(cat <<'EOF'
This task has been marked obsolete during a re-planning session.

**Reason:** No matching task in the updated plan.

See parent Epic #{epic_number} for the updated plan.

---
*Closed by [Regent](https://github.com/stickystyle/regent) during pivot reconciliation*
EOF
)"
```

#### Update Issue Descriptions

For each issue in UPDATE category:

```bash
gh issue edit {number} --body "$(cat <<'EOF'
Parent Epic: #{epic_number}

## Task Description

{updated task description from the new task list}

## Acceptance Criteria

{criteria derived from design.md or requirements.md}

---
*Updated by [Regent](https://github.com/stickystyle/regent) during pivot reconciliation*
EOF
)"
```

#### Summary

After execution, report:

```
Reconciliation complete:
  - Closed: {count} obsolete issues
  - Updated: {count} issue descriptions
  - Preserved: {count} existing issues
  - Will create: {count} new issues (in Phase 6.5)
```

Proceed to Phase 6.5 for creating new issues.

### Phase 6: Create Epic Issue (when --epic N NOT provided)

**Skip this phase if `--epic N` was provided.**

After saving tasks.md, create a GitHub epic issue to serve as the master tracking issue for this spec.

1. **Get repository info:**
   ```bash
   gh repo view --json url,defaultBranchRef --jq '"\(.url) \(.defaultBranchRef.name)"'
   ```

2. **Ensure labels exist:**
   ```bash
   gh label create "regent" --description "Managed by Regent" --color "6f42c1" --force
   gh label create "regent:epic" --description "Regent epic/master issue" --color "d93f0b" --force
   gh label create "spec:{spec-name}" --description "Spec: {spec-name}" --color "0366d6" --force
   ```

3. **Extract summary from brainstorm.md:**
   Read `.regent/{spec-name}/brainstorm.md` and extract the first 1-2 sentences from the Overview section.

4. **Construct spec file URLs:**
   - `{repo-url}/blob/{branch}/.regent/{spec-name}/brainstorm.md`
   - `{repo-url}/blob/{branch}/.regent/{spec-name}/requirements.md`
   - `{repo-url}/blob/{branch}/.regent/{spec-name}/design.md`
   - `{repo-url}/blob/{branch}/.regent/{spec-name}/tasks.md`

5. **Create the epic issue:**
   ```bash
   EPIC_NUM=$(gh issue create \
     --title "Epic: {spec-name}" \
     --label "regent" \
     --label "regent:epic" \
     --label "spec:{spec-name}" \
     --body "$(cat <<'EOF'
   ## {Spec Title from brainstorm.md}

   {1-2 sentence summary from brainstorm.md overview}

   ### Spec Documents

   - [Brainstorm]({brainstorm-url}) - Original exploration and Q&A
   - [Requirements]({requirements-url}) - EARS-format requirements
   - [Design]({design-url}) - Architecture and correctness properties
   - [Tasks]({tasks-url}) - Implementation plan

   ---
   *Managed by [Regent](https://github.com/stickystyle/regent)*
   EOF
   )" | grep -o '[0-9]\+$')
   ```

6. **Update tasks.md with epic reference:**
   Add the epic issue number to the header of tasks.md:
   ```markdown
   # Implementation Plan

   Epic: #{epic-number}

   ## Project Setup
   ...
   ```

7. **Confirm to user:**
   ```
   Implementation plan saved to .regent/{spec-name}/tasks.md

   Summary:
   - X total tasks
   - Epic issue: #{epic-number}

   Next step: Run /regent:create-issue to create task issues, or
              Run /regent:execute to start implementing tasks locally.
   ```

### Phase 6.5: Create Task Issues (when --epic N provided)

**Only execute this phase if `--epic N` was provided.**

**If reconciliation was performed (Phases 4.5-5.5):**
- Only create issues for tasks in the CREATE_NEW category
- Skip tasks that were matched to existing issues (KEEP_OPEN, KEEP_COMPLETED, UPDATE)
- The existing issues already track those tasks

**If no reconciliation (first-time planning with no existing child issues):**
- Create all task issues as normal (existing behavior)

Create GitHub issues for each task, linked to the existing Epic.

1. **Ensure labels exist:**
   ```bash
   gh label create "regent" --description "Managed by Regent" --color "6f42c1" --force
   gh label create "spec:{spec-name}" --description "Spec: {spec-name}" --color "0366d6" --force
   ```

2. **For each task in the generated task list, create a GitHub issue:**
   ```bash
   gh issue create \
     --title "Task {N}: {task title}" \
     --label "regent" \
     --label "spec:{spec-name}" \
     --body "$(cat <<'EOF'
   Parent Epic: #{epic_number}

   ## Task Description

   {task description from the generated task list}

   ## Acceptance Criteria

   {criteria derived from design.md or requirements.md}

   ---
   *Managed by [Regent](https://github.com/stickystyle/regent)*
   EOF
   )"
   ```

3. **Track created issues:**
   - Collect all newly created issue numbers and their IDs
   - Child issues ARE the tasks (no tasks.md file needed)
   - These will be needed for Phase 7

4. **Proceed to Phase 7** to add and order sub-issues.

### Phase 7: Order Sub-Issues (when --epic N provided)

**Only execute this phase if `--epic N` was provided.**

After creating task issues (Phase 6.5) or completing reconciliation (Phase 5.5), ensure all task issues are properly linked as sub-issues and ordered correctly.

#### Step 1: Add New Issues as Sub-Issues

For each newly created issue, add it as a sub-issue of the Epic:

```bash
# Get the issue ID (not the issue number)
ISSUE_ID=$(gh api repos/{owner}/{repo}/issues/{issue_number} --jq '.id')

# Add as sub-issue
gh api repos/{owner}/{repo}/issues/{epic_number}/sub_issues \
  --method POST \
  -F sub_issue_id=$ISSUE_ID
```

#### Step 2: Determine Correct Order

Build the correct TDD implementation order by combining:
1. Existing completed issues (in their logical order)
2. Existing open issues (in their logical order)
3. Newly created issues (inserted at their correct positions)

The order should match the task list generated by `regent-tasks-writer`.

#### Step 3: Reorder Sub-Issues

Use the GitHub Sub-Issues Priority API to reorder issues:

```bash
# Get issue IDs
ISSUE_A_ID=$(gh api repos/{owner}/{repo}/issues/{issue_a} --jq '.id')
ISSUE_B_ID=$(gh api repos/{owner}/{repo}/issues/{issue_b} --jq '.id')

# Move issue B after issue A
gh api repos/{owner}/{repo}/issues/{epic_number}/sub_issues/priority \
  --method PATCH \
  -F sub_issue_id=$ISSUE_B_ID \
  -F after_id=$ISSUE_A_ID
```

Iterate through the correct order, moving each issue after the previous one.

#### Step 4: Verify Order

After reordering, verify the order is correct:

```bash
gh api repos/{owner}/{repo}/issues/{epic_number}/sub_issues \
  --jq '.[] | "\(.number) | \(.state) | \(.title)"'
```

#### Step 5: Confirm to User

```
Task issues created and ordered under Epic #{N}

Summary:
- {X} task issues created
- {Y} existing issues preserved
- All {Z} sub-issues ordered by TDD implementation sequence

Sub-issue order:
  1. #{issue-1}: {title} (completed)
  2. #{issue-2}: {title} (completed)
  ...
  N. #{issue-N}: {title} (open) ← NEXT

Next step: Run /regent:execute-issue {next-open-issue} to implement the next task.
```

## Important Notes

- The `regent-tasks-writer` agent is the single source of truth for task formatting
- Every implementation task must have a corresponding test task that comes BEFORE it
- Property tests should directly reference properties from design.md
- Each task should be completable in a single focused session
- Tasks should be atomic - one clear objective per task
- Always include requirement traceability
