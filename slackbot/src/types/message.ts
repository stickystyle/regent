// ABOUTME: Message data model for individual messages in brainstorming sessions.
// ABOUTME: Handles official answer detection, sender tracking, and file attachments.

/**
 * ProcessedAttachment represents a file attachment that has been downloaded
 * and processed for use in the brainstorming context.
 *
 * Attachments are used to provide additional context (e.g., existing specs,
 * diagrams, documentation) that Claude can reference when asking questions.
 */
export interface ProcessedAttachment {
  /**
   * Slack file ID.
   *
   * Example: "F1234567890"
   */
  file_id: string;

  /**
   * Original filename.
   *
   * Example: "specification.md"
   */
  filename: string;

  /**
   * MIME type of the file.
   *
   * Example: "text/markdown", "application/pdf", "text/plain"
   */
  mimetype: string;

  /**
   * Processed file content as a string.
   *
   * For text files, this is the raw text content.
   * For binary files (PDFs, images), this may be extracted text or a description.
   */
  content: string;
}

/**
 * Message represents a single message in a brainstorming session thread.
 *
 * Messages can be either:
 * - Bot questions (sender = "bot")
 * - User messages (sender = user ID)
 *
 * All @regent mentions are passed to the LLM for intent understanding.
 */
export interface Message {
  /**
   * Sender identifier.
   *
   * - "bot" for bot-generated messages
   * - Slack user ID (e.g., "U1234567890") for user messages
   */
  sender: string;

  /**
   * Message text content.
   */
  text: string;

  /**
   * Slack message timestamp.
   *
   * Example: "1234567890.123456"
   */
  timestamp: string;

  /**
   * Optional list of processed file attachments.
   *
   * Attachments provide additional context for the brainstorming session.
   */
  attachments?: ProcessedAttachment[];
}

/**
 * Detects whether a message contains @regent mention (any command type).
 *
 * This function checks if a message starts with "@regent" prefix or contains
 * a bot mention tag followed by "@regent". This is useful for detecting any
 * @regent interaction, regardless of whether it's an answer or control command.
 *
 * For checking if a message is specifically an answer command (not a control
 * command like 'next' or 'ready'), use `isAnswerCommand()` instead.
 *
 * @param text - The message text to check
 * @returns true if the message contains @regent mention, false otherwise
 *
 * @example
 * ```ts
 * isOfficialAnswer("@regent This is my answer");  // true
 * isOfficialAnswer("@regent next");                // true (but not an answer!)
 * isOfficialAnswer("@regent ready");               // true (but not an answer!)
 * isOfficialAnswer("Just a discussion message");   // false
 * isOfficialAnswer("  @regent");                   // false (leading whitespace)
 * isOfficialAnswer("I'll use @regent here");       // false (not at start)
 * ```
 *
 * @deprecated Use `isMentionCommand()` from handlers/message-event.ts for new code
 */
export function isOfficialAnswer(text: string): boolean {
  return text.startsWith("@regent") || /^<@\w+>\s*@regent/.test(text);
}

/**
 * Detects whether a message is an answer command (not a control command).
 *
 * This function checks if a message contains @regent and is specifically an
 * answer command, excluding control commands like 'next', 'ready', 'approved'.
 *
 * @param text - The message text to check
 * @returns true if the message is an answer command, false otherwise
 *
 * @example
 * ```ts
 * isAnswerCommand("@regent This is my answer");   // true
 * isAnswerCommand("@regent next");                 // false (control command)
 * isAnswerCommand("@regent ready");                // false (control command)
 * isAnswerCommand("Just a discussion message");    // false
 * ```
 */
export function isAnswerCommand(text: string): boolean {
  if (!isOfficialAnswer(text)) {
    return false;
  }

  // Remove bot mention tag if present
  let cleanText = text;
  const botMentionPattern = /^<@\w+>\s+/;
  if (botMentionPattern.test(text)) {
    cleanText = text.replace(botMentionPattern, "");
  }

  // Remove @regent prefix
  const afterRegent = cleanText.slice(7).trim(); // "@regent" is 7 chars
  const lowerAfterRegent = afterRegent.toLowerCase();

  // Check if it's a control command
  const controlCommands = ["next", "ready", "approved"];
  return !controlCommands.includes(lowerAfterRegent);
}
