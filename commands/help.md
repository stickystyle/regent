---
description: Display workflow guide and available commands
---

# Regent Help

Display the Regent workflow guide and available commands.

## Process

1. Output the help text below exactly as shown (use a code block for formatting)
2. Do NOT check project state, git status, or provide context - just show the help

## Output

```
Regent: Spec-Driven Development for Claude Code
================================================

WORKFLOW:
  /regent:init        Initialize project for Regent
  /regent:brainstorm  Explore and capture an idea → brainstorm.md
  /regent:specify     Structure requirements (EARS) → requirements.md
  /regent:design      Technical architecture → design.md
  /regent:plan        TDD task breakdown → tasks.md
  /regent:execute     Implement next task

UTILITIES:
  /regent:status      Show current progress
  /regent:list        List all specs
  /regent:help        This help message

TYPICAL FLOW:
  1. /regent:init           Initialize the project
  2. /regent:brainstorm     Explore your idea through Q&A
  3. /regent:specify        Transform into structured requirements
  4. /regent:design         Create technical architecture
  5. /regent:plan           Generate TDD implementation tasks
  6. /regent:execute        Implement tasks one by one (repeat)

ITERATION:
  Re-run any phase command to refine that document.
  Changes flow downstream on next phase execution.

  Example: If /regent:plan reveals gaps, re-run /regent:design
  to update the architecture, then /regent:plan again.

SPEC SELECTION:
  Commands automatically use the most recently modified spec.
  If you have multiple specs, use /regent:list to see all.

AGENTS:
  Regent uses specialized agents for different tasks:

  Spec Writers:
    regent-brainstorm-writer    Conversational spec exploration
    regent-spec-validator       Validate specs for issues
    regent-requirements-writer  EARS requirements formatting
    regent-design-writer        Architecture documentation
    regent-tasks-writer         TDD task breakdown

  Implementation:
    regent-python-engineer      Python backend development
    regent-cdk-architect        AWS CDK infrastructure
    regent-test-engineer        Test writing and TDD
    regent-code-reviewer        Code quality review

For more information: https://github.com/your-org/regent
```
