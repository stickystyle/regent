# Task Brief

## From Issue #34

## Overview

**Task 26**: Write documentation and usage guides
**Type**: infrastructure

- Create README with installation instructions
- Document slash command syntax (/brainstorm [--repo owner/repo] <idea>)
- Document conversational interaction patterns (not commands)
- Create troubleshooting guide (error messages, recovery)
- Add JSDoc comments to all public interfaces
- Create architecture decision records (ADR) for key design choices
- _Requirements: N/A (documentation)_

📋 **Spec Files**: [requirements](https://github.com/stickystyle/regent/blob/main/.regent/regent-slack-bot/requirements.md) • [design](https://github.com/stickystyle/regent/blob/main/.regent/regent-slack-bot/design.md) • [tasks](https://github.com/stickystyle/regent/blob/main/.regent/regent-slack-bot/tasks.md)

## Requirements

> 📄 *Full requirements: [regent-slack-bot/requirements.md](https://github.com/stickystyle/regent/blob/main/.regent/regent-slack-bot/requirements.md)*

While this is documentation and doesn't directly implement requirements, it enables users to understand and effectively use all features.

## Design Context

> 📄 *Full design: [regent-slack-bot/design.md](https://github.com/stickystyle/regent/blob/main/.regent/regent-slack-bot/design.md)*

### Key User Workflows

**Starting a session:**
```
/brainstorm <idea description>
/brainstorm --repo owner/repo <idea description>
```

**Talking to Regent:**

The bot uses natural conversation - just talk to it with `@regent`. Examples:

| What you want | Example phrases |
|---------------|-----------------|
| Answer a question | "@regent The API should support REST and GraphQL" |
| Skip a question | "@regent Let's skip this one" / "@regent Next question" |
| Ready for review | "@regent I think we've covered everything" / "@regent We're done" |
| Give feedback | "@regent This section needs more detail on error handling" |
| Approve the spec | "@regent Looks good!" / "@regent Ship it" / "@regent Approved" |

**Key principle:** Regent understands natural language. You don't need to memorize commands - just talk to it like a team member.

### Error Categories

Document all error types from design:
- GitHub Access Errors
- Slack API Errors
- Anthropic API Errors
- Session Expiration
- Invalid Input
- File Processing Errors

## Task Relationships

> 📄 *All tasks: [regent-slack-bot/tasks.md](https://github.com/stickystyle/regent/blob/main/.regent/regent-slack-bot/tasks.md)*

- **Depends on**: Task 25
- **Blocks**: None (final task)

## Implementation Guidance

Create comprehensive documentation including:

1. **README.md**
   - Project overview and purpose
   - Installation and deployment instructions
   - Quick start guide
   - Link to full documentation

2. **User Guide**
   - Slash command syntax and options
   - Conversational interaction examples (emphasize natural language, not commands)
   - Example workflows with screenshots
   - Best practices for effective brainstorming

3. **Troubleshooting Guide**
   - Common error messages and solutions
   - Recovery procedures for each error category
   - How to check logs and debug issues

4. **JSDoc Comments**
   - All public interfaces documented with types
   - Parameter descriptions
   - Return value descriptions
   - Example usage

5. **Architecture Decision Records (ADR)**
   - Why ROSI platform was chosen
   - Why composite session ID (channel:thread)
   - Why Canvas with file fallback
   - Why conversational approach instead of commands
   - Why abstracted GitHub client for future App migration

## Issue Discussion

*No comments on this issue*

## Codebase Context

### Project Architecture Overview

The Regent Slack Bot is a collaborative specification development system built on Slack's ROSI (Run On Slack Infrastructure) platform with a hybrid architecture that addresses the 60-second function timeout by offloading deep codebase exploration to GitHub Actions.

**Key Architecture Decisions:**

1. **Hybrid Exploration Model**: Long-running codebase exploration (1-3 minutes) is delegated to GitHub Actions workflows, while mid-conversation focused lookups use Anthropic's MCP Connector
2. **Session Persistence**: Slack Datastore maintains session metadata across up to 30-day conversations, identified by composite key (channel_id:thread_ts)
3. **State Machine Design**: Sessions follow linear phase progression: `Initializing` → `Questioning` → `Review` → `Finalized`
4. **Epic-Based Spec Storage**: Finalized specs are stored as collapsible comments on GitHub Epic issues
5. **Multi-Client Architecture**: Abstracted clients (SlackClient, GitHubClient, AnthropicClient) enable dependency injection for testing

**Core Components:**
- SessionOrchestrator: Coordinates initialization flow and Q&A loop
- SessionManager: Handles persistence, TTL enforcement (30 days), and session resumption
- Handlers: SlashCommandHandler, MessageEventHandler, ExplorationHandler, PivotHandler, FinalizationHandler
- Managers: CanvasManager, EpicManager, MessageCache, DatastoreClient
- Clients: SlackMessagingClient, GitHubClient, AnthropicClient

### Public Interfaces Inventory

**Already Well-Documented:**
- Session types (session.ts) - Full JSDoc with Property references
- Message types (message.ts) - Full JSDoc
- SlashCommand types (slash-command.ts) - Full JSDoc
- Error hierarchy (errors/types.ts) - Full JSDoc
- All handler functions - Full JSDoc
- Manager classes - Full JSDoc
- Client interfaces - Full JSDoc

**Partially Documented (needs review):**
- SlackMessagingClient interface
- RepositoryExplorer
- GitHub types (GitHubIssue, GitHubComment, GitHubUser)

### Error Types and Messages

**Transient Errors (Retryable):**
1. GitHubRateLimitError - "GitHub API rate limit exceeded"
2. SlackRateLimitError - "Slack API rate limit exceeded"
3. SlackCanvasError - "Failed to create Canvas for spec review"
4. AnthropicRateLimitError - "Claude API rate limit exceeded"
5. NetworkTimeoutError - "Network request timed out"

**Permanent Errors (Non-retryable):**
1. ValidationError - Various: "Cannot use /brainstorm in direct messages", "Invalid repository format"
2. GitHubAccessError - "GitHub repository access denied"
3. AnthropicModelError - "Claude could not process this request"
4. AnthropicInputError - "Input is too large for processing"

### Command Syntax

```
/brainstorm [--repo owner/repo] <idea>
```

Parameters:
- `--repo owner/repo` (optional): GitHub repository for codebase exploration
- `<idea>` (required): Description of the concept to brainstorm

### Conversational Patterns

1. **Answer Command** - Any @regent mention that is NOT a control keyword
2. **Control Commands** - "next", "ready", "approved"
3. **Implicit Messages** - Messages in thread without @regent mention (stored for context)

### JSDoc Coverage Analysis

- Total JSDoc blocks: 560+ across 30 files
- Coverage: ~95% of public interfaces
- ABOUTME comments: Present on all file headers

### Key Files for Documentation

**Entry Points:**
- `manifest.ts` - App configuration, scopes, outgoing domains
- `functions/slash-command.ts` - /brainstorm command wrapper
- `functions/message-event.ts` - Message event wrapper

**Core Source:**
- `src/handlers/slash-command.ts`
- `src/handlers/message-event.ts`
- `src/orchestrators/session-orchestrator.ts`
- `src/types/*.ts`
- `src/errors/types.ts`

**Configuration:**
- `deno.jsonc` - Deno configuration
- `slack.json` - Slack CLI configuration

---
*Branch: feature/regent-slack-bot*
*Generated at execution time by Regent*
