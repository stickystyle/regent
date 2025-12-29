// ABOUTME: SessionManager handles session persistence to Slack Datastore with TTL management.
// ABOUTME: Implements Property 9 - TTL Enforcement and Property 6 - Session Resumption via history rebuild.

import type { SlackClient, SlackThreadMessage } from "../clients/slack-client.ts";
import { parseRepository } from "../handlers/finalization-handler.ts";
import type { Message } from "../types/message.ts";
import { isOfficialAnswer } from "../types/message.ts";
import type { Session } from "../types/session.ts";
import { formatSessionId, Phase } from "../types/session.ts";
import type { DatastoreClient } from "./datastore-client.ts";
import type { EpicManager } from "./epic-manager.ts";
import type { MessageCache } from "./message-cache.ts";

/**
 * Result of checking if a session can pivot to continue.
 */
export interface PivotCheckResult {
  canContinue: boolean;
  reason?: string;
  nextPhase?: "requirements" | "design";
  currentSpec?: string;
}

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
   * @param phase - Optional initial phase (defaults to Questioning)
   * @returns The created session
   * @throws Error if a session already exists for this channel and thread
   */
  async createSession(
    channelId: string,
    threadTs: string,
    repo: string,
    userId: string,
    phase?: Phase,
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
      phase: phase ?? Phase.Questioning,
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
      if (msg.bot_id && msg.blocks) { // Only check bot messages
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

  /**
   * Check if a Finalized session can continue for additional spec phases.
   *
   * A session can pivot if:
   * - Session phase is Finalized
   * - Session has epic_number set
   * - Some spec phases haven't been completed yet
   *
   * @param session - The session to check
   * @param epicManager - Epic manager to query for existing spec comments
   * @returns Result indicating whether pivot is possible and next phase
   */
  async canPivotToContinue(
    session: Session,
    epicManager: EpicManager,
  ): Promise<PivotCheckResult> {
    // Check session is Finalized
    if (session.phase !== Phase.Finalized) {
      return { canContinue: false, reason: "Session is not finalized" };
    }

    // Check epic_number exists
    if (!session.epic_number || !session.repository) {
      return { canContinue: false, reason: "No Epic associated with session" };
    }

    // Parse repository with validation
    let owner: string;
    let repo: string;
    try {
      const parsed = parseRepository(session.repository);
      owner = parsed.owner;
      repo = parsed.repo;
    } catch {
      return {
        canContinue: false,
        reason: `Invalid repository format: ${session.repository}`,
      };
    }

    // Check which spec phases are missing on Epic
    const specComments = await epicManager.getSpecComments(
      owner,
      repo,
      session.epic_number,
    );

    // Determine next phase
    if (!specComments.has("requirements")) {
      const brainstorm = specComments.get("brainstorm");
      return {
        canContinue: true,
        nextPhase: "requirements",
        currentSpec: brainstorm?.content,
      };
    }

    if (!specComments.has("design")) {
      const requirements = specComments.get("requirements");
      return {
        canContinue: true,
        nextPhase: "design",
        currentSpec: requirements?.content,
      };
    }

    // All phases complete
    return {
      canContinue: false,
      reason: "All spec phases are complete",
    };
  }

  /**
   * Resume a Finalized session for continued spec work.
   *
   * Transitions the session back to Questioning phase and optionally
   * acknowledges if the spec was edited directly on GitHub since finalization.
   *
   * @param session - The session to resume
   * @returns The updated session
   */
  async resumeSession(session: Session): Promise<Session> {
    const updatedSession: Session = {
      ...session,
      phase: Phase.Questioning,
      // Keep epic fields intact for continued storage
    };
    await this.updateSession(updatedSession);
    return updatedSession;
  }
}
