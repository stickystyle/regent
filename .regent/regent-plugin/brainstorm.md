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
5. **Cost** - Teams already pay for Claude; Kiro is an additional expense

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
"done" → brainstorm.md uploaded          │                                │
  │                                      │                                │
  └───── dev downloads brainstorm.md ────┼──→ .regent/rate-limiting/      │
                                         │         brainstorm.md          │
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

---

# Part 1: Slack Bot

## Session Initiation

- **Trigger:** `/brainstorm [--repo owner/repo] <idea>`
- **Input:** The idea is provided inline with the command
- **Optional flag:** `--repo owner/repo` gives the bot read access to a GitHub repository for context
- **Response Flow:**
  1. Immediately acknowledge with a message like "Starting brainstorm session..."
  2. Create a new thread with the first question
  3. Use Slack's `response_url` to handle the deferred response

## Conversation Flow

- The bot asks **one question at a time**, building on previous answers
- Questions are designed to dig into every relevant detail of the idea
- The bot maintains context of all previous Q&A within the thread

## Participation

- **Anyone in the channel** can reply to the bot's questions in the thread
- The bot sees all messages in the thread (useful context for follow-ups)
- Team can discuss freely without tagging the bot

## Answering Questions

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

## Progression

- To move to the next question, anyone types **"next"** or **"ready"**
- Freeform — no need to tag the bot
- Parsing: triggers on "next"/"ready" at start of message or as standalone
  - "ready" → triggers
  - "I'm ready" → triggers
  - "not ready yet" → does not trigger
  - "next" → triggers
  - "what's next on the agenda?" → does not trigger

## Session Completion

- The bot determines when it has gathered sufficient information (~95% confidence)
- Bot indicates it's ready: "I think I have enough to write the spec. Ready to generate?"
- Team confirms with **"yes"** or **"done"** to generate
- Team can request more depth: **"no, ask more about X"** to continue

## Output

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

## GitHub Integration (Optional)

When a repo is specified via `--repo`, the bot can:
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

---

# Part 2: Claude Code Plugin

Developers use the Regent plugin locally to refine specs, create issues, and implement.

## Installation

```bash
claude plugin install regent
```

Or via team marketplace:
```bash
claude marketplace add team-plugins https://github.com/your-org/plugins
claude plugin install regent@team-plugins
```

## Plugin Structure

```
regent/
├── .claude-plugin/
│   └── plugin.json           # Plugin manifest
├── commands/
│   ├── init.md
│   ├── specify.md
│   ├── design.md
│   ├── plan.md
│   ├── create-issues.md
│   ├── execute-issue.md
│   ├── status.md
│   ├── list.md
│   └── help.md
├── agents/
│   ├── python-engineer.md
│   ├── cdk-architect.md
│   ├── code-reviewer.md
│   ├── test-engineer.md
│   ├── requirements-writer.md
│   ├── design-writer.md
│   └── tasks-writer.md
└── README.md
```

## Project Structure

Created by `/regent:init`:

```
.regent/
├── config.yml                # Configuration
└── {spec-name}/              # One directory per spec
    ├── brainstorm.md         # Downloaded from Slack
    ├── requirements.md       # Generated by /regent:specify
    ├── design.md             # Generated by /regent:design
    ├── tasks.md              # Generated by /regent:plan
    └── briefs/
        └── issue-{N}.md      # Task brief for executed issue
```

## Commands

### /regent:init

Initialize a project for Regent usage.

**Behavior:**
1. Creates `.regent/` directory
2. Creates `.regent/config.yml`:
   ```yaml
   version: 1
   github:
     repo: owner/repo        # Default repo for issues
   ```

### /regent:specify

Transform brainstorm.md into structured requirements using EARS format.

**Behavior:**
1. Determines which spec to work on (most recently modified, or prompt if ambiguous)
2. Reads `brainstorm.md` from the spec directory
3. Uses `regent-requirements-writer` agent
4. Asks clarifying questions one at a time until confident
5. Presents final draft for review
6. On approval, writes `requirements.md`

**Output Format:**
```markdown
# Requirements Document

## Introduction
[Brief summary derived from brainstorm.md]

## Glossary
- **Term**: Definition
- **Term**: Definition

## Requirements

### Requirement 1

**User Story:** As a [role], I want [goal], so that [benefit].

#### Acceptance Criteria

1. WHEN [condition] THEN the system SHALL [behavior]
2. WHEN [condition] THEN the system SHALL [behavior]

### Requirement 2
...
```

### /regent:design

Create technical architecture from requirements.

