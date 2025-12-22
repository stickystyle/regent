# Task Brief

## From Issue #35

**Task 2**: Implement Session and Message data models
**Type**: test-first

### Overview

- Write tests for Session (composite ID, phase transitions, TTL calculation)
- Implement Session type with phase enum (questioning, review, finalized)
- Write tests for Message (official answer detection, attachment parsing)
- Implement Message type with sender tracking
- Write tests for session ID formatting ({channel_id}:{thread_ts})

### Requirements

**Requirement 1: Session Initialization**
User Story: As a team lead, I want to start a brainstorming session with a simple slash command, so that my team can collaboratively develop a spec without leaving Slack.

Acceptance Criteria:
> 5. WHEN a session is created THEN the system SHALL store a session record containing: session ID, repository (if provided), phase (`questioning`), initiator user ID, creation timestamp, and TTL (30 days from creation).

**Requirement 3: Question-Answer Workflow**
User Story: As a team member, I want the bot to ask one question at a time, so that the team can focus discussion and provide thoughtful answers without feeling overwhelmed.

Acceptance Criteria:
> 2. WHEN a user posts `@regent <answer text>` in the session thread THEN the system SHALL record the answer and proceed to the next question or phase transition.

**Requirement 7: Session Persistence and Resumption**
User Story: As a busy developer, I want to resume a brainstorming session after interruptions, so that work isn't lost when the team gets pulled into other priorities.

Acceptance Criteria:
> 1. WHEN a session is created THEN the system SHALL set a TTL of 30 days from the creation timestamp.

### Design Context

**Session Data Model**

Represents a single brainstorming conversation in a specific channel thread. Sessions are identified by the combination of channel ID and thread timestamp, ensuring uniqueness across concurrent sessions.

Key Attributes:
- `session_id`: Composite key `{channel_id}:{thread_ts}`
- `repository`: Optional GitHub repository in `owner/repo` format
- `phase`: Current state (questioning, review, finalized)
- `initiator_user_id`: User who started the session
- `canvas_id`: Slack Canvas identifier (set during review phase)
- `confidence_score`: Claude's current confidence (0-100%)
- `created_at`: Session creation timestamp
- `ttl`: Expiration timestamp (created_at + 30 days)

**Message Data Model**

Represents a single message in the conversation thread, including both user answers and bot questions.

Key Attributes:
- `sender`: User ID or "bot"
- `text`: Message content
- `timestamp`: Message timestamp from Slack
- `is_official_answer`: Whether message started with `@regent`
- `attachments`: List of processed file contents

**Correctness Properties**:
- **Property 1: Session Isolation** - Sessions must not share state across different threads
- **Property 2: Answer Recording** - Messages prefixed with @regent must be recorded as official answers
- **Property 9: TTL Enforcement** - TTL must be set to creation timestamp plus 30 days

### Task Relationships

- **Depends on**: Task 1 (project structure)
- **Blocks**: Tasks 3-26 (all tasks require these data models)
- **TDD pair**: Tests written first, then implementation

### Implementation Guidance

Follow TDD approach:
1. Write tests for Session composite ID format: `{channel_id}:{thread_ts}`
2. Write tests for phase enum validation (must be one of: questioning, review, finalized)
3. Write tests for TTL calculation (created_at + 30 days)
4. Implement Session type
5. Write tests for Message official answer detection (@regent prefix)
6. Write tests for attachment parsing
7. Implement Message type

These are foundational data models used throughout the system. Ensure TypeScript types are properly defined with strict null checking.

---

## Codebase Context

### Current Implementation State

The slackbot is a **Deno/TypeScript project** using Slack's ROSI (Run On Slack Infrastructure) platform. The project structure is partially initialized with infrastructure in place but no data models yet implemented.

#### Directory Structure
```
slackbot/
├── manifest.ts           # Slack app manifest defining scopes and configuration
├── deno.jsonc           # Deno configuration with imports and task definitions
├── slack.json           # Slack CLI hooks for local development
├── README.md            # Development documentation
├── .gitignore           # Ignores for .slack/, .deno/, deno.lock
├── deno.lock            # Lock file for dependencies
├── src/                 # Implementation code (currently contains only mod.ts)
│   └── mod.ts          # Main entry point (empty, ready for exports)
├── tests/               # Test directory
│   └── example_test.ts  # Example test showing testing patterns
├── functions/           # Slack ROSI functions (empty)
├── workflows/           # Slack ROSI workflows (empty)
└── triggers/            # Event triggers (empty)
```

#### Current deno.jsonc Configuration
```jsonc
{
  "compilerOptions": {
    "lib": ["deno.window"],
    "strict": true
  },
  "imports": {
    "deno-slack-sdk/": "https://deno.land/x/deno_slack_sdk@2.14.3/",
    "deno-slack-api/": "https://deno.land/x/deno_slack_api@2.8.0/",
    "@std/assert": "jsr:@std/assert@1",
    "@std/testing/bdd": "jsr:@std/testing@1/bdd"
  },
  "fmt": {
    "lineWidth": 100,
    "semiColons": true,
    "singleQuote": false
  },
  "lint": {
    "rules": {
      "tags": ["recommended"]
    }
  },
  "tasks": {
    "test": "deno test --allow-read --allow-net",
    "test:coverage": "deno test --allow-read --allow-net --coverage=coverage && deno coverage coverage",
    "check": "deno check **/*.ts",
    "fmt": "deno fmt",
    "lint": "deno lint"
  }
}
```

