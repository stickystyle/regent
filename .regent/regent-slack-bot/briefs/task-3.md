# Task Brief

## From Issue #36

**Task 3**: Implement SpecDocument and RepositoryContext models
**Type**: test-first

- Write tests for SpecDocument (all sections, markdown formatting)
- Implement SpecDocument type matching Regent brainstorm.md format
- Write tests for RepositoryContext (framework detection, file parsing)
- Implement RepositoryContext type with exploration metadata

📋 **Spec Files**: [requirements](https://github.com/stickystyle/regent/blob/main/.regent/regent-slack-bot/requirements.md) • [design](https://github.com/stickystyle/regent/blob/main/.regent/regent-slack-bot/design.md) • [tasks](https://github.com/stickystyle/regent/blob/main/.regent/regent-slack-bot/tasks.md)

## Requirements

> 📄 *Full requirements: [regent-slack-bot/requirements.md](https://github.com/stickystyle/regent/blob/main/.regent/regent-slack-bot/requirements.md)*

### Requirement 2: Codebase Exploration
**User Story:** As a senior developer, I want the bot to understand our existing codebase, so that it asks contextually relevant questions and suggests patterns consistent with our architecture.

**Acceptance Criteria:**
> 1. WHEN a session is created with `--repo owner/repo` THEN the system SHALL post a status message indicating codebase exploration is in progress.
> 2. WHEN exploring a repository THEN the system SHALL read key files including README, package manifests (package.json, pyproject.toml), and source directory structure.
> 3. WHEN exploration completes THEN the system SHALL post a summary of findings (framework, patterns, relevant existing code) before asking the first question.

### Requirement 5: Canvas Creation and Management
**User Story:** As a team lead, I want the draft spec delivered as a Slack Canvas, so that the team can review it in a familiar format and provide feedback easily.

**Acceptance Criteria:**
> 1. WHEN transitioning to review phase THEN the system SHALL create a Slack Canvas containing the structured spec document.
> 2. WHEN the Canvas is created THEN the system SHALL post a message in the thread with review instructions including how to provide feedback and how to approve.

## Design Context

> 📄 *Full design: [regent-slack-bot/design.md](https://github.com/stickystyle/regent/blob/main/.regent/regent-slack-bot/design.md)*

### SpecDocument Data Model

Represents the structured specification document in Regent brainstorm.md format.

**Key Attributes:**
- `title`: Spec title
- `overview`: High-level summary
- `problem_statement`: Problem being solved
- `goals`: What the project will accomplish
- `non_goals`: Explicitly out of scope items
- `personas`: User roles and descriptions
- `use_cases`: Concrete usage scenarios
- `technical_details`: Architecture notes, constraints, decisions
- `open_questions`: Remaining uncertainties

**Relationships:**
- Belongs to Session
- Rendered as Canvas or uploaded file

### RepositoryContext Data Model

Contains information extracted from GitHub repository exploration to inform Claude's questions.

**Key Attributes:**
- `framework`: Detected framework (React, FastAPI, etc.)
- `patterns`: Identified architectural patterns
- `relevant_files`: Key files referenced in questions
- `structure`: Directory layout summary

**Relationships:**
- Belongs to Session (if repo configured)
- Used by AnthropicClient for contextual questioning

### Existing Infrastructure

**Regent Claude Code Plugin**: Defines the `brainstorm.md` format through the `regent-brainstorm-writer` agent. This Slack bot produces spec documents that exactly match the format expected by the local Regent workflow (`/regent:specify` command).

## Task Relationships

> 📄 *All tasks: [regent-slack-bot/tasks.md](https://github.com/stickystyle/regent/blob/main/.regent/regent-slack-bot/tasks.md)*

- **Depends on**: Task 1 (project structure), Task 2 (Session and Message models)
- **Blocks**: Tasks 12, 13, 15, 19 (repository exploration and spec synthesis)
- **TDD pair**: Tests written first, then implementation

## Implementation Guidance

Follow TDD approach:
1. Write tests for SpecDocument structure matching Regent brainstorm.md format
2. Verify all required sections are present (title, overview, problem, goals, non-goals, personas, use cases)
3. Test markdown formatting for each section
4. Implement SpecDocument type
5. Write tests for RepositoryContext framework detection (React, FastAPI, Next.js, etc.)
6. Write tests for file parsing (README, package.json, pyproject.toml)
7. Implement RepositoryContext type

The SpecDocument must exactly match the format produced by the `regent-brainstorm-writer` agent in the Claude Code plugin to ensure compatibility with the `/regent:specify` command.

## Codebase Context

### Current Implementation State

**Session and Message Models** (from Task 2):

Session Type (`slackbot/src/types/session.ts`):
- Composite ID: `session_id` field with format `{channel_id}:{thread_ts}`
- Phase enum with three values: `Questioning`, `Review`, `Finalized`
- Helper function: `formatSessionId(channelId, threadTs)` for consistent ID generation
- Optional fields: `repository`, `canvas_id` (for repo and canvas tracking)
- Core fields: `phase`, `initiator_user_id`, `confidence_score`, `created_at`, `ttl`
- All timestamps use ISO 8601 format as strings

Message Type (`slackbot/src/types/message.ts`):
- Sender tracking: `sender` (either `"bot"` or Slack user ID)
- Official answer detection: `is_official_answer` boolean flag
- Helper function: `isOfficialAnswer(text)` - checks if text starts with `@regent`
- Attachment support: `attachments?: ProcessedAttachment[]` array
- `ProcessedAttachment` has: `file_id`, `filename`, `mimetype`, `content`

**Type Definition Patterns**:
- Uses TypeScript `interface` declarations (not `type`)
- Each interface is well-documented with JSDoc comments
- All types exported from central `index.ts` for easy importing
- Helper functions placed alongside their related types
- Optional fields use `?:` syntax

**Export pattern** (`slackbot/src/types/index.ts`):
```typescript
export { formatSessionId, Phase, type Session } from "./session.ts";
export { isOfficialAnswer, type Message, type ProcessedAttachment } from "./message.ts";
```

### Test Template Reference

**Testing Framework**: Deno test runner with BDD-style (`@std/testing/bdd`)
**Assertions**: `@std/assert` module (`assertEquals`, `assertExists`, etc.)

**Test File Structure Pattern** (from `session.test.ts`):
```typescript
import { assertEquals, assertExists } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import { formatSessionId, Phase, Session } from "../../src/types/session.ts";

describe("Session Type", () => {
  describe("formatSessionId", () => {
    it("should format session ID as channel_id:thread_ts", () => {
      const channelId = "C1234567890";
      const threadTs = "1234567890.123456";
      const sessionId = formatSessionId(channelId, threadTs);
      assertEquals(sessionId, "C1234567890:1234567890.123456");
    });
  });

  describe("Phase enum", () => {
    // Test each phase value
  });

  describe("Session interface", () => {
    // Test creation, optional fields
  });
});
```

**Key Testing Patterns**:
1. Enum validation: Test each enum value separately and verify count
2. Interface creation: Create instances with all required and optional fields
3. Helper function behavior: Extensive test coverage for edge cases
4. Optional field handling: Test with and without optional fields
5. Data format validation: Verify timestamps, IDs, and formats

### Regent brainstorm.md Format

The brainstorm.md file is the **contract format** that SpecDocument must match. Exact markdown structure:

```markdown
# [Spec Title]

## Overview
[High-level summary paragraph]

## Problem Statement
[Description of current pain points and gaps]

## Goals and Non-Goals

### Goals
- [Goal 1]
- [Goal 2]

### Non-Goals
- [Non-goal 1]
- [Non-goal 2]

## User Personas

### [Persona Name]
[Description of role, context, and needs]

### [Persona Name 2]
[Description]

## Use Cases

### UC1: [Use Case Title]
[Description and flow]

### UC2: [Use Case Title]
[Description and flow]

## Technical Details / Architecture
[Technical constraints, framework choices, architectural decisions]

## Open Questions
[Remaining uncertainties or decisions deferred]
```

**Key Format Requirements**:
- Title is level 1 heading
- Main sections are level 2 headings
- Subsections (Goals, Non-Goals, Personas, Use Cases) are level 3 headings
- Lists use markdown bullet points
- All content is Markdown-compatible
- Can include code blocks, diagrams, nested lists

### Project Conventions

**File Organization**:
```
slackbot/
├── src/
│   ├── types/           # Data model definitions
│   │   ├── session.ts   # Session and Phase types
│   │   ├── message.ts   # Message and ProcessedAttachment types
│   │   └── index.ts     # Central export point (ABOUTME at top)
├── tests/
│   ├── types/          # Tests for types (mirror src structure)
│   │   ├── session.test.ts
│   │   └── message.test.ts
```

**Import/Export Style**:
- Central `index.ts` re-exports all public types for convenient importing
- Use `export { type SomeName } from "./relative/path.ts"` for types
- Use relative imports within src/tests (e.g., `"../../src/types/session.ts"`)

**Naming Conventions**:
- Type names: PascalCase (`Session`, `Message`, `ProcessedAttachment`)
- Function names: camelCase (`formatSessionId`, `isOfficialAnswer`)
- File names: kebab-case (`session.ts`, `message.ts`)
- Test files: `{name}.test.ts` pattern
- Enum values: PascalCase (`Phase.Questioning`)

**Comment Convention (CRITICAL)**:
Every source file must start with exactly 2 lines of comments:
```typescript
// ABOUTME: [First line describing the file's purpose]
// ABOUTME: [Second line with additional detail if needed]
```

### Task 3 Specific Requirements

**SpecDocument Model** must have:
- `title`: string - Spec title
- `overview`: string - High-level summary
- `problem_statement`: string - Problem being solved
- `goals`: string[] - What the project will accomplish
- `non_goals`: string[] - Explicitly out of scope items
- `personas`: Map or array - User roles and descriptions
- `use_cases`: Map or array - Concrete usage scenarios
- `technical_details`: string - Architecture notes, constraints, decisions
- `open_questions`: string[] - Remaining uncertainties

**RepositoryContext Model** must have:
- `framework`: string - Detected framework (React, FastAPI, etc.)
- `patterns`: string[] - Identified architectural patterns
- `relevant_files`: Map or array - Key files referenced
- `structure`: string - Directory layout summary

### Files to Create/Modify

**Create new files** (following test-first approach):
1. `slackbot/tests/types/spec-document.test.ts` - Tests for SpecDocument
2. `slackbot/tests/types/repository-context.test.ts` - Tests for RepositoryContext
3. `slackbot/src/types/spec-document.ts` - SpecDocument implementation
4. `slackbot/src/types/repository-context.ts` - RepositoryContext implementation

**Update existing files**:
1. `slackbot/src/types/index.ts` - Add exports for new types

### Files to Reference

- `slackbot/src/types/session.ts` - Pattern for type definition and helper functions
- `slackbot/src/types/message.ts` - Pattern for complex types with nested interfaces
- `slackbot/tests/types/session.test.ts` - Template for comprehensive type tests
- `slackbot/tests/types/message.test.ts` - Template for interface and helper testing
- `.regent/regent-slack-bot/brainstorm.md` - Actual brainstorm.md format example

### Implementation Order (TDD)

1. Write SpecDocument tests - Cover all brainstorm.md sections with comprehensive assertions
2. Implement SpecDocument interface - Match the test requirements
3. Write RepositoryContext tests - Cover framework detection and file structure
4. Implement RepositoryContext interface - Match the test requirements
5. Update exports in `types/index.ts`
6. Run full test suite - `deno task test` to verify

---
*Branch: feature/regent-slack-bot*
*Generated at execution time by Regent*
