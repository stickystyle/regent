// ABOUTME: ROSI workflow for handling message and app_mention events.
// ABOUTME: Routes thread messages and @regent mentions to MessageEventFunction, then stores context.

import { DefineWorkflow, Schema } from "deno-slack-sdk/mod.ts";
import { MessageEventFunction } from "../functions/message-event.ts";
import { StoreContextMessageFunction } from "../functions/store-context-message.ts";

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

// Step 1: Parse message and determine if bot should respond
const messageEventStep = MessageEventWorkflow.addStep(
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

// Step 2: Store context message in session datastore
// This step stores non-@regent messages for later inclusion in Claude's context.
// The StoreContextMessageFunction gracefully handles cases where:
// - is_direct_mention is true (skip storage - handled by orchestrator's MessageCache)
// - session_id is undefined (message not in a thread)
// - session doesn't exist (thread has no active brainstorm)
// - data is missing (bot messages, etc.)
MessageEventWorkflow.addStep(
  StoreContextMessageFunction,
  {
    session_id: messageEventStep.outputs.session_id,
    sender: messageEventStep.outputs.sender,
    text: messageEventStep.outputs.message_text,
    timestamp: messageEventStep.outputs.timestamp,
    is_direct_mention: messageEventStep.outputs.is_direct_mention,
  },
);

export default MessageEventWorkflow;
