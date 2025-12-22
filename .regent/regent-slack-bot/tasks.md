# Implementation Plan

## Project Setup

- [x] 1. Initialize Deno project with ROSI structure and testing infrastructure (#14)
  - Create directory layout (src/, tests/, manifest/)
  - Initialize deno.json with import maps and task definitions
  - Configure Deno test runner with coverage
  - Set up deno fmt and deno lint configuration
  - Create .gitignore for ROSI deployment artifacts
  - _Requirements: N/A (infrastructure)_

## Data Models and Core Types

- [x] 2. Implement Session and Message data models (#35)
  - Write tests for Session (composite ID, phase transitions, TTL calculation)
  - Implement Session type with phase enum (questioning, review, finalized)
  - Write tests for Message (official answer detection, attachment parsing)
  - Implement Message type with sender tracking
  - Write tests for session ID formatting ({channel_id}:{thread_ts})
  - _Requirements: 1.5, 3.2, 7.1_

- [ ] 3. Implement SpecDocument and RepositoryContext models (#36)
  - Write tests for SpecDocument (all sections, markdown formatting)
  - Implement SpecDocument type matching Regent brainstorm.md format
  - Write tests for RepositoryContext (framework detection, file parsing)
  - Implement RepositoryContext type with exploration metadata
  - _Requirements: 2.1, 2.2, 2.3, 5.1, 5.2_

- [ ] 4. Implement error handling types and retry logic (#37)
  - Write tests for error categorization (transient vs permanent)
  - Implement error type hierarchy with Slack message formatting
  - Write tests for exponential backoff (timing, max retries)
  - Implement RetryHandler with backoff calculation
  - Write property test: **Property 11 - Retry Logic**
  - _Requirements: 8.1, 8.2, 8.3, 8.6_

## Session Management

- [ ] 5. Implement SessionManager with Slack Datastore (#38)
  - Write tests for createSession (TTL, duplicate prevention, repo storage)
  - Write tests for loadSession (existing, missing, expired handling)
  - Write tests for updateSession (phase transitions, confidence updates)
  - Implement SessionManager with Slack Datastore client
  - Write property test: **Property 9 - TTL Enforcement**
  - _Requirements: 1.5, 3.6, 5.1, 7.1, 7.2_

- [ ] 6. Implement MessageCache and thread history rebuilding (#13)
  - Write tests for MessageCache (get, append, evict)
  - Implement in-memory MessageCache with session scoping
  - Write tests for rebuildFromHistory (pagination, official answer detection, phase inference)
  - Implement history rebuild with Slack conversations.replies API
  - Write property test: **Property 6 - Session Resumption Completeness**
  - _Requirements: 7.3, 7.4, 7.5_

## Slack Integration

- [ ] 7. Implement slash command handler (#15)
  - Write tests for command parsing (--repo flag, idea extraction)
  - Write tests for channel validation (reject DMs, accept public/private)
  - Write tests for command flow (session creation, acknowledgment message)
  - Implement slash command handler with ROSI function signature
  - _Requirements: 1.1, 1.2, 1.3, 1.4_

- [ ] 8. Implement event routing and mention parsing (#16)
  - Write tests for event filtering (app_mention vs message, thread detection)
  - Write tests for mention parsing (@regent answer, next, ready, approved)
  - Write tests for official answer recording
  - Implement event handler with ROSI function signature
  - Write property test: **Property 2 - Answer Recording**
  - _Requirements: 3.2, 3.3, 3.4, 3.5_

- [ ] 9. Implement Slack messaging utilities (#22)
  - Write tests for postMessage (simple, threaded, error handling)
  - Write tests for uploadFile (naming, threading, fallback)
  - Write tests for rate limit handling with retry
  - Implement Slack client wrapper for chat.postMessage and files.upload
  - _Requirements: 1.1, 5.4, 8.2, 8.3_

- [ ] 10. Implement Canvas management with fallback (#27)
  - Write tests for createCanvas (content formatting, success/failure)
  - Write tests for updateCanvas (editing, error handling)
  - Write tests for fallback to file upload
  - Implement CanvasManager using Slack Canvas API
  - Write property test: **Property 13 - Canvas Fallback**
  - _Requirements: 5.1, 5.3, 5.4_

## GitHub Integration

- [ ] 11. Implement GitHub client abstraction layer (#23)
  - Write tests for authentication (token validation, access checks)
  - Write tests for readFile (success, 404, 403, large files)
  - Write tests for listDirectory (root, subdirs, filtering)
  - Implement GitHubClient with REST API calls
  - Write property test: **Property 5 - Repository Access Validation**
  - _Requirements: 2.2, 2.4, 10.2, 10.5_

- [ ] 12. Implement repository exploration (#25)
  - Write tests for explore (README detection, manifest parsing, structure summary)
  - Write tests for framework detection (React, FastAPI, Next.js, etc)
  - Write tests for error handling (missing files, private repos)
  - Implement RepositoryExplorer with GitHub client integration
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

- [ ] 13. Implement PR creation workflow (#28)
  - Write tests for readConfig (parse .regent/config.yml, defaults)
  - Write tests for branch creation (naming, base branch)
  - Write tests for file commit (path .regent/{spec-name}/brainstorm.md)
  - Write tests for PR creation (title, description, metadata)
  - Implement full PR creation flow
  - Write property test: **Property 8 - PR Creation Conditional**
  - _Requirements: 6.2, 6.3, 6.4, 6.5_

## Anthropic Integration

- [ ] 14. Implement Anthropic Messages API client (#30)
  - Write tests for request formatting (messages, system prompt, tools)
  - Write tests for response parsing (content, tool use, stop reason)
  - Write tests for confidence score extraction
  - Implement AnthropicClient with retry logic
  - _Requirements: 3.1, 3.6, 8.6_

- [ ] 15. Implement spec synthesis and revision (#33)
  - Write tests for synthesizeSpec (conversation history to brainstorm.md)
  - Write tests for format validation (sections, markdown structure)
  - Write tests for reviseSpec (feedback incorporation, updates)
  - Implement spec generation with Regent format compliance
  - _Requirements: 5.1, 5.2, 5.5_

- [ ] 16. Implement attachment processing (#17)
  - Write tests for image processing (vision API formatting)
  - Write tests for text extraction (markdown, code, PDF)
  - Write tests for size limit validation
  - Write tests for Slack file download
  - Implement AttachmentProcessor with file type detection
  - Write property test: **Property 7 - Attachment Processing**
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

## Session Orchestration

- [ ] 17. Implement session state machine and phase transitions (#18)
  - Write tests for phase transition logic (questioning → review → finalized)
  - Write tests for confidence threshold detection (>= 95%)
  - Write tests for manual transitions (@regent ready, @regent approved)
  - Implement SessionOrchestrator state management
  - Write property test: **Property 4 - Phase Transition Triggers**
  - _Requirements: 3.5, 3.6, 5.1, 6.1_

- [ ] 18. Implement question-answer loop with tool use (#19)
  - Write tests for tool loop execution (single tool, multiple tools, no tools)
  - Write tests for system prompt building (per phase, with/without repo)
  - Write tests for message history formatting (official answers, attachments)
  - Implement tool loop with Anthropic Messages API
  - Write property test: **Property 3 - Single Question Rule**
  - _Requirements: 2.3, 2.5, 3.1, 3.2, 3.3_

- [ ] 19. Implement review phase and finalization (#20)
  - Write tests for Canvas creation on review phase entry
  - Write tests for feedback processing (@regent <feedback>)
  - Write tests for approval handling (@regent approved)
  - Write tests for finalization (with repo → PR, without repo → complete)
  - Implement review orchestration logic
  - _Requirements: 5.3, 6.1, 6.2, 6.5_

## Security and Error Handling

- [ ] 20. Implement security controls and secret management (#21)
  - Write tests for environment variable loading (required secrets)
  - Write tests for secret validation (format, presence)
  - Write tests for credential isolation (no secrets in datastore/logs)
  - Write tests for repository access scoping
  - Implement SecretManager and access control
  - Write property test: **Property 12 - Secure Credential Storage**
  - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5_

- [ ] 21. Implement comprehensive error handling (#24)
  - Write tests for GitHub access errors (display, offer to continue)
  - Write tests for Slack API errors (Canvas fallback, rate limits)
  - Write tests for Anthropic API errors (save input, retry)
  - Write tests for invalid input errors (repo format, DM rejection)
  - Implement error handlers for all error categories
  - Write property test: **Property 10 - Error Disclosure**
  - _Requirements: 8.1, 8.3, 8.4, 8.5_

## Performance and Concurrency

- [ ] 22. Implement performance monitoring and thinking indicator (#26)
  - Write tests for latency tracking (start, stop, categorization)
  - Write tests for thinking indicator (post, cleanup)
  - Write performance tests (p95 < 5s simple, p95 < 30s exploration)
  - Implement monitoring utilities
  - _Requirements: 11.1, 11.2, 11.3_

- [ ] 23. Implement and test session isolation for concurrent sessions (#29)
  - Write tests for concurrent sessions in different threads
  - Write tests for concurrent sessions in same channel
  - Write tests for session ID uniqueness
  - Verify no state leakage between sessions
  - Write property test: **Property 1 - Session Isolation**
  - _Requirements: 9.1, 9.2, 9.3, 9.4_

## Integration Testing and Deployment

- [ ] 24. Write end-to-end integration tests with mock Slack workspace (#31)
  - Create test workspace setup with fixtures
  - Test complete questioning flow (slash command → exploration → Q&A → review)
  - Test complete review flow (feedback → canvas update → approval → PR)
  - Test session resumption (expired → rebuild → continue)
  - Test error recovery flows (all error categories)
  - Test concurrent session isolation
  - _Requirements: All_

- [ ] 25. Configure ROSI deployment and create Slack app manifest (#32)
  - Create Slack app manifest (scopes: chat:write, files:write, canvas:write, commands:write)
  - Define ROSI function handlers (slash command, events)
  - Configure event subscriptions (app_mention, message.channels)
  - Set up environment variables (ANTHROPIC_API_KEY, GITHUB_TOKEN)
  - Write deployment validation tests
  - _Requirements: N/A (deployment)_

- [ ] 26. Write documentation and usage guides (#34)
  - Create README with installation instructions
  - Document slash command syntax (/brainstorm [--repo owner/repo] <idea>)
  - Document @regent commands (answer, next, ready, approved)
  - Create troubleshooting guide (error messages, recovery)
  - Add JSDoc comments to all public interfaces
  - Create architecture decision records (ADR) for key design choices
  - _Requirements: N/A (documentation)_
