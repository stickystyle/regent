---
description: Generate TDD-ordered implementation tasks from design
---

# Plan Implementation

Generate a TDD-ordered implementation task list from the design document.

## Prerequisites

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
1. Write to `.regent/{spec-name}/tasks.md`

### Phase 6: Create Epic Issue

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

## Important Notes

- The `regent-tasks-writer` agent is the single source of truth for task formatting
- Every implementation task must have a corresponding test task that comes BEFORE it
- Property tests should directly reference properties from design.md
- Each task should be completable in a single focused session
- Tasks should be atomic - one clear objective per task
- Always include requirement traceability
