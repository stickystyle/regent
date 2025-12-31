// ABOUTME: ROSI workflow for checking session timeouts.
// ABOUTME: Placeholder - full implementation in Task 8 (Issue #64).

import { DefineWorkflow } from "deno-slack-sdk/mod.ts";

/**
 * Exploration Timeout Workflow - Checks for stale sessions.
 *
 * This workflow is invoked by a scheduled trigger every hour to:
 * - Query datastore for sessions stuck in Initializing state
 * - Check if sessions have exceeded the timeout threshold (5 minutes)
 * - Transition timed-out sessions to Questioning with degraded mode
 * - Notify users that exploration timed out
 *
 * Note: This is a placeholder definition. Full implementation
 * will be added in Task 8 (Issue #64).
 */
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

export default ExplorationTimeoutWorkflow;
