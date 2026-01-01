// ABOUTME: Webhook trigger for receiving exploration callbacks from GitHub Actions.
// ABOUTME: Receives POST requests with exploration data and invokes callback workflow.

import { Trigger } from "deno-slack-api/types.ts";
import { TriggerTypes } from "deno-slack-api/mod.ts";
import { ExplorationCallbackWorkflow } from "../workflows/exploration-callback-workflow.ts";

/**
 * Webhook trigger for exploration callbacks.
 *
 * This trigger:
 * - Exposes a unique HTTPS endpoint for GitHub Actions
 * - Receives POST with channel_id, thread_ts, exploration_data
 * - Invokes ExplorationCallbackWorkflow to process the callback
 * - URL remains stable across redeployments
 *
 * After deployment, retrieve the webhook URL using:
 *   slack trigger list
 *
 * The URL will be in the format:
 *   https://hooks.slack.com/triggers/<team_id>/<trigger_id>/<secret>
 */
const explorationCallbackTrigger: Trigger<
  typeof ExplorationCallbackWorkflow.definition
> = {
  type: TriggerTypes.Webhook,
  name: "exploration_callback",
  description: "Receives codebase exploration results from GitHub Actions",
  workflow: `#/workflows/${ExplorationCallbackWorkflow.definition.callback_id}`,
  inputs: {
    channel_id: {
      value: "{{data.channel_id}}",
    },
    thread_ts: {
      value: "{{data.thread_ts}}",
    },
    exploration_data: {
      value: "{{data.exploration_data}}",
    },
  },
};

export default explorationCallbackTrigger;