**Behavior:**
1. Reads `requirements.md`
2. Uses `regent-design-writer` agent
3. Asks clarifying questions (may present technical options)
4. Presents final draft for review
5. On approval, writes `design.md`

**Output Format:**
```markdown
# Design Document

## Overview
[High-level summary of the technical approach]

## Architecture

### System Components
[Mermaid diagram showing component relationships]

## Components and Interfaces

### [ComponentName]
[Description and code block with interface]

## Data Models

### Database Schema
[Table definitions, relationships]

## Correctness Properties

**Property 1: [Name]**
*For any* [condition], the system should [behavior]
**Validates: Requirements X.Y, Z.W**

## Error Handling
[Error scenarios and responses]

## Testing Strategy
[Unit, integration, and property-based testing approaches]
```

### /regent:plan

Generate TDD-ordered implementation tasks.

**Behavior:**
1. Reads `requirements.md` and `design.md`
2. Uses `regent-tasks-writer` agent
3. Generates task list with TDD ordering (tests before implementation)
4. Presents final draft for review
5. On approval, writes `tasks.md`

**Output Format:**
```markdown
# Implementation Plan

- [ ] 1. [Task title]
  - [Implementation step]
  - [Implementation step]
  - _Requirements: X.Y, Z.W_

- [ ] 2. Write property test for [feature]
  - **Property N: [Property name]**
  - **Validates: Requirements X.Y**

- [ ] 3. Implement [feature]
  - [Implementation step]
  - _Requirements: X.Y_
```

**TDD Ordering Rules:**
- Test tasks come before their corresponding implementation tasks
- Property tests reference correctness properties from design.md
- Each task references the requirements it satisfies
- Dependencies are sequenced appropriately

### /regent:create-issues

Create GitHub issues from tasks.md.

**Behavior:**
1. Parses `tasks.md` into individual tasks
2. Creates a GitHub issue for each task with:
   - Task description and steps
   - Linked requirements (verbatim acceptance criteria)
   - Design context (relevant interfaces, properties)
   - Acceptance criteria for the task
3. Reports created issue numbers
4. Optionally creates a GitHub Project board

**Issue Format:**
```markdown
## Task
[Task title and implementation steps from tasks.md]

## Requirements
[Verbatim user story and acceptance criteria]

## Design Context
[Relevant interfaces and correctness properties]

## Acceptance Criteria
- [ ] Tests pass
- [ ] Code reviewed
- [ ] Requirements X.Y satisfied
```

### /regent:execute-issue <number>

Execute a GitHub issue.

**Behavior:**
1. Fetches issue #N from the configured repo
2. Extracts spec context (requirements, design, acceptance criteria)
3. Saves task brief to `.regent/{spec-name}/briefs/issue-{N}.md`
4. Presents task brief and asks for confirmation
5. On confirmation:
   - Uses appropriate implementation agent (`regent-python-engineer`, etc.)
   - Follows TDD: writes tests first, then implementation
   - Uses `regent-code-reviewer` after significant changes
6. Runs tests to verify
7. Creates commit referencing the issue

### /regent:status

Show status of Regent specs and issues.

**Output:**
```
Current spec: rate-limiting

Phases: ✓ brainstorm → ✓ requirements → ✓ design → ✓ tasks

GitHub Issues: 8 total
  - 3 open (unassigned)
  - 2 in progress (you: #15, #16)
  - 3 closed

Next unassigned: #17 - Implement rate limit middleware

Use /regent:execute-issue 17 to start.
```

### /regent:list

List all specs in the project.

**Output:**
```
Specs in .regent/:

1. rate-limiting
   └── ✓ brainstorm → ✓ requirements → ✓ design → ✓ tasks
   └── Issues: 5/8 complete

2. webhook-integration
   └── ✓ brainstorm → ✓ requirements → ○ design → ○ tasks
   └── Issues: not created

3. audit-logging
   └── ✓ brainstorm → ○ requirements → ○ design → ○ tasks
```

### /regent:help

Display workflow guide and available commands.

**Output:**
```
Regent: Collaborative Spec-Driven Development

SLACK BOT:
  /brainstorm <idea>              Start team brainstorm in Slack
  /brainstorm --repo org/repo     Include GitHub repo context

LOCAL WORKFLOW:
  /regent:init                    Initialize project
  /regent:specify                 Structure requirements (EARS)
  /regent:design                  Technical architecture
  /regent:plan                    TDD task breakdown
  /regent:create-issues           Push tasks to GitHub
  /regent:execute-issue <N>       Implement issue #N

UTILITIES:
  /regent:status                  Show progress
  /regent:list                    List all specs
  /regent:help                    This help message

AGENTS (for direct invocation):
  regent-python-engineer          Python backend development
  regent-cdk-architect            AWS CDK infrastructure
  regent-code-reviewer            Code quality review
  regent-test-engineer            Test writing and TDD
  regent-requirements-writer      EARS requirements formatting
  regent-design-writer            Architecture document formatting
  regent-tasks-writer             Task list formatting
```

