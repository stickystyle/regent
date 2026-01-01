# Task Brief

## Task 55: Store Thread Context Messages for Claude Conversation History

Parent Epic: #42

## Task Description

Implement passive accumulation of non-`@regent` thread messages so Claude has full team discussion context when responding to direct mentions.

**Type**: test-first

### Problem Statement

The bot claims to "listen" to thread conversations for context, but this is only partially implemented:

1. **Trigger** correctly captures all thread messages (mention and non-mention)
2. **Handler** correctly parses both types, returning `{ shouldRespond: false, message: {...} }` for non-mention messages
3. **Gap**: The parsed message is discarded - nothing appends it to `MessageCache`
4. **Result**: Claude only sees `@regent` messages, missing valuable team discussion context

### Design: Directed vs. Ambient Messages

Messages fall into two categories based on **who they're directed to**, not their content:

| Message Type | Meaning | Bot Action |
|--------------|---------|------------|
| `@regent` mention | **Directed at bot** - user expects response/action | Append to cache, trigger API call |
| No mention | **Ambient context** - team discussion to factor in | Append to cache, NO API call |

This is like being in a meeting:
- Someone asks you directly → you respond
- You overhear colleagues discussing constraints → you factor it in

### Message Flow

```
┌─────────────────────────────────────────────────────────────────┐
│  Thread Timeline                                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  @regent I want to build a feature tracker                      │
│     └── append to cache → API call → bot posts question         │
│                                                                 │
│  @alice: should we use Postgres or Mongo?                       │
│     └── append to cache → done (no API call)                    │
│                                                                 │
│  @bob: Postgres, we already run it in prod                      │
│     └── append to cache → done (no API call)                    │
│                                                                 │
│  @regent Product managers will be the main users                │
│     └── append to cache → API call with ALL messages → response │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Implementation Steps

1. Write tests for Message type with `isDirectMention` field
2. Write tests for MessageCache receiving non-mention messages
3. Write tests for `formatMessages()` batching context into `---THREAD DISCUSSION---` blocks
4. Write tests for workflow storing non-mention messages without API call
5. Update Message type to include `isDirectMention: boolean`
6. Update message-event handler to set `isDirectMention` based on `@regent` presence
7. Implement context message storage in workflow (append to cache, no orchestrator call)
8. Update `AnthropicClientImpl.formatMessages()` to batch ambient context
9. Update system prompt to explain message format distinction
10. Verify existing `@regent` flow still works

### Message Structure Changes

**Current Message type:**
```typescript
interface Message {
  sender: string;
  text: string;
  timestamp: string;
  attachments?: Attachment[];
}
```

**Updated Message type:**
```typescript
interface Message {
  sender: string;
  text: string;
  timestamp: string;
  isDirectMention: boolean;  // NEW: was this an @regent message?
  attachments?: Attachment[];
}
```

### Anthropic API Message Formatting

Context messages are batched and prepended to the next direct message:

```json
{
  "system": "You are a senior software architect...\n\nMESSAGE FORMAT:\n...",
  "messages": [
    {
      "role": "user",
      "content": "I want to build a feature tracker"
    },
    {
      "role": "assistant",
      "content": "Who will be the primary users? I'm 25% confident."
    },
    {
      "role": "user",
      "content": "---THREAD DISCUSSION---\n@alice: should we use Postgres or Mongo?\n@bob: Postgres, we already run it in prod\n---END DISCUSSION---\n\nProduct managers will be the main users"
    }
  ]
}
```

### System Prompt Addition

Add to the questioning system prompt in `AnthropicClientImpl.buildQuestioningSystemPrompt()`:

```
MESSAGE FORMAT:

Messages come in two forms:

1. DIRECT MESSAGES (no prefix, or after ---END DISCUSSION---)
   - The user is addressing you directly
   - They may be answering your question, asking for clarification,
     giving you a command, or providing new information
   - You should respond to these

