# Regent Huddle Listening: Voice-Enhanced Brainstorming

## Overview

An enhancement to Regent that allows the brainstorm bot to passively listen to Slack Huddles during a brainstorming session. The team discusses verbally while the bot captures audio and transcribes, but only processes the transcript when someone submits an answer via `@regent` in the thread.

This eliminates real-time streaming complexity—transcripts are fetched on-demand, not continuously.

## Problem Statement

Text-only brainstorming misses nuance:
- Teams naturally talk through complex decisions
- Written answers lose the "why" behind choices
- Disagreements and alternatives discussed verbally don't make it into the spec
- Switching between huddle and thread feels disconnected

## Solution

The bot joins the Huddle as a silent listener:
- Captures audio via Recall.ai
- Transcribes in the background (batched, not real-time)
- On each `@regent` message, fetches transcript-so-far and includes it in Claude's context
- Bot can reference what it heard when asking follow-up questions

## Key Insight: No Real-Time Needed

The bot never responds to voice—only to `@regent` text messages. So we don't need streaming transcription. We just need the transcript available when Claude is invoked.

**On each `@regent` message:**
1. Fetch transcript from last fetch (or start) until now
2. Bundle with thread history
3. Send to Claude
4. Claude responds with awareness of both

This is dramatically simpler than real-time streaming.

## User Flow

```
Slack Thread                          Huddle (Voice)
     │                                     │
/brainstorm --huddle --repo acme/api       │
     │                                     │
Bot: "Starting brainstorm. I've started   │
     a huddle—join to discuss verbally.    │
     I'll listen in, but answer here       │
     with @regent when you're ready."      │
     │                                     │
     │                            ┌────────┴────────┐
     │                            │ Team joins      │
     │                            │                 │
Bot: "What authentication         │                 │
     approach do you want?"       │                 │
     │                            │                 │
     │                            │ Alice: "JWT?"   │
     │                            │ Bob: "Sessions  │
     │                            │   are easier    │
     │                            │   to revoke"    │
     │                            │ Alice: "True,   │
     │                            │   but we need   │
     │                            │   stateless     │
     │                            │   for Lambda"   │
     │                            │ Bob: "Fair."    │
     │                            └────────┬────────┘
     │                                     │
Alice: @regent JWT for stateless auth      │
     │                                     │
Bot: "Got it—JWT for stateless.            │
     I heard you weighing revocation       │
     concerns. Should we add a token       │
     blacklist for emergency revokes,      │
     or accept that tradeoff?"             │
     │                                     │
```

The bot's follow-up question references the verbal discussion it heard, making the brainstorm smarter.

## Triggering Huddle Mode

### Option A: Flag on command

```
/brainstorm --huddle --repo acme/api Add rate limiting
```

Bot starts the huddle automatically and posts the join link in the thread.

### Option B: Separate command

```
/brainstorm --repo acme/api Add rate limiting
```

Then later:

```
/regent join-huddle
```

Bot joins an existing huddle in the channel.

**Recommendation:** Option A for simplicity. One command, bot handles setup.

## What the Bot Hears vs. What It Acts On

| Source | Bot sees it? | Bot acts on it? |
|--------|--------------|-----------------|
| Huddle audio (transcribed) | ✅ Yes | ❌ Context only |
| Thread messages (no @regent) | ✅ Yes | ❌ Context only |
| Thread messages with @regent | ✅ Yes | ✅ Official answer |
| "next" / "ready" in thread | ✅ Yes | ✅ Triggers next question |

The huddle transcript enriches the bot's understanding but never substitutes for explicit text answers.

## Technical Architecture