## Agents

### Implementation Agents

#### regent-python-engineer
Senior Python backend engineer with expertise in:
- FastAPI, Django, Flask, SQLAlchemy, Pydantic
- Clean architecture and SOLID principles
- uv for dependency management
- Comprehensive testing with pytest
- Type hints and documentation

#### regent-cdk-architect
Senior AWS infrastructure architect with:
- CDK mastery with Python
- AWS best practices validation
- Security-first design
- Cost optimization awareness

#### regent-code-reviewer
Expert reviewer focusing on:
- Code quality and readability
- Security vulnerabilities
- Test coverage
- Performance considerations
- Does NOT fix code - only provides feedback

#### regent-test-engineer
Pytest specialist with:
- TDD workflow expertise
- Fixtures and parameterization
- Property-based testing with Hypothesis
- Clean, maintainable test code

### Spec Writer Agents

#### regent-requirements-writer
EARS format specialist:
- Transforms informal specs into structured requirements
- Uses "WHEN...THEN...SHALL" acceptance criteria
- Creates clear user stories
- Maintains glossary of domain terms
- Ensures testable, unambiguous requirements

#### regent-design-writer
Technical architecture expert:
- Creates Mermaid diagrams for system visualization
- Defines clear component interfaces with code blocks
- Formulates correctness properties with requirement traceability
- Documents error handling strategies
- Outlines testing approaches

#### regent-tasks-writer
TDD task breakdown specialist:
- Orders tasks for test-first development
- Links tasks to requirements and properties
- Sequences based on dependencies
- Creates actionable, specific steps
- Uses checkbox format for tracking

---

# Part 3: Technical Architecture

## Slack Bot Architecture

### Runtime
- **Language:** Python
- **Hosting:** AWS Lambda
- **Event-driven:** Responds to Slack events and slash commands

### AI Backend
- **SDK:** Claude Code SDK (for agentic tool use)
- **Model:** Claude Opus (or Sonnet for cost optimization)
- **Approach:** Agentic loop where Claude decides what tools to call and when

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
  - GitHub Personal Access Token (read-only, for repo context)

### Context Scope
- Bot only sees messages within the `/brainstorm` thread
- No access to broader channel history or workspace search
- Each brainstorm session is completely independent (no cross-session memory)
- **If `--repo` is provided:** Bot can read files from the specified GitHub repository

### Lambda Architecture

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
│  │  - github_read_file (if --repo)                   │  │
│  │  - github_list_directory                          │  │
│  │  - github_search_code                             │  │
│  └───────────────────────────────────────────────────┘  │
└─────────────────────┬───────────────────────────────────┘
                      │
        ┌─────────────┼─────────────┐
        ▼             ▼             ▼
┌──────────────┐ ┌─────────┐ ┌─────────────┐
│ AWS Secrets  │ │Anthropic│ │ CloudWatch  │
│ Manager      │ │ API     │ │ Logs        │
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
Read all messages in the brainstorm thread.

**Parameters:**
- `channel_id` (string): The channel containing the thread
- `thread_ts` (string): The thread timestamp

**Returns:** Array of messages with author, content, and attachment references

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
- `ref` (string, optional): Branch, tag, or commit SHA

**Returns:** File content as string

#### github_list_directory
List contents of a directory in the repository.

**Parameters:**
- `repo` (string): Repository in `owner/repo` format
- `path` (string): Directory path within the repository

**Returns:** Array of file/directory names with types

#### github_search_code
Search for code patterns within the repository.

**Parameters:**
- `repo` (string): Repository in `owner/repo` format
- `query` (string): Search query

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

---

# Part 4: Configuration

## .regent/config.yml

```yaml
version: 1

github:
  repo: owner/repo              # Default repo for issues and --repo context

# Future options (v2+)
# agents:
#   backend: regent-python-engineer
#   infrastructure: regent-cdk-architect
#   reviewer: regent-code-reviewer
#
# output:
#   diagrams: true
#   glossary: true
```

---

# Part 5: Error Handling

