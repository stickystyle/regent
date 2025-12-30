// ABOUTME: Interface for Slack API client to enable dependency injection for testing.
// ABOUTME: Provides thread message fetching with pagination support for history rebuilding.

/**
 * Represents a single message from a Slack thread.
 *
 * This is the raw message data returned from the Slack API before
 * it is transformed into our internal Message type.
 */
export interface SlackThreadMessage {
  /**
   * Slack user ID of the message sender.
   *
   * Example: "U1234567890"
   */
  user: string;

  /**
   * The text content of the message.
   */
  text: string;

  /**
   * Slack message timestamp (unique identifier for the message).
   *
   * Example: "1234567890.123456"
   */
  ts: string;

  /**
   * Bot ID if the message was sent by a bot.
   *
   * Example: "B1234567890"
   */
  bot_id?: string;

  /**
   * Block Kit blocks for rich message formatting.
   *
   * Used to detect Canvas attachments and other rich content.
   */
  blocks?: unknown[];
}

/**
 * Response from fetching thread messages, including pagination metadata.
 */
export interface ThreadMessagesResponse {
  /**
   * List of messages in the thread.
   *
   * Messages are returned in reverse chronological order from Slack API.
   */
  messages: SlackThreadMessage[];

  /**
   * Whether there are more messages to fetch.
   */
  has_more: boolean;

  /**
   * Pagination metadata containing the cursor for the next page.
   */
  response_metadata?: {
    /**
     * Cursor to use when fetching the next page of messages.
     */
    next_cursor?: string;
  };
}

/**
 * SlackClient abstracts the Slack Web API for fetching thread history.
 *
 * This interface enables dependency injection, allowing tests to use mock
 * implementations while production code uses the real Slack Web API client.
 */
export interface SlackClient {
  /**
   * Fetch messages from a Slack thread with pagination support.
   *
   * Uses the conversations.replies API to retrieve thread messages.
   * When there are more than 100 messages, use the cursor parameter
   * to paginate through all results.
   *
   * @param channelId - The Slack channel ID
   * @param threadTs - The thread timestamp (parent message ts)
   * @param cursor - Optional pagination cursor for fetching next page
   * @returns Thread messages with pagination metadata
   */
  fetchThreadMessages(
    channelId: string,
    threadTs: string,
    cursor?: string,
  ): Promise<ThreadMessagesResponse>;
}

/**
 * Mock Slack client for testing.
 *
 * Simulates the Slack API with configurable responses and pagination.
 */
export class MockSlackClient implements SlackClient {
  private messagesByThread = new Map<string, SlackThreadMessage[]>();
  private pageSize = 100;

  /**
   * Configure messages that should be returned for a specific thread.
   *
   * @param channelId - The channel ID
   * @param threadTs - The thread timestamp
   * @param messages - The messages to return
   */
  setThreadMessages(
    channelId: string,
    threadTs: string,
    messages: SlackThreadMessage[],
  ): void {
    const key = this.formatKey(channelId, threadTs);
    this.messagesByThread.set(key, messages);
  }

  /**
   * Set the page size for pagination simulation.
   *
   * @param size - Number of messages per page
   */
  setPageSize(size: number): void {
    this.pageSize = size;
  }

  /**
   * Fetch thread messages with simulated pagination.
   */
  fetchThreadMessages(
    channelId: string,
    threadTs: string,
    cursor?: string,
  ): Promise<ThreadMessagesResponse> {
    const key = this.formatKey(channelId, threadTs);
    const allMessages = this.messagesByThread.get(key) ?? [];

    // Determine the start index based on cursor
    const startIndex = cursor ? parseInt(cursor, 10) : 0;
    const endIndex = startIndex + this.pageSize;

    // Slice messages for this page
    const pageMessages = allMessages.slice(startIndex, endIndex);
    const hasMore = endIndex < allMessages.length;

    return Promise.resolve({
      messages: pageMessages,
      has_more: hasMore,
      response_metadata: hasMore ? { next_cursor: String(endIndex) } : undefined,
    });
  }

  /**
   * Clear all configured thread messages (for test cleanup).
   */
  clear(): void {
    this.messagesByThread.clear();
    this.pageSize = 100;
  }

  private formatKey(channelId: string, threadTs: string): string {
    return `${channelId}:${threadTs}`;
  }
}
