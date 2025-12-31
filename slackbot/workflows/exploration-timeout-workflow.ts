// ABOUTME: ROSI workflow for checking session timeouts.
// ABOUTME: Invokes ExplorationTimeoutFunction to check for stale Initializing sessions.

import { DefineWorkflow } from "deno-slack-sdk/mod.ts";
import { ExplorationTimeoutFunction } from "../functions/exploration-timeout-check.ts";

/**
 * Exploration Timeout Workflow - Checks for stale sessions.
 *
 * This workflow is invoked by a scheduled trigger every hour to:
 * - Query datastore for sessions stuck in Initializing state
 * - Check if sessions have exceeded the timeout threshold (5 minutes)
 * - Post timeout messages to threads with retry instructions
 * - Does NOT modify session state (allows callback to still complete)
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

// Wire the timeout check function to the workflow
ExplorationTimeoutWorkflow.addStep(ExplorationTimeoutFunction, {});

export default ExplorationTimeoutWorkflow;
