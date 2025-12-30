# Task Brief

## From Issue #43

**Task 8a**: Refactor event handling from command-driven to conversational approach
**Type**: refactor

## Background

The original implementation (issue #16) used a command-driven approach with specific keywords:
- `@regent answer` → record official answer
- `@regent next` → skip question
- `@regent ready` → transition to review
- `@regent approved` → finalize

This creates a "bot with controls" experience rather than a "team member" experience.

## New Approach: Conversational Intent

Instead of parsing commands, the bot should:
1. Detect any `@regent` mention (someone is talking to the bot)
2. Pass the full thread context to the LLM
3. Let the LLM understand intent naturally ("we're done", "let's move on", "looks good")
4. LLM decides phase transitions based on conversation context, not keywords

## Changes Required

### Remove
- `CommandType` enum and `ExtractedCommand` interface
- `extractCommand()` function with keyword parsing
- `is_official_answer` field from Message type
- Validation errors for "unknown commands"

### Simplify
- `handleMessageEvent()` → detect `@regent` mention, create Message, return for LLM processing
- No distinction between "official answers" and other messages - all `@regent` messages go to LLM

### Update Tests
- Remove command parsing tests
- Add tests for simple mention detection
- Property test: any `@regent` message triggers LLM response

## Files to Modify

- `src/handlers/message-event.ts` - simplify to mention detection only
- `src/types/message.ts` - remove `is_official_answer` field
- `tests/handlers/message-event.test.ts` - rewrite for conversational approach

## Design Principle

> The Regent Slack bot should feel like another team member, not a bot with controls. Opus is smart enough to understand "we're done" without needing `@regent approved`.

---
*Part of Epic #42 • Follows #16*

## Codebase Context

### Current Implementation State

#### CommandType Enum and Command Extraction (to be removed)

**File:** `slackbot/src/handlers/message-event.ts` (lines 10-17, 81-87, 184-243)

```typescript
// LINES 10-17: CommandType enum
export const CommandType = {
  ANSWER: "answer",
  NEXT: "next",
  READY: "ready",
  APPROVED: "approved",
} as const;

export type CommandTypeValue = typeof CommandType[keyof typeof CommandType];

// LINES 81-87: ExtractedCommand interface
export interface ExtractedCommand {
  command: CommandTypeValue;
  text?: string;
}

// LINES 184-243: extractCommand() function
export function extractCommand(text: string): ExtractedCommand {
  if (!isMentionCommand(text)) {
    throw new ValidationError(
      "Invalid mention command",
      "Text is not a mention command",
      "Message must start with @regent to be processed as a command",
    );
  }

  // Remove bot mention tag if present
  let cleanText = text;
  const botMentionPattern = /^<@\w+>\s+/;
  if (botMentionPattern.test(text)) {
    cleanText = text.replace(botMentionPattern, "");
  }

  // Remove @regent prefix
  const afterRegent = cleanText.slice(7).trim(); // "@regent" is 7 chars

  // Check for command keywords
  const lowerAfterRegent = afterRegent.toLowerCase();

  if (lowerAfterRegent === CommandType.NEXT) {
    return { command: CommandType.NEXT };
  }

  if (lowerAfterRegent === CommandType.READY) {
    return { command: CommandType.READY };
  }

  if (lowerAfterRegent === CommandType.APPROVED) {
    return { command: CommandType.APPROVED };
  }

  // Check if it's an invalid single-word command
  const words = afterRegent.split(/\s+/);
  if (words.length === 1 && words[0].length > 0) {
    // Single word that's not a recognized command
    throw new ValidationError(
      "Unknown command",
      `Command '${words[0]}' is not recognized`,
      "Valid commands are: next, ready, approved. Or provide answer text after @regent",
    );
  }

  // Default to 'answer' command with text
  // Reject empty answer text
  if (afterRegent.length === 0) {
    throw new ValidationError(
      "Empty answer text",
      "Answer command has no text",
      "Please provide answer text after @regent, or use a command like 'next' or 'ready'",
    );
  }

  return {
    command: CommandType.ANSWER,
    text: afterRegent,
  };
}
```

#### MessageEventResult Interface (to be simplified)

**File:** `slackbot/src/handlers/message-event.ts` (lines 89-104)

```typescript
export interface MessageEventResult {
  /** Whether the bot should respond to this message */
  shouldRespond: boolean;

  /** Extracted command (only present if shouldRespond is true) */
  command?: CommandTypeValue;

  /** Whether this is an official answer */
  isOfficialAnswer: boolean;

  /** Message object to store (undefined for bot messages) */
  message?: Message;
}
```

Currently, `MessageEventResult` contains `command` and `isOfficialAnswer` fields based on command parsing. After refactor, these should be removed.

#### Message Type with is_official_answer (to be removed)

**File:** `slackbot/src/types/message.ts` (lines 42-85)

```typescript
export interface Message {
  sender: string;
  text: string;
  timestamp: string;
  /**
   * Whether this message is an official answer to a question.
   *
   * Official answers are user messages that start with "@regent" prefix.
   * These are the answers that get recorded in the spec document.
   */
  is_official_answer: boolean;
  attachments?: ProcessedAttachment[];
}
```

The `is_official_answer` field must be removed. After refactor, all `@regent` messages are treated equally and passed to LLM for intent understanding.

### Current Message Event Flow

```
Slack Event Input
    ↓
parseMessageEvent()      [basic parsing, no filtering]
    ↓
thread validation        [must have thread_ts]
    ↓
bot message filter       [reject if bot_id present]
    ↓
isMentionCommand()       [check for @regent prefix]
    ├── NO → store for context, shouldRespond = false
    │
    └── YES → extractCommand()
              [parse keywords: next, ready, approved, or text]
              ├── "answer" → set is_official_answer = true
              └── other → set is_official_answer = false
              ↓
        Return: shouldRespond = true, command type, message object
```

### Proposed New Flow (Post-Refactor)

```
Slack Event Input
    ↓
parseMessageEvent()      [basic parsing, no filtering]
    ↓
thread validation        [must have thread_ts]
    ↓
bot message filter       [reject if bot_id present]
    ↓
isMentionCommand()       [check for @regent prefix]
    ├── NO → store for context, shouldRespond = false
    │
    └── YES → create Message with full text
              ↓
        Return: shouldRespond = true, message object
        (NO command extraction, NO is_official_answer)
              ↓
        LLM receives full thread context & determines intent
```

### Test Patterns to Follow

**Current Test File:** `tests/handlers/message-event.test.ts`

**Structure:**
- BDD-style describe/it blocks using @std/testing/bdd
- Fixtures using beforeEach/afterEach
- Assertions with assertEquals, assertExists, assertThrows from @std/assert

**Example Current Test (to be removed):**
```typescript
it("should extract 'next' command", () => {
  const result = extractCommand("@regent next");
  assertEquals(result.command, "next");
  assertEquals(result.text, undefined);
});
```

**Example New Test (simple mention detection):**
```typescript
it("should record any @regent message for LLM processing", () => {
  const input: SlackMessageEventInput = {
    type: "app_mention",
    user: "U1234567890",
    text: "<@U0BOTID> @regent anything here",
    ts: "1234567890.123456",
    channel: "C1234567890",
    thread_ts: "1234567880.123456",
  };

  const result = handleMessageEvent(input);

  assertEquals(result.shouldRespond, true);
  assertEquals(result.message?.text, "<@U0BOTID> @regent anything here");
});
```

### Project Conventions

**Import Style:**
```typescript
// Type imports
import type { Message } from "../types/message.ts";
import type { SlackMessageEventInput } from "../../src/handlers/message-event.ts";

// Value imports
import { ValidationError } from "../errors/types.ts";
import { assertEquals, assertThrows } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
```

**Error Handling:**
- Use three-parameter ValidationError constructor: (message, details, suggestedAction)
- Throw specific error types extending BaseError

**Type Annotations:**
- All function parameters typed
- Return types always explicitly specified

**File Comments:**
- Start with 2 ABOUTME lines describing file purpose

### Integration Points (Don't Modify)

**SessionManager** (`slackbot/src/managers/session-manager.ts`):
- Uses `isOfficialAnswer()` to identify thread initiator
- Uses `isAnswerCommand()` when caching messages
- These functions may need updating if `is_official_answer` field is removed

**Message Type Tests** (`slackbot/tests/types/message.test.ts`):
- Tests for `isOfficialAnswer()` and `isAnswerCommand()` helper functions
- May break if helper functions are removed or changed

### Files to Modify

1. **`slackbot/src/handlers/message-event.ts`**
   - Remove: `CommandType` enum
   - Remove: `CommandTypeValue` type
   - Remove: `ExtractedCommand` interface
   - Remove: `extractCommand()` function
   - Simplify: `MessageEventResult` interface - remove `command` and `isOfficialAnswer`
   - Simplify: `handleMessageEvent()` - detect `@regent` mention, create Message, return
   - Keep: `parseMessageEvent()` and `isMentionCommand()`

2. **`slackbot/src/types/message.ts`**
   - Remove: `is_official_answer` field from Message interface
   - Update: JSDoc comments

3. **`slackbot/tests/handlers/message-event.test.ts`**
   - Remove: All command parsing tests
   - Remove: Tests checking `result.command` values
   - Remove: Tests checking `result.isOfficialAnswer` distinctions
   - Remove: Error handling tests for "unknown command"
   - Add: Simple mention detection tests
   - Add: Tests verifying `shouldRespond: true` for any `@regent` message

---
*Branch: feature/regent-slack-bot*
*Generated at execution time by Regent*
