# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Regent is a monorepo containing:
1. **plugin/** - A Claude Code plugin for spec-driven development workflow
2. **slackbot/** - A Slack bot that enables collaborative spec development in Slack

## Repository Structure

```
regent/
├── .claude-plugin/    # Plugin manifest (references plugin/)
├── plugin/            # Claude Code plugin
│   ├── commands/      # Slash command definitions (markdown)
│   └── agents/        # Specialized agent definitions (markdown)
├── slackbot/          # Slack ROSI app (Deno/TypeScript)
│   ├── functions/     # Custom Slack functions
│   ├── workflows/     # Workflow definitions
│   └── triggers/      # Trigger configurations
└── .regent/           # Spec documents for this project
```

## Claude Code Plugin

### Plugin Structure

The plugin is defined in `.claude-plugin/plugin.json` which references files in `plugin/`.

```
plugin/
├── commands/          # Slash command definitions (markdown files)
└── agents/            # Specialized agent definitions (markdown files)
```

### Command Flow

Commands are executed in sequence, each producing artifacts that feed the next:

```
/regent:init → .regent/ directory
    ↓
/regent:brainstorm → brainstorm.md (Q&A exploration)
    ↓
/regent:specify → requirements.md (EARS format)
    ↓
/regent:design → design.md (architecture + properties)
    ↓
/regent:plan → tasks.md (TDD-ordered checklist)
    ↓
    ├── Solo Workflow:
    │   /regent:execute → implements one task at a time
    │
    └── Team Workflow:
        /regent:create-issue → GitHub issue (spec-only, no code refs)
            ↓
        /regent:execute-issue {N} → branch, implement, PR
```

### Workflow Comparison

| Aspect | Solo (`/execute`) | Team (`/create-issue` + `/execute-issue`) |
|--------|-------------------|-------------------------------------------|
| Code references | Included in brief | Added at execution time |
| Output | Local changes | GitHub Issue → Branch → PR |
| Collaboration | Single developer | LLM and non-LLM developers |
| Staleness risk | Low (immediate) | None (fresh codebase scan) |
| Git workflow | Manual | Automated branch + PR |

**When to use Team workflow:**
- Multiple developers working on the same spec
- Tasks may sit in backlog before implementation
- Need PR-based code review process
- Want GitHub Issues as work tracking

### Agent System

Commands invoke specialized agents for specific work:

**Spec Writers** (used during planning phases):
- `regent-brainstorm-writer` - Formats Q&A into structured spec
- `regent-spec-validator` - Validates specs for issues
- `regent-requirements-writer` - Produces EARS-format requirements
- `regent-design-writer` - Creates architecture documentation
- `regent-tasks-writer` - Generates TDD task breakdown

**Implementation** (used during execute phase):
- `regent-python-engineer` - Python backend development
- `regent-cdk-architect` - AWS CDK infrastructure
- `regent-test-engineer` - Test writing and TDD
- `regent-code-reviewer` - Code quality review

### Key Patterns

1. **Single Question at a Time**: During brainstorm, only one question is asked per turn
2. **Codebase-Aware**: Brainstorm uses Explore agent to understand existing code before asking questions
3. **Validation Loop**: Specs go through `regent-spec-validator` before finalization
4. **TDD Order**: Tasks are always ordered test-first (write test → implement → verify)
5. **Task Briefs**: Execute phases create detailed briefs in `.regent/{spec}/briefs/task-{N}.md`
6. **Issue Tracking**: Team workflow links tasks to GitHub issues: `- [ ] 1. Task title (#42)`

## Plugin Development

### Adding a New Command

Create a markdown file in `plugin/commands/` with frontmatter:

```markdown
---
description: One-line description shown in help
---

# Command Title

[Command instructions for Claude to follow]
```

### Adding a New Agent

Create a markdown file in `plugin/agents/` with frontmatter:

```markdown
---
name: agent-name
description: When and how to use this agent
model: sonnet  # or opus, haiku
---

# Agent Title

[Agent behavior instructions]
```

## Slack Bot

The Slack bot enables collaborative specification development in Slack. It uses the Slack ROSI (Run On Slack Infrastructure) platform with Deno/TypeScript.

### Slack Bot Structure

```
slackbot/
├── manifest.ts        # App manifest (name, scopes, workflows)
├── deno.jsonc         # Deno configuration
├── slack.json         # Slack CLI hooks
├── functions/         # Custom function implementations
├── workflows/         # Workflow definitions
└── triggers/          # Trigger configurations
```

### Development

```bash
cd slackbot
slack login          # Authenticate with Slack
slack run            # Run locally
slack deploy         # Deploy to Slack infrastructure
```

See `slackbot/README.md` for detailed development instructions.

## Output Formats

### EARS Requirements Format

```markdown
### Requirement 1: [Title]
**User Story:** As a [role], I want [goal], so that [benefit].

#### Acceptance Criteria
1. WHEN [condition] THEN the system SHALL [behavior]
2. IF [condition] THEN the system SHALL [behavior]
```

### Correctness Properties Format

```markdown
**Property 1: [Name]**
*For any* [scope], *there should be* [invariant]
**Validates:** Requirements X.Y, X.Z
```

### Task List Format

```markdown
- [ ] 1. [Test task title]
  - [subtask]
  - _Requirements: X.Y_

- [ ] 2. [Implementation task title] (#42)
  - [subtask]
  - _Requirements: X.Y_

- [x] 3. [Completed task title] (#43)
  - [subtask]
  - _Requirements: X.Z_
```

Note: `(#42)` links to GitHub issue when using team workflow.

## Important Conventions

- `.regent/` directory is NOT gitignored in target projects (specs should be versioned)
- Spec names use kebab-case derived from the project title
- All phases can be re-run to iterate on the spec
- Each execute session focuses on exactly one task
