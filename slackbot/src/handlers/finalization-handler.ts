// ABOUTME: Handles the finalization flow when user approves a spec.
// ABOUTME: Creates GitHub Epic and stores brainstorm as collapsible comment.

import { Phase, type Session } from "../types/session.ts";
import { SessionManager } from "../managers/session-manager.ts";
import type { CanvasManager } from "../managers/canvas-manager.ts";
import type { EpicManager } from "../managers/epic-manager.ts";
import type { SlackMessagingClient } from "../clients/messaging-client.ts";
import { BaseError, ValidationError } from "../errors/types.ts";

/**
 * Result of the finalization process.
 */
export interface FinalizationResult {
  success: boolean;
  epicUrl?: string;
  error?: string;
}

/**
 * Dependencies required for finalization.
 */
export interface FinalizationDependencies {
  sessionManager: SessionManager;
  canvasManager: CanvasManager;
  epicManager: EpicManager;
  messagingClient: SlackMessagingClient;
}

/**
 * Parse owner and repo from repository string.
 *
 * @param repository - Repository string in format "owner/repo"
 * @returns Object with owner and repo properties
 * @throws ValidationError if repository format is invalid
 */
export function parseRepository(repository: string): { owner: string; repo: string } {
  const parts = repository.split("/");
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new ValidationError(
      "Invalid repository format",
      `Expected 'owner/repo', got '${repository}'`,
      "Use format: owner/repo (e.g., 'stickystyle/regent')",
    );
  }
  return { owner: parts[0], repo: parts[1] };
}

/**
 * Extract title from spec content (first # heading or default).
 *
 * @param content - Markdown content from the spec
 * @returns Title string
 */
export function extractSpecTitle(content: string): string {
  const match = content.match(/^#\s+(.+)$/m);
  if (match) {
    return match[1].trim();
  }
  return "Brainstorm Specification";
}

/**
 * Extract summary from spec content (first non-heading paragraph).
 *
 * @param content - Markdown content from the spec
 * @returns Summary string (max 200 chars with ellipsis if truncated)
 */
export function extractSpecSummary(content: string): string {
  // Find first paragraph after title (non-empty line that doesn't start with # or * or -)
  const lines = content.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (
      trimmed &&
      !trimmed.startsWith("#") &&
      !trimmed.startsWith("*") &&
      !trimmed.startsWith("-")
    ) {
      return trimmed.length > 200 ? trimmed.slice(0, 197) + "..." : trimmed;
    }
  }
  return "Spec created via Regent Slack Bot";
}

/**
 * Format error for Slack message.
 *
 * Uses error.toSlackMessage() if available (BaseError types),
 * otherwise falls back to error.message.
 *
 * @param error - Error to format
 * @returns Formatted error message
 */
function formatErrorForSlack(error: unknown): string {
  if (error instanceof BaseError) {
    return error.toSlackMessage();
  }
  if (error instanceof Error) {
    return `:warning: *Error:* ${error.message}`;
  }
  return `:warning: *Error:* An unexpected error occurred`;
}

/**
 * Handle the finalization flow when a user approves a spec.
 *
 * Flow:
 * 1. Load session from SessionManager
 * 2. Validate session state (Review phase, repository, canvas_id)
 * 3. Get Canvas content
 * 4. Create Epic on GitHub
 * 5. Add brainstorm as comment on Epic
 * 6. Update Canvas with Epic URL for persistent reference
 * 7. Update session to Finalized phase
 * 8. Post confirmation message to Slack
 *
 * @param channelId - Slack channel ID
 * @param threadTs - Thread timestamp
 * @param dependencies - Required service dependencies
 * @returns Result indicating success or failure
 */
export async function handleFinalization(
  channelId: string,
  threadTs: string,
  dependencies: FinalizationDependencies,
): Promise<FinalizationResult> {
  const { sessionManager, canvasManager, epicManager, messagingClient } = dependencies;

  try {
    // Step 1: Load session
    const session = await sessionManager.loadSession(channelId, threadTs);

    if (!session) {
      return {
        success: false,
        error: "No active session found for this thread",
      };
    }

    // Step 2: Validate session state
    if (session.phase !== Phase.Review) {
      return {
        success: false,
        error: "Session is not in Review phase",
      };
    }

    if (!session.repository) {
      return {
        success: false,
        error: "No GitHub repository configured for this session",
      };
    }

    if (!session.canvas_id) {
      return {
        success: false,
        error: "No spec Canvas found for this session",
      };
    }

    // Step 3: Get Canvas content
    const canvasContent = await canvasManager.getCanvasContent(session.canvas_id);

    // Step 4: Parse repository and create Epic
    const { owner, repo } = parseRepository(session.repository);
    const title = extractSpecTitle(canvasContent);
    const summary = extractSpecSummary(canvasContent);

    const epic = await epicManager.createEpic(owner, repo, title, summary);

    // Step 5: Add brainstorm as comment on Epic
    const brainstormCommentId = await epicManager.addSpecComment(
      owner,
      repo,
      epic.number,
      "brainstorm",
      canvasContent,
    );

    // Step 6: Update Canvas with Epic URL for persistent reference
    const updatedCanvasContent =
      `**GitHub Epic:** [#${epic.number}](${epic.url})\n\n---\n\n${canvasContent}`;
    await canvasManager.updateCanvasContent(session.canvas_id, updatedCanvasContent);

    // Step 7: Update session to Finalized phase with Epic metadata
    const updatedSession: Session = {
      ...session,
      phase: Phase.Finalized,
      epic_number: epic.number,
      epic_url: epic.url,
      spec_comment_ids: {
        brainstorm: brainstormCommentId,
      },
    };
    await sessionManager.updateSession(updatedSession);

    // Step 8: Post confirmation message to Slack
    const confirmationMessage = `Spec approved and stored on Epic!\n\nEpic: ${epic.url}`;
    await messagingClient.postMessage(
      channelId,
      threadTs,
      confirmationMessage,
    );

    return {
      success: true,
      epicUrl: epic.url,
    };
  } catch (error) {
    // Attempt to notify user, but don't let notification failure mask original error
    try {
      const errorMessage = formatErrorForSlack(error);
      await messagingClient.postMessage(channelId, threadTs, errorMessage);
    } catch {
      // Notification failure is logged but doesn't change the error response
    }

    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error occurred",
    };
  }
}
