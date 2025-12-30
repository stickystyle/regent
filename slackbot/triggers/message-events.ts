// ABOUTME: Event trigger for message and app_mention events.
// ABOUTME: Connects thread messages and @regent mentions to MessageEventWorkflow.

import { Trigger } from "deno-slack-api/types.ts";
import { TriggerEventTypes, TriggerTypes } from "deno-slack-api/mod.ts";
import { MessageEventWorkflow } from "../workflows/message-event-workflow.ts";

/**
 * Event trigger for message events in brainstorm threads.
 *
 * This trigger:
 * - Listens for message.channels and app_mention events
 * - Filters to messages in threads (where brainstorm sessions occur)
 * - Passes message parameters to MessageEventWorkflow for processing
 */
const messageEventsTrigger: Trigger<typeof MessageEventWorkflow.definition> = {
  type: TriggerTypes.Event,
  name: "Brainstorm Message Handler",
  description: "Handle messages and mentions in brainstorm threads",
  workflow: `#/workflows/${MessageEventWorkflow.definition.callback_id}`,
  event: {
    event_type: TriggerEventTypes.MessagePosted,
    all_resources: true, // All channels where app is installed
    filter: {
      version: 1,
      root: {
        // Only process messages in threads
        operator: "AND",
        inputs: [
          {
            statement: "{{data.thread_ts}} != null",
          },
        ],
      },
    },
  },
  inputs: {
    event_type: {
      value: "{{data.type}}",
    },
    channel_id: {
      value: "{{data.channel_id}}",
    },
    user_id: {
      value: "{{data.user_id}}",
    },
    message_text: {
      value: "{{data.text}}",
    },
    message_ts: {
      value: "{{data.message_ts}}",
    },
    thread_ts: {
      value: "{{data.thread_ts}}",
    },
    bot_id: {
      value: "{{data.bot_id}}",
    },
  },
};

export default messageEventsTrigger;
