---
description: Show current progress on specs
---

# Show Status

Display the current progress on Regent specs.

## Process

1. Check if `.regent/` exists
   - If not: "Regent not initialized. Run /regent:init to get started."

2. Find all spec directories in `.regent/` (exclude config.yml)

3. Determine the current/active spec:
   - If only one spec, that's the current one
   - If multiple, the most recently modified is current

4. For the current spec, check which files exist:
   - `brainstorm.md` → brainstorm phase complete
   - `requirements.md` → specify phase complete
   - `design.md` → design phase complete
   - `tasks.md` → plan phase complete

5. If `tasks.md` exists, parse it to count:
   - Total tasks
   - Completed tasks `[x]`
   - Next incomplete task

## Output Format

**If no tasks.md yet:**
```
Current spec: [spec-name] (most recently modified)

Phases:
  ✓ brainstorm.md
  ✓ requirements.md (X requirements)
  ✓ design.md (Y properties)
  ○ tasks.md

Next step: Run /regent:plan to create the implementation plan.

Use /regent:list to see all specs.
```

**If tasks.md exists:**
```
Current spec: [spec-name]

Phases: ✓ brainstorm → ✓ requirements → ✓ design → ✓ tasks

Task Progress: [completed]/[total] complete ([percentage]%)

████████████░░░░░░░░ 60%

Next task: [N]. [Task title]

Use /regent:execute to continue implementation.
```

**If all tasks complete:**
```
Current spec: [spec-name]

Phases: ✓ brainstorm → ✓ requirements → ✓ design → ✓ tasks

Task Progress: [total]/[total] complete (100%)

████████████████████ 100%

All tasks complete! The spec has been fully implemented.
```

## Counting Rules

- **Requirements count**: Count `### Requirement` headings in requirements.md
- **Properties count**: Count `**Property` occurrences in design.md
- **Task count**: Count `- [ ]` and `- [x]` lines in tasks.md
- **Completed count**: Count `- [x]` lines in tasks.md
