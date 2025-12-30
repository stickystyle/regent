# Task Brief

## From Issue #17

**Task 16**: Implement attachment processing
**Type**: test-first

- Write tests for image processing (vision API formatting)
- Write tests for text extraction (markdown, code, PDF)
- Write tests for size limit validation
- Write tests for Slack file download
- Implement AttachmentProcessor with file type detection
- Write property test: **Property 7 - Attachment Processing**
- _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

### Requirements

**Requirement 4: Attachment Processing**

1. WHEN an image file (PNG, JPG, GIF, WebP) is shared in the session thread THEN the system SHALL download the file and include it in the next Claude request via the vision API.
2. WHEN a text-based file (Markdown, plain text, code files) is shared in the session thread THEN the system SHALL extract the text content and include it as context.
3. WHEN a PDF file is shared in the session thread THEN the system SHALL extract text content and include it as context.
4. WHEN an attachment exceeds Claude's input limits THEN the system SHALL acknowledge the file but note that it could not be fully processed.
5. WHEN processing attachments THEN the system SHALL reference them in follow-up questions when relevant to the discussion.

### Interface to Implement

```typescript
interface AttachmentProcessor {
  /** Download and process all attachments in a message. */
  processFiles(files: SlackFile[]): Promise<ProcessedAttachment[]>;

  /** Prepare image for Claude vision API. */
  processImage(file: SlackFile): Promise<VisionContent>;

  /** Extract text from PDF, markdown, or code files. */
  extractText(file: SlackFile): Promise<string>;

  /** Verify file doesn't exceed Claude input limits. */
  checkSizeLimits(file: SlackFile): boolean;
}
```

### Property 7: Attachment Processing

*For any* supported file type attached to an official answer, *the system should* include the file content in the next Claude request
**Validates:** Requirements 4.1, 4.2, 4.3, 4.5

## Codebase Context

### Current Implementation State

**ProcessedAttachment Type Already Exists** at `slackbot/src/types/message.ts`:

```typescript
export interface ProcessedAttachment {
  file_id: string;      // Slack file ID, e.g., "F1234567890"
  filename: string;     // Original filename, e.g., "specification.md"
  mimetype: string;     // MIME type, e.g., "text/markdown", "application/pdf"
  content: string;      // Processed file content as string
}
```

The `Message` type already supports optional `attachments?: ProcessedAttachment[]`.

**SlackFile Type** needs to be defined - represents a Slack file from the event payload.

### Test Template Reference

**Similar Test File**: `slackbot/tests/clients/messaging-client.test.ts`

**Key Patterns**:
- BDD structure: `describe`, `beforeEach`, `afterEach`, `it`
- Mock setup with `setError()` methods for error injection
- Assertions via `@std/assert` library (`assertEquals`, `assertRejects`)
- Nested describe blocks for organizing test suites

**Code Example**:
```typescript
beforeEach(() => {
  client = new MockAttachmentProcessor();
});

afterEach(() => {
  client.clear();
});

it("should throw configured error", async () => {
  const error = new NetworkTimeoutError("msg", "details", "action");
  client.setError(error);
  await assertRejects(() => client.processFiles([...]), NetworkTimeoutError);
});
```

### Project Conventions

- **File Structure**: All source files in `src/`, tests in `tests/` mirroring the structure
- **ABOUTME Header**: Every file must start with 2-line comment with "ABOUTME: " prefix
- **Error Handling**: Follows error hierarchy (BaseError → TransientError/PermanentError)
- **Imports**: Use relative paths from `src/` (e.g., `../types/message.ts`)
- **Error Types** at `slackbot/src/errors/types.ts`:
  - `NetworkTimeoutError` - transient, retryable
  - `ValidationError` - permanent, non-retryable
  - `AnthropicInputError` - for input exceeds limits

### Files to Create

1. **`slackbot/src/processors/attachment-processor.ts`**
   - Implement `AttachmentProcessor` interface
   - Implement `MockAttachmentProcessor` for testing
   - Handle: PNG, JPG, GIF, WebP (vision API), Markdown/text/code (text extraction), PDF (text extraction)
   - Define `SlackFile` and `VisionContent` types

2. **`slackbot/tests/processors/attachment-processor.test.ts`**
   - Test image processing for vision API formatting
   - Test text extraction from markdown, code, plain text
   - Test PDF text extraction
   - Test size limit validation
   - Test Slack file download integration
   - Test file type detection via MIME types
   - Test error handling (network timeouts, oversized files)
   - Write Property 7 test: attachment inclusion in Claude requests

### Files to Reference

- `slackbot/src/types/message.ts` - ProcessedAttachment interface
- `slackbot/src/errors/types.ts` - Error hierarchy
- `slackbot/src/errors/retry.ts` - RetryHandler
- `slackbot/src/clients/messaging-client.ts` - Dependency injection pattern
- `slackbot/tests/clients/messaging-client.test.ts` - Test patterns

### Implementation Notes

- Handle multiple file types: images (PNG, JPG, GIF, WebP), text files (Markdown, plain text, code), and PDFs
- Use Anthropic vision API format for image processing (base64 data URL format)
- Extract text content from non-image files
- Validate size limits against Claude's input constraints (roughly 100MB for images, text limits)
- Implement graceful degradation when files cannot be processed
- Consider using pdf-parse or similar for PDF text extraction in Deno

---
*Branch: feature/regent-slack-bot*
*Generated at execution time by Regent*
