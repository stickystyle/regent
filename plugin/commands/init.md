---
description: Initialize a project for Regent spec-driven development
---

# Initialize Regent Project

Initialize this project for Regent spec-driven development.

## Steps

1. **Check if already initialized**: Look for `.regent/` directory
   - If it exists, inform the user that Regent is already initialized and show current status

2. **Create directory structure**:
   - Create `.regent/` directory
   - Create `.regent/config.yml` with this content:
     ```yaml
     # .regent/config.yml
     # Regent configuration - currently uses defaults
     # Future options will be documented here
     version: 1
     ```

3. **Confirm initialization**: Tell the user:
   ```
   Regent initialized successfully!

   Created:
     .regent/
     .regent/config.yml

   Next step: Run /regent:brainstorm to start developing your spec.
   ```

## Important Notes

- Do NOT add `.regent/` to `.gitignore` - specs should be committed to version control
- The `.regent/` directory will contain spec directories created by `/regent:brainstorm`
