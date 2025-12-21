# Regent: Collaborative Spec-Driven Development

## Overview

Regent is a spec-driven development system that bridges team collaboration in Slack with individual implementation in Claude Code. Brainstorming happens where teams already talk—Slack—then developers take over locally to refine specs, create issues, and implement.

The name "Regent" implies governance and oversight of the development process—ruling over the spec-to-code pipeline.

## Problem Statement

Current workflow friction:
1. **Brainstorming is siloed** - One person writes the spec, misses team input
2. **Context loss** - By the time a dev picks up a task, the "why" is gone
3. **Tool switching** - Jumping between Slack, docs, GitHub, and IDE breaks flow
4. **No traceability** - Hard to connect a PR back to the original discussion

## Solution

A two-part system:
1. **Slack Bot** - Facilitates collaborative brainstorming, generates initial spec
2. **Claude Code Plugin** - Developers refine specs, create GitHub issues, and implement locally

## End-to-End Flow

```
Slack                              Local Claude Code                    GitHub
  │                                      │                                │
/brainstorm --repo acme/api              │                                │
  │                                      │                                │
Team Q&A with bot                        │                                │
  │                                      │                                │
"next" → next question                   │                                │
  │                                      │                                │
"done" → brainstorm.md uploaded                │                                │
  │                                      │                                │
  └───── dev downloads brainstorm.md ──────────┼──→ .regent/rate-limiting/      │
                                         │         brainstorm.md                │
                                         │                                │
                                         │    /regent:specify             │
                                         │         → requirements.md      │
                                         │                                │
                                         │    /regent:design              │
                                         │         → design.md            │
                                         │                                │
                                         │    /regent:plan                │
                                         │         → tasks.md             │
                                         │                                │
                                         │    /regent:create-issues ──────┼──→ Issues #15-22
                                         │                                │
                                         │    /regent:execute-issue 15    │
                                         │         │                      │
                                         │    Implements (TDD)            │
                                         │         │                      │
                                         │    Opens PR ───────────────────┼──→ PR closes #15
                                         │                                │
```

## Part 1: Slack Bot

### Session Initiation

- **Trigger:** `/brainstorm [--repo owner/repo] <idea>`
- **Input:** The idea is provided inline with the command
- **Optional flag:** `--repo owner/repo` gives the bot read access to a GitHub repository for context
- **Response Flow:**
  1. Immediately acknowledge with a message like "Starting brainstorm session..."
  2. Create a new thread with the first question
  3. Use Slack's `response_url` to handle the deferred response

### Conversation Flow

- The bot asks **one question at a time**, building on previous answers
- Questions are designed to dig into every relevant detail of the idea
- The bot maintains context of all previous Q&A within the thread

### Participation

- **Anyone in the channel** can reply to the bot's questions in the thread
- The bot sees all messages in the thread (useful context for follow-ups)
- Team can discuss freely without tagging the bot

### Answering Questions

- To submit an official answer, someone tags the bot: `@regent JWT - we need stateless auth`
- The bot acknowledges the answer and incorporates discussion context it observed
- Multiple @regent messages before "next" are treated as additional input/refinement

**Example flow:**
```
Bot: What authentication approach do you want?

Alice: I think JWT makes sense
Bob: What about sessions? Easier to revoke
Alice: Good point, but we need stateless for Lambda
Bob: Fair. JWT it is.

Alice: @regent JWT - we need stateless auth for Lambda

Bot: Got it—JWT for stateless auth. Ready for the next question, or want to add more?
```

### Progression

- To move to the next question, anyone types **"next"** or **"ready"**
- Freeform — no need to tag the bot
- Parsing: triggers on "next"/"ready" at start of message or as standalone
  - "ready" → triggers
  - "I'm ready" → triggers
  - "not ready yet" → does not trigger
  - "next" → triggers
  - "what's next on the agenda?" → does not trigger

### Session Completion

- The bot determines when it has gathered sufficient information (~95% confidence)
- Bot indicates it's ready: "I think I have enough to write the spec. Ready to generate?"
- Team confirms with **"yes"** or **"done"** to generate
- Team can request more depth: **"no, ask more about X"** to continue

### Output

When the team confirms completion, the bot generates and uploads **brainstorm.md** to the thread.

