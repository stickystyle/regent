// ABOUTME: SessionManager handles session persistence to Slack Datastore with TTL management.
// ABOUTME: Implements Property 9 - TTL Enforcement and Property 6 - Session Resumption via history rebuild.

import type { SlackClient, SlackThreadMessage } from "../clients/slack-client.ts";
import type { Message } from "../types/message.ts";
import { isOfficialAnswer } from "../types/message.ts";
import type { Session } from "../types/session.ts";
import { formatSessionId, Phase } from "../types/session.ts";
import type { DatastoreClient } from "./datastore-client.ts";
import type { MessageCache } from "./message-cache.ts";

/**
 * Number of days until a session expires.
 */
const SESSION_TTL_DAYS = 30;

/**
 * SessionManager handles persistence of session metadata to Slack Datastore.
 *
 * Responsibilities:
 * - Create new session records with TTL (30 days)
 * - Load sessions from datastore
 * - Update session state changes
 * - Enforce TTL expiration
 *
 * The manager uses dependency injection for the DatastoreClient to enable
 * testing with mock implementations.
 */
export class SessionManager {
  private datastore: DatastoreClient;
  private getCurrentTime: () => Date;
  private slackClient?: SlackClient;
  private messageCache?: MessageCache;

  /**
   * Create a new SessionManager.
   *
   * @param datastore - The datastore client to use for persistence
   * @param getCurrentTime - Optional function to get current time (for testing)
   * @param slackClient - Optional Slack client for fetching thread history
   * @param messageCache - Optional message cache for storing rebuilt messages
   */
  constructor(
    datastore: DatastoreClient,
    getCurrentTime?: () => Date,
    slackClient?: SlackClient,
    messageCache?: MessageCache,
  ) {
    this.datastore = datastore;
    this.getCurrentTime = getCurrentTime ?? (() => new Date());
    this.slackClient = slackClient;
    this.messageCache = messageCache;
  }

  /**
   * Create a new session record with TTL.
   *
   * @param channelId - Slack channel ID
   * @param threadTs - Slack thread timestamp
   * @param repo - GitHub repository in owner/repo format (empty string becomes undefined)
   * @param userId - Slack user ID of the initiator
   * @returns The created session
   * @throws Error if a session already exists for this channel and thread
   */
  async createSession(
    channelId: string,
    threadTs: string,
    repo: string,
    userId: string,
  ): Promise<Session> {
    const sessionId = formatSessionId(channelId, threadTs);

    // Check for duplicate session
    const existing = await this.datastore.get(sessionId);
    if (existing.ok && existing.item) {
      throw new Error("Session already exists for this thread");
    }

    const createdAt = this.getCurrentTime();
    const ttl = new Date(
      createdAt.getTime() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000,
    );

    const session: Session = {
      session_id: sessionId,
      repository: repo || undefined,
      phase: Phase.Questioning,
      initiator_user_id: userId,
      confidence_score: 0,
      created_at: createdAt.toISOString(),
      ttl: ttl.toISOString(),
    };

    const response = await this.datastore.put(session);
    if (!response.ok) {
      throw new Error(`Failed to create session: ${response.error}`);
    }

    return session;
  }

  /**
   * Load a session from the datastore.
   *
   * Checks TTL at the application level to ensure expired sessions are not returned,
   * even if the datastore hasn't automatically deleted them yet.
   *
   * @param channelId - Slack channel ID
   * @param threadTs - Slack thread timestamp
   * @returns The session if found and not expired, null otherwise
   */
  async loadSession(
    channelId: string,
    threadTs: string,
  ): Promise<Session | null> {
    const sessionId = formatSessionId(channelId, threadTs);

    const response = await this.datastore.get(sessionId);
    if (!response.ok || !response.item) {
      return null;
    }

    // Application-level TTL check for consistency across datastore implementations
    const session = response.item;
    const ttlDate = new Date(session.ttl);
    const currentTime = this.getCurrentTime();

    if (currentTime > ttlDate) {
      // Session has expired - clean up and return null
      await this.datastore.delete(sessionId);
      return null;
    }

    return session;
  }

