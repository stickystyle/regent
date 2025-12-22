// ABOUTME: Slack Datastore definition for session persistence with DynamoDB backend.
// ABOUTME: Defines session schema with TTL attribute for session expiration tracking.

import { DefineDatastore, Schema } from "deno-slack-sdk/mod.ts";

/**
 * SessionsDatastore defines the schema for persisting brainstorming sessions.
 *
 * The datastore uses Slack's DynamoDB-backed storage with workspace scoping.
 * The TTL attribute tracks when sessions should expire (30 days from creation).
 *
 * Note: Application code checks TTL during loadSession to handle expired sessions.
 * The MockDatastoreClient simulates automatic TTL deletion for testing.
 *
 * Schema aligns with the Session interface in src/types/session.ts.
 */
export const SessionsDatastore = DefineDatastore({
  name: "sessions",
  primary_key: "session_id",
  attributes: {
    /**
     * Composite session identifier: {channel_id}:{thread_ts}
     */
    session_id: {
      type: Schema.types.string,
    },
    /**
     * Optional GitHub repository in owner/repo format
     */
    repository: {
      type: Schema.types.string,
    },
    /**
     * Current phase: "questioning", "review", or "finalized"
     */
    phase: {
      type: Schema.types.string,
    },
    /**
     * Slack user ID of the session initiator
     */
    initiator_user_id: {
      type: Schema.types.string,
    },
    /**
     * Slack Canvas ID (set during review phase)
     */
    canvas_id: {
      type: Schema.types.string,
    },
    /**
     * Claude's confidence score (0-100)
     */
    confidence_score: {
      type: Schema.types.number,
    },
    /**
     * ISO 8601 timestamp of session creation
     */
    created_at: {
      type: Schema.types.string,
    },
    /**
     * ISO 8601 timestamp of session expiration (created_at + 30 days).
     * Used by application code to check session validity.
     */
    ttl: {
      type: Schema.types.string,
    },
  },
});
