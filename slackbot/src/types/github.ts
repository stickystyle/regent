// ABOUTME: GitHub API response types for issue and comment operations.
// ABOUTME: Defines interfaces for users, comments, and issues from GitHub REST API.

/**
 * GitHubUser represents minimal user information from GitHub API responses.
 *
 * This is the subset of user data included in comment and issue responses.
 */
export interface GitHubUser {
  /**
   * Unique numeric identifier for the GitHub user.
   *
   * Example: 12345678
   */
  id: number;

  /**
   * GitHub username (login handle).
   *
   * Example: "octocat"
   */
  login: string;
}

/**
 * GitHubComment represents a comment on a GitHub issue.
 *
 * Used when fetching, creating, or updating issue comments via the GitHub API.
 *
 * @example
 * ```ts
 * const comment: GitHubComment = {
 *   id: 123456789,
 *   body: "This looks good to me!",
 *   created_at: "2025-01-15T10:30:00Z",
 *   updated_at: "2025-01-15T10:30:00Z",
 *   user: { id: 12345, login: "reviewer" },
 *   html_url: "https://github.com/owner/repo/issues/42#issuecomment-123456789",
 * };
 * ```
 */
export interface GitHubComment {
  /**
   * Unique numeric identifier for the comment.
   *
   * Example: 123456789
   */
  id: number;

  /**
   * Markdown content of the comment.
   *
   * Example: "LGTM! Ready to merge."
   */
  body: string;

  /**
   * ISO 8601 timestamp when the comment was created.
   *
   * Example: "2025-01-15T10:30:00Z"
   */
  created_at: string;

  /**
   * ISO 8601 timestamp when the comment was last updated.
   *
   * Example: "2025-01-15T11:00:00Z"
   */
  updated_at: string;

  /**
   * User who authored the comment.
   */
  user: GitHubUser;

  /**
   * URL to view the comment on GitHub.
   *
   * Example: "https://github.com/owner/repo/issues/42#issuecomment-123456789"
   */
  html_url: string;
}

/**
 * GitHubIssue represents an issue from the GitHub API.
 *
 * Used when fetching or interacting with GitHub issues for spec storage.
 *
 * @example
 * ```ts
 * const issue: GitHubIssue = {
 *   number: 42,
 *   title: "Add user authentication",
 *   body: "## Summary\nImplement OAuth2 login flow...",
 *   state: "open",
 *   html_url: "https://github.com/owner/repo/issues/42",
 *   user: { id: 12345, login: "author" },
 *   labels: [{ name: "enhancement" }, { name: "priority:high" }],
 *   created_at: "2025-01-10T09:00:00Z",
 *   updated_at: "2025-01-15T14:30:00Z",
 * };
 * ```
 */
export interface GitHubIssue {
  /**
   * Issue number within the repository.
   *
   * Example: 42
   */
  number: number;

  /**
   * Title of the issue.
   *
   * Example: "Implement user authentication"
   */
  title: string;

  /**
   * Markdown body content of the issue.
   * Can be null for issues created without a body.
   *
   * Example: "## Summary\nThis issue tracks..."
   */
  body: string | null;

  /**
   * Current state of the issue.
   */
  state: "open" | "closed";

  /**
   * URL to view the issue on GitHub.
   *
   * Example: "https://github.com/owner/repo/issues/42"
   */
  html_url: string;

  /**
   * User who created the issue.
   */
  user: GitHubUser;

  /**
   * Labels applied to the issue.
   *
   * Example: [{ name: "bug" }, { name: "priority:high" }]
   */
  labels: Array<{ name: string }>;

  /**
   * ISO 8601 timestamp when the issue was created.
   *
   * Example: "2025-01-10T09:00:00Z"
   */
  created_at: string;

  /**
   * ISO 8601 timestamp when the issue was last updated.
   *
   * Example: "2025-01-15T14:30:00Z"
   */
  updated_at: string;
}
