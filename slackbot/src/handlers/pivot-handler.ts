// ABOUTME: Pivot handler for detecting and resuming finalized sessions.
// ABOUTME: Enables continuation of spec work when returning to finalized threads.

import type { SessionManager } from "../managers/session-manager.ts";
import type { EpicManager } from "../managers/epic-manager.ts";
import { Phase } from "../types/session.ts";

/**
 * Minimal messaging interface required for pivot handler.
 */
export interface PivotMessagingClient {
  postMessage(channelId: string, threadTs: string, text: string): Promise<void>;
}

/**
 * Dependencies required for pivot detection and handling.
 */
export interface PivotDependencies {
  sessionManager: SessionManager;
  epicManager: EpicManager;
  messagingClient: PivotMessagingClient;
}

/**
 * Result of pivot check and handling.
 */
export interface PivotHandlerResult {
  /** Whether a pivot opportunity was detected */
  pivotDetected: boolean;
  /** Whether the session was successfully resumed */
  resumed: boolean;
  /** The next phase to work on (if pivot detected) */
  nextPhase?: "requirements" | "design";
  /** Reason if pivot was not detected */
  reason?: string;
}

/**
 * Check if a session can pivot to continue, and handle the pivot if so.
 *
 * This function checks if:
 * 1. A session exists for the given thread
 * 2. The session is Finalized with an Epic
 * 3. There are remaining spec phases to complete
 *
 * If all conditions are met, it:
 * 1. Resumes the session (transitions back to Questioning phase)
 * 2. Posts an acknowledgment message to Slack
 *
 * @param channelId - Slack channel ID
 * @param threadTs - Thread timestamp
 * @param dependencies - Required service dependencies
 * @returns Result indicating whether pivot was detected and handled
 */
export async function checkAndHandlePivot(
  channelId: string,
  threadTs: string,
  dependencies: PivotDependencies,
): Promise<PivotHandlerResult> {
  const { sessionManager, epicManager, messagingClient } = dependencies;

  // Load session
  const session = await sessionManager.loadSession(channelId, threadTs);

  if (!session) {
    return {
      pivotDetected: false,
      resumed: false,
      reason: "No session found",
    };
  }

  // Check if session can pivot
  if (session.phase !== Phase.Finalized) {
    return {
      pivotDetected: false,
      resumed: false,
      reason: "Session is not finalized",
    };
  }

  // Use SessionManager's canPivotToContinue method with error handling
  let pivotCheck;
  try {
    pivotCheck = await sessionManager.canPivotToContinue(session, epicManager);
  } catch (error) {
    return {
      pivotDetected: false,
      resumed: false,
      reason: `Error checking pivot status: ${
        error instanceof Error ? error.message : "Unknown error"
      }`,
    };
  }

  if (!pivotCheck.canContinue) {
    return {
      pivotDetected: false,
      resumed: false,
      reason: pivotCheck.reason,
    };
  }

  // Resume the session
  await sessionManager.resumeSession(session);

  // Post acknowledgment message
  const message =
    `Resuming session for ${pivotCheck.nextPhase} phase. Your brainstorm is stored on Epic #${session.epic_number}.`;
  await messagingClient.postMessage(channelId, threadTs, message);

  return {
    pivotDetected: true,
    resumed: true,
    nextPhase: pivotCheck.nextPhase,
  };
}
