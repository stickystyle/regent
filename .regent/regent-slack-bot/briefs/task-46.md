# Task Brief

## From Issue #46

Parent Epic: #42

## Task Description

Implement phase-specific system prompts for Claude interactions during questioning, review, and synthesis phases.

**Type**: test-first

### Implementation Steps

- Write tests for questioning phase prompt (with/without repo context)
- Write tests for review phase prompt (feedback incorporation)
- Write tests for codebase context formatting (exploration summary)
- Write tests for spec synthesis instructions
- Implement buildSystemPrompt method with phase-specific logic

### Prompt Requirements

**Questioning Phase:**
- Include codebase exploration summary when repo configured
- Instruct Claude to ask one question at a time
- Track confidence score toward 95% threshold
- Reference existing patterns from repository

**Review Phase:**
- Include current spec draft
- Instruct Claude to incorporate feedback
- Maintain Regent brainstorm.md format

**Synthesis Phase:**
- Generate structured spec matching Regent format
- Include all sections: title, overview, problem, goals, non-goals, personas, use cases

## Acceptance Criteria

- System prompts generate appropriate Claude behavior for each phase
- Codebase context properly formatted when available
- Spec synthesis produces valid brainstorm.md format

_Requirements: 2.3, 2.5, 3.1, 5.2_

## Issue Discussion

**@stickystyle** (today):
> Need to take into account the prompts that are already written in `plugin/commands/`

## Codebase Context

### Current Implementation State

**Location**: `slackbot/src/clients/anthropic-client.ts`

The AnthropicClient already has **three system prompts partially implemented** as private methods:

1. **buildQuestioningSystemPrompt** (lines 384-422)
   - Base prompt instructs Claude to ask exactly one question per turn
   - References confidence scoring mechanism
   - **Has conditional repo context support**: When `repoContext` is provided, adds a "REPOSITORY CONTEXT" section
   - Example context inclusion:
     ```typescript
     const contextSection = `
     REPOSITORY CONTEXT:
     - Repository: ${repoContext.repository}
     - Framework: ${repoContext.framework}
     - Patterns: ${repoContext.patterns.join(", ") || "None detected"}
     - Structure:
     ${repoContext.structure}

     Consider this existing codebase when asking questions...`;
     ```
   - **Returns**: Complete system prompt string

2. **buildSynthesisSystemPrompt** (lines 429-451)
   - Instructs Claude to synthesize conversation into JSON spec document
   - Specifies exact JSON structure expected
   - Output rules: ONLY JSON, no other text
   - **Signature**: `private buildSynthesisSystemPrompt(): string`

3. **buildRevisionSystemPrompt** (lines 458-472)
   - For review phase feedback incorporation
   - Instructs Claude to update spec based on feedback
   - Maintains original structure, modifies only relevant sections
   - **Signature**: `private buildRevisionSystemPrompt(): string`

**Integration Points**:
- `continueConversation()` (line 650): Uses `buildQuestioningSystemPrompt(repoContext)`
- `synthesizeSpec()` (line 675): Uses `buildSynthesisSystemPrompt()`
- `reviseSpec()` (line 697): Uses `buildRevisionSystemPrompt()`

**Error Handling**: Currently none - methods are private and only return strings. No validation of prompt content.

### Plugin Prompts Reference

**Source**: `plugin/commands/brainstorm.md`

**Key Patterns to Reference**:

1. **Phase Structure**: The plugin follows these distinct phases:
   - Phase 0: Codebase Discovery (optional)
   - Phase 1: Initial Understanding
   - Phase 2: Iterative Deepening
   - Phase 3: Confidence Check
   - Phase 4: Draft Creation
   - Phase 5: Validation
   - Phase 6: Final Review
   - Phase 7: Finalization

2. **Question Style**: "Ask only ONE question at a time - don't overwhelm"
   - Build on previous answers
   - Probe deeper into specific aspects
   - Uncover edge cases, constraints, assumptions
   - Reference existing codebase patterns when relevant

3. **Codebase Context Usage** (Phase 0):
   ```
   Provide a concise summary of this codebase for a brainstorming session. Include:
   - Project type and tech stack
   - Overall architecture pattern
   - Existing patterns for common concerns
   - Any relevant code for feature development
   ```

4. **Confidence Assessment**:
   - Start at low confidence (20-40%)
   - Increase as gather more detail
   - At 95%+ the spec is ready for review

