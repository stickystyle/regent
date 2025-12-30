// ABOUTME: ROSI function definition for message and app_mention events.
// ABOUTME: Wraps existing handleMessageEvent in Slack platform function format.

import { DefineFunction, Schema, SlackFunction } from "deno-slack-sdk/mod.ts";
import { handleMessageEvent } from "../src/handlers/message-event.ts";
import { ValidationError } from "../src/errors/types.ts";

/**
 * ROSI function definition for handling message events.
 *
 * Input: Raw message event payload from Slack
 * Output: Parsed message data and routing decision
 */
export const MessageEventFunction = DefineFunction({
  callback_id: "message_event_function",
  title: "Message Event Handler",
  description: "Handles message and app_mention events in brainstorm threads",
  source_file: "functions/message-event.ts",
  input_parameters: {
    properties: {
      type: {
        type: Schema.types.string,
        description: "Event type (message or app_mention)",
      },
      channel: {
        type: Schema.slack.types.channel_id,
        description: "Channel where message was posted",
      },
      user: {
        type: Schema.slack.types.user_id,
        description: "User who sent the message",
      },
      text: {
        type: Schema.types.string,
        description: "Message text content",
      },
      ts: {
        type: Schema.types.string,
        description: "Message timestamp",
      },
      thread_ts: {
        type: Schema.types.string,
        description: "Thread timestamp (undefined if not in thread)",
      },
      bot_id: {
        type: Schema.types.string,
        description: "Bot ID if message was sent by a bot",
      },
    },
    required: ["type", "channel", "text", "ts"],
  },
  output_parameters: {
    properties: {
      should_respond: {
        type: Schema.types.boolean,
        description: "Whether the bot should respond to this message",
      },
      sender: {
        type: Schema.types.string,
        description: "User ID of message sender",
      },
      message_text: {
        type: Schema.types.string,
        description: "Extracted message text",
      },
      timestamp: {
        type: Schema.types.string,
        description: "Message timestamp for tracking",
      },
      channel_id: {
        type: Schema.slack.types.channel_id,
        description: "Channel ID for session lookup",
      },
      thread_ts: {
        type: Schema.types.string,
        description: "Thread timestamp for session lookup",
      },
      is_validation_error: {
        type: Schema.types.boolean,
        description: "Whether a validation error occurred",
      },
      error_message: {
        type: Schema.types.string,
        description: "Error message if validation failed",
      },
    },
    required: ["should_respond"],
  },
});

export default SlackFunction(
  MessageEventFunction,
  ({ inputs }) => {
    try {
      // Map ROSI inputs to handler input format
      const slackInput = {
        type: inputs.type,
        channel: inputs.channel,
        user: inputs.user,
        text: inputs.text,
        ts: inputs.ts,
        thread_ts: inputs.thread_ts,
        bot_id: inputs.bot_id,
      };

      // Call existing handler (synchronous)
      const result = handleMessageEvent(slackInput);

      return {
        outputs: {
          should_respond: result.shouldRespond,
          sender: result.message?.sender,
          message_text: result.message?.text,
          timestamp: result.message?.timestamp,
          channel_id: inputs.channel,
          thread_ts: inputs.thread_ts,
          is_validation_error: false,
        },
      };
    } catch (error) {
      if (error instanceof ValidationError) {
        // Validation errors are expected for messages not in threads
        // Return should_respond: false with error context
        return {
          outputs: {
            should_respond: false,
            channel_id: inputs.channel,
            thread_ts: inputs.thread_ts,
            is_validation_error: true,
            error_message: error.message,
          },
        };
      }

      // Re-throw unexpected errors
      throw error;
    }
  },
);
