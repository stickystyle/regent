// ABOUTME: ROSI workflow for processing exploration callbacks from GitHub Actions.
// ABOUTME: Routes webhook payload to ExplorationCallbackFunction for session update.

import { DefineWorkflow, Schema } from "deno-slack-sdk/mod.ts";
import { ExplorationCallbackFunction } from "../functions/exploration-callback.ts";

/**
 * Exploration Callback Workflow - Entry point for webhook callbacks.
 *
 * This workflow receives POST data from GitHub Actions containing
 * exploration results and routes them to the callback function.
 *
 * Input parameters are mapped from the webhook trigger's {{data.field}} syntax.
 */
export const ExplorationCallbackWorkflow = DefineWorkflow({
  callback_id: "exploration_callback_workflow",
  title: "Exploration Callback",
  description: "Process exploration results from GitHub Actions",
  input_parameters: {
    properties: {
      channel_id: {
        type: Schema.types.string,
        description: "Slack channel ID",
      },
      thread_ts: {
        type: Schema.types.string,
        description: "Slack thread timestamp",
      },
      exploration_data: {
        type: Schema.types.string,
        description: "JSON-stringified exploration results",
      },
    },
    required: ["channel_id", "thread_ts", "exploration_data"],
  },
});

// Add step to process the exploration callback
ExplorationCallbackWorkflow.addStep(
  ExplorationCallbackFunction,
  {
    channel_id: ExplorationCallbackWorkflow.inputs.channel_id,
    thread_ts: ExplorationCallbackWorkflow.inputs.thread_ts,
    exploration_data: ExplorationCallbackWorkflow.inputs.exploration_data,
  },
);

export default ExplorationCallbackWorkflow;
