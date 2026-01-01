// ABOUTME: Message event handler for app_mention and message events with mention parsing.
// ABOUTME: Routes events based on type, extracts commands, and creates Message objects.

import { ValidationError } from "../errors/types.ts";
import type { Message } from "../types/message.ts";

/**
 * Raw message event input from Slack ROSI platform.
 *
 * This represents the structure Slack sends for message and app_mention events.
 */
export interface SlackMessageEventInput {
  /** Event type: 'message' or 'app_mention' */
  type: string;

  /** Slack user ID who sent the message (undefined for bot messages) */
  user?: string;

  /** Bot ID if message was sent by a bot (undefined for user messages) */
  bot_id?: string;

  /** Message text content */
  text: string;

  /** Slack message timestamp */
  ts: string;

  /** Channel ID where message was posted */
  channel: string;

  /** Thread timestamp (undefined if message is in channel root) */
  thread_ts?: string;
}

/**
 * Parsed message event with extracted metadata.
 *
 * This represents the validated and parsed message event ready for processing.
 */
export interface ParsedMessageEvent {
  /** Event type */
  eventType: string;

  /** User ID (undefined for bot messages) */
  userId?: string;

  /** Whether message was sent by a bot */
  isBot: boolean;

  /** Message text */
  text: string;

  /** Message timestamp */
  timestamp: string;

  /** Channel ID */
  channelId: string;

  /** Thread timestamp (undefined if not in thread) */
  threadTs?: string;

  /** Whether message is in a thread */
  isInThread: boolean;
}

/**
 * Result of handling a message event.
 */
export interface MessageEventResult {
  /** Whether the bot should respond to this message */
  shouldRespond: boolean;

  /** Message object to store (undefined for bot messages) */
  message?: Message;
}

/**
 * Parses raw message event input from Slack.
 *
 * Extracts event type, sender information, thread detection, and message content.
 *
 * @param input - Raw message event from Slack ROSI
 * @returns Parsed message event with extracted metadata
 */
export function parseMessageEvent(
  input: SlackMessageEventInput,
): ParsedMessageEvent {
  const isBot = input.bot_id !== undefined;
  const isInThread = input.thread_ts !== undefined;

  return {
    eventType: input.type,
    userId: input.user,
    isBot,
    text: input.text,
    timestamp: input.ts,
    channelId: input.channel,
    threadTs: input.thread_ts,
    isInThread,
  };
}

/**
 * Detects whether a message contains @regent mention command.
 *
 * Handles both direct @regent mentions and bot mention tags followed by @regent.
 * The @regent prefix must appear at the start of the message or immediately after
 * the bot mention tag (e.g., "<@U0BOTID> @regent answer").
 *
 * @param text - Message text to check
 * @returns true if message contains @regent mention command, false otherwise
 *
 * @example
 * ```ts
 * isMentionCommand("@regent answer");                    // true
 * isMentionCommand("<@U0BOTID> @regent next");           // true
 * isMentionCommand("just a comment");                    // false
 * isMentionCommand("I'll use @regent here");             // false
 * ```
 */
export function isMentionCommand(text: string): boolean {
  // Check for direct @regent mention at start
  if (text.startsWith("@regent")) {
    return true;
  }

  // Check for bot mention tag followed by @regent
  // Pattern: <@USERID> @regent ...
  const botMentionPattern = /^<@\w+>\s*@regent/;
  return botMentionPattern.test(text);
}

/**
 * Handles message event from Slack.
 *
 * This is the main entry point for message event processing:
 * 1. Parses message event to extract metadata
 * 2. Validates message is in a thread (not channel root)
 * 3. Filters out bot messages
 * 4. Detects @regent mentions
 * 5. Creates Message object for storage
 * 6. Determines whether bot should respond
 *
 * Event routing logic:
 * - app_mention with @regent → shouldRespond = true, pass to LLM for intent understanding
 * - message with @regent in thread → shouldRespond = true, pass to LLM for intent understanding
 * - message without @regent in thread → shouldRespond = false, store for context
 * - bot message → shouldRespond = false, no storage
 * - message not in thread → ValidationError
 *
 * @param input - Raw message event input from Slack ROSI
 * @returns Message event result with routing decision and Message object
 * @throws {ValidationError} If message is not in a thread or missing sender
 */
export function handleMessageEvent(
  input: SlackMessageEventInput,
): MessageEventResult {
  // Parse event
  const parsed = parseMessageEvent(input);

  // Validate message is in a thread
  if (!parsed.isInThread) {
    throw new ValidationError(
      "Message must be in a thread",
      "Regent only responds to messages in brainstorming threads",
      "Please reply in the thread started by /brainstorm",
    );
  }

  // Filter out bot messages
  if (parsed.isBot) {
    return {
      shouldRespond: false,
    };
  }

  // Validate sender
  if (!parsed.userId) {
    throw new ValidationError(
      "Missing sender",
      "Message has no user ID or bot ID",
      "This should not happen - please report this error",
    );
  }

  // Check for @regent mention
  const isDirectMention = isMentionCommand(parsed.text);

  if (!isDirectMention) {
    // Not a mention - store for context but don't respond
    const message: Message = {
      sender: parsed.userId,
      text: parsed.text,
      timestamp: parsed.timestamp,
      isDirectMention: false,
    };

    return {
      shouldRespond: false,
      message,
    };
  }

  // Create message object for @regent mention
  const message: Message = {
    sender: parsed.userId,
    text: parsed.text,
    timestamp: parsed.timestamp,
    isDirectMention: true,
  };

  return {
    shouldRespond: true,
    message,
  };
}
