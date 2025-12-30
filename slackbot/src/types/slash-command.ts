// ABOUTME: Type definitions for Slack slash command handling.
// ABOUTME: Defines the SlashCommand interface with all fields needed for session creation.

/**
 * Represents a parsed and validated slash command from Slack.
 *
 * This interface combines:
 * - Parsed command content (idea, optional repository)
 * - Slack context (channel, user, response URL)
 * - Validation results (channel type)
 */
export interface SlashCommand {
  /** The idea or description text from the command (after --repo flag if present) */
  idea: string;

  /** Optional repository in owner/repo format */
  repository?: string;

  /** Slack channel ID where command was invoked */
  channelId: string;

  /** Slack user ID who invoked the command */
  userId: string;

  /** Slack channel type (channel, group, im, mpim) */
  channelType: string;

  /** Slack response URL for sending delayed responses */
  responseUrl: string;
}

/**
 * Raw slash command input from Slack ROSI platform.
 *
 * This represents the structure Slack sends to the slash command handler.
 */
export interface SlackSlashCommandInput {
  /** Command text after /brainstorm */
  text: string;

  /** Channel ID where command was invoked */
  channel_id: string;

  /** User ID who invoked the command */
  user_id: string;

  /** Channel type (channel, group, im, mpim) */
  channel_type: string;

  /** Response URL for delayed responses */
  response_url: string;
}
