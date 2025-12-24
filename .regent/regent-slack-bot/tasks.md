# Implementation Plan

## Project Setup

- [ ] 1. Initialize Slack ROSI project with testing infrastructure
  - Create directory layout (functions/, workflows/, triggers/, lib/, tests/)
  - Initialize deno.json with test configuration and dependencies
  - Configure test framework with coverage support
  - Set up manifest.ts with required scopes and outgoing domains
  - Add pre-commit hooks for type checking and formatting
  - _Requirements: N/A (infrastructure)_

## Core Data Models and Types

- [ ] 2. Implement Session and Message data models
  - Write tests for Session model (field validation, TTL calculation, phase transitions)
  - Implement Session type with all fields (id, channelId, threadTs, repo, phase, userId, createdAt, ttl)
  - Write tests for Message model (text extraction, attachment handling, timestamp parsing)
  - Implement Message type with factory methods
  - Write tests for phase transition validation (questioning → review → finalized)
  - _Requirements: 1.5, 3.6, 7.1_

- [ ] 3. Implement error handling types and retry logic
  - Write tests for BotError (categorization, message formatting, error details)
  - Implement BotError class hierarchy with toSlackMessage()
  - Write tests for RetryHandler (exponential backoff, max retries, rate limit handling)
  - Implement RetryHandler with backoff logic and retry eligibility checks
  - Write property test: **Property - Exponential Backoff Correctness**
  - _Requirements: 8.1, 8.2, 8.3_

## Session Management

- [ ] 4. Implement SessionManager CRUD operations
  - Write tests for createSession (with/without repo, TTL setting, duplicate rejection)
  - Write tests for loadSession (existing, missing, expired)
  - Write tests for updateSession (phase transitions, partial updates)
  - Write tests for appendMessage (cache updates, ordering)
  - Implement SessionManager with Slack Datastore integration
  - Write property test: **Property 1 - Session Uniqueness by channel:thread**
  - _Requirements: 1.5, 3.6, 7.1, 7.2, 9.3_

- [ ] 5. Implement message cache and thread history rebuilding
  - Write tests for MessageCache (in-memory storage, eviction, retrieval)
  - Write tests for rebuildFromHistory (pagination, message ordering, attachment preservation)
  - Write tests for inferPhase (questioning, review, finalized detection)
  - Implement MessageCache with TTL-based eviction
  - Implement rebuildFromHistory with Slack API pagination
  - Write property test: **Property 7 - Thread Context Reconstruction Completeness**
  - _Requirements: 7.3, 7.4, 7.5_

## Slack Integration

- [ ] 6. Implement slash command handler
  - Write tests for argument parsing (--repo extraction, idea text, validation)
  - Write tests for channel validation (reject DMs, accept public/private)
  - Write tests for full handle flow (session creation, acknowledgment message)
  - Write tests for error handling (invalid repo format, missing idea text)
  - Implement SlashCommandHandler function
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 8.5_

- [ ] 7. Implement event routing and mention handling
  - Write tests for event filtering (app_mention, message in thread, ignore bots)
  - Write tests for mention parsing (answer, next, ready, approved, feedback)
  - Write tests for command detection (@regent next, @regent ready, @regent approved)
  - Implement EventHandler function with phase-aware routing
  - Write property test: **Property 2 - Official Answer Recording**
  - _Requirements: 3.2, 3.3, 3.4, 3.5, 9.3_

- [ ] 8. Implement Canvas management
  - Write tests for createCanvas (content formatting, thread association)
  - Write tests for updateCanvas (editing, error handling)
  - Write tests for fallback to file upload when Canvas fails
  - Implement CanvasManager with Canvas API integration
  - Write property test: **Property 6 - Canvas Fallback Guarantee**
  - _Requirements: 5.1, 5.3, 5.4_

- [ ] 9. Implement attachment processing
  - Write tests for image download and vision API preparation (PNG, JPG, GIF, WebP)
  - Write tests for text file extraction (Markdown, code files, plain text)
  - Write tests for PDF text extraction
  - Write tests for oversized file handling (Claude input limits)
  - Implement AttachmentProcessor with Slack files API
  - Write property test: **Property 4 - Attachment Inclusion in Claude Requests**
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

## GitHub Integration

- [ ] 10. Implement GitHub client abstraction layer
  - Write tests for authentication (token validation, error handling)
  - Write tests for checkAccess (read, write, missing permissions)
  - Write tests for rate limit handling (detection, retry after)
  - Write tests for createIssue, getIssue, getIssueComments
  - Write tests for createIssueComment, updateIssueComment
  - Implement GitHubClient with GitHub REST API
  - _Requirements: 2.4, 8.4, 10.1, 10.2, 10.5_

- [ ] 11. Implement repository exploration
  - Write tests for exploreRepository (README, manifests, structure summary)
  - Write tests for file reading (content extraction, filtering)
  - Write tests for directory traversal (depth limits, file type filtering)
  - Write tests for error fallback (missing files, access denied)
  - Implement repository exploration methods in GitHubClient
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

- [ ] 12. Implement Epic Manager
  - Write tests for createEpic (title, summary, regent:epic label)
  - Write tests for addSpecComment (collapsible format, marker comment)
  - Write tests for updateSpecComment (find by marker, update content)
  - Write tests for getSpecContent (parse collapsible section, extract content)
  - Write tests for getSpecComments (multiple spec types, ordering)
  - Implement EpicManager with comment formatting and marker parsing
  - Write property test: **Property 8 - Spec Comment Marker Uniqueness**
  - _Requirements: 6.2, 6.3, 6.4_

