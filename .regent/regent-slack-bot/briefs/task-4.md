# Task Brief

## From Issue #37

## Overview

**Task 4**: Implement error handling types and retry logic
**Type**: test-first

- Write tests for error categorization (transient vs permanent)
- Implement error type hierarchy with Slack message formatting
- Write tests for exponential backoff (timing, max retries)
- Implement RetryHandler with backoff calculation
- Write property test: **Property 11 - Retry Logic**

## Requirements

### Requirement 8: Error Handling
**User Story:** As a developer, I want clear and detailed error messages, so that I can quickly understand what went wrong and how to fix it.

**Acceptance Criteria:**
1. WHEN an error occurs THEN the system SHALL display a verbose error message in the thread including: error type, specific details, and suggested action.
2. WHEN a transient error occurs (API timeout, rate limit) THEN the system SHALL retry with exponential backoff up to 3 times before reporting failure.
3. WHEN a GitHub API rate limit is exceeded THEN the system SHALL display the reset time and confirm that the user's answer was saved.
6. WHEN the Anthropic API returns an error THEN the system SHALL save any pending user input and retry automatically.

## Design Context

### Error Handling Categories

**GitHub Access Errors:**
- Trigger: Repository cannot be accessed with configured token
- Response: Post error message, offer to continue without repository context
- Recovery: User fixes permissions or continues without repo

**Slack API Errors:**
- Trigger: Canvas creation fails, rate limits, pagination errors
- Response: Canvas fallback to file upload, display reset time, suggest reducing thread size
- Recovery: Automatic fallback for Canvas, self-recovery for rate limits

**Anthropic API Errors:**
- Trigger: Rate limit, model error, input too long
- Response: Save user input, retry with exponential backoff (up to 3 attempts)
- Recovery: Most errors are transient and resolve with retry

### Correctness Properties

**Property 10: Error Disclosure**
*For any* error condition, *the system should* display a verbose message including error type, details, and suggested action

**Property 11: Retry Logic**
*For any* transient error (timeout, rate limit), *the system should* retry with exponential backoff up to 3 times before reporting failure

## Codebase Context

### Current Implementation State

**Project Structure:**
```
slackbot/
├── src/
│   ├── types/
│   │   ├── session.ts              # Session data model with Phase enum
│   │   ├── message.ts              # Message and ProcessedAttachment types
│   │   ├── spec-document.ts        # SpecDocument with Persona, UseCase
│   │   ├── repository-context.ts   # RepositoryContext with Framework enum
│   │   └── index.ts                # Central type exports
│   └── mod.ts                       # Main module entry point
└── tests/
    ├── types/
    │   ├── session.test.ts
    │   ├── message.test.ts
    │   ├── spec-document.test.ts
    │   └── repository-context.test.ts
    └── example_test.ts
```

**Key Existing Data Models:**
- Session with Phase enum (Questioning, Review, Finalized)
- Message with official answer detection
- SpecDocument with Persona and UseCase interfaces
- RepositoryContext with Framework enum

### Test Template Reference

**Test File Location:** `slackbot/tests/types/`

**Import Pattern (Deno style):**
```typescript
import { assertEquals, assertExists } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
```

**Test Structure:**
- Uses `describe()` for test suites
- Uses `it()` for individual test cases
- Flat assertion API: `assertEquals()`, `assertExists()`

### Project Conventions

**Import Style (Deno):**
- Uses explicit `.ts` file extensions
- Uses JSR packages: `@std/assert`
- Uses `@std/testing/bdd` for describe/it

**File Naming:**
- Implementation: `snake-case.ts`
- Tests: `{name}.test.ts` in `tests/` directory

**ABOUTME Header Requirement:**
All files must start with:
```typescript
// ABOUTME: [description line 1]
// ABOUTME: [description line 2]
```

### Files to Create

1. `slackbot/src/errors/types.ts` - Error class hierarchy
2. `slackbot/src/errors/retry.ts` - RetryHandler with exponential backoff
3. `slackbot/src/errors/index.ts` - Central exports
4. `slackbot/tests/errors/types.test.ts` - Error categorization tests
5. `slackbot/tests/errors/retry.test.ts` - Retry logic tests + property test

### Files to Modify

1. `slackbot/src/mod.ts` - Add exports for error types

## Error Hierarchy Design

```
BaseError
├── TransientError (retryable)
│   ├── GitHubRateLimitError
│   ├── SlackRateLimitError
│   ├── SlackCanvasError
│   ├── AnthropicRateLimitError
│   └── NetworkTimeoutError
└── PermanentError (not retryable)
    ├── GitHubAccessError
    ├── AnthropicModelError
    ├── AnthropicInputError
    └── ValidationError
```

Each error must support:
- `type`: Error category name
- `message`: Human-readable message
- `details`: Specific error details
- `suggestedAction`: What the user should do
- `toSlackMessage()`: Format for Slack display

## Exponential Backoff Specification

- Base delay: 1000ms (1 second)
- Multiplier: 2x
- Max attempts: 3
- Delays: attempt 1 (0s), attempt 2 (1s), attempt 3 (2s)
- Optional jitter for production use

---
*Branch: feature/regent-slack-bot*
*Generated at execution time by Regent*
