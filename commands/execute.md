---
description: Implement the next incomplete task from tasks.md
---

# Execute Next Task

Implement the next incomplete task from the implementation plan.

## Prerequisites

1. Check that `.regent/` directory exists
2. Find the spec to work on (same logic as other commands)
3. Verify `tasks.md` exists
   - If not, tell user to run `/regent:plan` first

## Process

### Phase 1: Find Next Task

1. Read `.regent/{spec-name}/tasks.md`
2. Find the first unchecked task: `- [ ]`
3. If all tasks are complete, congratulate the user and summarize what was built

### Phase 2: Extract Task Brief

Create a comprehensive Task Brief by gathering context from all spec documents.

Read and extract relevant information from:
- `tasks.md` - The task itself and related tasks
- `requirements.md` - Referenced requirements (verbatim)
- `design.md` - Relevant interfaces and correctness properties
- Existing source code - Current implementation state

**Task Brief Format:**

```markdown
# Task Brief

## Task
- **Number**: [N]
- **Title**: [title from tasks.md]
- **Type**: [test-first | implementation | infrastructure]
- **Implementation Steps**:
  [bullet points verbatim from tasks.md]

## Requirements (Verbatim)

### Requirement X.Y: [title]
**User Story**: [exact text from requirements.md]

**Acceptance Criteria**:
> [exact criterion text]

[Include all requirements referenced by this task]

## Design Context

### Relevant Interfaces
[code blocks from design.md that this task implements or uses]

### Correctness Properties
[relevant properties this task should satisfy, with their numbers]

### Data Models
[relevant models from design.md if applicable]

## Task Sequencing
- **Prior Tasks**: [completed tasks this builds on]
- **This Task**: [what this task accomplishes]
- **Next Tasks**: [what tasks come after and depend on this]

## Dependencies
- **Files to Create**: [new files this task will create]
- **Files to Modify**: [existing files to update]
- **External Dependencies**: [packages, services, etc.]

## Current Implementation State
[relevant code from actual source files, if any exist]

## Test Patterns
[patterns from design.md or similar existing tests to follow]
```

### Phase 3: Save and Present Brief

1. Create briefs directory if needed: `.regent/{spec-name}/briefs/`
2. Save to `.regent/{spec-name}/briefs/task-{N}.md`
3. Present the Task Brief to the user

Ask: "Ready to proceed with Task [N]: [Title]?"

### Phase 4: Implementation

On confirmation, implement the task:

**For Test Tasks:**
1. Write the test file following project conventions
2. Run the test to confirm it fails (TDD red phase)
3. If the test passes unexpectedly, investigate

**For Implementation Tasks:**
1. Implement the code following the interfaces from design.md
2. Run related tests to verify (TDD green phase)
3. Refactor if needed while keeping tests green

**For Property Test Tasks:**
1. Write the property test using Hypothesis
2. Reference the correctness property from design.md
3. Run to verify the property holds (or fails as expected if implementation pending)

**Implementation Guidelines:**
- Follow existing code patterns in the project
- Use the interfaces exactly as defined in design.md
- Add appropriate error handling
- Include docstrings and type hints
- Keep changes focused on the single task

### Phase 5: Verification

After implementation:
1. Run all related tests
2. Check for linting/type errors
3. Review the changes against the requirements

If tests fail:
- Analyze the failure
- Fix the issue
- Re-run tests
- Continue until green

### Phase 6: Mark Complete

Once verified:
1. Update `tasks.md`: Change `- [ ]` to `- [x]` for this task
2. Report completion:
   ```
   Task [N] complete: [Title]

   Changes:
   - [file1]: [what changed]
   - [file2]: [what changed]

   Tests: [X passing]

   Progress: [completed]/[total] tasks ([percentage]%)

   Run /regent:execute to continue with the next task.
   ```

## Selecting the Right Agent

Based on the task type, use the appropriate agent:

| Task Type | Agent |
|-----------|-------|
| Python backend code | regent-python-engineer |
| AWS CDK infrastructure | regent-cdk-architect |
| Test writing | regent-test-engineer |
| Code review (after significant changes) | regent-code-reviewer |

## Important Notes

- Always run tests before marking complete
- If blocked by a missing dependency, note it and ask the user
- Keep each execution session focused on one task
- Commit after each task if using version control
- The Task Brief serves as documentation of what was planned vs implemented
