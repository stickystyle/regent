// ABOUTME: Slack messaging client for postMessage and uploadFile operations with retry logic.
// ABOUTME: Implements Property 11 retry behavior for transient errors with exponential backoff.

import { RetryHandler } from "../errors/retry.ts";
import type { RetryConfig } from "../errors/retry.ts";

/**
 * Result from posting a message to Slack.
 */
export interface PostMessageResult {
  /** Whether the API call succeeded */
  ok: boolean;

  /** Message timestamp (unique identifier) */
  ts: string;

  /** Channel where the message was posted */
  channel: string;

  /** Thread timestamp if posted to a thread */
  thread_ts?: string;
}

/**
 * Result from uploading a file to Slack.
 */
export interface UploadFileResult {
  /** Whether the API call succeeded */
  ok: boolean;

  /** File metadata */
  file: {
    /** Unique file identifier */
    id: string;
  };
}

/**
 * SlackMessagingClient abstracts Slack's chat.postMessage and files.upload APIs.
 *
 * This interface enables dependency injection, allowing tests to use mock
 * implementations while production code uses the real Slack Web API client.
 */
export interface SlackMessagingClient {
  /**
   * Post a message to a Slack channel or thread.
   *
   * @param channelId - The Slack channel ID
   * @param threadTs - Optional thread timestamp to post as a reply
   * @param text - Message text content (supports mrkdwn)
   * @param blocks - Optional Block Kit blocks for rich formatting
   * @returns Message posting result with timestamp
   */
  postMessage(
    channelId: string,
    threadTs: string | undefined,
    text: string,
    blocks?: unknown[],
  ): Promise<PostMessageResult>;

  /**
   * Upload a file to a Slack channel or thread.
   *
   * @param channelId - The Slack channel ID
   * @param threadTs - Optional thread timestamp to attach file to thread
   * @param filename - Name for the uploaded file
   * @param content - File content as string
   * @param contentType - Optional MIME type (default: text/markdown)
   * @returns File upload result with file ID
   */
  uploadFile(
    channelId: string,
    threadTs: string | undefined,
    filename: string,
    content: string,
    contentType?: string,
  ): Promise<UploadFileResult>;
}

/**
 * Real implementation of SlackMessagingClient that integrates with Slack Web API.
 *
 * Wraps Slack API calls with retry logic for transient errors (Property 11).
 * Retries up to 3 times with exponential backoff for rate limits and timeouts.
 */
export class SlackMessagingClientImpl implements SlackMessagingClient {
  private readonly retryHandler: RetryHandler;

  /**
   * Create a new Slack messaging client.
   *
   * @param slackApi - Slack Web API client instance
   * @param retryConfig - Optional retry configuration (defaults to 3 attempts)
   */
  constructor(
    private readonly slackApi: {
      chatPostMessage: (params: {
        channel: string;
        text: string;
        thread_ts?: string;
        blocks?: unknown[];
      }) => Promise<{ ok: boolean; ts: string; channel: string }>;
      filesUpload: (params: {
        channels: string;
        content: string;
        filename: string;
        thread_ts?: string;
        filetype?: string;
      }) => Promise<{ ok: boolean; file: { id: string } }>;
    },
    retryConfig?: Partial<RetryConfig>,
  ) {
    this.retryHandler = new RetryHandler(retryConfig);
  }

  async postMessage(
    channelId: string,
    threadTs: string | undefined,
    text: string,
    blocks?: unknown[],
  ): Promise<PostMessageResult> {
    return await this.retryHandler.execute(async () => {
      const params: {
        channel: string;
        text: string;
        thread_ts?: string;
        blocks?: unknown[];
      } = {
        channel: channelId,
        text,
      };

      if (threadTs !== undefined) {
        params.thread_ts = threadTs;
      }

      if (blocks !== undefined) {
        params.blocks = blocks;
      }

      const result = await this.slackApi.chatPostMessage(params);

      return {
        ok: result.ok,
        ts: result.ts,
        channel: result.channel,
        thread_ts: threadTs,
      };
    });
  }