#### Existing Code Files

**src/mod.ts** (Current state - empty placeholder):
```typescript
// ABOUTME: Main module entry point for slackbot implementation code.
// ABOUTME: Re-exports public APIs from submodules as they are implemented.

// This file serves as the main entry point for the slackbot implementation.
// Submodules will be added and re-exported here as they are developed.
```

#### Test Template Reference

**Testing Framework**:
- Framework: Deno's built-in test runner with `@std/testing/bdd` for describe/it syntax
- Assertion Library: `@std/assert` providing assertEquals, assert, etc.
- Coverage: Built-in via `deno test --coverage=coverage && deno coverage coverage`

**Test File Pattern**:
- Test files use the naming convention: `*.test.ts` or `*_test.ts`
- Located in `tests/` directory mirroring `src/` structure
- Typically one test file per source module

**Key Patterns (from example_test.ts)**:
```typescript
// ABOUTME: Example test file demonstrating Deno test runner configuration.
// ABOUTME: Verifies testing infrastructure is working correctly.

import { assertEquals } from "@std/assert";
import { describe, it } from "@std/testing/bdd";

describe("Testing Infrastructure", () => {
  it("should run a basic assertion", () => {
    assertEquals(1 + 1, 2);
  });

  it("should handle string comparisons", () => {
    assertEquals("hello", "hello");
  });
});
```

### Project Conventions

1. **ABOUTME Header Convention (CRITICAL)**
   Every TypeScript file MUST start with a 2-line comment with "ABOUTME: " prefix:
   ```typescript
   // ABOUTME: Brief one-line description of file purpose
   // ABOUTME: Optional second line for additional context
   ```

2. **Import Style**
   - Uses Deno's import maps from `deno.jsonc`
   - Standard imports: `import { X } from "@std/...";`
   - Slack SDK: `import { X } from "deno-slack-sdk/mod.ts";`
   - No relative imports needed when using import maps

3. **Type Definition Style**
   - TypeScript strict mode enabled (`"strict": true`)
   - Use `interface` for contracts, `type` for unions/aliases
   - Explicit type annotations required
   - No `any` types without justification

4. **Code Formatting**
   - Line width: 100 characters (enforced by `deno fmt`)
   - Semicolons: Required
   - Quotes: Double quotes (`"string"`)
   - Formatting via `deno task fmt`
   - Linting via `deno task lint`

5. **File Organization Pattern**
   ```
   src/
   ├── types/          # Data model type definitions
   ├── models/         # Business logic and implementations
   ├── services/       # Domain-specific service classes
   └── mod.ts         # Public API exports

   tests/
   ├── types/          # Type definition tests (mirrors src structure)
   ├── models/         # Model/implementation tests
   ├── services/       # Service tests
   └── fixtures/       # Test data and mocks
   ```

### Files to Create

1. **`slackbot/src/types/session.ts`**
   - Purpose: Type definitions for Session data model
   - Contents:
     - `Phase` enum: "questioning" | "review" | "finalized"
     - `Session` interface with all required fields
     - Helper function for session ID formatting

2. **`slackbot/src/types/message.ts`**
   - Purpose: Type definitions for Message data model
   - Contents:
     - `ProcessedAttachment` interface
     - `Message` interface with all required fields
     - Type for official answer detection

3. **`slackbot/src/types/index.ts`**
   - Purpose: Central export point for all type definitions
   - Contents: Re-exports from session.ts and message.ts

4. **`slackbot/tests/types/session.test.ts`**
   - Purpose: Comprehensive tests for Session model
   - Key test cases:
     - Session ID formatting (channel_id:thread_ts)
     - Phase enum values
     - TTL calculation (30 days from creation)
     - Phase transition validation
     - Optional field handling (repository, canvas_id)
     - Confidence score bounds (0-100%)
     - Timestamp formats

5. **`slackbot/tests/types/message.test.ts`**
   - Purpose: Comprehensive tests for Message model
   - Key test cases:
     - Official answer detection from text prefix
     - Sender identification (user ID vs "bot")
     - Attachment parsing and processing
     - Timestamp handling
     - Text content validation
     - Edge cases (empty attachments, no prefix, etc.)

### Key Design Decisions from Specification

1. **Session Identification**: Uses composite `channel_id:thread_ts` format to ensure uniqueness across concurrent sessions
2. **Phase Management**: Three-state machine (questioning → review → finalized)
3. **TTL Handling**: 30-day expiration stored as timestamp (not relative duration)
4. **Official Answers**: Detected by `@regent` prefix in message text
5. **Confidence Scoring**: Stored as 0-100 percentage, extracted from Claude responses
6. **Slack Integration**: Session state persisted to Slack Datastore (not implemented in these models, but models must support it)

### Testing Infrastructure

```bash
# Run tests
deno task test

# Run with coverage
deno task test:coverage

# Check code
deno task check

# Format code
deno task fmt

# Lint code
deno task lint
```

Tests use:
- `@std/assert` (v1.0.16) for assertions
- `@std/testing/bdd` (v1.0.16) for describe/it structure
- Deno's built-in test runner (no external test framework needed)

---

*Branch: feature/regent-slack-bot*
*Generated at execution time by Regent*