## User Feedback
- Detailed error messages posted to the thread
- Target audience is developers, so technical details are appropriate
- Examples:
  - "Couldn't process that attachment: unsupported file type"
  - "Failed to generate spec: context too long, try summarizing some earlier points"

## Logging
- All errors logged to **CloudWatch**
- Enables debugging and monitoring

## Constraints & Limits
- **Rate limiting:** None (trusted internal teams)
- **Concurrent sessions:** No limits
- **Admin configuration:** None—works out of the box

---

# Part 6: Deployment

## Slack Bot Deployment

1. **Create Slack App**
   - Configure OAuth scopes
   - Set up `/brainstorm` slash command
   - Enable event subscriptions

2. **AWS Infrastructure**
   - Create Lambda function (Python runtime)
   - Set up API Gateway endpoint
   - Configure Secrets Manager with credentials
   - Set up CloudWatch log group

3. **Deploy Code**
   - Lambda handler for webhook events
   - Claude Code SDK integration
   - Tool implementations for Slack and GitHub

4. **Connect**
   - Point Slack app webhook URL to API Gateway
   - Install app to workspace
   - Test with `/brainstorm test idea`

## Claude Code Plugin Deployment

1. **Create Plugin Repository**
   ```
   regent/
   ├── .claude-plugin/
   │   └── plugin.json
   ├── commands/
   ├── agents/
   └── README.md
   ```

2. **Publish Plugin**
   - Push to GitHub
   - Add to team's plugin marketplace

3. **Team Installation**
   ```bash
   claude marketplace add team-plugins https://github.com/your-org/plugins
   claude plugin install regent@team-plugins
   ```

4. **Configure**
   - Run `/regent:init` in each project
   - Set GitHub repo in `.regent/config.yml`

---

# Part 7: Future Enhancements

## v2 Roadmap

1. **Guided Backtracking**
   When `/regent:plan` reveals upstream gaps, offer to update requirements.md or design.md and cascade changes

2. **GitHub Projects Integration**
   - `/regent:create-issues` creates a GitHub Project board
   - Kanban-style tracking of all tasks
   - Auto-move issues based on PR status

3. **Additional Language Agents**
   - `regent-node-engineer`
   - `regent-go-engineer`
   - `regent-rust-engineer`

4. **Configurable Agents**
   Per-project agent customization via config.yml

5. **CI/CD Integration**
   Auto-update issue status from test results

6. **Spec Templates**
   Pre-built templates for common patterns (API, CLI tool, library)

7. **Diff View**
   Show what changed between spec versions

8. **Export**
   Generate markdown summary for stakeholder review

---

# Part 8: Design Decisions

## Why Slack for Brainstorming?
- **Collaboration is natural** - Teams already discuss ideas in Slack
- **Lower barrier** - PMs, designers, and engineers can all participate
- **Async-friendly** - Thread builds over hours/days, no pressure
- **Captures the "why"** - Discussion context preserved alongside decisions

## Why Claude Code for Implementation?
- **Local context** - Full access to codebase, tests, environment
- **TDD workflow** - Natural fit for test-first development
- **Tool integration** - Git, testing, file editing all in one place

## Why EARS Format?
EARS (Easy Approach to Requirements Syntax) provides:
- Consistent structure for acceptance criteria
- Clear testability (each criterion maps to a test)
- Unambiguous language ("SHALL" not "should")
- Industry-standard format familiar to engineers

## Why Correctness Properties?
Properties bridge requirements to tests by:
- Formalizing expected system behaviors
- Providing property-based test targets
- Creating explicit traceability (Property → Requirements)
- Enabling formal verification approaches

## Why TDD Task Ordering?
Test-first ordering ensures:
- Tests define behavior before implementation
- Implementation stays focused on requirements
- Refactoring happens with confidence
- Coverage is built-in, not afterthought

## Why GitHub Issues for Coordination?
- **Visibility** - Team sees who's working on what
- **Traceability** - PRs link to issues, issues link to specs
- **Discussion** - Comments enable async collaboration
- **Integration** - Works with existing GitHub workflows

---

# Part 9: Success Metrics

Regent succeeds if:
1. Teams complete full idea-to-implementation cycle using Slack + Claude Code
2. Multiple team members contribute to brainstorming phase
3. Context (the "why") is preserved from ideation to PR
4. Output quality matches or exceeds Kiro-generated specs
5. New team members can follow the workflow without training
6. Specs serve as living documentation throughout project lifecycle
7. Task completion rate improves due to clear requirements and design

---

*This specification combines collaborative brainstorming in Slack with local implementation in Claude Code, creating a team-first spec-driven development workflow.*
