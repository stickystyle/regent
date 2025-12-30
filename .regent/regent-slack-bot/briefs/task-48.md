# Task Brief

## From Issue #48

Parent Epic: #42

## Task Description

Implement the transition from questioning to review phase, including spec synthesis and Canvas creation.

**Type**: test-first

### Implementation Steps

- Write tests for transitionToReview (confidence threshold, manual trigger)
- Write tests for spec synthesis (conversation history → brainstorm.md format)
- Write tests for Canvas creation and review instructions
- Write tests for feedback processing (@regent feedback)
- Write tests for spec updates during review
- Implement review phase logic in SessionOrchestrator

### Transition Triggers

1. Confidence score reaches 95%
2. User posts "@regent ready" or similar (conversational intent)

### Review Phase Flow

1. Synthesize spec from conversation history
2. Create Slack Canvas with spec content
3. Post review instructions in thread
4. Process feedback mentions
5. Update Canvas with revisions

## Acceptance Criteria

- Transition occurs at 95% confidence or user intent
- Spec follows Regent brainstorm.md format
- Canvas created with review instructions
- Feedback properly incorporated into revisions

_Requirements: 3.6, 5.1, 5.2, 5.3, 5.5_

## Issue Discussion

No comments on this issue.

## Codebase Context

### Current Implementation State

#### 1. **Session Types & Phase Enum** (`slackbot/src/types/session.ts`)

**Phase Enum:**
```typescript
export enum Phase {
  Initializing = "initializing",
  Questioning = "questioning",
  Review = "review",
  Finalized = "finalized",
}
```

**Session Interface (relevant fields):**
```typescript
export interface Session {
  session_id: string;
  phase: Phase;
  confidence_score: number;
  canvas_id?: string;
  // ... other fields omitted
}
```

#### 2. **SessionOrchestrator** (`slackbot/src/orchestrators/session-orchestrator.ts`)

**Current Review Phase Handling (line 515-517):**
```typescript
// Step 6: Check for phase transition
if (response.confidence_score >= REVIEW_PHASE_THRESHOLD) {
  session.phase = Phase.Review;
}
```

**REVIEW_PHASE_THRESHOLD = 95** (line 23)

**Current Flow in `runToolLoop` method:**
1. Build message history from cache + new user message
2. Call `anthropicClient.continueConversation()` with messages
3. Post Claude's question to Slack
4. Update session confidence score
5. **Check threshold and transition to Review if >= 95%**
6. Persist session updates

**Missing:** No handling for review phase transitions, spec synthesis, Canvas creation, or review instructions.

#### 3. **CanvasManager** (`slackbot/src/managers/canvas-manager.ts`)

**Interface:**
```typescript
export interface CanvasManager {
  createCanvas(spec: SpecDocument, threadTs: string, channelId: string): Promise<string>;
  updateCanvas(canvasId: string, spec: SpecDocument): Promise<void>;
  updateCanvasContent(canvasId: string, content: string): Promise<void>;
  getCanvasContent(canvasId: string): Promise<string>;
  formatForCanvas(spec: SpecDocument): string;
}
```

**Implementation Details:**
- Returns `canvas_id` on success OR `fallback:{file_id}` for Canvas API failures (Property 13 fallback)
- Uses `toMarkdown(spec)` from spec-document.ts to format content
- Throws `SlackCanvasError` with retry-safe error messages

#### 4. **AnthropicClient** (`slackbot/src/clients/anthropic-client.ts`)

**Interface Methods:**
```typescript
export interface AnthropicClient {
  continueConversation(messages: Message[], repoContext: RepositoryContext | null): Promise<QuestionResponse>;
  synthesizeSpec(messages: Message[]): Promise<SpecDocument>;  // CRITICAL FOR REVIEW PHASE
  reviseSpec(spec: SpecDocument, feedback: string): Promise<SpecDocument>;
  extractConfidenceScore(response: AnthropicMessage): number;
  continueConversationWithMCP(messages: Message[], repoContext: RepositoryContext | null,
                              mcpConfig: MCPServerConfig, options?: MCPConversationOptions): Promise<QuestionResponse>;
}
```

**Note:** `synthesizeSpec()` and `reviseSpec()` are defined in the interface but not yet implemented in production code.

#### 5. **SpecDocument Type** (`slackbot/src/types/spec-document.ts`)

**Structure:**
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

export function toMarkdown(doc: SpecDocument): string;  // Formats to brainstorm.md
```

### Test Patterns

#### **Test File Structure** (from `slackbot/tests/orchestrators/session-orchestrator-tool-loop.test.ts`)

**Setup Pattern:**
```typescript
function createTestSession(overrides?: Partial<Session>): Session {
  const now = new Date();
  const ttl = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  return {
    session_id: "C1234567890:1234567890.123456",
    phase: Phase.Questioning,
    initiator_user_id: "U1234567890",
    confidence_score: 50,
    created_at: now.toISOString(),
    ttl: ttl.toISOString(),
    ...overrides,
  };
}
```

**Test Pattern (Arrange-Act-Assert):**
```typescript
it("should transition to review phase when confidence reaches 95%", async () => {
  // Arrange: Create session + configure mocks
  const session = createTestSession({ confidence_score: 90 });
  await datastore.put(session);
  anthropicClient.setNextQuestionResponse({
    question: "I'm 95% confident...",
    confidence_score: 95,
  });

  // Act: Run tool loop
  await orchestrator.runToolLoop(session, "User answer", "U123", "1234567890.200000");

  // Assert: Verify state change
  const updatedSession = await sessionManager.loadSession("C1234567890", "1234567890.123456");
  assertEquals(updatedSession.phase, Phase.Review);
});
```

### Files to Modify

1. **`slackbot/src/orchestrators/session-orchestrator.ts`**
   - Add method(s) to handle review phase transition
   - Add method to synthesize spec from message history
   - Add method to create Canvas with review instructions
   - Integration with CanvasManager and AnthropicClient

2. **`slackbot/src/clients/anthropic-client.ts`**
   - Implement `synthesizeSpec()` method in `AnthropicClientImpl`
   - Implement `reviseSpec()` method in `AnthropicClientImpl`
   - Add system prompts for spec synthesis and revision phases

### Files to Reference

1. **`slackbot/tests/orchestrators/session-orchestrator-tool-loop.test.ts`** - Test structure template
2. **`slackbot/tests/integration/finalization.test.ts`** - Integration test pattern
3. **`slackbot/tests/managers/canvas-manager.test.ts`** - Canvas test patterns
4. **`slackbot/tests/clients/anthropic-client-prompts.test.ts`** - System prompt testing

### Key Integration Points

**Message History Flow:**
```
MessageCache → buildMessageHistory() → continueConversation() → synthesizeSpec()
```

**Canvas Creation Flow:**
```
synthesizeSpec() → CanvasManager.createCanvas() → update Session.canvas_id → updateSession()
```

**Review Phase Trigger:**
```
runToolLoop() → confidence >= 95% → transition to Review → synthesizeSpec() → createCanvas()
```

### Constants & Thresholds

- **REVIEW_PHASE_THRESHOLD = 95** - Confidence score to transition from Questioning to Review
- **SESSION_TTL_DAYS = 30** - Session expiration time
- **SPEC_MARKER_PREFIX = "<!-- REGENT_SPEC:"** - For identifying specs on Epic issues

---
*Branch: feature/regent-slack-bot*
*Generated at execution time by Regent*
