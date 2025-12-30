// ABOUTME: ROSI workflow for handling message and app_mention events.
// ABOUTME: Routes thread messages and @regent mentions to MessageEventFunction.

import { DefineWorkflow, Schema } from "deno-slack-sdk/mod.ts";
import { MessageEventFunction } from "../functions/message-event.ts";

/**
 * Message Event Workflow - Entry point for thread messages and @mentions.
 *
 * This workflow handles:
 * - Messages in existing brainstorm threads
 * - @regent mentions for continuing conversations
 *
 * It routes message parameters to the MessageEventFunction for parsing
 * and routing decisions.
 */
export const MessageEventWorkflow = DefineWorkflow({
  callback_id: "message_event_workflow",
  title: "Brainstorm Message Handler",
  description: "Handle messages and mentions in brainstorm threads",
  input_parameters: {
    properties: {
      event_type: {
        type: Schema.types.string,
        description: "Event type (message or app_mention)",
      },
      channel_id: {
        type: Schema.slack.types.channel_id,
        description: "Channel where message was posted",
      },
      user_id: {
        type: Schema.slack.types.user_id,
        description: "User who sent the message",
      },
      message_text: {
        type: Schema.types.string,
        description: "Message text content",
      },
      message_ts: {
        type: Schema.types.string,
        description: "Message timestamp",
      },
      thread_ts: {
        type: Schema.types.string,
        description: "Thread timestamp for session lookup",
      },
      bot_id: {
        type: Schema.types.string,
        description: "Bot ID if message from bot",
      },
    },
    required: ["channel_id", "event_type", "message_text", "message_ts"],
  },
});

// Add step for message event handling
MessageEventWorkflow.addStep(
  MessageEventFunction,
  {
    type: MessageEventWorkflow.inputs.event_type,
    channel: MessageEventWorkflow.inputs.channel_id,
    user: MessageEventWorkflow.inputs.user_id,
    text: MessageEventWorkflow.inputs.message_text,
    ts: MessageEventWorkflow.inputs.message_ts,
    thread_ts: MessageEventWorkflow.inputs.thread_ts,
    bot_id: MessageEventWorkflow.inputs.bot_id,
  },
);

export default MessageEventWorkflow;
