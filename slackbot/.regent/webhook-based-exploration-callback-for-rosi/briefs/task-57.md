# Task Brief

## From Issue #57

Parent Epic: #56

## Task Description

Implement the core type definitions for exploration callbacks:
- Write tests for ExplorationCallback interface (success/error variants)
- Write tests for ExplorationContext interface (all fields, optional handling)
- Write tests for isExplorationSuccess type guard (success vs error detection)
- Implement all types in `src/types/exploration-callback.ts`

## Acceptance Criteria

- ExplorationCallback type supports both success and error variants
- ExplorationContext type includes all fields from design (file_tree, key_files, relevant_patterns, project_overview, architecture_summary, testing_approach)
- Type guard correctly distinguishes success from error callbacks
- All tests pass

## Requirements Traceability

- Requirement 2: Callback Payload Reception
- Requirement 3: Session Validation

## Issue Discussion

No comments on this issue.

## Codebase Context

### Current Implementation State

The types are already implemented in `slackbot/src/types/exploration-callback.ts`:

**ExplorationContext** - Contains all required fields:
- `file_tree?: string` - File tree structure
- `project_overview?: string` - Project overview
- `architecture_summary?: string` - Architecture patterns
- `relevant_patterns?: string[]` - Detected patterns
- `key_files?: string[]` - Key relevant files
- `testing_approach?: string` - Testing patterns
- Plus additional enhancement fields: `integration_points`, `idea_related_code`

**ExplorationCallback** - Union type supporting:
- `ExplorationCallbackSuccess` - with `session_id`, `status: "success"`, `exploration_context`
- `ExplorationCallbackError` - with `session_id`, `status: "error"`, `error` object

**Type Guards**:
- `isExplorationSuccess(callback)` - checks `callback.status === "success"`
- `isExplorationError(callback)` - checks `callback.status === "error"`

### Test Template Reference

- **Similar Test File**: `tests/types/session.test.ts`
- **Key Patterns**:
  - Uses `describe`/`it` from `@std/testing/bdd`
  - Uses `assertEquals`, `assertExists` from `@std/assert`
  - Tests interface creation with all required fields
  - Tests optional field handling
  - Tests type guards and utility functions

### Files to Modify

- `tests/types/exploration-callback.test.ts` (NEW) - Create dedicated type tests

### Files to Reference

- `src/types/exploration-callback.ts` - Implementation to test
- `tests/types/session.test.ts` - Pattern for type tests
- `tests/orchestrators/exploration-result.test.ts` - Usage patterns

---
*Branch: feature/webhook-based-exploration-callback-for-rosi*
*Generated at execution time by Regent*
