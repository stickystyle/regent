# Task Brief

## From Issue #27

**Task 10**: Implement Canvas management with fallback

This task involves:
- Write tests for createCanvas (content formatting, success/failure)
- Write tests for updateCanvas (editing, error handling)
- Write tests for fallback to file upload
- Implement CanvasManager using Slack Canvas API
- Write property test: **Property 13 - Canvas Fallback**
- _Requirements: 5.1, 5.3, 5.4_

### Requirements

> 📄 *Full requirements: [regent-slack-bot/requirements.md](https://github.com/stickystyle/regent/blob/main/.regent/regent-slack-bot/requirements.md)*

**Requirement 5: Canvas Creation and Management**
**User Story:** As a team lead, I want the draft spec delivered as a Slack Canvas, so that the team can review it in a familiar format and provide feedback easily.

**Acceptance Criteria:**
> 1. WHEN transitioning to review phase THEN the system SHALL create a Slack Canvas containing the structured spec document.

> 3. WHEN a user posts `@regent <feedback>` during review phase THEN the system SHALL update the Canvas content based on the feedback.

> 4. IF Canvas creation fails THEN the system SHALL fall back to uploading `brainstorm.md` as a file attachment to the thread.

### Design Context

> 📄 *Full design: [regent-slack-bot/design.md](https://github.com/stickystyle/regent/blob/main/.regent/regent-slack-bot/design.md)*

**Interfaces:**

```typescript
interface CanvasManager {
  /** Create Canvas with spec content, fallback to file upload on failure. */
  createCanvas(spec: SpecDocument, threadTs: string, channelId: string): Promise<string>;

  /** Update existing Canvas with revised spec. */
  updateCanvas(canvasId: string, spec: SpecDocument): Promise<void>;

  /** Convert spec markdown to Canvas-compatible format. */
  formatForCanvas(spec: SpecDocument): string;
}
```

**Correctness Properties:**
**Property 13: Canvas Fallback**
*If* Canvas creation fails, *then* the system must upload brainstorm.md as a file attachment to the thread
**Validates:** Requirements 5.4

**Error Handling:**
**Slack API Errors:**
- **Trigger**: Canvas creation fails, Slack API rate limits exceeded, or thread history pagination errors
- **Response**: For Canvas failures, automatically fall back to file upload. For rate limits, display the reset time and confirm data was saved
- **Recovery**: Canvas fallback is automatic. Rate limit errors are transient and self-recover

### Task Relationships

> 📄 *All tasks: [regent-slack-bot/tasks.md](https://github.com/stickystyle/regent/blob/main/.regent/regent-slack-bot/tasks.md)*

- **Depends on**: Task 9 (Slack messaging utilities - for file upload fallback), Task 3 (SpecDocument model)
- **Blocks**: Task 17 (session orchestration - uses Canvas manager), Task 19 (review phase - creates and updates Canvas)

### Implementation Guidance

- Canvas API: use Slack's Canvas API for programmatic creation and editing
- Canvas formatting: convert SpecDocument markdown to Slack's Canvas-compatible markdown syntax
- Fallback mechanism: if Canvas creation fails (API error, permissions, unsupported workspace), automatically fall back to uploading `brainstorm.md` as a file attachment using the file upload utilities from Task 9
- Canvas linking: Canvases should be linked to the thread via `thread_ts`
- Update handling: `updateCanvas` should handle partial updates and Canvas edit conflicts gracefully

## Codebase Context

### Current Implementation State

#### SpecDocument (Task 3 - Already Implemented)

**File**: `/Volumes/workingfolder/regent/slackbot/src/types/spec-document.ts`

The SpecDocument interface fully matches Regent brainstorm.md format:
```typescript
export interface SpecDocument {
  title: string;
  overview: string;
  problem_statement: string;
  goals: string[];
  non_goals: string[];
  personas: Persona[];
  use_cases: UseCase[];
  technical_details: string;
  open_questions: string[];
}

// Conversion utility already exists:
export function toMarkdown(doc: SpecDocument): string {
  // Returns markdown in brainstorm.md format
}
```

The `toMarkdown()` function converts SpecDocument to markdown with proper section handling (omits empty sections). This is what Canvas will display.

#### Slack Messaging Utilities (Task 9 - Already Implemented)

**File**: `/Volumes/workingfolder/regent/slackbot/src/clients/messaging-client.ts`

Provides `SlackMessagingClient` interface with two key methods:
```typescript
export interface SlackMessagingClient {
  // Post messages to thread
  postMessage(
    channelId: string,
    threadTs: string | undefined,
    text: string,
    blocks?: unknown[],
  ): Promise<PostMessageResult>;

  // Upload files - CRITICAL FOR FALLBACK
  uploadFile(
    channelId: string,
    threadTs: string | undefined,
    filename: string,
    content: string,
    contentType?: string,  // defaults to text/markdown
  ): Promise<UploadFileResult>;
}
```

The `uploadFile` method is the fallback mechanism for Canvas failures. It accepts markdown content and automatically uploads as a named file.

#### Error Types for Canvas

**File**: `/Volumes/workingfolder/regent/slackbot/src/errors/types.ts`

Canvas-related error already defined:
```typescript
/**
 * Slack Canvas operation failed.
 * Canvas operations can fail due to permissions, quotas, or temporary issues.
 * The system should fall back to file upload when Canvas fails.
 */
export class SlackCanvasError extends TransientError {
  readonly type = "SlackCanvasError";
}
```

This is a **transient error**, so the RetryHandler will automatically retry it up to 3 times with exponential backoff.

#### Retry Infrastructure (Already Implemented)

**File**: `/Volumes/workingfolder/regent/slackbot/src/errors/retry.ts`

RetryHandler handles all transient errors automatically:
- 3 maximum attempts by default
- Exponential backoff: 0ms, 1000ms, 2000ms (with 2x multiplier)
- Only retries `TransientError` instances
- Supports `onRetry` callback for pre-retry hooks

Canvas failures (SlackCanvasError) will automatically retry 3 times before throwing.

#### Session Data Model

**File**: `/Volumes/workingfolder/regent/slackbot/src/types/session.ts`

Session already has canvas_id field:
```typescript
export interface Session {
  session_id: string;           // "C1234567890:1234567890.123456"
  repository?: string;
  phase: Phase;                 // Questioning | Review | Finalized
  initiator_user_id: string;
  canvas_id?: string;           // Set during review phase (what Task 10 creates)
  confidence_score: number;
  created_at: string;
  ttl: string;
}
```

Your CanvasManager will set the `canvas_id` field in the session after successful Canvas creation.

### Test Template Reference

**Best Pattern Match**: `/Volumes/workingfolder/regent/slackbot/tests/clients/messaging-client.test.ts` (510 lines)

This is the most relevant test file since:
1. It tests a client abstraction (like CanvasManager will test Canvas API)
2. It uses MockSlackMessagingClient for dependency injection
3. It tests both success and failure paths
4. It includes error handling with specific error types
5. It tests retry logic integration

#### Key Testing Patterns

**1. Test Organization Structure**:
```typescript
import { assertEquals, assertRejects } from "@std/assert";
import { describe, it, beforeEach, afterEach } from "@std/testing/bdd";

describe("CanvasManager", () => {
  let canvas: CanvasManager;
  let mockMessaging: MockSlackMessagingClient;

  beforeEach(() => {
    mockMessaging = new MockSlackMessagingClient();
    canvas = new CanvasManagerImpl(mockMessaging);
  });

  afterEach(() => {
    mockMessaging.clear();
  });

  describe("createCanvas", () => {
    it("should create canvas with markdown content", async () => {
      // test implementation
    });
  });
});
```

**2. Error Testing Pattern** (from messaging-client.test.ts):
```typescript
it("should throw configured error", async () => {
  const error = new SlackCanvasError(
    "Canvas creation failed",
    "API returned 429",
    "Try again later",
  );

  // Setup or expectations here

  await assertRejects(
    () => canvas.createCanvas(spec, threadTs, channelId),
    SlackCanvasError,
  );
});
```

**3. Property Test Pattern** (for Property 13 - Canvas Fallback):
```typescript
describe("Property 13: Canvas Fallback", () => {
  it("should fall back to file upload when Canvas creation fails", async () => {
    // This is what you'll implement
    // If Canvas creation throws SlackCanvasError,
    // system must call uploadFile with brainstorm.md as fallback
  });
});
```

**4. Mock State Recording** (from messaging-client.test.ts):
```typescript
// MockSlackMessagingClient tracks operations:
const uploadedFiles = mockMessaging.getUploadedFiles();
assertEquals(uploadedFiles.length, 1);
assertEquals(uploadedFiles[0].filename, "brainstorm.md");
assertEquals(uploadedFiles[0].content.includes("# "), true);  // markdown
```

### Project Conventions

#### Import Style
```typescript
// Type imports
import type { SpecDocument } from "../../src/types/spec-document.ts";

// Implementation imports
import { SlackCanvasError } from "../../src/errors/types.ts";

// Test utilities
import { describe, it, beforeEach } from "@std/testing/bdd";
import { assertEquals, assertRejects } from "@std/assert";
```

#### File Header Comments (REQUIRED)
Every file must start with two comment lines with "ABOUTME:" prefix:
```typescript
// ABOUTME: Canvas manager for creating and updating Slack Canvases.
// ABOUTME: Implements automatic fallback to file upload on Canvas API failures per Property 13.
```

#### Error Handling Pattern
All errors follow this constructor signature:
```typescript
throw new SlackCanvasError(
  message,        // User-facing error summary
  details,        // Specific technical details
  suggestedAction // What user should do
);
```

Errors extend `BaseError` which has `toSlackMessage()` for formatting.

#### Type Annotations
- All function return types explicitly annotated
- Strict TypeScript enabled (`"strict": true`)
- JSDoc comments on interface properties
- Example: `threadTs: string` with comment explaining format

#### File Organization Pattern
```
src/
  managers/
    canvas-manager.ts       // New file - CanvasManager implementation
    index.ts                // Update to export CanvasManager
tests/
  managers/
    canvas-manager.test.ts  // New file - test suite
```

### Requirements Mapping

**Requirement 5.1**: "WHEN transitioning to review phase THEN the system SHALL create a Slack Canvas containing the structured spec document"
- CanvasManager.createCanvas() implements this

**Requirement 5.3**: "WHEN the Canvas is created THEN it SHALL follow the Regent spec format including: title, overview, problem statement, goals/non-goals, personas, use cases, and any technical details captured"
- formatForCanvas() uses toMarkdown() which preserves this structure

**Requirement 5.4**: "IF Canvas creation fails THEN the system SHALL fall back to uploading `brainstorm.md` as a file attachment to the thread"
- **Property 13 validates this**: *If* Canvas creation fails, *then* uploadFile() is called with brainstorm.md
- This is the critical fallback mechanism

### Error Handling Flow

1. **Canvas Creation Attempt**: SlackCanvasError thrown
2. **RetryHandler Kicks In**: Automatically retries up to 3 times (exponential backoff)
3. **All Retries Exhausted**: SlackCanvasError propagates from CanvasManager
4. **Fallback Logic**: Catch SlackCanvasError and call `uploadFile(channelId, threadTs, "brainstorm.md", markdown)`
5. **File Upload**: Uses existing Task 9 messaging utilities with their own retry logic

### Files to Create/Modify

#### New Implementation File
**`/Volumes/workingfolder/regent/slackbot/src/managers/canvas-manager.ts`**
- Implement `CanvasManager` interface
- Implement `CanvasManagerImpl` class with Slack Canvas API integration
- Inject `SlackMessagingClient` for fallback uploads
- Use `toMarkdown()` for content formatting
- Error handling with `SlackCanvasError`

#### Update Export File
**`/Volumes/workingfolder/regent/slackbot/src/managers/index.ts`**
- Add: `export { CanvasManager } from "./canvas-manager.ts";`
- Add: `export type { CanvasManager } from "./canvas-manager.ts";`
- Add: `export { MockCanvasManager } from "./canvas-manager.ts";` (for testing)

#### New Test File
**`/Volumes/workingfolder/regent/slackbot/tests/managers/canvas-manager.test.ts`**
- Test `createCanvas` success case (returns canvas ID)
- Test `createCanvas` with content formatting
- Test `createCanvas` error handling and fallback
- Test `updateCanvas` success and error cases
- Test `formatForCanvas` output format
- **Property 13 test**: Canvas creation fails → falls back to file upload

### Files to Reference

1. **`/Volumes/workingfolder/regent/slackbot/src/types/spec-document.ts`**
   - SpecDocument type definition
   - toMarkdown() function for converting specs to markdown
   - Used by formatForCanvas()

2. **`/Volumes/workingfolder/regent/slackbot/src/clients/messaging-client.ts`**
   - SlackMessagingClient interface and mock
   - uploadFile() method for fallback implementation
   - How to handle file uploads to threads

3. **`/Volumes/workingfolder/regent/slackbot/src/errors/types.ts`**
   - SlackCanvasError definition
   - BaseError.toSlackMessage() pattern
   - TransientError behavior (auto-retry)

4. **`/Volumes/workingfolder/regent/slackbot/src/errors/retry.ts`**
   - RetryHandler automatic retry behavior
   - How SlackCanvasError will be retried before fallback
   - Exponential backoff timing

5. **`/Volumes/workingfolder/regent/slackbot/src/types/session.ts`**
   - Session.canvas_id field (what you'll set)
   - Phase enum (Review phase triggers Canvas creation)

6. **`/Volumes/workingfolder/regent/slackbot/tests/clients/messaging-client.test.ts`** (510 lines)
   - Best test pattern reference
   - Mock client structure (MockSlackMessagingClient)
   - Error testing and fallback patterns
   - State recording and assertions

### Key Implementation Notes

**Content Formatting**:
- Use `toMarkdown(spec)` from spec-document.ts to convert to markdown
- This automatically formats with proper structure and omits empty sections
- Pass result directly to Canvas API

**Fallback Strategy**:
- Wrap Canvas creation in try-catch
- When SlackCanvasError caught, call:
  ```typescript
  await this.messagingClient.uploadFile(
    channelId,
    threadTs,
    "brainstorm.md",
    markdown,
    "text/markdown"
  );
  ```

**Dependency Injection**:
- Accept SlackMessagingClient via constructor
- This enables mocking in tests and fallback in production

**Mock Implementation**:
- Create `MockCanvasManager` class for testing
- Track created/updated canvases in mock state
- Support configurable errors for fallback testing

**Property 13 Test Focus**:
This is the critical correctness property to validate:
- Canvas creation fails
- System automatically falls back to file upload
- File upload contains brainstorm.md
- File is posted to correct thread

---
*Branch: feature/regent-slack-bot*
*Generated at execution time by Regent*