5. **Coverage Areas** (from brainstorm command):
   - Problem Statement
   - Goals and Non-Goals
   - User Personas
   - Use Cases
   - Technical Context
   - Constraints
   - Assumptions
   - Success Criteria

### Test Template Reference

**Similar Test File**: `slackbot/tests/clients/anthropic-client.test.ts` (950 lines)

**Test Structure**:
- BDD-style: `describe()` and `it()` blocks
- Import pattern: `import { describe, it } from "@std/testing/bdd"`
- Mock client: Provides configurable responses and error injection
- Assertions: `assertEquals()`, `assertRejects()` from `@std/assert`

**Key Patterns**:

1. **Mock Setup** (lines 84-92):
   ```typescript
   beforeEach(() => {
     client = new MockAnthropicClient();
   });

   afterEach(() => {
     client.clear();
   });
   ```

2. **Test Fixtures** (lines 96-105):
   ```typescript
   const messages: Message[] = [
     { sender: "U123", text: "I want to build a login feature", timestamp: "123.456" },
   ];
   const context: RepositoryContext = {
     repository: "owner/repo",
     framework: Framework.React,
     patterns: [],
     relevant_files: [],
     structure: "",
   };
   ```

3. **Response Helpers**:
   - `createMockResponse(content, stopReason, inputTokens, outputTokens)` (lines 32-55)
   - `createErrorResponse(status, errorType, message, retryAfter)` (lines 60-80)

4. **Assertion Style**:
   ```typescript
   assertEquals(response.question, "Custom question?");
   assertEquals(response.confidence_score, 75);
   assertRejects(() => client.continueConversation(messages, null), ErrorType);
   ```

### Project Conventions

**ABOUTME Headers** (Required):
- All source files start with 2-line ABOUTME comment
- Format: `// ABOUTME: [description]`

**Import Style**:
```typescript
import { AnthropicInputError, ... } from "../errors/types.ts";
import type { Message } from "../types/message.ts";
// Deno imports from @std/
import { assertEquals } from "@std/assert";
```

**Type Definitions**:
- Use `interface` for complex types
- Document with JSDoc comments above interface
- Example parameters/returns in @example blocks

**Error Handling**:
- Specific error types: `AnthropicRateLimitError`, `AnthropicModelError`, `AnthropicInputError`, `NetworkTimeoutError`
- Retry logic with exponential backoff

**Function Naming**:
- Private methods use `build*` prefix (e.g., `buildQuestioningSystemPrompt`)
- Public interfaces define contracts
- Mock implementations for testing

### Design Document Context

**Source**: `.regent/regent-slack-bot/design.md`

**System Prompt Structure Expected**:
```markdown
You are Regent, a collaborative brainstorming facilitator...

## Current Session
- Phase: {questioning|review|finalized}
- Repo: {owner/repo or "none"}
- Questions asked: {count}
- Confidence: {percentage}

## Codebase Context (if repo provided)
{summary of explored files and patterns}

## Guidelines
- Ask ONE question at a time
- Questions should be specific and actionable
- Reference existing code when relevant
- Track confidence toward complete spec
- When at 95% confidence, propose creating draft

## Thread History
{formatted Q&A history}
```

### Requirements Context

**Relevant Requirements**:
- Req 3.1: System SHALL ask exactly one question per turn
- Req 3.6: Confidence score reaches 95% for phase transition
- Req 2.3: System SHALL reference relevant existing code in questions
- Req 2.5: Patterns should match codebase style
- Req 5.2: Spec synthesis produces valid brainstorm.md format

### Files to Modify

1. **`slackbot/src/clients/anthropic-client.ts`**
   - Refactor prompt building into a `buildSystemPrompt()` method that takes phase
   - Add codebase context formatting as separate helper
   - Update private methods to accept phase parameter
   - Add prompt validation (ensure "ONE question" for questioning phase)

### Files to Reference

1. **`slackbot/src/types/repository-context.ts`** - RepositoryContext interface
2. **`slackbot/src/types/spec-document.ts`** - SpecDocument interface (synthesis output)
3. **`slackbot/src/types/message.ts`** - Message interface (test fixtures)
4. **`slackbot/tests/clients/anthropic-client.test.ts`** - Test patterns
5. **`plugin/commands/brainstorm.md`** - Reference for prompt philosophy
6. **`plugin/commands/specify.md`** - Reference for spec synthesis and EARS format

---
*Branch: feature/regent-slack-bot*
*Generated at execution time by Regent*
