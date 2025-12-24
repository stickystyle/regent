
# Requirements Document

## Introduction

Regent Slack Bot is a Slack-native collaborative brainstorming tool that enables teams to develop structured specifications with Claude's guidance directly in Slack. The bot conducts guided Q&A sessions in threads, synthesizes team responses into formal spec documents delivered via Slack Canvas, and optionally creates GitHub Epic issues with finalized specs stored as collapsible comments when connected to a repository.

## Glossary

- **Session**: A single brainstorming conversation, uniquely identified by channel ID and thread timestamp
- **Official Answer**: A response prefixed with `@regent` that the bot records as the definitive answer to the current question
- **Confidence Score**: Claude's self-assessed percentage (0-100%) indicating spec completeness
- **Canvas**: A Slack Canvas document containing the draft or final specification
- **ROSI**: Slack's Run On Slack Infrastructure - the serverless deployment platform for Slack apps
- **Spec**: A structured specification document following the Regent format (brainstorm.md)
- **Thread**: A Slack message thread where the brainstorming session takes place
- **Questioning Phase**: Session state where the bot asks questions and collects answers
- **Review Phase**: Session state where a draft Canvas exists and the team provides feedback
- **Finalized Phase**: Terminal session state after approval

---

## Requirements

### Requirement 1: Session Initialization

**User Story:** As a team lead, I want to start a brainstorming session with a simple slash command, so that my team can collaboratively develop a spec without leaving Slack.

#### Acceptance Criteria

1. WHEN a user invokes `/brainstorm <idea description>` THEN the system SHALL create a new thread and post an initial message acknowledging the session start.
2. WHEN a user invokes `/brainstorm --repo owner/repo <idea description>` THEN the system SHALL store the repository reference for the session and initiate codebase exploration before asking the first question.
3. WHEN `/brainstorm` is invoked in a DM channel THEN the system SHALL reject the command with an error message explaining that brainstorming requires a shared channel.
4. WHEN `/brainstorm` is invoked in a public or private channel THEN the system SHALL accept the command and create the session.
5. WHEN a session is created THEN the system SHALL store a session record containing: session ID, repository (if provided), phase (`questioning`), initiator user ID, creation timestamp, and TTL (30 days from creation).

### Requirement 2: Codebase Exploration

**User Story:** As a senior developer, I want the bot to understand our existing codebase, so that it asks contextually relevant questions and suggests patterns consistent with our architecture.

#### Acceptance Criteria

1. WHEN a session is created with `--repo owner/repo` THEN the system SHALL post a status message indicating codebase exploration is in progress.
2. WHEN exploring a repository THEN the system SHALL read key files including README, package manifests (package.json, pyproject.toml), and source directory structure.
3. WHEN exploration completes THEN the system SHALL post a summary of findings (framework, patterns, relevant existing code) before asking the first question.
4. WHEN the GitHub token lacks access to the specified repository THEN the system SHALL display an error message and offer to continue without repository context.
5. WHILE in questioning phase with a repository configured THEN the system SHALL reference relevant existing code in questions when applicable.

### Requirement 3: Question-Answer Workflow

**User Story:** As a team member, I want the bot to ask one question at a time, so that the team can focus discussion and provide thoughtful answers without feeling overwhelmed.

#### Acceptance Criteria

1. WHILE in questioning phase THEN the system SHALL ask exactly one question per turn.
2. WHEN a user posts `@regent <answer text>` in the session thread THEN the system SHALL record the answer and proceed to the next question or phase transition.
3. WHEN a message is posted in the thread without `@regent` mention THEN the system SHALL store the message for context but SHALL NOT respond or treat it as an official answer.
4. WHEN a user posts `@regent next` THEN the system SHALL skip the current question and ask the next one.
5. WHEN a user posts `@regent ready` THEN the system SHALL transition to review phase regardless of current confidence score.
6. WHEN Claude's confidence score reaches 95% or higher THEN the system SHALL transition to review phase and create a draft Canvas.

### Requirement 4: Attachment Processing

**User Story:** As a product manager, I want to share mockups and documents during brainstorming, so that the bot can incorporate visual designs and existing documentation into its questions.

#### Acceptance Criteria

1. WHEN an image file (PNG, JPG, GIF, WebP) is shared in the session thread THEN the system SHALL download the file and include it in the next Claude request via the vision API.
2. WHEN a text-based file (Markdown, plain text, code files) is shared in the session thread THEN the system SHALL extract the text content and include it as context.
3. WHEN a PDF file is shared in the session thread THEN the system SHALL extract text content and include it as context.
4. WHEN an attachment exceeds Claude's input limits THEN the system SHALL acknowledge the file but note that it could not be fully processed.
5. WHEN processing attachments THEN the system SHALL reference them in follow-up questions when relevant to the discussion.

### Requirement 5: Canvas Creation and Management

**User Story:** As a team lead, I want the draft spec delivered as a Slack Canvas, so that the team can review it in a familiar format and provide feedback easily.

#### Acceptance Criteria

