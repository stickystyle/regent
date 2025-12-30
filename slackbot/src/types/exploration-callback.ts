// ABOUTME: Type definitions for exploration callback payloads from GitHub Actions workflow.
// ABOUTME: Defines success and error callback structures for async codebase exploration.

/**
 * Idea-related code context discovered during exploration.
 *
 * Contains information about existing code that relates to the user's idea.
 */
export interface IdeaRelatedCode {
  /** Summary of how the idea relates to existing code */
  summary: string;

  /** Existing features similar to the proposed idea */
  existing_similar_features: string[];

  /** Files relevant to implementing the idea */
  relevant_files: string[];

  /** Suggested places to integrate the new feature */
  suggested_integration_points: string[];
}

/**
 * Exploration context returned on successful codebase exploration.
 *
 * Contains structured information about the repository that helps
 * Claude ask contextually relevant questions.
 */
export interface ExplorationContext {
  /** File tree structure of the repository */
  file_tree?: string;

  /** Overview of the project's purpose and structure */
  project_overview?: string;

  /** Summary of the architectural patterns used */
  architecture_summary?: string;

  /** Detected design patterns in the codebase */
  relevant_patterns?: string[];

  /** Key integration points for new features */
  integration_points?: string[];

  /** Description of the testing approach used */
  testing_approach?: string;

  /** Key files that are relevant to the exploration */
  key_files?: string[];

  /** Context about code related to the user's idea */
  idea_related_code?: IdeaRelatedCode;
}

/**
 * Error codes for exploration failures.
 *
 * These correspond to different stages where exploration can fail.
 */
export type ExplorationErrorCode =
  | "CLONE_FAILED"
  | "INSTALL_FAILED"
  | "EXPLORATION_FAILED";

/**
 * Error details for failed exploration.
 */
export interface ExplorationError {
  /** Human-readable error message */
  message: string;

  /** Error code indicating the failure stage */
  code: ExplorationErrorCode;
}

/**
 * Callback payload for successful exploration.
 *
 * Sent by the GitHub Actions workflow when codebase exploration completes.
 */
export interface ExplorationCallbackSuccess {
  /** Session ID in format channelId:threadTs */
  session_id: string;

  /** Status indicator for success */
  status: "success";

  /** Exploration context data */
  exploration_context: ExplorationContext;
}

/**
 * Callback payload for failed exploration.
 *
 * Sent by the GitHub Actions workflow when exploration fails.
 */
export interface ExplorationCallbackError {
  /** Session ID in format channelId:threadTs */
  session_id: string;

  /** Status indicator for error */
  status: "error";

  /** Error details */
  error: ExplorationError;
}

/**
 * Union type for all exploration callback payloads.
 *
 * Used to handle both success and error cases.
 */
export type ExplorationCallback =
  | ExplorationCallbackSuccess
  | ExplorationCallbackError;

/**
 * Type guard to check if a callback is a success callback.
 *
 * @param callback - The callback to check
 * @returns True if the callback is a success callback
 */
export function isExplorationSuccess(
  callback: ExplorationCallback,
): callback is ExplorationCallbackSuccess {
  return callback.status === "success";
}

/**
 * Type guard to check if a callback is an error callback.
 *
 * @param callback - The callback to check
 * @returns True if the callback is an error callback
 */
export function isExplorationError(
  callback: ExplorationCallback,
): callback is ExplorationCallbackError {
  return callback.status === "error";
}
