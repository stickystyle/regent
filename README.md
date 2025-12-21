# Regent

Spec-driven development workflow for AI-assisted software engineering.

## Overview

Regent is a monorepo containing tools for structured specification development:

| Package | Description |
|---------|-------------|
| [plugin/](./plugin/) | Claude Code plugin for local spec-driven development |
| [slackbot/](./slackbot/) | Slack bot for collaborative spec development in teams |

## Quick Start

### Claude Code Plugin

```bash
# Install the plugin
claude plugin install regent

# Initialize and start brainstorming
/regent:init
/regent:brainstorm
```

See [plugin/README.md](./plugin/README.md) for full documentation.

### Slack Bot

```bash
cd slackbot
slack login
slack run
```

See [slackbot/README.md](./slackbot/README.md) for development setup.

## Workflow

Both the plugin and Slack bot follow the same spec-driven workflow:

```
Brainstorm → Requirements → Design → Tasks → Execute
```

1. **Brainstorm** - Explore and capture ideas through Q&A
2. **Specify** - Transform into structured EARS requirements
3. **Design** - Create technical architecture with correctness properties
4. **Plan** - Generate TDD-ordered implementation tasks
5. **Execute** - Implement tasks one at a time

## Repository Structure

```
regent/
├── .claude-plugin/    # Plugin manifest
├── plugin/            # Claude Code plugin
│   ├── commands/      # Slash commands
│   └── agents/        # Specialized agents
├── slackbot/          # Slack ROSI app
│   ├── functions/     # Slack functions
│   ├── workflows/     # Workflow definitions
│   └── triggers/      # Trigger configs
└── .regent/           # Specs for this project
```

## License

AGPL
