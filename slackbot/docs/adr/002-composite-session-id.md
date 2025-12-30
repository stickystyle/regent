# ADR-002: Composite Session ID (channel:thread)

## Status

Accepted

## Context

Sessions in the Regent Slack Bot represent ongoing brainstorming conversations. We needed a reliable
way to identify and look up sessions that would:

1. **Uniquely Identify**: Each session must have a unique identifier
2. **Enable Lookup**: Sessions must be findable from incoming Slack events
3. **Support Concurrency**: Multiple sessions can run simultaneously in the same workspace
4. **Handle Thread Context**: Each session exists within a specific Slack thread

Options considered:

- **UUID-based ID**: Generate a unique UUID for each session, store mapping
- **Thread Timestamp Only**: Use just `thread_ts` as the identifier
- **Channel:Thread Composite**: Combine channel ID and thread timestamp
- **Message Link**: Use Slack's permalink format

## Decision

We chose a **composite key combining channel ID and thread timestamp** in the format:

```
{channel_id}:{thread_ts}
```

Example: `C01ABCD2EFG:1736945234.123456`

Rationale:

1. **Globally Unique**: Thread timestamps are unique within a channel; combining with channel ID
   makes them unique across the workspace

2. **Directly Derivable**: Every Slack event includes both `channel` and `thread_ts`, so the session
   ID can be computed without additional lookups

3. **No Mapping Required**: Unlike UUID-based IDs, we don't need to store or query a mapping table
   to find the session

4. **Natural Partitioning**: Sessions in different channels are naturally isolated

5. **Slack-Native**: Uses Slack's own identifiers, ensuring stability

## Consequences

### Positive

- **Zero-Lookup Session Access**: Session ID computed directly from event payload
- **Natural Concurrency**: Different threads in the same channel have different sessions
- **No Race Conditions**: Composite key eliminates ID generation conflicts
- **Audit Trail**: Session ID maps directly to viewable Slack thread

### Negative

- **Key Length**: Composite keys are longer than UUIDs (24-30 characters)
  - Acceptable for Datastore storage
  - Not user-facing

- **Coupled to Slack**: Session IDs are meaningless outside Slack context
  - Acceptable: this is a Slack-specific application

- **Thread Requirement**: Main channel messages have different `ts` than `thread_ts`
  - Handled by using the reply thread's root `thread_ts`
  - First message in thread creates the session, `thread_ts` is its `ts`

### Implementation Notes

The SessionManager handles composite key construction:

```typescript
function formatSessionId(channelId: string, threadTs: string): string {
  return `${channelId}:${threadTs}`;
}

function parseSessionId(sessionId: string): { channelId: string; threadTs: string } {
  const [channelId, threadTs] = sessionId.split(":");
  return { channelId, threadTs };
}
```

### Related Properties

- **Property 8 (Session Isolation)**: Composite key ensures session isolation
- **Property 9 (Session Persistence)**: Session ID is the Datastore primary key
