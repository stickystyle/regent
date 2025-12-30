// ABOUTME: Link trigger for /brainstorm slash command.
// ABOUTME: Connects slash command to SlashCommandWorkflow.

import { Trigger } from "deno-slack-api/types.ts";
import { TriggerTypes } from "deno-slack-api/mod.ts";
import { SlashCommandWorkflow } from "../workflows/slash-command-workflow.ts";

/**
 * Slash command trigger for /brainstorm.
 *
 * This trigger:
 * - Listens for /brainstorm slash command invocations
 * - Passes command parameters to SlashCommandWorkflow
 * - Available in all channels where the app is installed
 */
const brainstormCommandTrigger: Trigger<typeof SlashCommandWorkflow.definition> = {
  type: TriggerTypes.Shortcut,
  name: "Start Brainstorm",
  description: "Begin a collaborative specification development session",
  workflow: `#/workflows/${SlashCommandWorkflow.definition.callback_id}`,
  inputs: {
    command_text: {
      value: "{{data.text}}",
    },
    channel_id: {
      value: "{{data.channel_id}}",
    },
    user_id: {
      value: "{{data.user_id}}",
    },
    channel_type: {
      value: "{{data.channel_type}}",
    },
    response_url: {
      value: "{{data.response_url}}",
    },
  },
};

export default brainstormCommandTrigger;
