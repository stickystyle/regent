# Task Brief

## From Issue #59

Parent Epic: #56

## Task Description

Create the Slack webhook trigger for receiving exploration callbacks:
- Write tests for webhook trigger creation (trigger exists after deploy)
- Create `triggers/exploration-callback.ts` with webhook trigger definition
- Document webhook URL retrieval in deployment docs

## Acceptance Criteria

- Webhook trigger named `exploration_callback` is created on deploy
- Trigger accepts POST with channel_id, thread_ts, exploration_data fields
- `slack trigger list` shows the webhook URL after deployment
- Webhook URL remains stable across redeployments

## Requirements Traceability

- Requirement 1: Webhook Trigger Creation
- Requirement 9: Deployment Documentation

## Issue Discussion

No comments on this issue.

## Codebase Context

### Current Trigger Implementation Pattern

**File Location**: `slackbot/triggers/`

**Key Patterns from existing triggers**:
- Import `Trigger` type from `deno-slack-api/types.ts`
- Import `TriggerTypes` from `deno-slack-api/mod.ts`
- Define as typed constant: `const triggerName: Trigger<typeof WorkflowDefinition.definition> = { ... }`
- Reference workflow via callback_id: `#/workflows/${Workflow.definition.callback_id}`
- Map input values using `{{data.field}}` syntax
- Export as default export
- Add ABOUTME comment at top (2 lines)

**Webhook Trigger Type**: Use `TriggerTypes.Webhook` (not Shortcut or Event)

### Workflow Dependency

The trigger needs to reference `ExplorationCallbackWorkflow` which is defined in Task 4 (Issue #60).

**Workflow reference pattern**:
```typescript
import { ExplorationCallbackWorkflow } from "../workflows/exploration-callback-workflow.ts";

const trigger: Trigger<typeof ExplorationCallbackWorkflow.definition> = {
  type: TriggerTypes.Webhook,
  workflow: `#/workflows/${ExplorationCallbackWorkflow.definition.callback_id}`,
  // ...
};
```

### Webhook Input Mapping

From design.md, the webhook receives these fields in the POST body:
- `channel_id`: string - Slack channel ID
- `thread_ts`: string - Slack thread timestamp
- `exploration_data`: string - JSON-stringified exploration results

These map to workflow inputs using `{{data.field}}` syntax:
```typescript
inputs: {
  channel_id: { value: "{{data.channel_id}}" },
  thread_ts: { value: "{{data.thread_ts}}" },
  exploration_data: { value: "{{data.exploration_data}}" },
}
```

### Test Pattern

From `slackbot/tests/deployment/manifest-validation.test.ts`:

```typescript
describe("Triggers (File Existence)", () => {
  const triggersDir = new URL("../../triggers/", import.meta.url);

  it("should have exploration-callback.ts trigger", async () => {
    const filePath = new URL("exploration-callback.ts", triggersDir);
    const stat = await Deno.stat(filePath);
    assertExists(stat);
    assertEquals(stat.isFile, true);
  });
});
```

### Deployment Documentation

**Location**: `slackbot/docs/deployment.md`

Need to add section about retrieving webhook URL after deployment:

1. Run `slack trigger list` to see all triggers
2. Find the `exploration_callback` trigger's webhook URL
3. Add URL to GitHub repository secrets as `SLACK_WEBHOOK_TRIGGER_URL`
4. Note that URL persists across `slack deploy` redeployments

### Files to Modify

1. **Create**: `slackbot/triggers/exploration-callback.ts` - Webhook trigger definition
2. **Update**: `slackbot/tests/deployment/manifest-validation.test.ts` - Add file existence test
3. **Update**: `slackbot/docs/deployment.md` - Add webhook URL retrieval section

### Files to Reference

- `slackbot/triggers/brainstorm-command.ts` - Trigger pattern template
- `slackbot/triggers/message-events.ts` - Trigger pattern template
- `slackbot/workflows/exploration-callback-workflow.ts` - Workflow to reference (Task 4)
- Design doc section on WebhookTrigger for interface spec

---
*Branch: feature/webhook-based-exploration-callback-for-rosi*
*Generated at execution time by Regent*
