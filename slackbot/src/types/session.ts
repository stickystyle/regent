// ABOUTME: Session data model for brainstorming conversations in Slack threads.
// ABOUTME: Defines session state, phase transitions, and TTL management.

/**
 * Phase enum representing the current state of a brainstorming session.
 *
 * Phases follow a linear progression:
 * questioning → review → finalized
 */
export enum Phase {
  /** Initial phase where Claude asks questions and collects answers */
  Questioning = "questioning",

  /** Review phase where the team reviews the collected spec in a Canvas */
  Review = "review",

  /** Final phase where the spec is complete and committed to repository */
  Finalized = "finalized",
}

/**
 * Session represents a single brainstorming conversation in a Slack thread.
 *
 * Sessions are uniquely identified by the composite key of channel ID and thread
 * timestamp, ensuring isolation across concurrent sessions in different threads.
 */
export interface Session {
  /**
   * Composite session identifier in format: {channel_id}:{thread_ts}
   *
   * Example: "C1234567890:1234567890.123456"
   */
  session_id: string;

  /**
   * Optional GitHub repository in owner/repo format.
   *
   * Example: "stickystyle/regent"
   */
  repository?: string;

  /**
   * Current phase of the brainstorming session.
   */
  phase: Phase;

  /**
   * Slack user ID of the person who initiated the session.
   *
   * Example: "U1234567890"
   */
  initiator_user_id: string;

  /**
   * Slack Canvas ID (set during review phase).
   *
   * Example: "F1234567890"
   */
  canvas_id?: string;

  /**
   * Claude's confidence score for the current spec (0-100%).
   *
   * Higher scores indicate Claude is more confident the spec is complete
   * and ready to move to the next phase.
   */
  confidence_score: number;

  /**
   * ISO 8601 timestamp when the session was created.
   *
   * Example: "2025-01-01T00:00:00.000Z"
   */
  created_at: string;

  /**
   * ISO 8601 timestamp when the session expires (created_at + 30 days).
   *
   * Sessions are automatically cleaned up after TTL expiration.
   *
   * Example: "2025-01-31T00:00:00.000Z"
   */
  ttl: string;

  /**
   * GitHub Epic issue number (set during finalization).
   *
   * Example: 42
   */
  epic_number?: number;

  /**
   * Full URL to GitHub Epic issue (set during finalization).
   *
   * Example: "https://github.com/owner/repo/issues/42"
   */
  epic_url?: string;

  /**
   * Comment IDs for each spec type stored on the Epic.
   *
   * Allows future updates to existing spec comments on the Epic.
   */
  spec_comment_ids?: {
    brainstorm?: number;
    requirements?: number;
    design?: number;
  };
}

/**
 * Formats a session ID from channel ID and thread timestamp.
 *
 * This ensures consistent session ID formatting across the application and
 * guarantees uniqueness for concurrent sessions in different threads.
 *
 * @param channelId - Slack channel ID (e.g., "C1234567890")
 * @param threadTs - Slack thread timestamp (e.g., "1234567890.123456")
 * @returns Formatted session ID (e.g., "C1234567890:1234567890.123456")
 *
 * @example
 * ```ts
 * const sessionId = formatSessionId("C1234567890", "1234567890.123456");
 * // Returns: "C1234567890:1234567890.123456"
 * ```
 */
export function formatSessionId(channelId: string, threadTs: string): string {
  return `${channelId}:${threadTs}`;
}
