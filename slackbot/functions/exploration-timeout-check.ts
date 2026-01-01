// ABOUTME: ROSI function for checking exploration timeout on stale sessions.
// ABOUTME: Queries sessions in Initializing state and posts timeout messages for sessions older than 5 minutes.

import { DefineFunction, Schema, SlackFunction } from "deno-slack-sdk/mod.ts";
import { SessionsDatastore } from "../src/datastores/sessions.ts";
import { Phase, parseSessionId } from "../src/types/session.ts";
import type { Session } from "../src/types/session.ts";

/**
 * Timeout threshold in minutes for sessions in Initializing state.
 * Sessions older than this are considered timed out.
 */
export const TIMEOUT_MINUTES = 5;

/**
 * Check if a session has timed out based on its created_at timestamp.
 *
 * @param session - The session to check
 * @param now - Current time for comparison
 * @returns true if session is older than TIMEOUT_MINUTES
 */
export function isSessionTimedOut(session: Session, now: Date): boolean {
  const createdAt = new Date(session.created_at);
  const ageMs = now.getTime() - createdAt.getTime();
  const ageMinutes = ageMs / (1000 * 60);

  return ageMinutes >= TIMEOUT_MINUTES;
}

/**
 * ROSI function definition for checking exploration timeouts.
 *
 * This function is invoked by a scheduled trigger every hour to:
 * - Query all sessions in Initializing state
 * - Check if any sessions are older than 5 minutes
 * - Post timeout messages to those threads
 * - Does NOT modify session state
 *
 * Input: None (scheduled trigger provides no inputs)
 * Output: Success status and counts of sessions checked/timeouts posted
 */
export const ExplorationTimeoutFunction = DefineFunction({
  callback_id: "exploration_timeout_function",
  title: "Exploration Timeout Check",
  description: "Check for sessions stuck in Initializing state and notify users",
  source_file: "functions/exploration-timeout-check.ts",
  input_parameters: {
    properties: {},
    required: [],
  },
  output_parameters: {
    properties: {
      success: {
        type: Schema.types.boolean,
        description: "Whether the check completed successfully",
      },
      sessions_checked: {
        type: Schema.types.number,
        description: "Number of Initializing sessions checked",
      },
      timeouts_posted: {
        type: Schema.types.number,
        description: "Number of timeout messages posted",
      },
    },
    required: ["success", "sessions_checked", "timeouts_posted"],
  },
});

export default SlackFunction(
  ExplorationTimeoutFunction,
  async ({ client }) => {
    const now = new Date();
    let sessionsChecked = 0;
    let timeoutsPosted = 0;

    try {
      // Query all sessions in Initializing state
      const queryResult = await client.apps.datastore.query<
        typeof SessionsDatastore.definition
      >({
        datastore: SessionsDatastore.name,
        expression: "#phase = :phase",
        expression_attributes: { "#phase": "phase" },
        expression_values: { ":phase": Phase.Initializing },
      });

      if (!queryResult.ok) {
        console.error("Failed to query sessions:", queryResult.error);
        return {
          outputs: {
            success: false,
            sessions_checked: 0,
            timeouts_posted: 0,
          },
        };
      }

      const sessions = queryResult.items as Session[];
      sessionsChecked = sessions.length;

      console.log(`Found ${sessionsChecked} sessions in Initializing state`);

      // Check each session for timeout
      for (const session of sessions) {
        if (isSessionTimedOut(session, now)) {
          // Parse session_id to get channel and thread
          const parts = parseSessionId(session.session_id);

          if (!parts) {
            console.error(`Invalid session_id format: ${session.session_id}`);
            continue;
          }

          const { channelId, threadTs } = parts;

          // Post timeout message to thread
          const messageResult = await client.chat.postMessage({
            channel: channelId,
            thread_ts: threadTs,
            text: "Exploration is taking longer than expected. You can retry using `/regent brainstorm {spec-name}`",
          });

          if (!messageResult.ok) {
            console.error(
              `Failed to post timeout message to ${session.session_id}:`,
              messageResult.error,
            );
            continue;
          }

          timeoutsPosted++;
          console.log(`Posted timeout message to ${session.session_id}`);

          // NOTE: We do NOT modify session state here.
          // The session remains in Initializing so the callback can still complete.
        }
      }

      console.log(
        `Timeout check complete: ${sessionsChecked} checked, ${timeoutsPosted} timeouts posted`,
      );

      return {
        outputs: {
          success: true,
          sessions_checked: sessionsChecked,
          timeouts_posted: timeoutsPosted,
        },
      };
    } catch (error) {
      console.error("ExplorationTimeoutFunction error:", error);

      return {
        outputs: {
          success: false,
          sessions_checked: sessionsChecked,
          timeouts_posted: timeoutsPosted,
        },
      };
    }
  },
);