The spec is a free-form document capturing:
- Problem statement
- Goals and non-goals
- User personas and use cases
- Technical context
- Constraints and assumptions
- Success criteria

Filename is contextual based on the idea (e.g., `rate-limiting-brainstorm.md`).

## Attachments

The bot can process attachments shared during the brainstorm:

- Images (mockups, diagrams, screenshots)
- Documents (PDFs, existing specs)
- Code files (for context on existing systems)

Attachments are incorporated into the bot's understanding when formulating questions and the final spec.

## Part 2: Claude Code Plugin

Developers use the Regent plugin locally to refine specs, create issues, and implement.

### Installation

```bash
claude plugin install regent
```

### Workflow Phases

```
/regent:init
    ↓
brainstorm.md (from Slack brainstorm)
    ↓
/regent:specify → requirements.md (EARS format)
    ↓
/regent:design → design.md (architecture, correctness properties)
    ↓
/regent:plan → tasks.md (TDD-ordered checklist)
    ↓
/regent:create-issues → GitHub issues with full context
    ↓
/regent:execute-issue 15 → implements task
```

### Commands

#### `/regent:init`

Initialize a project for Regent usage.

**Behavior:**
1. Creates `.regent/` directory
2. Creates `.regent/config.yml` with defaults

#### `/regent:specify`

Transform brainstorm.md into structured requirements using EARS format.

**Behavior:**
1. Reads `brainstorm.md` from the active spec directory
2. Asks clarifying questions one at a time until confident
3. Generates `requirements.md` with:
   - Introduction
   - Glossary of terms
   - User stories with WHEN/THEN/SHALL acceptance criteria

#### `/regent:design`

Create technical architecture from requirements.

**Behavior:**
1. Reads `requirements.md`
2. Asks clarifying questions (may present technical options)
3. Generates `design.md` with:
   - System architecture (Mermaid diagrams)
   - Component interfaces (code blocks)
   - Data models
   - Correctness properties with requirement traceability
   - Error handling strategy
   - Testing approach

#### `/regent:plan`

Generate TDD-ordered implementation tasks.

**Behavior:**
1. Reads `requirements.md` and `design.md`
2. Generates `tasks.md` with:
   - Checkbox task list
   - Test tasks before implementation tasks
   - Requirement references for each task

#### `/regent:create-issues`

Create GitHub issues from tasks.md.

**Behavior:**
1. Parses `tasks.md` into individual tasks
2. Creates a GitHub issue for each task with:
   - Task description and steps
   - Linked requirements
   - Design context
   - Acceptance criteria
3. Reports issue numbers

#### `/regent:execute-issue <number>`

Execute a GitHub issue.

**Behavior:**
1. Fetches issue #N from the configured repo
2. Extracts spec context (requirements, design, acceptance criteria)
3. Implements following TDD:
   - Writes tests first (if test task)
   - Implements code to pass tests
   - Runs tests to verify
4. Creates commit referencing the issue

#### `/regent:status`

Show status of Regent issues:
- Open issues assigned to you
- In-progress (branch exists)
- Recently closed

### Local Directory Structure

```
.regent/
├── config.yml
└── {spec-name}/           # e.g., rate-limiting/
    ├── brainstorm.md            # From Slack brainstorm
    ├── requirements.md    # Generated by /regent:specify
    ├── design.md          # Generated by /regent:design
    ├── tasks.md           # Generated by /regent:plan
    └── briefs/
        └── issue-15.md    # Task brief for executed issue
```

### Configuration

**.regent/config.yml**:
```yaml
version: 1
github:
  repo: owner/repo        # Default repo for issues
```

## Technical Architecture

### Runtime

- **Language:** Python
- **Hosting:** AWS Lambda
- **Event-driven:** Responds to Slack events and slash commands

### AI Backend

- **SDK:** Claude Code SDK (for agentic tool use)
- **Model:** Claude Opus (or Sonnet for cost optimization)
- **Approach:** Agentic loop where Claude decides what tools to call (Slack, GitHub) and when

### Slack Integration

- **Installation:** Single workspace per deployment (not multi-tenant SaaS)
- **Each company installs and hosts their own instance**
- **Authentication:** Bot tokens stored securely, standard Slack app OAuth

