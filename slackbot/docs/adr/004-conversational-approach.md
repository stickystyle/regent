# ADR-004: Conversational Approach Over Structured Commands

## Status

Accepted

## Context

Users need to interact with Regent during brainstorming sessions to:

1. Answer questions posed by the bot
2. Skip questions they're unsure about
3. Signal readiness for review
4. Provide feedback on draft specs
5. Approve final specs

We needed to decide how users would express these intents.

Options considered:

- **Structured Commands**: Explicit commands like `/answer`, `/skip`, `/ready`, `/approve`
- **Button-Based UI**: Interactive buttons for each action
- **Conversational NLU**: Natural language understanding with `@regent` mentions
- **Hybrid**: Commands for control, natural language for answers

## Decision

We chose a **fully conversational approach** where users interact with `@regent` using natural
language for all interactions.

| Intent   | Example Phrases                                         |
| -------- | ------------------------------------------------------- |
| Answer   | `@regent The API should support REST and GraphQL`       |
| Skip     | `@regent Let's skip this one` / `@regent Next question` |
| Ready    | `@regent I think we've covered everything`              |
| Feedback | `@regent Add more detail about error handling`          |
| Approve  | `@regent Looks good!` / `@regent Approved`              |

Rationale:

1. **Lower Cognitive Load**: Users don't need to memorize commands
2. **Natural Discussion Flow**: Brainstorming is inherently conversational
3. **Claude's Strength**: Claude excels at understanding intent from natural language
4. **Flexibility**: Users can express the same intent in many ways
5. **Team-Friendly**: Non-technical stakeholders can participate without learning syntax

## Consequences

### Positive

- **Accessible**: Anyone can participate without training
- **Expressive**: Rich answers aren't constrained by command syntax
- **Forgiving**: Typos and variations are understood
- **Contextual**: Claude considers conversation history for intent

### Negative

- **Ambiguity Risk**: Some phrases might be misinterpreted
  - **Mitigation**: Claude asks for clarification when unsure
  - **Mitigation**: Control intents (skip, ready, approve) have clear patterns

- **No Discoverability**: Users might not know what they can do
  - **Mitigation**: Onboarding messages explain key phrases
  - **Mitigation**: User guide documents common patterns

- **Processing Overhead**: Every message goes through Claude for intent classification
  - Acceptable: Claude processing is the core value proposition
  - Intent classification happens as part of response generation

### Intent Classification

Claude classifies messages into intents as part of its response:

```typescript
type UserIntent =
  | { type: "answer"; content: string }
  | { type: "skip" }
  | { type: "ready" }
  | { type: "feedback"; content: string }
  | { type: "approve" };
```

The classification is implicit in Claude's response:

- If Claude asks a new question: previous message was an answer
- If Claude synthesizes spec: user signaled readiness
- If Claude confirms approval: user approved the spec

### Implicit vs Explicit Messages

Messages in the thread without `@regent` are stored for context but don't trigger responses:

```
Alice: What about supporting SAML?         <- Implicit (no response)
Bob: OAuth2 is probably enough for now     <- Implicit (no response)
Alice: @regent Let's focus on OAuth2       <- Explicit (Claude responds)
```

This allows team discussion without requiring every message to go through Claude.

### Related Properties

- **Property 2 (Single Question)**: Conversational flow maintains one-question-at-a-time
- **Property 6 (Spec Updates)**: Natural language feedback updates Canvas
- **Property 7 (Finalization)**: Approval intent triggers Epic creation