  async uploadFile(
    channelId: string,
    threadTs: string | undefined,
    filename: string,
    content: string,
    contentType?: string,
  ): Promise<UploadFileResult> {
    return await this.retryHandler.execute(async () => {
      const params: {
        channels: string;
        content: string;
        filename: string;
        thread_ts?: string;
        filetype?: string;
      } = {
        channels: channelId,
        content,
        filename,
      };

      if (threadTs !== undefined) {
        params.thread_ts = threadTs;
      }

      if (contentType !== undefined) {
        params.filetype = contentType;
      }

      const result = await this.slackApi.filesUpload(params);

      return {
        ok: result.ok,
        file: {
          id: result.file.id,
        },
      };
    });
  }
}

/**
 * Mock Slack messaging client for testing.
 *
 * Provides configurable responses and error injection for testing retry logic.
 */
export class MockSlackMessagingClient implements SlackMessagingClient {
  private postMessageError: Error | null = null;
  private uploadFileError: Error | null = null;
  private messageCounter = 0;
  private fileCounter = 0;
  private postedMessages: Array<{
    channelId: string;
    threadTs: string | undefined;
    text: string;
    blocks?: unknown[];
  }> = [];
  private uploadedFiles: Array<{
    channelId: string;
    threadTs: string | undefined;
    filename: string;
    content: string;
    contentType?: string;
  }> = [];

  /**
   * Configure an error to be thrown by postMessage.
   *
   * @param error - Error to throw on next postMessage call
   */
  setPostMessageError(error: Error): void {
    this.postMessageError = error;
  }

  /**
   * Configure an error to be thrown by uploadFile.
   *
   * @param error - Error to throw on next uploadFile call
   */
  setUploadFileError(error: Error): void {
    this.uploadFileError = error;
  }

  /**
   * Get all messages posted through this mock client.
   */
  getPostedMessages(): Array<{
    channelId: string;
    threadTs: string | undefined;
    text: string;
    blocks?: unknown[];
  }> {
    return [...this.postedMessages];
  }

  /**
   * Get all files uploaded through this mock client.
   */
  getUploadedFiles(): Array<{
    channelId: string;
    threadTs: string | undefined;
    filename: string;
    content: string;
    contentType?: string;
  }> {
    return [...this.uploadedFiles];
  }

  /**
   * Clear all configured errors and recorded operations.
   */
  clear(): void {
    this.postMessageError = null;
    this.uploadFileError = null;
    this.messageCounter = 0;
    this.fileCounter = 0;
    this.postedMessages = [];
    this.uploadedFiles = [];
  }

  postMessage(
    channelId: string,
    threadTs: string | undefined,
    text: string,
    blocks?: unknown[],
  ): Promise<PostMessageResult> {
    // Throw configured error if set
    if (this.postMessageError !== null) {
      return Promise.reject(this.postMessageError);
    }

    // Record the message (only after error check)
    this.postedMessages.push({ channelId, threadTs, text, blocks });

    // Generate mock response
    this.messageCounter++;
    const ts = `${Date.now()}.${this.messageCounter.toString().padStart(6, "0")}`;

    return Promise.resolve({
      ok: true,
      ts,
      channel: channelId,
      thread_ts: threadTs,
    });
  }

  uploadFile(
    channelId: string,
    threadTs: string | undefined,
    filename: string,
    content: string,
    contentType?: string,
  ): Promise<UploadFileResult> {
    // Throw configured error if set
    if (this.uploadFileError !== null) {
      return Promise.reject(this.uploadFileError);
    }

    // Record the upload (only after error check)
    this.uploadedFiles.push({
      channelId,
      threadTs,
      filename,
      content,
      contentType,
    });

    // Generate mock response
    this.fileCounter++;
    const fileId = `F${this.fileCounter.toString().padStart(10, "0")}`;

    return Promise.resolve({
      ok: true,
      file: {
        id: fileId,
      },
    });
  }
}