### Secrets Management

- **Store:** AWS Secrets Manager
- Secrets include:
  - Slack Bot Token
  - Slack Signing Secret
  - Anthropic API Key
  - GitHub Personal Access Token (read-only, for repo context during brainstorm)

### Context Scope

- Bot only sees messages within the `/brainstorm` thread
- No access to broader channel history or workspace search
- Each brainstorm session is completely independent (no cross-session memory)
- **If `--repo` is provided:** Bot can read files from the specified GitHub repository to inform questions and the final spec

### GitHub Integration (Optional)

When a repo is specified, the bot can:
- Read file contents to understand existing implementations
- List directory structures to understand project layout
- Search code for relevant patterns
- Reference actual code in the generated spec

The bot decides autonomously when to consult the repo based on conversation context. For example, if the team mentions "auth service," the bot might explore `src/auth/` to understand current patterns before asking follow-up questions.

## Session Lifecycle

### Active Session

- No time limits
- No maximum question count
- Runs until team confirms spec generation

### Abandoned Sessions

- Sessions that go inactive simply die naturally
- No timeout messages or cleanup required
- No partial progress saved

## Error Handling

### User Feedback

- Detailed error messages posted to the thread
- Target audience is developers, so technical details are appropriate
- Examples:
  - "Couldn't process that attachment: unsupported file type"
  - "Failed to generate spec: context too long, try summarizing some earlier points"

### Logging

- All errors logged to **CloudWatch**
- Enables debugging and monitoring

## Constraints & Limits

- **Rate limiting:** None (trusted internal teams)
- **Concurrent sessions:** No limits
- **Admin configuration:** None—works out of the box

## Lambda Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Slack Workspace                       │
└─────────────────────┬───────────────────────────────────┘
                      │ /brainstorm command
                      │ Thread replies
                      │ File uploads
                      ▼
┌─────────────────────────────────────────────────────────┐
│                 API Gateway                              │
│            (Webhook endpoint)                            │
└─────────────────────┬───────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────┐
│                 AWS Lambda                               │
│  ┌───────────────────────────────────────────────────┐  │
│  │  Event Handler                                     │  │
│  │  - Verify Slack signature                         │  │
│  │  - Parse event type                               │  │
│  │  - Route to appropriate handler                   │  │
│  └───────────────────┬───────────────────────────────┘  │
│                      │                                   │
│  ┌───────────────────▼───────────────────────────────┐  │
│  │  Claude Code SDK                                   │  │
│  │  - Agentic orchestration                          │  │
│  │  - Tool definitions for Slack operations          │  │
│  │  - Opus model for reasoning                       │  │
│  └───────────────────┬───────────────────────────────┘  │
│                      │                                   │
│  ┌───────────────────▼───────────────────────────────┐  │
│  │  Tools                                             │  │
│  │  - slack_read_thread                              │  │
│  │  - slack_post_message                             │  │
│  │  - slack_upload_file                              │  │
│  │  - slack_fetch_attachment                         │  │
│  └───────────────────────────────────────────────────┘  │
└─────────────────────┬───────────────────────────────────┘
                      │
        ┌─────────────┼─────────────┐
        ▼             ▼             ▼
