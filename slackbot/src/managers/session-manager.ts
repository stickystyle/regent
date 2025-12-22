// ABOUTME: SessionManager handles session persistence to Slack Datastore with TTL management.
// ABOUTME: Implements Property 9 - TTL Enforcement (30 days from creation timestamp).

import type { Session } from "../types/session.ts";
import { formatSessionId, Phase } from "../types/session.ts";
import type { DatastoreClient } from "./datastore-client.ts";

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

  /**
   * Create a new SessionManager.
   *
   * @param datastore - The datastore client to use for persistence
   * @param getCurrentTime - Optional function to get current time (for testing)
   */
  constructor(datastore: DatastoreClient, getCurrentTime?: () => Date) {
    this.datastore = datastore;
    this.getCurrentTime = getCurrentTime ?? (() => new Date());
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
}
