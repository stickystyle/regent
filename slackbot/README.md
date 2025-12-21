# Regent Slack Bot

Collaborative specification development through conversational AI in Slack.

The Regent Slack Bot enables teams to develop specifications collaboratively using Claude's natural language understanding. Team members can brainstorm ideas, answer clarifying questions, review synthesized specs, and create pull requests—all within Slack.

## Prerequisites

- [Deno](https://deno.land/) >= 1.37.0
- [Slack CLI](https://api.slack.com/automation/cli/install)
- Anthropic API key
- GitHub personal access token (for repository integration)

## Development Setup

1. Install dependencies:

```bash
# Install Deno (if not already installed)
curl -fsSL https://deno.land/x/install/install.sh | sh

# Install Slack CLI (macOS)
brew install slack-cli
```

2. Authenticate with Slack:

```bash
slack login
```

3. Run locally:

```bash
slack run
```

## Project Structure

```
slackbot/
├── manifest.ts        # App manifest (name, scopes, workflows)
├── deno.jsonc         # Deno configuration
├── slack.json         # Slack CLI hooks
├── functions/         # Custom function implementations
├── workflows/         # Workflow definitions
├── triggers/          # Trigger configurations
└── README.md          # This file
```

## Commands

| Command | Description |
|---------|-------------|
| `/brainstorm` | Start a new brainstorming session |
| `@regent <answer>` | Provide an official answer to a question |
| `@regent ready` | Signal readiness for spec synthesis |
| `@regent approved` | Approve the synthesized spec |

## Environment Variables

Configure these in your Slack workspace settings:

| Variable | Description |
|----------|-------------|
| `ANTHROPIC_API_KEY` | API key for Claude |
| `GITHUB_TOKEN` | GitHub personal access token |

## Testing

```bash
deno task test
```

## Linting & Formatting

```bash
deno task lint
deno task fmt
```

## Deployment

```bash
slack deploy
```

## Architecture

See [design.md](../.regent/regent-slack-bot/design.md) for the full system architecture.
