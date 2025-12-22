# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Regent is a monorepo for spec-driven development workflow:
- **plugin/** - Claude Code plugin for local spec-driven development
- **slackbot/** - Slack ROSI app (Deno/TypeScript) for collaborative spec development in teams

## Development Commands

### Slack Bot (slackbot/)

```bash
cd slackbot
deno task test              # Run tests
deno task test:coverage     # Run tests with coverage
deno task check             # Type-check all TypeScript
deno task lint              # Lint code
deno task fmt               # Format code

slack login                 # Authenticate with Slack CLI
slack run                   # Run locally
slack deploy                # Deploy to Slack infrastructure
```

### Plugin Development

Plugin files are markdown - no build step required. Test by running:
```bash
claude --plugin-dir /path/to/regent
```

## Plugin Architecture

The plugin is defined in `.claude-plugin/plugin.json` which references `plugin/commands/` and `plugin/agents/`.

### Command Flow

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
    ├── Solo: /regent:execute → implements one task at a time
    └── Team: /regent:create-issue → /regent:execute-issue {N} → branch + PR
```

### Agent System

**Spec Writers:** `regent-brainstorm-writer`, `regent-spec-validator`, `regent-requirements-writer`, `regent-design-writer`, `regent-tasks-writer`

**Implementation:** `regent-python-engineer`, `regent-cdk-architect`, `regent-test-engineer`, `regent-code-reviewer`

### Adding Commands/Agents

Commands: Create `plugin/commands/{name}.md` with `---\ndescription: ...\n---` frontmatter
Agents: Create `plugin/agents/{name}.md` with `---\nname: ...\ndescription: ...\nmodel: sonnet\n---` frontmatter

## Slack Bot Architecture

Uses Slack ROSI (Run On Slack Infrastructure) platform. Key files:
- `manifest.ts` - App manifest (scopes, outgoing domains)
- `functions/` - Custom function implementations
- `workflows/` - Workflow definitions
- `triggers/` - Trigger configurations

Outgoing domains: `api.anthropic.com`, `api.github.com`

## Spec Output Directory

```
.regent/
├── config.yml              # Configuration (placeholder)
└── {spec-name}/            # One directory per spec (kebab-case)
    ├── brainstorm.md
    ├── requirements.md     # EARS format
    ├── design.md           # Architecture + correctness properties
    ├── tasks.md            # TDD-ordered checklist
    └── briefs/task-{N}.md  # Execution briefs
```

## Key Patterns

1. **Single Question at a Time** - Brainstorm asks one question per turn
2. **Codebase-Aware** - Brainstorm uses Explore agent before asking questions
3. **Validation Loop** - Specs go through `regent-spec-validator` before finalization
4. **TDD Order** - Tasks are always test-first (write test → implement → verify)
5. **Issue Tracking** - Team workflow links tasks to GitHub issues: `- [ ] 1. Task title (#42)`

## Conventions

- `.regent/` is NOT gitignored (specs should be versioned)
- Spec names use kebab-case derived from the project title
- Each execute session focuses on exactly one task
