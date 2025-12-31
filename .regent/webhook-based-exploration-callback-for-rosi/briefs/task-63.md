# Task Brief

## From Issue #63

Parent Epic: #56

## Task Description

Create the scheduled trigger for monitoring session timeouts:
- Write tests for scheduled trigger (runs every minute)
- Create `triggers/exploration-timeout.ts` with scheduled trigger definition

## Acceptance Criteria

- Scheduled trigger runs every minute
- Trigger invokes TimeoutCheckWorkflow
- Trigger is created on deploy

## Requirements Traceability

- Requirement 7: Session Timeout Handling

## Issue Discussion

No comments on this issue.

## Codebase Context

### Platform Limitation

**IMPORTANT**: Slack ROSI scheduled triggers support **hourly minimum frequency**, not minute-based. The design document's "every minute" schedule is not technically possible. Implementation will use `repeats_every: 1` with type `hourly`.

### Current Trigger Patterns

Triggers in this project follow a consistent pattern:

```typescript
const triggerName: Trigger<typeof WorkflowName.definition> = {
  type: TriggerTypes.SomeType,
  name: "trigger_name",
  description: "Description of the trigger",
  workflow: `#/workflows/${WorkflowName.definition.callback_id}`,
  inputs: {
    // Optional - scheduled triggers may have no inputs
  },
};

export default triggerName;
```

### Scheduled Trigger Pattern (from Context7 docs)

```typescript
import { TriggerTypes } from "deno-slack-api/mod.ts";
import { ScheduledTrigger } from "deno-slack-api/typed-method-types/workflows/triggers/scheduled.ts";
import { ExampleWorkflow } from "../workflows/example_workflow.ts";

const schedule: ScheduledTrigger<typeof ExampleWorkflow.definition> = {
  name: "Sample",
  type: TriggerTypes.Scheduled,
  workflow: `#/workflows/${ExampleWorkflow.definition.callback_id}`,
  inputs: {},
  schedule: {
    start_time: new Date(new Date().getTime() + 60000).toISOString(),
    end_time: "2040-05-01T14:00:00Z",
    frequency: {
      type: "hourly",
      repeats_every: 1,
    },
  },
};
export default schedule;
```

### Files to Create

1. `slackbot/triggers/exploration-timeout.ts` - Scheduled trigger definition
2. `slackbot/tests/triggers/exploration-timeout.test.ts` - Tests for trigger

### Files to Reference

- `slackbot/triggers/exploration-callback.ts` - Example trigger pattern
- `slackbot/workflows/exploration-callback-workflow.ts` - Workflow reference pattern

### Design Reference

From design.md:
```typescript
const trigger = DefineScheduledTrigger({
  name: "timeout_monitor",
  description: "Check for sessions stuck in Initializing state",
  schedule: "0 * * * *", // Every minute (NOTE: Not possible, will use hourly)
  workflow: TimeoutCheckWorkflow,
});
```

### Workflow Reference

The trigger will reference `ExplorationTimeoutWorkflow` which will be created in Task 8 (Issue #64). For now, we can create a placeholder import reference.

**Note**: The workflow doesn't exist yet (Task 8), but the trigger file can still be created with the proper import - it will be resolved when Task 8 implements the workflow.

### Project Conventions

- ABOUTME headers on all files (2 lines)
- Use `.ts` extensions in imports
- Export trigger as default export
- Snake_case for callback_id values

---
*Branch: feature/webhook-based-exploration-callback-for-rosi*
*Generated at execution time by Regent*
