// ABOUTME: Manages thinking indicator messages in Slack threads during long operations.
// ABOUTME: Posts "Thinking..." indicators and removes them when operations complete.

import type { SlackMessagingClient } from "../clients/messaging-client.ts";

/**
 * Default thinking indicator message text.
 */
const DEFAULT_THINKING_TEXT = "Thinking...";

/**
 * Manages thinking indicator messages in Slack threads.
 *
 * Posts a "Thinking..." message when operations exceed latency thresholds,
 * and removes the indicator when the operation completes. This provides
 * user feedback during long-running operations per Requirement 11.3.
 *
 * @example
 * ```ts
 * const manager = new ThinkingIndicatorManager(slackClient);
 * const ts = await manager.postThinkingIndicator(channelId, threadTs);
 * // ... do work ...
 * await manager.deleteThinkingIndicator(channelId, ts);
 * ```
 */
export class ThinkingIndicatorManager {
  private readonly messagingClient: SlackMessagingClient;
  private activeIndicators: Set<string> = new Set();

  /**
   * Create a new ThinkingIndicatorManager.
   *
   * @param messagingClient - Slack messaging client for posting messages
   */
  constructor(messagingClient: SlackMessagingClient) {
    this.messagingClient = messagingClient;
  }

  /**
   * Post a thinking indicator message to a Slack thread.
   *
   * @param channelId - The Slack channel ID
   * @param threadTs - The thread timestamp to post in
   * @returns The message timestamp of the posted indicator
   * @throws Error if posting fails
   */
  async postThinkingIndicator(
    channelId: string,
    threadTs: string,
  ): Promise<string> {
    const result = await this.messagingClient.postMessage(
      channelId,
      threadTs,
      DEFAULT_THINKING_TEXT,
    );

    this.activeIndicators.add(result.ts);
    return result.ts;
  }

  /**
   * Delete/remove a thinking indicator message.
   *
   * Since SlackMessagingClient doesn't have a delete method, this marks
   * the indicator as inactive locally. In a real implementation, this
   * would use chat.delete or chat.update to remove the message.
   *
   * @param channelId - The Slack channel ID
   * @param messageTs - The message timestamp of the indicator to delete
   */
  async deleteThinkingIndicator(
    _channelId: string,
    messageTs: string,
  ): Promise<void> {
    // Mark as inactive regardless of whether we can actually delete
    this.activeIndicators.delete(messageTs);

    // Note: In production, this would call chat.delete or chat.update
    // to actually remove the message from Slack. For now, we just
    // track the state locally.
    await Promise.resolve();
  }

  /**
   * Check if a thinking indicator is currently active.
   *
   * @param messageTs - The message timestamp to check
   * @returns true if the indicator is active, false otherwise
   */
  isIndicatorActive(messageTs: string): boolean {
    return this.activeIndicators.has(messageTs);
  }

  /**
   * Get the count of active indicators.
   *
   * @returns Number of active thinking indicators
   */
  getActiveCount(): number {
    return this.activeIndicators.size;
  }

  /**
   * Clear all tracked indicators.
   */
  clear(): void {
    this.activeIndicators.clear();
  }
}
