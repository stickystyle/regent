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

## Phase 0: Epic Validation (when --epic N provided)

If the `--epic N` argument is provided:

1. Parse the `--epic N` argument to extract the issue number
2. Get repository owner/repo from current git remote:
   ```bash
   gh repo view --json owner,name --jq '"\(.owner.login)/\(.name)"'
   ```
3. Validate the Epic issue exists and has the `regent:epic` label:
   ```bash
   gh issue view {N} --json labels --jq '.labels[].name' | grep -q "regent:epic"
   ```
   If not, report error: "Issue #{N} is not a Regent Epic (missing regent:epic label)"

4. Extract spec name from Epic title:
   - Get title: `gh issue view {N} --json title --jq '.title'`
   - Remove "[Epic] " prefix
   - Convert to kebab-case for directory name

## Phase 0.5: Download Specs from Epic (when --epic N provided)

1. Create local spec directory:
   ```bash
   mkdir -p .regent/{spec-name}
   ```

2. Fetch and cache brainstorm:
   ```bash
   gh api repos/{owner}/{repo}/issues/{N}/comments \
     --jq '.[] | select(.body | contains("<!-- REGENT_SPEC:brainstorm -->")) | .body'
   ```
   - Extract content from inside the `<details>` section (between `</summary>` and `</details>`)
   - Write to `.regent/{spec-name}/brainstorm.md`

3. Fetch and cache requirements:
   ```bash
   gh api repos/{owner}/{repo}/issues/{N}/comments \
     --jq '.[] | select(.body | contains("<!-- REGENT_SPEC:requirements -->")) | .body'
   ```
   - Extract content from inside the `<details>` section
   - Write to `.regent/{spec-name}/requirements.md`
   - If requirements not found, report error: "Requirements spec not found on Epic #{N}. Run /regent:specify --epic {N} first."

4. Fetch and cache design:
   ```bash
   gh api repos/{owner}/{repo}/issues/{N}/comments \
     --jq '.[] | select(.body | contains("<!-- REGENT_SPEC:design -->")) | .body'
   ```
   - Extract content from inside the `<details>` section
   - Write to `.regent/{spec-name}/design.md`
   - If design not found, report error: "Design spec not found on Epic #{N}. Run /regent:design --epic {N} first."

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

### Phase 5: Finalization

On approval:

**If `--epic N` was NOT provided:**
1. Write to `.regent/{spec-name}/tasks.md`
2. Proceed to Phase 6: Create Epic Issue

**If `--epic N` was provided:**
1. Do NOT write tasks.md locally (child issues ARE the tasks)
2. Skip Phase 6 (Epic already exists)
3. Proceed to Phase 6.5: Create Task Issues

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
   - Note the issue numbers as they are created
   - Child issues ARE the tasks (no tasks.md file needed)

4. **Confirm to user:**
   ```
   Task issues created under Epic #{N}

   Summary:
   - X task issues created
   - Epic: #{N}

   Created issues:
   - #{issue-1}: Task 1: {title}
   - #{issue-2}: Task 2: {title}
   ...

   Next step: Run /regent:execute-issue {issue-number} to implement a task.
   ```

## Important Notes

- The `regent-tasks-writer` agent is the single source of truth for task formatting
- Every implementation task must have a corresponding test task that comes BEFORE it
- Property tests should directly reference properties from design.md
- Each task should be completable in a single focused session
- Tasks should be atomic - one clear objective per task
- Always include requirement traceability
