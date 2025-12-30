// ABOUTME: Error type hierarchy for categorizing API and validation failures.
// ABOUTME: Supports transient vs permanent classification and Slack message formatting.

/**
 * Base class for all application errors.
 *
 * Extends native Error with additional metadata for error disclosure (Property 10):
 * - type: Error category name
 * - details: Specific error details
 * - suggestedAction: What the user should do
 * - isRetryable: Whether the error can be retried
 */
export abstract class BaseError extends Error {
  /** Error category name (class name) */
  abstract readonly type: string;

  /** Whether this error can be retried */
  abstract readonly isRetryable: boolean;

  /** Specific error details */
  readonly details: string;

  /** What the user should do to resolve the error */
  readonly suggestedAction: string;

  constructor(message: string, details: string, suggestedAction: string) {
    super(message);
    this.details = details;
    this.suggestedAction = suggestedAction;
    this.name = this.constructor.name;
  }

  /**
   * Formats the error for display in Slack using mrkdwn.
   *
   * Includes error type, message, details, and suggested action
   * per Property 10: Error Disclosure requirements.
   *
   * @returns Formatted string for Slack message
   */
  toSlackMessage(): string {
    const lines = [
      `:warning: *${this.message}*`,
      "",
      `*Error Type:* ${this.type}`,
      `*Details:* ${this.details}`,
      `*Suggested Action:* ${this.suggestedAction}`,
    ];

    return lines.join("\n");
  }
}

/**
 * Abstract base class for transient (retryable) errors.
 *
 * Transient errors are temporary conditions that may resolve with retry:
 * - Rate limits
 * - Network timeouts
 * - Temporary service unavailability
 */
export abstract class TransientError extends BaseError {
  readonly isRetryable = true;
}

/**
 * Abstract base class for permanent (non-retryable) errors.
 *
 * Permanent errors require user intervention to resolve:
 * - Invalid input
 * - Authentication failures
 * - Missing permissions
 */
export abstract class PermanentError extends BaseError {
  readonly isRetryable = false;
}

// =============================================================================
// Transient Errors (retryable)
// =============================================================================

/**
 * GitHub API rate limit exceeded.
 *
 * Includes reset time to inform user when they can retry.
 */
export class GitHubRateLimitError extends TransientError {
  readonly type = "GitHubRateLimitError";

  /** When the rate limit resets */
  readonly resetTime: Date;

  constructor(message: string, details: string, suggestedAction: string, resetTime: Date) {
    super(message, details, suggestedAction);
    this.resetTime = resetTime;
  }

  override toSlackMessage(): string {
    const base = super.toSlackMessage();
    const resetStr = this.resetTime.toISOString();
    return `${base}\n*Rate Limit Resets:* ${resetStr}`;
  }
}

/**
 * Slack API rate limit exceeded.
 *
 * Includes retry-after duration from Slack's response headers.
 */
export class SlackRateLimitError extends TransientError {
  readonly type = "SlackRateLimitError";

  /** Seconds to wait before retrying */
  readonly retryAfterSeconds: number;

  constructor(
    message: string,
    details: string,
    suggestedAction: string,
    retryAfterSeconds: number,
  ) {
    super(message, details, suggestedAction);
    this.retryAfterSeconds = retryAfterSeconds;
  }

  override toSlackMessage(): string {
    const base = super.toSlackMessage();
    return `${base}\n*Retry After:* ${this.retryAfterSeconds} seconds`;
  }
}

/**
 * Slack Canvas operation failed.
 *
 * Canvas operations can fail due to permissions, quotas, or temporary issues.
 * The system should fall back to file upload when Canvas fails.
 */
export class SlackCanvasError extends TransientError {
  readonly type = "SlackCanvasError";
}

/**
 * Anthropic API rate limit exceeded.
 *
 * Includes retry-after duration for automatic retry scheduling.
 */
export class AnthropicRateLimitError extends TransientError {
  readonly type = "AnthropicRateLimitError";

  /** Seconds to wait before retrying */
  readonly retryAfterSeconds: number;

  constructor(
    message: string,
    details: string,
    suggestedAction: string,
    retryAfterSeconds: number,
  ) {
    super(message, details, suggestedAction);
    this.retryAfterSeconds = retryAfterSeconds;
  }

  override toSlackMessage(): string {
    const base = super.toSlackMessage();
    return `${base}\n*Retry After:* ${this.retryAfterSeconds} seconds`;
  }
}

/**
 * Network timeout error.
 *
 * Occurs when an API request times out. Usually transient and resolves with retry.
 */
export class NetworkTimeoutError extends TransientError {
  readonly type = "NetworkTimeoutError";
}

// =============================================================================
// Permanent Errors (not retryable)
// =============================================================================

/**
 * GitHub repository access denied.
 *
 * Occurs when the configured token lacks permissions to access the repository.
 * Requires user to fix token permissions or use a different repository.
 */
export class GitHubAccessError extends PermanentError {
  readonly type = "GitHubAccessError";
}

/**
 * Anthropic model refused the request.
 *
 * Occurs when the model cannot process the request due to content policy
 * or other model-level restrictions. Requires modifying the prompt.
 */
export class AnthropicModelError extends PermanentError {
  readonly type = "AnthropicModelError";
}

/**
 * Anthropic input exceeds limits.
 *
 * Occurs when the input context is too large for the model.
 * Requires reducing context size (fewer files, shorter history).
 */
export class AnthropicInputError extends PermanentError {
  readonly type = "AnthropicInputError";
}

/**
 * Input validation failed.
 *
 * Occurs when user input doesn't match expected format.
 * Examples: invalid repository format, unsupported channel type.
 */
export class ValidationError extends PermanentError {
  readonly type = "ValidationError";
}