## Anthropic Integration

- [ ] 13. Implement Anthropic client and tool loop
  - Write tests for Messages API request formatting (system prompt, messages, tools)
  - Write tests for tool use parsing and execution
  - Write tests for tool loop iteration (single tool, multiple tools, max iterations)
  - Write tests for confidence score extraction from responses
  - Write tests for error handling (API errors, rate limits, retries)
  - Implement AnthropicClient with tool use support
  - Write property test: **Property 3 - Single Question Invariant**
  - _Requirements: 3.1, 8.2, 8.6_

- [ ] 14. Implement system prompts for each phase
  - Write tests for questioning phase prompt (with/without repo context)
  - Write tests for review phase prompt (feedback incorporation)
  - Write tests for codebase context formatting (exploration summary)
  - Write tests for spec synthesis instructions
  - Implement buildSystemPrompt method with phase-specific logic
  - _Requirements: 2.3, 2.5, 3.1, 5.2_

## Session Orchestration

- [ ] 15. Implement session initialization and exploration flow
  - Write tests for handleSlashCommand (acknowledgment, session creation)
  - Write tests for repository exploration trigger (--repo flag)
  - Write tests for exploration summary posting
  - Write tests for first question generation
  - Write tests for exploration error handling (access denied, repo not found)
  - Implement initialization flow in SessionOrchestrator
  - _Requirements: 1.1, 1.2, 2.1, 2.4_

- [ ] 16. Implement question-answer loop
  - Write tests for handleMessage (@regent mention handling)
  - Write tests for answer recording and history updates
  - Write tests for attachment integration with answers
  - Write tests for next question generation
  - Write tests for confidence score tracking
  - Write tests for command handling (next, ready)
  - Implement question-answer loop in SessionOrchestrator
  - Write property test: **Property 5 - Message Ordering Preservation**
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 4.5_

- [ ] 17. Implement review phase transition and spec synthesis
  - Write tests for transitionToReview (confidence threshold, manual trigger)
  - Write tests for spec synthesis (conversation history → brainstorm.md format)
  - Write tests for Canvas creation and review instructions
  - Write tests for feedback processing (@regent feedback)
  - Write tests for spec updates during review
  - Implement review phase logic in SessionOrchestrator
  - _Requirements: 3.6, 5.1, 5.2, 5.3, 5.5_

- [ ] 18. Implement session finalization and Epic creation
  - Write tests for approval detection (@regent approved)
  - Write tests for Epic creation (with repo configured)
  - Write tests for spec comment creation (brainstorm.md as collapsible)
  - Write tests for completion without repo (Canvas/file only)
  - Write tests for Epic URL posting to Slack
  - Implement finalization flow in SessionOrchestrator
  - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

## Security and Performance

- [ ] 19. Implement security controls
  - Write tests for secret validation (env variables, no logging)
  - Write tests for repository access validation (explicit --repo only)
  - Write tests for thread access control (invoked threads only)
  - Write tests for message content isolation (no content in datastore)
  - Implement security checks in SessionManager and GitHubClient
  - Write property test: **Property 10 - Secret Storage Safety**
  - Write property test: **Property 11 - Repository Access Scope**
  - _Requirements: 10.1, 10.2, 10.3, 10.4_

- [ ] 20. Implement performance monitoring and thinking indicators
  - Write tests for latency tracking (simple messages, exploration, tool calls)
  - Write tests for thinking indicator (delay trigger, cleanup)
  - Write tests for performance targets (p95 < 5s simple, p95 < 30s exploration)
  - Implement LatencyTracker and ThinkingIndicator
  - _Requirements: 11.1, 11.2, 11.3_

## Concurrent Sessions

- [ ] 21. Test and verify session isolation
  - Write property test: **Property 9 - Session Isolation Across Channels**
  - Write integration tests for concurrent sessions (different channels, same channel/different threads)
  - Write tests for session identification (channel:thread uniqueness)
  - Write tests for state isolation (actions in one session don't affect others)
  - Verify all isolation guarantees across SessionManager and Orchestrator
  - _Requirements: 9.1, 9.2, 9.3, 9.4_

## Integration and Deployment

- [ ] 22. Write end-to-end integration tests
  - Test complete questioning phase flow (/brainstorm → exploration → Q&A → review)
  - Test complete review phase flow (feedback → canvas update → approval → Epic)
  - Test session resumption (expired → rebuild → continue)
  - Test error recovery flows (transient → retry, auth → clear message)
  - Test concurrent sessions (isolation verification)
  - _Requirements: All_

- [ ] 23. Configure ROSI deployment
  - Create complete manifest.ts (scopes, commands, events, outgoing domains)
  - Create function handlers and workflow definitions
  - Create trigger configurations (slash command, events)
  - Write deployment validation tests (manifest completeness, scope coverage)
  - Configure environment variables for secrets
  - _Requirements: N/A (deployment)_

- [ ] 24. Write documentation
  - Create README with installation and deployment instructions
  - Document slash commands and @regent interaction patterns
  - Create troubleshooting guide (common errors, debugging)
  - Add JSDoc to all public interfaces
  - Document Epic-based spec storage format
  - _Requirements: N/A (documentation)_
