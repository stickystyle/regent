# Regent Slack Bot

Collaborative specification development through conversational AI in Slack.

The Regent Slack Bot enables teams to develop specifications collaboratively using Claude's natural
language understanding. Team members can brainstorm ideas, answer clarifying questions, review
synthesized specs, and create GitHub Epic issues for tracking - all within Slack.

## Table of Contents

- [Features](#features)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Configuration](#configuration)
- [Project Structure](#project-structure)
- [Development](#development)
- [Documentation](#documentation)
- [Architecture](#architecture)
- [License](#license)

## Features

- **Conversational Brainstorming**: Start sessions with `/brainstorm` and interact naturally with
  `@regent`
- **Codebase-Aware**: Connects to GitHub repositories for contextual understanding
- **One Question at a Time**: Focused Q&A sessions that don't overwhelm your team
- **Canvas Integration**: Draft specs delivered as editable Slack Canvas documents
- **GitHub Epic Integration**: Finalized specs stored on GitHub Epic issues for workflow
  continuation
- **Session Persistence**: Resume brainstorming sessions for up to 30 days
- **Attachment Support**: Share images, documents, and code files during brainstorming

## Prerequisites

Before installing the Regent Slack Bot, ensure you have:

- **[Deno](https://deno.land/)** >= 1.37.0 - The JavaScript/TypeScript runtime
- **[Slack CLI](https://api.slack.com/automation/cli/install)** - For deploying to Slack's ROSI
  platform
- **Anthropic API Key** - For Claude integration ([get one here](https://console.anthropic.com/))
- **GitHub Personal Access Token** - For repository integration (requires `repo` scope)
- **Slack Workspace** - With permission to install apps

## Installation

### 1. Install Dependencies

```bash
# Install Deno (macOS/Linux)
curl -fsSL https://deno.land/x/install/install.sh | sh

# Install Deno (Windows PowerShell)
irm https://deno.land/install.ps1 | iex

# Install Slack CLI (macOS)
brew install slack-cli

# Install Slack CLI (other platforms)
# See https://api.slack.com/automation/cli/install
```

### 2. Clone the Repository

```bash
git clone https://github.com/stickystyle/regent.git
cd regent/slackbot
```

### 3. Authenticate with Slack

```bash
slack login
```

Follow the prompts to authenticate with your Slack workspace.

### 4. Deploy to Slack

```bash
# Deploy the app to your workspace
slack deploy

# You'll be prompted to:
# 1. Select your workspace
# 2. Choose the app name (default: regent)
# 3. Confirm deployment
```

### 5. Configure Environment Variables

After deployment, configure the required secrets in your Slack workspace:

```bash
# Set Anthropic API key
slack env add ANTHROPIC_API_KEY

# Set GitHub token (requires repo scope)
slack env add GITHUB_TOKEN
```

### 6. Invite the Bot

Invite the Regent bot to the channels where you want to use it:

```
/invite @regent
```

## Quick Start

### Start a Brainstorming Session

In any channel where Regent is invited, start a session:

```
/brainstorm Add user authentication to our application
```

Or with repository context:

```
/brainstorm --repo myorg/myrepo Add user authentication to our application
```

### Answer Questions

Regent will ask one question at a time. Answer by mentioning the bot:

```
@regent We want to support OAuth2 with Google and GitHub providers
```

### Review and Approve

When Regent has enough information (or when you say you're ready):

```
@regent I think we've covered everything
```

Review the generated spec in the Canvas, provide feedback, and when ready:

```
@regent Approved
```

For more details, see the [User Guide](docs/user-guide.md).

## Configuration

### Environment Variables

| Variable            | Required | Description                                        |
| ------------------- | -------- | -------------------------------------------------- |
| `ANTHROPIC_API_KEY` | Yes      | API key for Claude (from Anthropic Console)        |
| `GITHUB_TOKEN`      | Yes      | GitHub PAT with `repo` scope for repository access |

### Slack App Permissions

The app requires these OAuth scopes (configured in `manifest.ts`):

- `app_mentions:read` - Receive @regent mentions
- `canvases:write` - Create and update Canvas documents
- `channels:history` - Read channel messages
- `channels:read` - List channels
- `chat:write` - Post messages
- `commands` - Handle slash commands
- `datastore:read` - Read session data
- `datastore:write` - Write session data
- `files:read` - Read shared files
- `files:write` - Upload spec files
- `users:read` - Get user information

### Outgoing Connections

The app connects to these external services:

- `api.anthropic.com` - Claude API for conversation
- `api.github.com` - GitHub API for repository access and Epic creation

## Project Structure

```
slackbot/
├── manifest.ts              # App manifest (name, scopes, workflows)
├── deno.jsonc               # Deno configuration and tasks
├── slack.json               # Slack CLI hooks
├── functions/               # ROSI function wrappers
│   ├── slash-command.ts     # /brainstorm command handler
│   └── message-event.ts     # @regent mention handler
├── workflows/               # Workflow definitions
├── triggers/                # Trigger configurations
├── datastores/              # Datastore schema definitions
├── src/                     # Core application source
│   ├── clients/             # External service clients
│   ├── handlers/            # Business logic handlers
│   ├── managers/            # State and resource managers
│   ├── orchestrators/       # Session flow coordination
│   ├── processors/          # File and attachment processing
│   ├── explorers/           # Repository exploration
│   ├── types/               # TypeScript type definitions
│   └── errors/              # Error types and retry logic
├── tests/                   # Test files
└── docs/                    # Documentation
    ├── user-guide.md        # End-user documentation
    ├── troubleshooting.md   # Error resolution guide
    └── adr/                 # Architecture Decision Records
```

## Development

### Running Locally

```bash
# Start in development mode with hot reload
slack run
```

### Running Tests

```bash
# Run all tests
deno task test

# Run tests with coverage
deno task test:coverage

# Run a specific test file
deno test --allow-read --allow-net --allow-env tests/path/to/file.test.ts
```

### Code Quality

```bash
# Type checking
deno task check

# Linting
deno task lint

# Formatting
deno task fmt
```

### Useful Commands

| Command               | Description                     |
| --------------------- | ------------------------------- |
| `slack run`           | Run locally in development mode |
| `slack deploy`        | Deploy to Slack infrastructure  |
| `slack activity`      | View activity logs              |
| `slack env list`      | List environment variables      |
| `slack env add <KEY>` | Add an environment variable     |
| `deno task test`      | Run test suite                  |
| `deno task check`     | Type-check TypeScript files     |
| `deno task lint`      | Run linter                      |
| `deno task fmt`       | Format code                     |

## Documentation

- [User Guide](docs/user-guide.md) - How to use Regent effectively
- [Troubleshooting](docs/troubleshooting.md) - Common issues and solutions
- [Architecture Decision Records](docs/adr/) - Key design decisions

For the full system architecture, see the [design document](../.regent/regent-slack-bot/design.md).

## Architecture

Regent runs on Slack's ROSI (Run On Slack Infrastructure) platform, a serverless Deno/TypeScript
runtime with integrated authentication and datastore capabilities.

### Key Components

- **Session Orchestrator**: Manages conversation lifecycle and coordinates components
- **Session Manager**: Handles persistence to Slack Datastore with 30-day TTL
- **GitHub Client**: Abstracts GitHub API for repository access and Epic management
- **Anthropic Client**: Manages Claude API requests with retry logic
- **Canvas Manager**: Creates and updates Slack Canvas documents

### Session Phases

```
Initializing -> Questioning -> Review -> Finalized
```

1. **Initializing**: Processing repository exploration (if specified)
2. **Questioning**: Q&A loop with confidence tracking
3. **Review**: Team reviewing synthesized spec in Canvas
4. **Finalized**: Spec committed to GitHub Epic (if repository configured)

### Timeout Handling

ROSI has a 60-second function timeout. Deep codebase exploration (which can take 1-3 minutes) is
offloaded to GitHub Actions. Mid-conversation code lookups use Anthropic's MCP Connector to stay
within timeout constraints.

## License

See [LICENSE](../LICENSE) for details.
