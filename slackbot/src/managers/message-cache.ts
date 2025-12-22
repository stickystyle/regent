// ABOUTME: In-memory cache for thread messages during active brainstorming sessions.
// ABOUTME: Reduces Slack API calls by caching conversation history for active sessions.

import type { Message } from "../types/message.ts";

/**
 * MessageCache provides in-memory caching of thread messages during active sessions.
 *
 * The cache reduces the need for repeated Slack API calls to fetch conversation
 * history. Messages are stored per session and can be evicted when the session
 * expires or is finalized.
 */
export class MessageCache {
  private cache = new Map<string, Message[]>();

  /**
   * Retrieve cached messages for a session.
   *
   * @param sessionId - The session ID to get messages for
   * @returns Array of messages, empty if session not in cache
   */
  get(sessionId: string): Message[] {
    return this.cache.get(sessionId) ?? [];
  }

  /**
   * Add a message to the session cache.
   *
   * Messages are appended in order, preserving conversation sequence.
   *
   * @param sessionId - The session ID to add the message to
   * @param message - The message to append
   */
  append(sessionId: string, message: Message): void {
    const messages = this.cache.get(sessionId) ?? [];
    messages.push(message);
    this.cache.set(sessionId, messages);
  }

  /**
   * Clear cache for an expired or finalized session.
   *
   * @param sessionId - The session ID to evict
   */
  evict(sessionId: string): void {
    this.cache.delete(sessionId);
  }

  /**
   * Clear all cached sessions.
   *
   * Primarily used for testing cleanup.
   */
  clear(): void {
    this.cache.clear();
  }
}
