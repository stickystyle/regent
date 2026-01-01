// ABOUTME: ROSI function to store context messages (non-@regent mentions) in session datastore.
// ABOUTME: Only stores messages for existing sessions to prevent orphan storage.

import { DefineFunction, Schema, SlackFunction } from "deno-slack-sdk/mod.ts";
import {
  type DatastoreClient,
  type SlackAppsDatastore,
  SlackDatastoreClient,
} from "../src/managers/datastore-client.ts";
import type { ContextMessage, Session } from "../src/types/session.ts";

/**
 * Input parameters for the storeContextMessage function.
 */
export interface StoreContextMessageInput {
  session_id: string | undefined;
  sender: string | undefined;
  text: string | undefined;
  timestamp: string | undefined;
  is_direct_mention: boolean | undefined;
}

/**
 * Output from the storeContextMessage function.
 */
export interface StoreContextMessageOutput {
  success: boolean;
  stored: boolean;
  reason?: "no_session_id" | "no_session" | "missing_data" | "storage_error" | "direct_mention";
}

/**
 * Store a context message directly in the session's datastore record.
 *
 * This function persists context messages to the session's context_messages
 * field in the datastore. This ensures messages survive across ROSI function
 * invocations.
 *
 * @param input - The message data to store
 * @param datastore - DatastoreClient to read/write session data
 * @returns Result indicating whether message was stored
 */
export async function storeContextMessageInDatastore(
  input: StoreContextMessageInput,
  datastore: DatastoreClient,
): Promise<StoreContextMessageOutput> {
  // Skip storage for direct @regent mentions - these are handled by the
  // orchestrator's MessageCache to avoid double-storage
  if (input.is_direct_mention === true) {
    return {
      success: true,
      stored: false,
      reason: "direct_mention",
    };
  }

  // Check for session_id
  if (!input.session_id) {
    return {
      success: true,
      stored: false,
      reason: "no_session_id",
    };
  }

  // Check for required message data
  if (!input.sender || !input.text || !input.timestamp) {
    return {
      success: true,
      stored: false,
      reason: "missing_data",
    };
  }

  // Fetch the session from datastore
  const getResponse = await datastore.get(input.session_id);
  if (!getResponse.ok || !getResponse.item) {
    return {
      success: true,
      stored: false,
      reason: "no_session",
    };
  }

  const session = getResponse.item;

  // Parse existing context messages or initialize empty array
  let contextMessages: ContextMessage[] = [];
  if (session.context_messages) {
    try {
      contextMessages = JSON.parse(session.context_messages);
    } catch {
      // If parsing fails, start with empty array
      contextMessages = [];
    }
  }

  // Append the new context message
  const newMessage: ContextMessage = {
    sender: input.sender,
    text: input.text,
    timestamp: input.timestamp,
  };
  contextMessages.push(newMessage);

  // Update the session with the new context messages
  const updatedSession: Session = {
    ...session,
    context_messages: JSON.stringify(contextMessages),
  };

  // Save the updated session
  const putResponse = await datastore.put(updatedSession);
  if (!putResponse.ok) {
    return {
      success: false,
      stored: false,
      reason: "storage_error",
    };
  }

  return {
    success: true,
    stored: true,
  };
}

/**
 * ROSI function definition for storing context messages.
 *
 * This function is called from the message-event workflow when should_respond
 * is false (non-@regent message in an active thread).
 *
 * Input: Message data from message-event function
 * Output: Storage result (success, stored, reason)
 */
export const StoreContextMessageFunction = DefineFunction({
  callback_id: "store_context_message_function",
  title: "Store Context Message",
  description: "Stores non-@regent thread messages in session datastore for context",
  source_file: "functions/store-context-message.ts",
  input_parameters: {
    properties: {
      session_id: {
        type: Schema.types.string,
        description: "Session ID (channel_id:thread_ts) for cache lookup",
      },
      sender: {
        type: Schema.types.string,
        description: "User ID of message sender",
      },
      text: {
        type: Schema.types.string,
        description: "Message text content",
      },
      timestamp: {
        type: Schema.types.string,
        description: "Message timestamp",
      },
      is_direct_mention: {
        type: Schema.types.boolean,
        description: "Whether this message was a direct @regent mention (skip storage if true)",
      },
    },
    required: [],
  },
  output_parameters: {
    properties: {
      success: {
        type: Schema.types.boolean,
        description: "Whether the operation completed without errors",
      },
      stored: {
        type: Schema.types.boolean,
        description: "Whether the message was stored in the session",
      },
      reason: {
        type: Schema.types.string,
        description: "Reason if message was not stored (no_session_id, no_session, missing_data, storage_error)",
      },
    },
    required: ["success", "stored"],
  },
});

/**
 * ROSI SlackFunction implementation.
 *
 * This function stores context messages directly in the session's datastore
 * record. Context messages are non-@regent team discussions that provide
 * valuable context for Claude when responding to direct mentions.
 *
 * The function:
 * 1. Creates a DatastoreClient adapter from the Slack client
 * 2. Fetches the session record by session_id
 * 3. Appends the context message to session.context_messages
 * 4. Saves the updated session back to the datastore
 */
export default SlackFunction(
  StoreContextMessageFunction,
  async ({ inputs, client }) => {
    // Create a DatastoreClient adapter from the Slack client
    const datastoreClient = new SlackDatastoreClient(
      client.apps.datastore as SlackAppsDatastore,
    );

    // Store the context message in the session's datastore record
    const result = await storeContextMessageInDatastore(
      {
        session_id: inputs.session_id,
        sender: inputs.sender,
        text: inputs.text,
        timestamp: inputs.timestamp,
        is_direct_mention: inputs.is_direct_mention,
      },
      datastoreClient,
    );

    return {
      outputs: {
        success: result.success,
        stored: result.stored,
        reason: result.reason,
      },
    };
  },
);