┌──────────────┐ ┌─────────┐ ┌─────────────┐
│ AWS Secrets  │ │ Anthropic│ │ CloudWatch  │
│ Manager      │ │ API      │ │ Logs        │
└──────────────┘ └─────────┘ └─────────────┘
```

## Slack App Configuration

### Required OAuth Scopes

- `commands` - For `/brainstorm` slash command
- `chat:write` - Post messages in threads
- `files:write` - Upload spec files
- `files:read` - Read attachments shared in thread

### Event Subscriptions

- `message.channels` - Detect replies in public channels
- `message.groups` - Detect replies in private channels

### Slash Commands

- `/brainstorm` - Initiates a brainstorming session

## Claude Code SDK Tool Definitions

### Slack Tools

#### slack_read_thread

Read all messages in the brainstorm thread to understand current context.

**Parameters:**
- `channel_id` (string): The channel containing the thread
- `thread_ts` (string): The thread timestamp

**Returns:** Array of messages with author, content, and any attachment references

#### slack_post_message

Post a message to the brainstorm thread.

**Parameters:**
- `channel_id` (string): Target channel
- `thread_ts` (string): Thread to reply in
- `text` (string): Message content

**Returns:** Message timestamp

#### slack_upload_file

Upload the generated spec file to the thread.

**Parameters:**
- `channel_id` (string): Target channel
- `thread_ts` (string): Thread to attach file to
- `filename` (string): Name for the file
- `content` (string): File content

**Returns:** File upload confirmation

#### slack_fetch_attachment

Retrieve an attachment shared in the thread.

**Parameters:**
- `file_id` (string): Slack file ID

**Returns:** File content (text, base64 for images, etc.)

### GitHub Tools (Available when `--repo` flag is provided)

#### github_read_file

Read the contents of a file from the repository.

**Parameters:**
- `repo` (string): Repository in `owner/repo` format
- `path` (string): File path within the repository
- `ref` (string, optional): Branch, tag, or commit SHA (defaults to default branch)

**Returns:** File content as string

#### github_list_directory

List contents of a directory in the repository.

**Parameters:**
- `repo` (string): Repository in `owner/repo` format
- `path` (string): Directory path within the repository
- `ref` (string, optional): Branch, tag, or commit SHA

**Returns:** Array of file/directory names with types

#### github_search_code

Search for code patterns within the repository.

**Parameters:**
- `repo` (string): Repository in `owner/repo` format
- `query` (string): Search query (file contents, function names, etc.)

**Returns:** Array of matching files with relevant snippets

## System Prompt

The bot uses this core instruction set for brainstorming:

```
Ask me one question at a time so we can develop a thorough, step-by-step spec 
for this idea. Each question should build on my previous answers, and our end 
goal is to have a detailed specification I can hand off to a developer. Let's 
do this iteratively and dig into every relevant detail until you have a 
confidence of 95% of the idea. Remember, only one question at a time.

Once we are done, generate brainstorm.md covering:
- Problem statement
- Goals and non-goals  
- User personas and use cases
- Technical context
- Constraints and assumptions
- Success criteria
```

Additional context provided to the model:
- The initial idea from the `/brainstorm` command
- Repository context if `--repo` flag provided
- That multiple team members may contribute answers
- To acknowledge responses and wait for "next"/"ready" before proceeding
- To indicate when ready and ask for confirmation before generating

## Deployment Checklist

### Part 1: Slack Bot

1. **Create Slack App**
   - Configure OAuth scopes
   - Set up `/brainstorm` slash command
   - Enable event subscriptions

2. **AWS Infrastructure**
   - Create Lambda function (Python runtime)
   - Set up API Gateway endpoint
   - Configure Secrets Manager with credentials (Slack, Anthropic, GitHub read token)
   - Set up CloudWatch log group

3. **Deploy Code**
   - Lambda handler for webhook events
   - Claude Code SDK integration
   - Tool implementations for Slack and GitHub read operations

4. **Connect**
   - Point Slack app webhook URL to API Gateway
   - Install app to workspace
   - Test with `/brainstorm test idea`

### Part 2: Claude Code Plugin

1. **Create Plugin Repository**
   ```
   regent/
   ├── .claude-plugin/
   │   └── plugin.json
   ├── commands/
   │   ├── init.md
   │   ├── specify.md
   │   ├── design.md
   │   ├── plan.md
   │   ├── create-issues.md
   │   ├── execute-issue.md
   │   └── status.md
   └── README.md
   ```

2. **Publish Plugin**
   - Push to GitHub
   - Add to team's plugin marketplace (or install directly)

3. **Team Installation**
   ```bash
   claude plugin install regent
   ```

4. **Configure**
   - Each dev configures `.regent/config.yml` with their repo
   - GitHub token via `gh` CLI auth or environment variable

## Future Considerations (Out of Scope for v1)

- GitHub Project board creation from `/regent finalize`
- Customizable spec templates (API, CLI tool, library patterns)
- Additional writer agents (Node, Go, Rust engineers)
- CI/CD integration to auto-update issue status from test results
- Guided backtracking when implementation reveals spec gaps
- Diff view between spec versions
- Export for stakeholder review
