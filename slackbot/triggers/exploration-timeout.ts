// ABOUTME: Scheduled trigger for monitoring session timeouts.
// ABOUTME: Runs hourly to check for sessions stuck in Initializing state.

import { TriggerTypes } from "deno-slack-api/mod.ts";
import { ScheduledTrigger } from "deno-slack-api/typed-method-types/workflows/triggers/scheduled.ts";
import { ExplorationTimeoutWorkflow } from "../workflows/exploration-timeout-workflow.ts";

/**
 * Scheduled trigger for exploration timeout monitoring.
 *
 * This trigger:
 * - Runs every hour (minimum ROSI scheduled frequency)
 * - Invokes ExplorationTimeoutWorkflow to check for stale sessions
 * - Queries datastore directly for sessions in Initializing state
 * - No inputs required - the workflow handles datastore queries
 *
 * The workflow will:
 * - Find sessions stuck in Initializing state beyond timeout threshold
 * - Transition them to Questioning with degraded mode
 * - Notify users that exploration timed out
 *
 * Note: The trigger name is "exploration_timeout" rather than the design.md
 * name "timeout_monitor" for clarity - this monitors exploration timeouts
 * specifically during the Initializing phase, not general session timeouts.
 */
const explorationTimeoutTrigger: ScheduledTrigger<
  typeof ExplorationTimeoutWorkflow.definition
> = {
  type: TriggerTypes.Scheduled,
  name: "exploration_timeout",
  description: "Check for sessions stuck in Initializing state",
  workflow: `#/workflows/${ExplorationTimeoutWorkflow.definition.callback_id}`,
  inputs: {},
  schedule: {
    // Far future start time - the schedule runs indefinitely once created
    start_time: "2099-01-01T00:00:00Z",
    frequency: {
      type: "hourly",
      repeats_every: 1,
    },
  },
};

export default explorationTimeoutTrigger;