1. WHEN transitioning to review phase THEN the system SHALL create a Slack Canvas containing the structured spec document.
2. WHEN the Canvas is created THEN the system SHALL post a message in the thread with review instructions including how to provide feedback and how to approve.
3. WHEN a user posts `@regent <feedback>` during review phase THEN the system SHALL update the Canvas content based on the feedback.
4. IF Canvas creation fails THEN the system SHALL fall back to uploading `brainstorm.md` as a file attachment to the thread.
5. WHEN the Canvas is created THEN it SHALL follow the Regent spec format including: title, overview, problem statement, goals/non-goals, personas, use cases, and any technical details captured.

### Requirement 6: Session Finalization and Epic Creation

**User Story:** As a senior developer, I want the finalized spec stored on a GitHub Epic issue, so that I can immediately use it with the local Regent workflow via `/regent:specify --epic N`.

#### Acceptance Criteria

1. WHEN a user posts `@regent approved` during review phase THEN the system SHALL transition the session to finalized phase.
2. GIVEN a session has a repository configured WHEN the session is finalized THEN the system SHALL create a GitHub Epic issue with `regent:epic` label and store the brainstorm.md as a collapsible comment using `<!-- REGENT_SPEC:brainstorm -->` marker.
3. WHEN creating an Epic THEN the system SHALL include in the body: a summary of the spec, and links to continue the workflow.
4. WHEN storing a spec comment THEN the system SHALL format it with a collapsible `<details>` wrapper for readability.
5. GIVEN a session has no repository configured WHEN the session is finalized THEN the system SHALL mark the session complete and inform the user the Canvas/file is available for manual use.
6. WHEN the Epic is created THEN the system SHALL post the Epic URL to Slack so users can continue with `/regent:specify --epic N`.

### Requirement 7: Session Persistence and Resumption

**User Story:** As a busy developer, I want to resume a brainstorming session after interruptions, so that work isn't lost when the team gets pulled into other priorities.

#### Acceptance Criteria

1. WHEN a session is created THEN the system SHALL set a TTL of 30 days from the creation timestamp.
2. WHEN a session record expires (TTL exceeded) THEN the system SHALL allow the record to be deleted.
3. WHEN a user posts `@regent` in a thread with an expired or missing session record THEN the system SHALL create a new session record and re-read the entire thread history to rebuild context.
4. WHEN rebuilding context from thread history THEN the system SHALL handle Slack API pagination for threads with 100+ messages.
5. WHEN resuming a session THEN the system SHALL infer the appropriate phase (questioning or review) from the thread history and continue accordingly.

### Requirement 8: Error Handling

**User Story:** As a developer, I want clear and detailed error messages, so that I can quickly understand what went wrong and how to fix it.

#### Acceptance Criteria

1. WHEN an error occurs THEN the system SHALL display a verbose error message in the thread including: error type, specific details, and suggested action.
2. WHEN a transient error occurs (API timeout, rate limit) THEN the system SHALL retry with exponential backoff up to 3 times before reporting failure.
3. WHEN a GitHub API rate limit is exceeded THEN the system SHALL display the reset time and confirm that the user's answer was saved.
4. WHEN an authentication error occurs (invalid token) THEN the system SHALL display a clear message indicating the bot cannot proceed until the issue is resolved.
5. WHEN a user provides an invalid repository format THEN the system SHALL explain the correct format (`owner/repo`) and prompt for retry.
6. WHEN the Anthropic API returns an error THEN the system SHALL save any pending user input and retry automatically.

### Requirement 9: Concurrent Session Handling

**User Story:** As a workspace admin, I want multiple teams to brainstorm simultaneously, so that the bot scales across our organization.

#### Acceptance Criteria

1. The system SHALL support multiple concurrent brainstorming sessions across different channels in the same workspace.
2. The system SHALL support multiple concurrent brainstorming sessions in different threads within the same channel.
3. WHEN processing a message THEN the system SHALL identify the correct session using the channel ID and thread timestamp combination.
4. The system SHALL isolate session state such that actions in one session do not affect other sessions.

### Requirement 10: Security and Access Control

**User Story:** As a security-conscious team lead, I want the bot to only access repositories and channels it's explicitly invited to, so that sensitive information remains protected.

#### Acceptance Criteria

1. The system SHALL store secrets (API keys, tokens) only in Slack's secure environment variables.
2. The system SHALL only access repositories explicitly specified in `/brainstorm` commands.
3. The system SHALL only read threads in which it has been invoked via slash command or mention.
4. The system SHALL NOT store message content in the datastore; only session metadata (IDs, timestamps, phase).
5. WHEN a user specifies a repository the GitHub token cannot access THEN the system SHALL report the access error and offer to continue without repository context.

### Requirement 11: Performance

**User Story:** As a team member, I want the bot to respond quickly, so that brainstorming sessions feel like natural conversations rather than waiting for a slow system.

#### Acceptance Criteria

1. WHEN processing a simple message (no tool calls) THEN the system SHALL respond within 5 seconds (p95).
2. WHEN performing repository exploration THEN the system SHALL respond within 30 seconds (p95).
3. WHEN the system cannot meet latency targets THEN it SHALL post a "thinking..." indicator to acknowledge receipt.