```
Slack Workspace
├── Thread: @regent messages trigger Lambda
└── Huddle: Recall.ai captures audio → transcribes async
                                              │
                                              ▼
                              ┌───────────────────────────┐
                              │  Recall.ai stores         │
                              │  transcript (queryable)   │
                              └───────────────────────────┘

On @regent message:
┌─────────────────────────────────────────────────────────────┐
│                    Lambda Handler                            │
│                                                              │
│  1. Receive @regent message from Slack                       │
│  2. Fetch thread history (Slack API)                         │
│  3. Fetch transcript-so-far (Recall.ai API)                  │
│  4. Bundle all context → send to Claude                      │
│  5. Post Claude's response to thread                         │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

**No streaming. No websockets. Just an API call to Recall.ai when needed.**

## Third-Party Dependencies

### Recall.ai

- Joins Slack Huddles programmatically
- Captures audio and transcribes (available via API on-demand)
- Provides speaker diarization (who said what)
- Pricing: Per-minute audio capture

Recall.ai handles transcription internally—we just query for the transcript when we need it.

## Transcript Handling

### On-Demand Fetch

When an `@regent` message arrives:

```python
# Pseudocode
def handle_regent_message(message):
    # 1. Get thread context
    thread_history = slack.get_thread_messages(channel, thread_ts)
    
    # 2. Get huddle transcript (if huddle active)
    if huddle_active:
        transcript = recall.get_transcript(
            bot_id=huddle_bot_id,
            since=last_fetch_timestamp  # Only new content
        )
        last_fetch_timestamp = now()
    
    # 3. Bundle and send to Claude
    response = claude.complete(
        system=BRAINSTORM_PROMPT,
        context={
            "thread": thread_history,
            "huddle_transcript": transcript,
            "current_answer": message.text
        }
    )
    
    # 4. Post response
    slack.post_message(channel, thread_ts, response)
```

### Transcript Format

```json
{
  "segments": [
    {
      "speaker": "Alice (U123)",
      "start": 45.2,
      "end": 52.8,
      "text": "I think we need rate limiting per-user, not just global"
    },
    {
      "speaker": "Bob (U456)",
      "start": 53.1,
      "end": 61.4,
      "text": "Yeah but what about API keys that serve multiple users?"
    }
  ]
}
```

### Context Window Management

For long huddles:
1. Keep last 10 minutes of full transcript
2. Summarize older segments
3. Always include segments near previous `@regent` answers

## Slack Huddle Lifecycle

### Starting the Huddle

When `/brainstorm --huddle` is invoked:

1. Bot creates the brainstorm thread
2. Bot triggers Recall.ai to join/create a huddle in the channel
3. Bot posts huddle join link in thread
4. Bot waits for first participant before asking first question

### During the Huddle

- Recall.ai continuously captures and transcribes audio
- Transcript accumulates and is queryable via API
- Bot only queries on `@regent` messages (not continuously)

### Ending the Huddle

When brainstorm completes ("done" confirmed):

1. Bot generates `brainstorm.md` (includes insights from verbal discussion)
2. Bot leaves/ends the huddle via Recall.ai
3. Full transcript optionally attached to thread

### Huddle Without Brainstorm End

If the huddle ends before brainstorm is complete:
- Bot continues text-only in the thread
- Transcript up to that point is still available as context

## Privacy & Consent

### Notification

When bot joins huddle, it should announce:

> "Regent is now listening to this huddle to provide context for the brainstorm. The transcript will be used to inform the spec but won't be stored permanently."

### Data Retention

- Transcript kept only for duration of brainstorm session
- Deleted after `brainstorm.md` is generated
- Not stored in logs or databases

### Opt-Out

Team can exclude huddle listening:

```
/brainstorm --no-huddle --repo acme/api Add rate limiting
```

Or simply not join the huddle—bot falls back to text-only.

## Cost Considerations

### Recall.ai

- Typically per-minute pricing
- Estimate: $0.02-0.05 per minute of audio
- Includes transcription

### Example Session Cost

30-minute brainstorm huddle:
- Recall.ai (audio + transcription): ~$0.60-1.50
- Claude API: ~$0.50-2.00 (same as text-only)
- **Total: ~$1.10-3.50 per session**

Comparable to a team's coffee run. Worth it for richer specs.

## Implementation Phases

### Phase 1: Basic Listening

- Bot joins huddle via Recall.ai
- Fetch transcript on each `@regent` message
- Include full transcript in Claude context
- No speaker attribution

### Phase 2: Speaker-Aware

- Speaker diarization enabled
- Bot can reference "Alice mentioned..." in follow-ups
- Transcript segments linked to Slack user IDs

### Phase 3: Smart Context

- Rolling summarization for long huddles
- Only fetch transcript deltas (since last fetch)
- Automatic topic detection

## Success Metrics

Huddle listening is successful if:

1. Generated specs include insights that weren't in text answers
2. Bot asks smarter follow-up questions based on verbal context
3. Teams feel the brainstorm captured their discussion accurately
4. No noticeable