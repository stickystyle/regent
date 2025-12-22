// ABOUTME: Slash command handler for /brainstorm command with parsing and validation.
// ABOUTME: Extracts --repo flag, validates channel type, and returns parsed SlashCommand.

import { ValidationError } from "../errors/types.ts";
import type { SlackSlashCommandInput, SlashCommand } from "../types/slash-command.ts";

/**
 * Parses command text to extract optional --repo flag and idea description.
 *
 * Format: `[--repo owner/repo] <idea description>`
 *
 * @param text - Raw command text after /brainstorm
 * @returns Object with repository and idea fields
 * @throws {ValidationError} If --repo flag has invalid format
 */
export function parseCommand(
  text: string,
): { repository?: string; idea: string } {
  const trimmed = text.trim();

  // Check if command starts with --repo flag
  if (!trimmed.startsWith("--repo")) {
    return {
      repository: undefined,
      idea: trimmed,
    };
  }

  // Extract --repo value and remaining text
  const afterRepo = trimmed.slice(6).trim(); // Remove "--repo" prefix

  // Find the end of the repo value (first space or end of string)
  const spaceIndex = afterRepo.indexOf(" ");

  let repoValue: string;
  let idea: string;

  if (spaceIndex === -1) {
    // No space found - entire string is repo value
    repoValue = afterRepo;
    idea = "";
  } else {
    // Space found - split into repo and idea
    repoValue = afterRepo.slice(0, spaceIndex);
    idea = afterRepo.slice(spaceIndex + 1).trim();
  }

  // Validate repository format
  validateRepositoryFormat(repoValue);

  return {
    repository: repoValue,
    idea: idea,
  };
}

/**
 * Validates repository format is owner/repo.
 *
 * @param repo - Repository string to validate
 * @throws {ValidationError} If format is invalid
 */
function validateRepositoryFormat(repo: string): void {
  if (!repo || repo.length === 0) {
    throw new ValidationError(
      "Invalid repository format",
      "Repository cannot be empty",
      "Please use the format owner/repo and try again",
    );
  }

  const parts = repo.split("/");

  if (parts.length !== 2) {
    throw new ValidationError(
      "Invalid repository format",
      `Format must be owner/repo, got: ${repo}`,
      "Please use the format owner/repo and try again",
    );
  }

  const [owner, name] = parts;

  if (!owner || owner.length === 0) {
    throw new ValidationError(
      "Invalid repository format",
      `Owner cannot be empty, got: ${repo}`,
      "Please use the format owner/repo and try again",
    );
  }

  if (!name || name.length === 0) {
    throw new ValidationError(
      "Invalid repository format",
      `Repository name cannot be empty, got: ${repo}`,
      "Please use the format owner/repo and try again",
    );
  }
}

/**
 * Validates that the channel type is allowed for /brainstorm command.
 *
 * Accepts: 'channel' (public), 'group' (private)
 * Rejects: 'im' (DM), 'mpim' (multi-party DM)
 *
 * @param channelType - Slack channel type
 * @throws {ValidationError} If channel type is not allowed
 */
export function validateChannel(channelType: string): void {
  const allowedTypes = ["channel", "group"];
  const dmTypes = ["im", "mpim"];

  if (dmTypes.includes(channelType)) {
    throw new ValidationError(
      "Cannot use /brainstorm in direct messages",
      `This command is only available in channels. Channel type: ${channelType}`,
      "Please use /brainstorm in a channel instead",
    );
  }

  if (!allowedTypes.includes(channelType)) {
    throw new ValidationError(
      "Unsupported channel type",
      `Channel type '${channelType}' is not supported`,
      "Please use /brainstorm in a public or private channel",
    );
  }
}

/**
 * Handles /brainstorm slash command from Slack.
 *
 * This is the main entry point for slash command processing:
 * 1. Validates channel type (reject DMs)
 * 2. Parses command text (extract --repo flag and idea)
 * 3. Returns SlashCommand object for session creation
 *
 * @param input - Raw slash command input from Slack ROSI
 * @returns Parsed and validated SlashCommand
 * @throws {ValidationError} If validation fails (DM, invalid repo format)
 */
export function handleSlashCommand(
  input: SlackSlashCommandInput,
): SlashCommand {
  // Validate channel type first
  validateChannel(input.channel_type);

  // Parse command text
  const { repository, idea } = parseCommand(input.text);

  // Return parsed command
  return {
    idea,
    repository,
    channelId: input.channel_id,
    userId: input.user_id,
    channelType: input.channel_type,
    responseUrl: input.response_url,
  };
}