2. THREAD CONTEXT (marked with ---THREAD DISCUSSION---)
   - Team members discussing among themselves
   - Important context to factor into your understanding
   - Do NOT respond to these directly, but DO incorporate
     relevant information into your mental model

Example:
  ---THREAD DISCUSSION---
  @alice: should we use PostgreSQL or MongoDB?
  @bob: PostgreSQL, we already have it in prod
  ---END DISCUSSION---

  We want the feature to support bulk imports

Here, the direct message is about bulk imports. But you now know they've
decided on PostgreSQL - factor that into technical questions.
```

### formatMessages() Implementation

```typescript
private formatMessages(messages: Message[]): Array<{ role: string; content: string }> {
  const result: Array<{ role: string; content: string }> = [];
  let pendingContext: Message[] = [];

  for (const msg of messages) {
    if (msg.sender === "bot") {
      // Bot messages go straight through, flush any pending context
      result.push({ role: "assistant", content: this.formatMessageContent(msg) });
      pendingContext = [];
    } else if (msg.isDirectMention) {
      // Direct mention - bundle any pending context with it
      let content = "";
      if (pendingContext.length > 0) {
        content += "---THREAD DISCUSSION---\n";
        content += pendingContext.map(m => `@${m.sender}: ${m.text}`).join("\n");
        content += "\n---END DISCUSSION---\n\n";
        pendingContext = [];
      }
      content += this.formatMessageContent(msg);
      result.push({ role: "user", content });
    } else {
      // Ambient context - accumulate until next direct mention
      pendingContext.push(msg);
    }
  }

  // Handle trailing context (rare - would mean context after last @regent with no response yet)
  // This gets included in the next API call when user sends @regent

  return result;
}
```

## Acceptance Criteria

- [ ] Non-mention messages in active session threads are stored in MessageCache
- [ ] Non-mention messages do NOT trigger Anthropic API calls
- [ ] `@regent` messages trigger API call with full history including context
- [ ] Context messages are formatted with `---THREAD DISCUSSION---` blocks
- [ ] System prompt explains the message format distinction
- [ ] Claude can reference information from context messages in responses
- [ ] Messages in threads WITHOUT active sessions are ignored (no orphan storage)
- [ ] Session resumption still works (rebuildFromHistory unchanged)
- [ ] No double-storage when user sends `@regent` message

## Codebase Context

### Message Type (`slackbot/src/types/message.ts`)

Current definition - needs `isDirectMention` field added.

### MessageEventFunction (`slackbot/functions/message-event.ts`)

**Current outputs:**
```typescript
outputs: {
  should_respond: { type: Schema.types.boolean },
  sender: { type: Schema.types.string },
  message_text: { type: Schema.types.string },
  timestamp: { type: Schema.types.string },
},
```

**Needs:** `session_id` output (derived from `channel_id:thread_ts`) for cache lookup.

### MessageEventWorkflow (`slackbot/workflows/message-event-workflow.ts`)

**Current:** Single step that calls MessageEventFunction, outputs are not consumed.

**Needs:** Conditional routing:
- `should_respond: true` → existing flow (call orchestrator)
- `should_respond: false` → new flow (append to cache only)

### Handler (`slackbot/src/handlers/message-event.ts`)

Already detects `@regent` mentions correctly. Needs to populate `isDirectMention` on returned Message.

### AnthropicClientImpl (`slackbot/src/clients/anthropic-client.ts`)

**`formatMessages()` (lines 592-597):** Currently simple mapping, needs batching logic.

**`buildQuestioningSystemPrompt()` (lines 494-532):** Needs message format explanation added.

## Files to Modify

1. **`slackbot/src/types/message.ts`**
   - Add `isDirectMention: boolean` to Message interface

2. **`slackbot/src/handlers/message-event.ts`**
   - Set `isDirectMention` based on `@regent` detection
   - Ensure Message object always includes this field

3. **`slackbot/functions/message-event.ts`**
   - Add `session_id` output
   - Add `is_direct_mention` output

4. **`slackbot/workflows/message-event-workflow.ts`**
   - Add conditional routing based on `should_respond`
   - Add step to append context messages to cache

5. **`slackbot/src/clients/anthropic-client.ts`**
   - Update `formatMessages()` to batch context messages
   - Update `buildQuestioningSystemPrompt()` with message format docs

6. **New function**: `slackbot/functions/store-context-message.ts`
   - Simple function to append message to MessageCache for a session
   - Takes session_id, sender, text, timestamp, is_direct_mention inputs

7. **New tests**: `slackbot/tests/integration/context-message-storage.test.ts`

## Files to Reference (No Changes Needed)

- `slackbot/src/managers/message-cache.ts` - Cache implementation (works as-is)
- `slackbot/src/managers/session-manager.ts` - rebuildFromHistory pattern
- `slackbot/src/orchestrators/session-orchestrator.ts` - runToolLoop flow

## Test Scenarios

```typescript
describe("context message storage", () => {
  it("stores non-mention message when session exists", async () => {
    // Setup: create active session
    // Send: message without @regent in that thread
    // Verify: message in MessageCache with isDirectMention: false
  });

  it("does not call Anthropic API for non-mention messages", async () => {
    // Setup: active session, mock Anthropic client
    // Send: message without @regent
    // Verify: Anthropic client NOT called
  });

  it("ignores non-mention message when no session exists", async () => {
    // Send: message without @regent in random thread (no session)
    // Verify: no orphan storage, no errors
  });

  it("batches context messages with next @regent message", async () => {
    // Setup: active session
    // Send: context message 1, context message 2, @regent answer
    // Verify: Anthropic receives formatted message with ---THREAD DISCUSSION--- block
  });

  it("Claude response references context message content", async () => {
    // Setup: active session, context says "we use PostgreSQL"
    // Send: @regent "what database should we use?"
    // Verify: Claude's response acknowledges PostgreSQL decision
  });
});

