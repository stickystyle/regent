// ABOUTME: ROSI function definition for exploration callback from GitHub Actions.
// ABOUTME: Wraps existing handleExplorationCallback in Slack platform function format.

import { DefineFunction, Schema, SlackFunction } from "deno-slack-sdk/mod.ts";
import {
  handleExplorationCallback,
  type ExplorationHandlerDependencies,
  type ExplorationHandlerRequest,
} from "../src/handlers/exploration-handler.ts";
import type { ExplorationCallback } from "../src/types/exploration-callback.ts";
import { SessionManager } from "../src/managers/session-manager.ts";
import type { DatastoreClient, DatastoreResponse } from "../src/managers/datastore-client.ts";
import { SlackMessagingClientImpl } from "../src/clients/messaging-client.ts";
import type { Session } from "../src/types/session.ts";
import { SessionsDatastore } from "../src/datastores/sessions.ts";

/**
 * Parse and validate the exploration_data JSON string.
 *
 * @param jsonString - JSON string containing ExplorationCallback payload
 * @returns Parsed ExplorationCallback object
 * @throws Error if JSON is invalid or missing required fields
 */
export function parseExplorationData(jsonString: string): ExplorationCallback {
  let parsed: unknown;

  try {
    parsed = JSON.parse(jsonString);
  } catch {
    throw new Error("Invalid exploration_data JSON: failed to parse");
  }

  // Validate required fields
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("Invalid exploration_data JSON: expected object");
  }

  const obj = parsed as Record<string, unknown>;

  if (typeof obj.session_id !== "string" || obj.session_id.length === 0) {
    throw new Error("Invalid exploration_data JSON: missing or invalid session_id");
  }

  if (obj.status !== "success" && obj.status !== "error") {
    throw new Error("Invalid exploration_data JSON: missing or invalid status");
  }

  // Type-assert since we validated the structure
  return parsed as ExplorationCallback;
}

/**
 * Slack API client type for datastore operations.
 */
interface SlackApiClient {
  apps: {
    datastore: {
      get: (params: { datastore: string; id: string }) => Promise<{ ok: boolean; item?: unknown; error?: string }>;
      put: (params: { datastore: string; item: unknown }) => Promise<{ ok: boolean; item?: unknown; error?: string }>;
      delete: (params: { datastore: string; id: string }) => Promise<{ ok: boolean; error?: string }>;
    };
  };
  chat: {
    postMessage: (params: unknown) => Promise<unknown>;
  };
  files: {
    upload: (params: unknown) => Promise<unknown>;
  };
}

/**
 * Create a DatastoreClient adapter that wraps the Slack SDK client.
 *
 * This adapter implements the DatastoreClient interface using the
 * Slack SDK's datastore APIs.
 *
 * @param client - Slack SDK client instance
 * @returns DatastoreClient implementation
 */
function createDatastoreClient(client: SlackApiClient): DatastoreClient {
  return {
    async get(sessionId: string): Promise<DatastoreResponse<Session>> {
      const result = await client.apps.datastore.get({
        datastore: SessionsDatastore.name,
        id: sessionId,
      });
      return {
        ok: result.ok,
        item: result.item as Session | undefined,
        error: result.error,
      };
    },

    async put(session: Session): Promise<DatastoreResponse<Session>> {
      const result = await client.apps.datastore.put({
        datastore: SessionsDatastore.name,
        item: session,
      });
      return {
        ok: result.ok,
        item: result.item as Session | undefined,
        error: result.error,
      };
    },

    async delete(sessionId: string): Promise<DatastoreResponse<void>> {
      const result = await client.apps.datastore.delete({
        datastore: SessionsDatastore.name,
        id: sessionId,
      });
      return {
        ok: result.ok,
        error: result.error,
      };
    },
  };
}

/**
 * ROSI function definition for handling exploration callbacks.
 *
 * Input: Webhook payload from GitHub Actions (channel_id, thread_ts, exploration_data)
 * Output: Success/error status from handler
 */
export const ExplorationCallbackFunction = DefineFunction({
  callback_id: "exploration_callback_function",
  title: "Exploration Callback Handler",
  description: "Processes exploration results from GitHub Actions webhook",
  source_file: "functions/exploration-callback.ts",
  input_parameters: {
    properties: {
      channel_id: {
        type: Schema.types.string,
        description: "Slack channel ID where the session originated",
      },
      thread_ts: {
        type: Schema.types.string,
        description: "Slack thread timestamp identifying the session",
      },
      exploration_data: {
        type: Schema.types.string,
        description: "JSON-stringified exploration callback payload",
      },
    },
    required: ["channel_id", "thread_ts", "exploration_data"],
  },
  output_parameters: {
    properties: {
      success: {
        type: Schema.types.boolean,
        description: "Whether the callback was processed successfully",
      },
      error_message: {
        type: Schema.types.string,
        description: "Error message if processing failed",
      },
    },
    required: ["success"],
  },
});

export default SlackFunction(
  ExplorationCallbackFunction,
  async ({ inputs, client, env }) => {
    try {
      // Parse the JSON string into ExplorationCallback
      let explorationCallback: ExplorationCallback;
      try {
        explorationCallback = parseExplorationData(inputs.exploration_data);
      } catch (error) {
        return {
          outputs: {
            success: false,
            error_message: error instanceof Error
              ? error.message
              : "Failed to parse exploration_data",
          },
        };
      }

      // Validate session_id matches channel_id:thread_ts from webhook inputs
      const expectedSessionId = `${inputs.channel_id}:${inputs.thread_ts}`;
      if (explorationCallback.session_id !== expectedSessionId) {
        return {
          outputs: {
            success: false,
            error_message: `Session ID mismatch: expected '${expectedSessionId}', got '${explorationCallback.session_id}'`,
          },
        };
      }

      // Build dependencies using real implementations
      // Cast client to our internal type for type safety
      const slackClient = client as unknown as SlackApiClient;
      const datastoreClient = createDatastoreClient(slackClient);
      const sessionManager = new SessionManager(datastoreClient);
      const messagingClient = new SlackMessagingClientImpl({
        chatPostMessage: (params) =>
          slackClient.chat.postMessage(params) as Promise<{
            ok: boolean;
            ts: string;
            channel: string;
          }>,
        filesUpload: (params) =>
          slackClient.files.upload(params) as Promise<{
            ok: boolean;
            file: { id: string };
          }>,
      });

      // Get callback secret from environment
      const callbackSecret = env.CALLBACK_SECRET ?? "";
      if (!callbackSecret) {
        console.warn("CALLBACK_SECRET environment variable is not set");
      }

      const dependencies: ExplorationHandlerDependencies = {
        sessionManager,
        messagingClient,
        callbackSecret,
      };

      // Build request for handler
      const request: ExplorationHandlerRequest = {
        authorizationHeader: `Bearer ${callbackSecret}`,
        body: explorationCallback,
      };

      // Call the existing handler
      const response = await handleExplorationCallback(request, dependencies);

      if (!response.ok) {
        return {
          outputs: {
            success: false,
            error_message: response.error ?? "Handler returned error",
          },
        };
      }

      return {
        outputs: {
          success: true,
        },
      };
    } catch (error) {
      // Handle unexpected errors
      const errorMessage = error instanceof Error
        ? error.message
        : "Unknown error occurred";
      console.error("ExplorationCallbackFunction error:", error);

      return {
        outputs: {
          success: false,
          error_message: errorMessage,
        },
      };
    }
  },
);