  /**
   * Persist session state changes.
   *
   * @param session - The session to update
   * @throws Error if the session does not exist
   */
  async updateSession(session: Session): Promise<void> {
    // Verify session exists before updating
    const existing = await this.datastore.get(session.session_id);
    if (!existing.ok || !existing.item) {
      throw new Error("Session not found");
    }

    // Preserve original created_at and ttl
    const updatedSession: Session = {
      ...session,
      created_at: existing.item.created_at,
      ttl: existing.item.ttl,
    };

    const response = await this.datastore.put(updatedSession);
    if (!response.ok) {
      throw new Error(`Failed to update session: ${response.error}`);
    }
  }

  /**
   * Rebuild a session from Slack thread history.
   *
   * This method fetches all messages from a Slack thread and reconstructs
   * the session state. It is used to resume sessions after TTL expiration
   * or when the session record is missing.
   *
   * @param channelId - Slack channel ID
   * @param threadTs - Slack thread timestamp
   * @returns The rebuilt session
   * @throws Error if SlackClient is not configured
   * @throws Error if thread is empty
   * @throws Error if no @regent mention is found in thread
   */
  async rebuildFromHistory(
    channelId: string,
    threadTs: string,
  ): Promise<Session> {
    if (!this.slackClient) {
      throw new Error("SlackClient is required to rebuild from history");
    }

    // Fetch all messages with pagination
    const allMessages: SlackThreadMessage[] = [];
    let cursor: string | undefined;
    let hasMore = true;

    while (hasMore) {
      const response = await this.slackClient.fetchThreadMessages(
        channelId,
        threadTs,
        cursor,
      );
      allMessages.push(...response.messages);
      hasMore = response.has_more && !!response.response_metadata?.next_cursor;
      cursor = response.response_metadata?.next_cursor;
    }

    // Check for empty thread
    if (allMessages.length === 0) {
      throw new Error("Thread is empty");
    }

    // Find the initiator (first user who mentions @regent)
    const initiatorMessage = allMessages.find(
      (msg) => !msg.bot_id && isOfficialAnswer(msg.text),
    );

    if (!initiatorMessage) {
      throw new Error("No @regent mention found in thread");
    }

    const initiatorUserId = initiatorMessage.user;

    // Detect phase and canvas ID by looking for Canvas blocks
    let phase = Phase.Questioning;
    let canvasId: string | undefined;

    for (const msg of allMessages) {
      if (msg.bot_id && msg.blocks) {  // Only check bot messages
        for (const block of msg.blocks) {
          const typedBlock = block as { type?: string; file_id?: string };
          if (typedBlock.type === "file" && typedBlock.file_id) {
            phase = Phase.Review;
            canvasId = typedBlock.file_id;
            break;
          }
        }
      }
      if (canvasId) break;
    }

    // Convert and cache messages
    const sessionId = formatSessionId(channelId, threadTs);

    if (this.messageCache) {
      for (const slackMsg of allMessages) {
        const message: Message = {
          sender: slackMsg.bot_id ? "bot" : slackMsg.user,
          text: slackMsg.text,
          timestamp: slackMsg.ts,
          is_official_answer: !slackMsg.bot_id && isOfficialAnswer(slackMsg.text),
        };
        this.messageCache.append(sessionId, message);
      }
    }

    // Create and persist the session
    const createdAt = this.getCurrentTime();
    const ttl = new Date(
      createdAt.getTime() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000,
    );

    const session: Session = {
      session_id: sessionId,
      phase,
      initiator_user_id: initiatorUserId,
      confidence_score: 0,
      created_at: createdAt.toISOString(),
      ttl: ttl.toISOString(),
      canvas_id: canvasId,
    };

    const response = await this.datastore.put(session);
    if (!response.ok) {
      throw new Error(`Failed to create rebuilt session: ${response.error}`);
    }

    return session;
  }
}