describe("formatMessages with context", () => {
  it("batches consecutive context messages before direct mention", () => {
    const messages: Message[] = [
      { sender: "U1", text: "idea", timestamp: "1", isDirectMention: true },
      { sender: "bot", text: "question?", timestamp: "2", isDirectMention: false },
      { sender: "U2", text: "use postgres", timestamp: "3", isDirectMention: false },
      { sender: "U3", text: "agreed", timestamp: "4", isDirectMention: false },
      { sender: "U1", text: "answer", timestamp: "5", isDirectMention: true },
    ];

    const formatted = formatMessages(messages);

    expect(formatted).toEqual([
      { role: "user", content: "idea" },
      { role: "assistant", content: "question?" },
      { role: "user", content: "---THREAD DISCUSSION---\n@U2: use postgres\n@U3: agreed\n---END DISCUSSION---\n\nanswer" },
    ]);
  });

  it("handles no context messages (existing behavior)", () => {
    const messages: Message[] = [
      { sender: "U1", text: "idea", timestamp: "1", isDirectMention: true },
      { sender: "bot", text: "question?", timestamp: "2", isDirectMention: false },
      { sender: "U1", text: "answer", timestamp: "3", isDirectMention: true },
    ];

    const formatted = formatMessages(messages);

    expect(formatted).toEqual([
      { role: "user", content: "idea" },
      { role: "assistant", content: "question?" },
      { role: "user", content: "answer" },
    ]);
  });
});
```

## Key Implementation Insights

1. **No API call for context:** Context messages only touch the cache, never trigger Anthropic
2. **Session existence check:** Only store messages for threads with active sessions
3. **Bot messages reset context:** Context batches between bot responses
4. **Preserve message order:** Timestamps ensure correct sequencing
5. **Backwards compatible:** Old messages without `isDirectMention` should default to `true` for safety

---
*Branch: feature/regent-slack-bot*
*Generated from design discussion on thread listening functionality*
