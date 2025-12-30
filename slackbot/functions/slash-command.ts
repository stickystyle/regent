// ABOUTME: ROSI function definition for /brainstorm slash command.
// ABOUTME: Wraps existing handleSlashCommand in Slack platform function format.

import { DefineFunction, Schema, SlackFunction } from "deno-slack-sdk/mod.ts";
import { handleSlashCommand } from "../src/handlers/slash-command.ts";
import { ValidationError } from "../src/errors/types.ts";

/**
 * ROSI function definition for handling /brainstorm slash command.
 *
 * Input: Raw slash command payload from Slack
 * Output: Parsed command data for workflow processing
 */
export const SlashCommandFunction = DefineFunction({
  callback_id: "slash_command_function",
  title: "Brainstorm Slash Command Handler",
  description: "Handles /brainstorm slash command, validates input, and parses parameters",
  source_file: "functions/slash-command.ts",
  input_parameters: {
    properties: {
      channel_id: {
        type: Schema.slack.types.channel_id,
        description: "Channel where the command was invoked",
      },
      user_id: {
        type: Schema.slack.types.user_id,
        description: "User who invoked the command",
      },
      text: {
        type: Schema.types.string,
        description: "Command text after /brainstorm",
      },
      channel_type: {
        type: Schema.types.string,
        description: "Type of channel (channel, group, im, mpim)",
      },
      response_url: {
        type: Schema.types.string,
        description: "URL for delayed responses",
      },
    },
    required: ["channel_id", "user_id", "text", "channel_type", "response_url"],
  },
  output_parameters: {
    properties: {
      success: {
        type: Schema.types.boolean,
        description: "Whether command was parsed successfully",
      },
      idea: {
        type: Schema.types.string,
        description: "The brainstorm idea extracted from command",
      },
      repository: {
        type: Schema.types.string,
        description: "Optional repository in owner/repo format",
      },
      channel_id: {
        type: Schema.slack.types.channel_id,
        description: "Channel ID for session creation",
      },
      user_id: {
        type: Schema.slack.types.user_id,
        description: "User ID for session attribution",
      },
      error_message: {
        type: Schema.types.string,
        description: "Error message if parsing failed",
      },
    },
    required: ["success"],
  },
});

export default SlackFunction(
  SlashCommandFunction,
  ({ inputs }) => {
    try {
      // Map ROSI inputs to handler input format
      const slackInput = {
        text: inputs.text,
        channel_id: inputs.channel_id,
        user_id: inputs.user_id,
        channel_type: inputs.channel_type,
        response_url: inputs.response_url,
      };

      // Call existing handler (synchronous)
      const result = handleSlashCommand(slackInput);

      return {
        outputs: {
          success: true,
          idea: result.idea,
          repository: result.repository,
          channel_id: result.channelId,
          user_id: result.userId,
        },
      };
    } catch (error) {
      if (error instanceof ValidationError) {
        return {
          outputs: {
            success: false,
            error_message: error.message,
          },
        };
      }

      // Re-throw unexpected errors
      throw error;
    }
  },
);
