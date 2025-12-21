---
description: List all specs in the project
---

# List All Specs

Display all specs in the Regent project with their progress.

## Process

1. Check if `.regent/` exists
   - If not: "Regent not initialized. Run /regent:init to get started."

2. Find all spec directories in `.regent/` (directories only, exclude files like config.yml)

3. For each spec directory, check which phase files exist:
   - `brainstorm.md`
   - `requirements.md`
   - `design.md`
   - `tasks.md`

4. If `tasks.md` exists, count completed vs total tasks

5. Sort specs by most recently modified (most recent first)

## Output Format

```
Specs in .regent/:

1. [spec-name-1]
   └── ✓ brainstorm → ✓ requirements → ✓ design → ✓ tasks ([completed]/[total])

2. [spec-name-2]
   └── ✓ brainstorm → ✓ requirements → ○ design → ○ tasks

3. [spec-name-3]
   └── ✓ brainstorm → ○ requirements → ○ design → ○ tasks

Use /regent:status for detailed progress on the current spec.
```

**Symbol Key:**
- `✓` = Phase complete (file exists)
- `○` = Phase incomplete (file missing)

**If no specs exist:**
```
No specs found in .regent/

Run /regent:brainstorm to create your first spec.
```
