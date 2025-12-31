# Task Brief

## From Issue #60

Parent Epic: #56

## Task Description

Implement the workflow that connects webhook trigger to callback function:
- Write tests for workflow invocation (receives webhook POST, passes to function)
- Create `workflows/exploration-callback-workflow.ts` with workflow definition
- Wire workflow to callback function

## Acceptance Criteria

- Workflow receives inputs from webhook trigger (channel_id, thread_ts, exploration_data)
- Workflow invokes ExplorationCallbackFunction with inputs
- Workflow returns function output to webhook response

## Requirements Traceability

- Requirement 2: Callback Payload Reception

## Issue Discussion

No comments on this issue.

## Codebase Context

### Current Implementation State

**exploration-callback-workflow.ts** - STUB FILE
- File: `slackbot/workflows/exploration-callback-workflow.ts`
- Status: Skeleton definition only (14 lines of actual code)
- Defined inputs: `channel_id`, `thread_ts`, `exploration_data` (all strings)
- Missing: The workflow step that wires to the callback function (TODO on line 40)

**triggers/exploration-callback.ts** - COMPLETE
- Status: Fully implemented webhook trigger
- Maps webhook POST data to workflow inputs using `{{data.field}}` syntax
- Ready to invoke the workflow

**manifest.ts** - REGISTERED
- Status: Workflow already registered
- Outgoing domains include GitHub and Anthropic APIs

**ExplorationCallbackFunction** - DOES NOT EXIST YET
- Must be created at: `slackbot/functions/exploration-callback.ts`
- Should wrap the existing `handleExplorationCallback` from `src/handlers/exploration-handler.ts`

### What Needs to Happen

1. **Create ExplorationCallbackFunction** that receives:
   - `channel_id`: Slack channel ID
   - `thread_ts`: Slack thread timestamp
   - `exploration_data`: JSON string containing exploration callback payload

2. **Function implementation** should:
   - Parse the JSON string back to `ExplorationCallback` object
   - Call `handleExplorationCallback()` from `src/handlers/exploration-handler.ts`
   - Return success/error response
   - Dependencies: SessionManager, SlackMessagingClient, CALLBACK_SECRET env var

3. **Update workflow** to add step that:
   - Passes workflow inputs to the function
   - Maps parameter names from workflow format to function format

### Workflow Pattern (from slash-command-workflow.ts)

```typescript
export const SlashCommandWorkflow = DefineWorkflow({
  callback_id: "slash_command_workflow",
  title: "Brainstorm Slash Command",
  input_parameters: {
    properties: { /* ... */ },
    required: ["channel_id", "user_id", "command_text", "channel_type", "response_url"],
  },
});

SlashCommandWorkflow.addStep(
  SlashCommandFunction,
  {
    channel_id: SlashCommandWorkflow.inputs.channel_id,
    user_id: SlashCommandWorkflow.inputs.user_id,
    // ... map all inputs
  },
);
```

### Function Pattern (from slash-command.ts)

```typescript
export const SlashCommandFunction = DefineFunction({
  callback_id: "slash_command_function",
  title: "...",
  description: "...",
  source_file: "functions/slash-command.ts",
  input_parameters: {
    properties: { /* required inputs */ },
    required: ["..."],
  },
  output_parameters: {
    properties: { /* return values */ },
    required: ["success"],
  },
});

export default SlackFunction(
  SlashCommandFunction,
  ({ inputs }) => {
    // implementation
  },
);
```

### Handler to Wrap

- **Location**: `src/handlers/exploration-handler.ts`
- **Function**: `handleExplorationCallback(request, dependencies)`
- **Input types**:
  - `ExplorationHandlerRequest`: `{ authorizationHeader: string | undefined, body: ExplorationCallback }`
  - `ExplorationHandlerDependencies`: `{ sessionManager: SessionManager, messagingClient: SlackMessagingClient, callbackSecret: string }`
- **Return**: `{ status: number, ok: boolean, error?: string, message?: string }`

### Files to Create

1. `slackbot/functions/exploration-callback.ts` - New function wrapping handler
2. `slackbot/tests/functions/exploration-callback.test.ts` - Unit tests for function

### Files to Modify

1. `slackbot/workflows/exploration-callback-workflow.ts` - Add import and addStep call
2. `slackbot/manifest.ts` - Add function to functions array (if needed)

### Files to Reference

- `slackbot/workflows/slash-command-workflow.ts` - Workflow pattern
- `slackbot/functions/slash-command.ts` - Function pattern
- `slackbot/src/handlers/exploration-handler.ts` - Handler to wrap
- `slackbot/src/types/exploration-callback.ts` - Types

---
*Branch: feature/webhook-based-exploration-callback-for-rosi*
*Generated at execution time by Regent*
