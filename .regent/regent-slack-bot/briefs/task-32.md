# Task Brief

## From Issue #32

## Overview

**Task 25**: Configure ROSI deployment and create Slack app manifest
**Type**: infrastructure

- Create Slack app manifest (scopes: chat:write, files:write, canvas:write, commands:write)
- Define ROSI function handlers (slash command, events)
- Configure event subscriptions (app_mention, message.channels)
- Set up environment variables (ANTHROPIC_API_KEY, GITHUB_TOKEN)
- Write deployment validation tests
- _Requirements: N/A (deployment)_

📋 **Spec Files**: [requirements](https://github.com/stickystyle/regent/blob/main/.regent/regent-slack-bot/requirements.md) • [design](https://github.com/stickystyle/regent/blob/main/.regent/regent-slack-bot/design.md) • [tasks](https://github.com/stickystyle/regent/blob/main/.regent/regent-slack-bot/tasks.md)

## Requirements

> 📄 *Full requirements: [regent-slack-bot/requirements.md](https://github.com/stickystyle/regent/blob/main/.regent/regent-slack-bot/requirements.md)*

While this is infrastructure and doesn't directly implement requirements, it enables deployment of the system that fulfills all requirements.

## Design Context

> 📄 *Full design: [regent-slack-bot/design.md](https://github.com/stickystyle/regent/blob/main/.regent/regent-slack-bot/design.md)*

### Platform Architecture

The system is built on Slack's ROSI (Run On Slack Infrastructure) platform, which provides:
- Serverless Deno/TypeScript runtime
- Integrated authentication
- Datastore capabilities
- Automatic routing of slash commands and events

### Required Slack Scopes

- `chat:write` - Post messages to threads
- `files:write` - Upload brainstorm.md files
- `canvas:write` - Create and update Canvas documents
- `commands` - Register `/brainstorm` slash command
- `app_mentions:read` - Receive @regent mentions
- `channels:history` - Read thread history for session resumption

### Event Subscriptions

- `app_mention` - Triggered when @regent is mentioned
- `message.channels` - Triggered for messages in channels where bot is member

### Environment Variables

- `ANTHROPIC_API_KEY` - API key for Claude Messages API
- `GITHUB_TOKEN` - Personal access token or GitHub App credentials for repository access

## Task Relationships

> 📄 *All tasks: [regent-slack-bot/tasks.md](https://github.com/stickystyle/regent/blob/main/.regent/regent-slack-bot/tasks.md)*

- **Depends on**: 24
- **Blocks**: 26

## Implementation Guidance

Create deployment configuration that:
1. Defines Slack app manifest with required scopes and event subscriptions
2. Configures ROSI function handlers for slash command and events
3. Sets up secure environment variables for API credentials
4. Includes deployment validation tests that verify:
   - Slash command is registered
   - Event subscriptions are active
   - Environment variables are set
   - Basic health check succeeds

Reference ROSI documentation for manifest format and function handler signatures.

## Issue Discussion

*No comments on this issue*

## Codebase Context

### Current Implementation State

**Manifest Configuration** (`slackbot/manifest.ts`)
- Fully defined manifest using `deno-slack-sdk/mod.ts`
- App name: `regent-slackbot`
- **Bot scopes already configured:**
  - `app_mentions:read` - Read app mentions
  - `channels:history` - Read channel history
  - `channels:read` - Read channels
  - `chat:write` - Send messages (required for task)
  - `commands` - Handle slash commands
  - `datastore:read` - Read from datastores
  - `datastore:write` - Write to datastores
  - `files:read` - Read files
  - `files:write` - Write files (required for task)
  - `users:read` - Read user information
- **Outgoing domains configured:** `api.anthropic.com`, `api.github.com`
- **DataStore registered:** `SessionsDatastore` for session persistence

**Empty Directories** (ready for implementation):
- `slackbot/functions/` - ROSI function handlers
- `slackbot/workflows/` - Slack workflows
- `slackbot/triggers/` - Event triggers

**Deno Configuration** (`slackbot/deno.jsonc`)
- TypeScript strict mode enabled
- Dependencies:
  - `deno-slack-sdk@2.14.3`
  - `deno-slack-api@2.8.0`
  - `@std/assert@1` (testing)
  - `@std/testing/bdd@1` (testing)
  - `@std/encoding/base64@1` (utilities)
- Tasks: `test`, `test:coverage`, `check`, `fmt`, `lint`

### ROSI Patterns Identified

**Handler/Function Pattern:**
The codebase uses functional handlers that:
1. Accept input from Slack ROSI platform
2. Validate inputs and parse parameters
3. Execute business logic
4. Return results or throw `BaseError` subclasses

**Orchestrator Pattern:**
`SessionOrchestrator` coordinates complex flows:
- Accepts parsed input from handlers
- Creates/loads session via `SessionManager`
- Coordinates multiple clients (`AnthropicClient`, `GitHubClient`, `SlackMessagingClient`)
- Posts messages to Slack thread via `messagingClient`

**Manager Pattern:**
Managers handle persistence and external integrations:
- `SessionManager` - Persists to `SessionsDatastore` (Slack's DynamoDB)
- `EpicManager` - Creates GitHub Issues and comments
- `CanvasManager` - Creates/updates Slack Canvases
- `MessageCache` - Rebuilds conversation history from Slack thread

**Error Handling Pattern:**
Errors extend `BaseError` with Slack-specific formatting.

### Test Patterns

**Organization:**
- Tests mirror source structure: `tests/{component}/*.test.ts`
- 40 test files covering handlers, managers, orchestrators, integration flows
- BDD-style: `describe()` for suites, `it()` for tests

**Mock Pattern:**
Each class with external dependencies has Mock version.

**Assertion Patterns:**
- `assertEquals(actual, expected)` - Value equality
- `assertThrows(fn, ErrorType, message)` - Exception validation

### Project Conventions

**Import Style:**
```typescript
// Type imports separated from value imports
import type { Session, Phase } from "../types/session.ts";
import { formatSessionId, parseSessionId } from "../types/session.ts";
```

**ABOUTME Comments:**
Every file starts with 2-line ABOUTME comment.

### Files to Create

**Create (ROSI Functions):**
1. `slackbot/functions/slash-command.ts` - Slash command function handler
2. `slackbot/functions/message-event.ts` - Message event handler

**Create (Workflows):**
1. `slackbot/workflows/brainstorm.ts` - Main brainstorming workflow

**Create (Triggers):**
1. `slackbot/triggers/brainstorm-command.ts` - Trigger for `/brainstorm` command
2. `slackbot/triggers/message-events.ts` - Trigger for message and app_mention events

**Modify:**
1. `slackbot/manifest.ts` - Add `canvases:write` scope, workflows and triggers to manifest

**Create (Tests):**
1. `slackbot/tests/deployment/manifest-validation.test.ts` - Validate manifest configuration
2. `slackbot/tests/deployment/environment-validation.test.ts` - Validate required env vars

**Create (Configuration):**
1. `slackbot/.env.example` - Template for required environment variables

### Key Design Constraints

**ROSI Platform (60-second timeout):**
- Functions must return quickly
- Complex operations (repo exploration) offloaded to GitHub Actions
- Exploration results received via webhook callback

**Session Lifecycle:**
- Created in `Initializing` or `Questioning` phase
- Progresses through phases based on confidence score (95% threshold)
- TTL: 30 days from creation

**Environment Variables Required:**
- `ANTHROPIC_API_KEY` - Anthropic API authentication
- `GITHUB_TOKEN` - GitHub repository access
- `CALLBACK_SECRET` - HMAC validation for webhook callbacks

---
*Branch: feature/regent-slack-bot*
*Generated at execution time by Regent*
