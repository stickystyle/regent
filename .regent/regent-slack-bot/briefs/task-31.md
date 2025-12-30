# Task Brief

## From Issue #31

**Task 24**: Write end-to-end integration tests with mock Slack workspace
**Type**: test-first

- Create test workspace setup with fixtures
- Test complete questioning flow (slash command → exploration → Q&A → review)
- Test complete review flow (feedback → canvas update → approval → PR)
- Test session resumption (expired → rebuild → continue)
- Test error recovery flows (all error categories)
- Test concurrent session isolation
- _Requirements: All_

### Requirements

This task validates all requirements through end-to-end integration tests. Key flows to test:

1. **Session Initialization** (Requirements 1.1-1.5, 2.1-2.5)
2. **Question-Answer Workflow** (Requirements 3.1-3.6)
3. **Attachment Processing** (Requirements 4.1-4.5)
4. **Canvas Creation** (Requirements 5.1-5.5)
5. **Finalization and PR** (Requirements 6.1-6.5)
6. **Session Resumption** (Requirements 7.1-7.5)
7. **Error Handling** (Requirements 8.1-8.6)
8. **Concurrent Sessions** (Requirements 9.1-9.4)
9. **Security** (Requirements 10.1-10.5)
10. **Performance** (Requirements 11.1-11.3)

### Design Context

Test complete flows end-to-end with live Slack workspace (test workspace) and mocked external APIs:

- **Session Initialization Flow**: `/brainstorm` command → session creation → first question posted
- **Repository Exploration Flow**: `/brainstorm --repo` → codebase exploration → contextual first question
- **Question-Answer Loop**: Multiple `@regent <answer>` messages → conversation progresses → confidence score increases
- **Canvas Creation Flow**: Transition to review → Canvas created → review instructions posted
- **Finalization with PR**: `@regent approved` in session with repo → PR created → link posted
- **Session Resumption**: Expire session → post `@regent` → history rebuilt → conversation continues
- **Concurrent Sessions**: Multiple simultaneous sessions in different threads → verify isolation
- **Error Handling**: Trigger each error category → verify error messages and recovery behavior

## Codebase Context

### Current Test Infrastructure

**Test Framework**: Deno Test with BDD-style assertions
- Uses `@std/testing/bdd` for `describe()` and `it()` blocks
- Uses `@std/assert` for equality and existence assertions
- Configuration in `deno.jsonc`: test task with `--allow-read --allow-net --allow-env` permissions

**Test Organization**: 35 test files organized by component:
- `/tests/clients/` - Client mocks and API interactions
- `/tests/handlers/` - Event/command handlers
- `/tests/managers/` - Manager classes
- `/tests/orchestrators/` - SessionOrchestrator flow tests (6 specialized test files)
- `/tests/integration/` - Cross-component tests (currently only `finalization.test.ts`)

**Existing Integration Test Pattern**: The `finalization.test.ts` file provides excellent reference:
- Sets up complete dependency graph with mock clients
- Tests full flow from session state through Epic creation
- Verifies side effects in correct order
- Tests error handling and recovery

### Mock Implementations

All major components have production-ready mocks colocated in their source files:

- `MockAnthropicClient` - Controls question responses, confidence scores, errors
- `MockGitHubClient` - Tracks API calls, controls errors, manages state
- `MockSlackMessagingClient` - Captures posted messages
- `MockDatastoreClient` - In-memory session storage with TTL simulation
- `MockCanvasManager` - Canvas creation/update tracking, error injection
- `MockEpicManager` - Issue/comment tracking

### Project Conventions

**File Header**: All files must start with 2-line ABOUTME comment

**Import Style**:
- Deno standard library: `import { ... } from "jsr:@std/assert@1"`
- Relative paths with `.ts` extension: `import { ... } from "../../src/..."`

**Test Structure**:
- BDD-style with nested `describe()` blocks
- `beforeEach()` for setup, `afterEach()` for cleanup
- Helper functions for creating test data within test files

### Files to Create

1. **`tests/integration/flow-questioning.test.ts`** - Complete questioning flow
2. **`tests/integration/flow-review.test.ts`** - Review phase with Canvas updates
3. **`tests/integration/concurrent-sessions.test.ts`** - Session isolation tests
4. **`tests/integration/session-resumption.test.ts`** - TTL handling and recovery
5. **`tests/integration/error-recovery.test.ts`** - All error categories

### Test Template Reference

Best existing test to use as pattern: `tests/integration/finalization.test.ts` (467 lines)
- Shows side effect verification order
- Error handling with rollback
- Message ordering assertions
- Complete dependency graph setup

---
*Branch: feature/regent-slack-bot*
*Generated at execution time by Regent*
