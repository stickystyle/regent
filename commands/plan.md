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
2. Confirm:
   ```
   Implementation plan saved to .regent/{spec-name}/tasks.md

   Summary:
   - X total tasks
   - Y test tasks (TDD)
   - Z implementation tasks

   Next step: Run /regent:execute to start implementing tasks.
   ```

## Important Notes

- The `regent-tasks-writer` agent is the single source of truth for task formatting
- Every implementation task must have a corresponding test task that comes BEFORE it
- Property tests should directly reference properties from design.md
- Each task should be completable in a single focused session
- Tasks should be atomic - one clear objective per task
- Always include requirement traceability
