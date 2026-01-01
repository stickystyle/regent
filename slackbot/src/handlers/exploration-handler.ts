// ABOUTME: HTTP handler for exploration callback webhooks from GitHub Actions.
// ABOUTME: Validates authentication, parses payloads, and routes to SessionOrchestrator.

import { timingSafeEqual } from "node:crypto";
import type { SlackMessagingClient } from "../clients/messaging-client.ts";
import type { SessionManager } from "../managers/session-manager.ts";
import type { SessionOrchestrator } from "../orchestrators/session-orchestrator.ts";
import type { ExplorationCallback } from "../types/exploration-callback.ts";
import { isExplorationSuccess } from "../types/exploration-callback.ts";
import { parseSessionId, Phase } from "../types/session.ts";

// Re-export parseSessionId for backwards compatibility with existing imports
export { parseSessionId } from "../types/session.ts";

/**
 * Maximum payload size in bytes (100KB).
 */
const MAX_PAYLOAD_SIZE_BYTES = 102400;

/**
 * Request structure for the exploration callback handler.
 */
export interface ExplorationHandlerRequest {
  /** Authorization header value (e.g., "Bearer secret-token") */
  authorizationHeader: string | undefined;

  /** Parsed exploration callback body */
  body: ExplorationCallback;
}

/**
 * Response structure from the exploration callback handler.
 */
export interface ExplorationHandlerResponse {
  /** HTTP status code */
  status: number;

  /** Whether the operation was successful */
  ok: boolean;

  /** Error message if operation failed */
  error?: string;

  /** Informational message (for successful responses with notes) */
  message?: string;
}

/**
 * Dependencies required for the exploration callback handler.
 */
export interface ExplorationHandlerDependencies {
  /** Manager for session persistence */
  sessionManager: SessionManager;

  /** Client for posting messages to Slack */
  messagingClient: SlackMessagingClient;

  /** Secret for validating Authorization header */
  callbackSecret: string;

  /** Optional orchestrator for generating first brainstorm question */
  orchestrator?: SessionOrchestrator;
}

/**
 * Validate the Authorization header against the expected secret.
 *
 * The header must be in the format "Bearer {secret}" and the secret
 * must match the configured callback secret exactly.
 *
 * Uses constant-time comparison to prevent timing attacks.
 *
 * @param header - Authorization header value
 * @param expectedSecret - Expected secret to validate against
 * @returns True if valid, false otherwise
 */
export function validateAuthorizationHeader(
  header: string | undefined,
  expectedSecret: string,
): boolean {
  if (!header) {
    return false;
  }

  const prefix = "Bearer ";
  if (!header.startsWith(prefix)) {
    return false;
  }

  const token = header.slice(prefix.length);

  // Use constant-time comparison to prevent timing attacks
  const tokenBytes = new TextEncoder().encode(token);
  const secretBytes = new TextEncoder().encode(expectedSecret);

  // Length check must happen first, but lengths are not secret
  if (tokenBytes.length !== secretBytes.length) {
    return false;
  }

  return timingSafeEqual(tokenBytes, secretBytes);
}

/**
 * Format exploration summary message for Slack.
 *
 * @param callback - Success callback with exploration context
 * @returns Formatted message string
 */
function formatExplorationSummary(
  callback: ExplorationCallback & { status: "success" },
): string {
  const ctx = callback.exploration_context;
  const lines: string[] = ["Repository exploration complete:"];

  if (ctx.project_overview) {
    lines.push(`- Overview: ${ctx.project_overview}`);
  }

  if (ctx.architecture_summary) {
    lines.push(`- Architecture: ${ctx.architecture_summary}`);
  }

  if (ctx.relevant_patterns && ctx.relevant_patterns.length > 0) {
    lines.push(`- Patterns: ${ctx.relevant_patterns.join(", ")}`);
  }

  if (ctx.key_files && ctx.key_files.length > 0) {
    lines.push(`- Found ${ctx.key_files.length} key files`);
  }

  if (ctx.testing_approach) {
    lines.push(`- Testing: ${ctx.testing_approach}`);
  }

  return lines.join("\n");
}

/**
 * Format exploration error message for Slack.
 *
 * @param callback - Error callback with error details
 * @returns Formatted message string
 */
function formatExplorationError(
  callback: ExplorationCallback & { status: "error" },
): string {
  const lines: string[] = [
    `:warning: *Exploration failed*`,
    "",
    `*Error:* ${callback.error.message}`,
    `*Code:* ${callback.error.code}`,
    "",
    "I'll continue without repository context.",
  ];

  return lines.join("\n");
}

/**
 * Handle an exploration callback from the GitHub Actions workflow.
 *
 * Flow:
 * 1. Validate Authorization header matches CALLBACK_SECRET
 * 2. Parse session_id to extract channelId and threadTs
 * 3. Load session from SessionManager and validate phase
 * 4. Validate payload size (max 100KB)
 * 5. Store exploration_data and transition session to Questioning
 * 6. If success: post exploration summary to thread
 * 7. If error: post error message and offer to continue
 *
 * @param request - The incoming request with auth header and body
 * @param dependencies - Required service dependencies
 * @returns Response with HTTP status code
 */
export async function handleExplorationCallback(
  request: ExplorationHandlerRequest,
  dependencies: ExplorationHandlerDependencies,
): Promise<ExplorationHandlerResponse> {
  const { sessionManager, messagingClient, callbackSecret } = dependencies;

  // Step 1: Validate Authorization header
  if (!validateAuthorizationHeader(request.authorizationHeader, callbackSecret)) {
    return {
      status: 401,
      ok: false,
      error: "Unauthorized: Missing or invalid Authorization header",
    };
  }

  // Step 2: Parse session_id
  const sessionParts = parseSessionId(request.body.session_id);
  if (!sessionParts) {
    return {
      status: 400,
      ok: false,
      error: "Bad Request: Invalid session_id format",
    };
  }

  const { channelId, threadTs } = sessionParts;

  // Step 3: Load session
  const session = await sessionManager.loadSession(channelId, threadTs);
  if (!session) {
    return {
      status: 404,
      ok: false,
      error: "Not Found: Session not found",
    };
  }

  // Step 3b: Validate session is in Initializing phase
  if (session.phase !== Phase.Initializing) {
    return {
      status: 400,
      ok: false,
      error: "Bad Request: Session is not in Initializing state",
    };
  }

  // Step 4: Validate payload size (100KB limit)
  const explorationDataJson = JSON.stringify(
    isExplorationSuccess(request.body)
      ? request.body.exploration_context
      : { error: request.body.error },
  );
  if (explorationDataJson.length > MAX_PAYLOAD_SIZE_BYTES) {
    return {
      status: 400,
      ok: false,
      error: "Bad Request: Payload exceeds 100KB limit",
    };
  }

  // Step 5: Store exploration_data and transition to Questioning phase
  session.exploration_data = explorationDataJson;
  session.phase = Phase.Questioning;
  await sessionManager.updateSession(session);

  // Step 6/7: Handle success or error callback
  if (isExplorationSuccess(request.body)) {
    const summaryMessage = formatExplorationSummary(request.body);
    await messagingClient.postMessage(channelId, threadTs, summaryMessage);
  } else {
    const errorMessage = formatExplorationError(request.body);
    await messagingClient.postMessage(channelId, threadTs, errorMessage);
  }

  // Step 8: Generate first brainstorm question if orchestrator is available
  if (dependencies.orchestrator) {
    await dependencies.orchestrator.generateFirstQuestion(channelId, threadTs);
  }

  return {
    status: 200,
    ok: true,
  };
}
