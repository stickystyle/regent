// ABOUTME: ROSI workflow for handling /brainstorm slash command invocations.
// ABOUTME: Routes slash command input to SlashCommandFunction for processing.

import { DefineWorkflow, Schema } from "deno-slack-sdk/mod.ts";
import { SlashCommandFunction } from "../functions/slash-command.ts";

/**
 * Slash Command Workflow - Entry point for /brainstorm slash commands.
 *
 * This workflow handles /brainstorm slash command invocations to start
 * new brainstorming sessions. It routes command parameters to the
 * SlashCommandFunction for parsing and validation.
 */
export const SlashCommandWorkflow = DefineWorkflow({
  callback_id: "slash_command_workflow",
  title: "Brainstorm Slash Command",
  description: "Start a collaborative specification development session",
  input_parameters: {
    properties: {
      command_text: {
        type: Schema.types.string,
        description: "Command text from /brainstorm",
      },
      channel_id: {
        type: Schema.slack.types.channel_id,
        description: "Channel where the command was invoked",
      },
      user_id: {
        type: Schema.slack.types.user_id,
        description: "User who invoked the command",
      },
      channel_type: {
        type: Schema.types.string,
        description: "Type of channel",
      },
      response_url: {
        type: Schema.types.string,
        description: "Slack response URL for delayed responses",
      },
    },
    required: ["channel_id", "user_id", "command_text", "channel_type", "response_url"],
  },
});

// Add step for slash command handling
SlashCommandWorkflow.addStep(
  SlashCommandFunction,
  {
    channel_id: SlashCommandWorkflow.inputs.channel_id,
    user_id: SlashCommandWorkflow.inputs.user_id,
    text: SlashCommandWorkflow.inputs.command_text,
    channel_type: SlashCommandWorkflow.inputs.channel_type,
    response_url: SlashCommandWorkflow.inputs.response_url,
  },
);

export default SlashCommandWorkflow;
