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
 * - Bot questions (sender = "bot", is_official_answer = false)
 * - User answers (sender = user ID, is_official_answer = true if prefixed with @regent)
 * - User discussion (sender = user ID, is_official_answer = false)
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
   * Whether this message is an official answer to a question.
   *
   * Official answers are user messages that start with "@regent" prefix.
   * These are the answers that get recorded in the spec document.
   */
  is_official_answer: boolean;

  /**
   * Optional list of processed file attachments.
   *
   * Attachments provide additional context for the brainstorming session.
   */
  attachments?: ProcessedAttachment[];
}

/**
 * Detects whether a message is an official answer based on @regent prefix.
 *
 * Official answers must start with "@regent" (case-sensitive, no leading whitespace).
 * The prefix can be followed by a space and answer text, or be the only content.
 *
 * @param text - The message text to check
 * @returns true if the message starts with "@regent", false otherwise
 *
 * @example
 * ```ts
 * isOfficialAnswer("@regent This is my answer");  // true
 * isOfficialAnswer("@regent");                     // true
 * isOfficialAnswer("Just a discussion message");   // false
 * isOfficialAnswer("  @regent");                   // false (leading whitespace)
 * isOfficialAnswer("I'll use @regent here");       // false (not at start)
 * ```
 */
export function isOfficialAnswer(text: string): boolean {
  return text.startsWith("@regent");
}
