# Task Brief

## From Issue #64

Parent Epic: #56

## Task Description

Implement the workflow connecting scheduled trigger to timeout function:
- Write tests for workflow invocation (scheduled trigger fires, passes to function)
- Create `workflows/exploration-timeout-workflow.ts` with workflow definition
- Wire workflow to timeout check function

## Acceptance Criteria

- Workflow is invoked by scheduled trigger
- Workflow executes TimeoutCheckFunction
- No inputs required (function queries datastore directly)

## Requirements Traceability

- Requirement 7: Session Timeout Handling

## Issue Discussion

No comments on issue.

## Codebase Context

### Current Implementation State

#### Scheduled Trigger (COMPLETED in Task #63)
**File**: `slackbot/triggers/exploration-timeout.ts`

The scheduled trigger is already implemented and correctly references the workflow:

```typescript
const explorationTimeoutTrigger: ScheduledTrigger<
  typeof ExplorationTimeoutWorkflow.definition
> = {
  type: TriggerTypes.Scheduled,
  name: "exploration_timeout",
  description: "Check for sessions stuck in Initializing state",
  workflow: `#/workflows/${ExplorationTimeoutWorkflow.definition.callback_id}`,
  inputs: {},
  schedule: {
    start_time: "2099-01-01T00:00:00Z",
    frequency: {
      type: "hourly",
      repeats_every: 1,
    },
  },
};
```

**Important note**: The trigger runs hourly (ROSI's minimum scheduled frequency), not every minute as originally designed.

#### Placeholder Workflow (INCOMPLETE)
**File**: `slackbot/workflows/exploration-timeout-workflow.ts`

Currently a placeholder with a TODO comment:

```typescript
export const ExplorationTimeoutWorkflow = DefineWorkflow({
  callback_id: "exploration_timeout_workflow",
  title: "Exploration Timeout Check",
  description: "Check for sessions stuck in Initializing state",
  input_parameters: {
    properties: {},
    required: [],
  },
});

// TODO: Task 8 will add the function step to process timeouts
// ExplorationTimeoutWorkflow.addStep(ExplorationTimeoutFunction, {});
```

**What's missing**: The `ExplorationTimeoutFunction` needs to be created and wired into the workflow via `addStep()`.

### Reference Implementation: ExplorationCallbackWorkflow
**File**: `slackbot/workflows/exploration-callback-workflow.ts`

Complete reference for workflow structure:

```typescript
import { DefineWorkflow, Schema } from "deno-slack-sdk/mod.ts";
import { ExplorationCallbackFunction } from "../functions/exploration-callback.ts";

export const ExplorationCallbackWorkflow = DefineWorkflow({
  callback_id: "exploration_callback_workflow",
  title: "Exploration Callback",
  description: "Process exploration results from GitHub Actions",
  input_parameters: {
    properties: {
      channel_id: { type: Schema.types.string, ... },
      thread_ts: { type: Schema.types.string, ... },
      exploration_data: { type: Schema.types.string, ... },
    },
    required: ["channel_id", "thread_ts", "exploration_data"],
  },
});

ExplorationCallbackWorkflow.addStep(
  ExplorationCallbackFunction,
  {
    channel_id: ExplorationCallbackWorkflow.inputs.channel_id,
    thread_ts: ExplorationCallbackWorkflow.inputs.thread_ts,
    exploration_data: ExplorationCallbackWorkflow.inputs.exploration_data,
  },
);

export default ExplorationCallbackWorkflow;
```

### Design Document Context

**TimeoutCheckFunction Specification** (from design.md):

**Responsibility**: Query all sessions in Initializing state, identify sessions created more than 5 minutes ago, post timeout messages to corresponding threads, do NOT modify session state.

```typescript
class TimeoutCheckFunction {
  async execute(): Promise<void> {
    // Query all Initializing sessions
    // For each session >5 min old, post timeout message
    // Do not modify session state
  }

  private isTimedOut(session: Session): boolean {
    // Check if session created_at is more than 5 minutes ago
  }

  private async postTimeoutMessage(
    channelId: string,
    threadTs: string
  ): Promise<void> {
    // Post user-facing timeout message with retry instructions
  }
}
```

### Project Conventions

#### Import Style
```typescript
import { DefineWorkflow, Schema } from "deno-slack-sdk/mod.ts";
import { DefineFunction, SlackFunction } from "deno-slack-sdk/mod.ts";
```

#### Workflow Definition
- `callback_id`: snake_case identifier
- `title`: Human-readable title
- `description`: Brief description
- `input_parameters.properties`: Define each input field
- `input_parameters.required`: Array of required field names

#### Function Definition
- Must include `source_file` pointing to the function file
- `input_parameters` and `output_parameters` with same structure
- Handler receives `{ inputs, client, env }`
- Returns `{ outputs: {...} }` matching output_parameters schema

#### File Headers
All files start with ABOUTME comments:
```typescript
// ABOUTME: Brief description of what this file does.
// ABOUTME: Additional context or responsibility.
```

### Test Template Reference

**File**: `slackbot/tests/triggers/exploration-timeout.test.ts`

Pattern for trigger/workflow tests (static analysis):

```typescript
import { assertEquals, assertExists, assertStringIncludes } from "@std/assert";
import { describe, it } from "@std/testing/bdd";

const workflowPath = new URL("../../workflows/exploration-timeout-workflow.ts", import.meta.url);
const workflowContent = await Deno.readTextFile(workflowPath);

describe("Exploration Timeout Workflow (Static Analysis)", () => {
  it("should use DefineWorkflow", () => {
    assertStringIncludes(workflowContent, "DefineWorkflow");
  });

  it("should reference function correctly", () => {
    assertStringIncludes(workflowContent, "ExplorationTimeoutFunction");
  });
});
```

### Files to Modify

1. **`slackbot/workflows/exploration-timeout-workflow.ts`**
   - Import `ExplorationTimeoutFunction`
   - Call `addStep()` to wire the function
   - Remove placeholder TODO comment

2. **`slackbot/functions/exploration-timeout-check.ts`** (NEW)
   - Define `ExplorationTimeoutFunction`
   - No input parameters (scheduled trigger provides no inputs)
   - Handler queries datastore, checks timeouts, posts messages

3. **`slackbot/manifest.ts`**
   - Import `ExplorationTimeoutWorkflow`
   - Add to workflows array

4. **`slackbot/tests/workflows/exploration-timeout-workflow.test.ts`** (NEW)
   - Test workflow definition structure
   - Test function import and addStep

### Files to Reference

- `slackbot/workflows/exploration-callback-workflow.ts` - Complete workflow pattern
- `slackbot/functions/exploration-callback.ts` - Complete function pattern
- `slackbot/tests/triggers/exploration-timeout.test.ts` - Test pattern
- `slackbot/src/types/session.ts` - Session type with created_at, phase
- `slackbot/src/managers/session-manager.ts` - Session query methods
- `.regent/webhook-based-exploration-callback-for-rosi/design.md` - Design spec

---
*Branch: feature/webhook-based-exploration-callback-for-rosi*
*Generated at execution time by Regent*
