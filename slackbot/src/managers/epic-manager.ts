// ABOUTME: Epic manager for storing spec documents as GitHub issue comments.
// ABOUTME: Implements collapsible comment format with markers for spec identification.

import type { GitHubClient } from "../clients/github-client.ts";

/**
 * Spec document types supported by the Epic manager.
 */
export type SpecType = "brainstorm" | "requirements" | "design";

/**
 * Marker prefix for identifying spec comments.
 */
const SPEC_MARKER_PREFIX = "<!-- REGENT_SPEC:";

/**
 * Marker suffix for spec comments.
 */
const SPEC_MARKER_SUFFIX = " -->";

/**
 * Map of spec types to their display summaries in collapsible comments.
 */
const SPEC_SUMMARY_MAP: Record<SpecType, string> = {
  brainstorm: "📋 Brainstorm Specification",
  requirements: "📝 Requirements Specification",
  design: "🏗️ Design Specification",
};

/**
 * Format spec content as a collapsible comment with marker.
 *
 * @param specType - Type of spec (brainstorm, requirements, design)
 * @param content - Markdown content of the spec
 * @returns Formatted comment string with marker and collapsible details
 */
export function formatSpecComment(specType: SpecType, content: string): string {
  const marker = `${SPEC_MARKER_PREFIX}${specType}${SPEC_MARKER_SUFFIX}`;
  const summary = SPEC_SUMMARY_MAP[specType];
  return `${marker}\n<details>\n<summary>${summary}</summary>\n\n${content}\n\n</details>`;
}

/**
 * Parse spec type from comment marker.
 *
 * @param comment - Comment body to parse
 * @returns SpecType if marker found and valid, null otherwise
 */
export function parseSpecMarker(comment: string): SpecType | null {
  const match = comment.match(/<!-- REGENT_SPEC:(\w+) -->/);
  if (!match) return null;
  const type = match[1];
  if (type === "brainstorm" || type === "requirements" || type === "design") {
    return type;
  }
  return null;
}

/**
 * Extract content from a spec comment (between <details> tags, excluding <summary>).
 *
 * @param comment - Full comment body with details and summary tags
 * @returns Extracted spec content, or empty string if not found
 */
export function extractSpecContent(comment: string): string {
  // Find content after </summary> and before </details>
  const match = comment.match(/<\/summary>\s*([\s\S]*?)\s*<\/details>/);
  return match ? match[1].trim() : "";
}

/**
 * EpicManager handles storing and retrieving spec documents on GitHub Epic issues.
 *
 * Specs are stored as collapsible comments with markers for identification.
 */
export interface EpicManager {
  /**
   * Create a new Epic issue for a spec.
   *
   * @param owner - Repository owner
   * @param repo - Repository name
   * @param title - Epic title (spec name)
   * @param summary - Brief summary for Epic body
   * @returns Issue number and URL
   */
  createEpic(
    owner: string,
    repo: string,
    title: string,
    summary: string,
  ): Promise<{ number: number; url: string }>;

  /**
   * Add a spec document as a collapsible comment on an Epic.
   *
   * @param owner - Repository owner
   * @param repo - Repository name
   * @param epicNumber - Issue number of the Epic
   * @param specType - Type of spec (brainstorm, requirements, design)
   * @param content - Markdown content of the spec
   * @returns Comment ID
   */
  addSpecComment(
    owner: string,
    repo: string,
    epicNumber: number,
    specType: SpecType,
    content: string,
  ): Promise<number>;

  /**
   * Update an existing spec comment.
   *
   * @param owner - Repository owner
   * @param repo - Repository name
   * @param commentId - Comment ID to update
   * @param specType - Type of spec
   * @param content - New markdown content
   */
  updateSpecComment(
    owner: string,
    repo: string,
    commentId: number,
    specType: SpecType,
    content: string,
  ): Promise<void>;

  /**
   * Get spec content from an Epic by type.
   *
   * @param owner - Repository owner
   * @param repo - Repository name
   * @param epicNumber - Issue number of the Epic
   * @param specType - Type of spec to find
   * @returns Spec content or null if not found
   */
  getSpecContent(
    owner: string,
    repo: string,
    epicNumber: number,
    specType: SpecType,
  ): Promise<string | null>;

  /**
   * Get all spec comments from an Epic.
   *
   * @param owner - Repository owner
   * @param repo - Repository name
   * @param epicNumber - Issue number of the Epic
   * @returns Map of spec type to comment ID and content
   */
  getSpecComments(
    owner: string,
    repo: string,
    epicNumber: number,
  ): Promise<Map<SpecType, { commentId: number; content: string }>>;
}

/**
 * Production implementation of EpicManager using GitHubClient.
 *
 * Integrates with GitHub Issues API to store spec documents as comments
 * with collapsible formatting and markers for identification.
 */
export class EpicManagerImpl implements EpicManager {
  /**
   * Create a new Epic manager.
   *
   * @param githubClient - GitHub client for API operations
   */
  constructor(private readonly githubClient: GitHubClient) {}

  async createEpic(
    owner: string,
    repo: string,
    title: string,
    summary: string,
  ): Promise<{ number: number; url: string }> {
    const epicTitle = `[Epic] ${title}`;
    const epicBody =
      `## Summary\n\n${summary}\n\n---\n\n*Spec documents will be added as comments below.*`;

    const result = await this.githubClient.createIssue(
      owner,
      repo,
      epicTitle,
      epicBody,
      ["epic"],
    );

    return result;
  }

  async addSpecComment(
    owner: string,
    repo: string,
    epicNumber: number,
    specType: SpecType,
    content: string,
  ): Promise<number> {
    const formattedBody = formatSpecComment(specType, content);

    const comment = await this.githubClient.createIssueComment(
      owner,
      repo,
      epicNumber,
      formattedBody,
    );

    return comment.id;
  }

  async updateSpecComment(
    owner: string,
    repo: string,
    commentId: number,
    specType: SpecType,
    content: string,
  ): Promise<void> {
    const formattedBody = formatSpecComment(specType, content);

    await this.githubClient.updateIssueComment(
      owner,
      repo,
      commentId,
      formattedBody,
    );
  }

  async getSpecContent(
    owner: string,
    repo: string,
    epicNumber: number,
    specType: SpecType,
  ): Promise<string | null> {
    const comments = await this.githubClient.getIssueComments(
      owner,
      repo,
      epicNumber,
    );

    for (const comment of comments) {
      const parsedType = parseSpecMarker(comment.body);
      if (parsedType === specType) {
        return extractSpecContent(comment.body);
      }
    }

    return null;
  }

  async getSpecComments(
    owner: string,
    repo: string,
    epicNumber: number,
  ): Promise<Map<SpecType, { commentId: number; content: string }>> {
    const result = new Map<SpecType, { commentId: number; content: string }>();

    const comments = await this.githubClient.getIssueComments(
      owner,
      repo,
      epicNumber,
    );

    for (const comment of comments) {
      const specType = parseSpecMarker(comment.body);
      if (specType !== null) {
        const content = extractSpecContent(comment.body);
        result.set(specType, { commentId: comment.id, content });
      }
    }

    return result;
  }
}

/**
 * Mock Epic manager for testing.
 *
 * Provides configurable responses and error injection for testing
 * Epic management operations.
 */
export class MockEpicManager implements EpicManager {
  private createEpicError: Error | null = null;
  private addSpecCommentError: Error | null = null;
  private updateSpecCommentError: Error | null = null;
  private getSpecContentError: Error | null = null;
  private getSpecCommentsError: Error | null = null;

  private epicCounter = 0;
  private commentCounter = 0;

  private createdEpics: Array<{
    owner: string;
    repo: string;
    title: string;
    summary: string;
    number: number;
  }> = [];

  private addedComments: Array<{
    owner: string;
    repo: string;
    epicNumber: number;
    specType: SpecType;
    content: string;
    commentId: number;
  }> = [];

  private updatedComments: Array<{
    owner: string;
    repo: string;
    commentId: number;
    specType: SpecType;
    content: string;
  }> = [];

  /**
   * Configure an error to be thrown by createEpic.
   *
   * @param error - Error to throw on next createEpic call
   */
  setCreateEpicError(error: Error): void {
    this.createEpicError = error;
  }

  /**
   * Configure an error to be thrown by addSpecComment.
   *
   * @param error - Error to throw on next addSpecComment call
   */
  setAddSpecCommentError(error: Error): void {
    this.addSpecCommentError = error;
  }

  /**
   * Configure an error to be thrown by updateSpecComment.
   *
   * @param error - Error to throw on next updateSpecComment call
   */
  setUpdateSpecCommentError(error: Error): void {
    this.updateSpecCommentError = error;
  }

  /**
   * Configure an error to be thrown by getSpecContent.
   *
   * @param error - Error to throw on next getSpecContent call
   */
  setGetSpecContentError(error: Error): void {
    this.getSpecContentError = error;
  }

  /**
   * Configure an error to be thrown by getSpecComments.
   *
   * @param error - Error to throw on next getSpecComments call
   */
  setGetSpecCommentsError(error: Error): void {
    this.getSpecCommentsError = error;
  }

  /**
   * Alias for setGetSpecCommentsError for test readability.
   *
   * @param error - Error to throw on next getSpecComments call
   */
  setErrorOnGetSpecComments(error: Error): void {
    this.setGetSpecCommentsError(error);
  }

  /**
   * Get all epics created through this mock manager.
   */
  getCreatedEpics(): Array<{
    owner: string;
    repo: string;
    title: string;
    summary: string;
    number: number;
  }> {
    return [...this.createdEpics];
  }

  /**
   * Get all comments added through this mock manager.
   */
  getAddedComments(): Array<{
    owner: string;
    repo: string;
    epicNumber: number;
    specType: SpecType;
    content: string;
    commentId: number;
  }> {
    return [...this.addedComments];
  }

  /**
   * Get all comments updated through this mock manager.
   */
  getUpdatedComments(): Array<{
    owner: string;
    repo: string;
    commentId: number;
    specType: SpecType;
    content: string;
  }> {
    return [...this.updatedComments];
  }

  /**
   * Clear all configured errors and recorded operations.
   */
  clear(): void {
    this.createEpicError = null;
    this.addSpecCommentError = null;
    this.updateSpecCommentError = null;
    this.getSpecContentError = null;
    this.getSpecCommentsError = null;
    this.epicCounter = 0;
    this.commentCounter = 0;
    this.createdEpics = [];
    this.addedComments = [];
    this.updatedComments = [];
  }

  createEpic(
    owner: string,
    repo: string,
    title: string,
    summary: string,
  ): Promise<{ number: number; url: string }> {
    if (this.createEpicError !== null) {
      return Promise.reject(this.createEpicError);
    }

    this.epicCounter++;
    const number = this.epicCounter;

    this.createdEpics.push({ owner, repo, title, summary, number });

    return Promise.resolve({
      number,
      url: `https://github.com/${owner}/${repo}/issues/${number}`,
    });
  }

  addSpecComment(
    owner: string,
    repo: string,
    epicNumber: number,
    specType: SpecType,
    content: string,
  ): Promise<number> {
    if (this.addSpecCommentError !== null) {
      return Promise.reject(this.addSpecCommentError);
    }

    this.commentCounter++;
    const commentId = this.commentCounter;

    this.addedComments.push({
      owner,
      repo,
      epicNumber,
      specType,
      content,
      commentId,
    });

    return Promise.resolve(commentId);
  }

  updateSpecComment(
    owner: string,
    repo: string,
    commentId: number,
    specType: SpecType,
    content: string,
  ): Promise<void> {
    if (this.updateSpecCommentError !== null) {
      return Promise.reject(this.updateSpecCommentError);
    }

    this.updatedComments.push({
      owner,
      repo,
      commentId,
      specType,
      content,
    });

    // Update the content in addedComments if it exists
    const existingComment = this.addedComments.find(
      (c) => c.commentId === commentId,
    );
    if (existingComment) {
      existingComment.content = content;
    }

    return Promise.resolve();
  }

  getSpecContent(
    owner: string,
    repo: string,
    epicNumber: number,
    specType: SpecType,
  ): Promise<string | null> {
    if (this.getSpecContentError !== null) {
      return Promise.reject(this.getSpecContentError);
    }

    // Find the most recent content for this spec type on this epic
    const matchingComments = this.addedComments.filter(
      (c) =>
        c.owner === owner &&
        c.repo === repo &&
        c.epicNumber === epicNumber &&
        c.specType === specType,
    );

    if (matchingComments.length === 0) {
      return Promise.resolve(null);
    }

    // Return the content from the last matching comment
    return Promise.resolve(matchingComments[matchingComments.length - 1].content);
  }

  getSpecComments(
    owner: string,
    repo: string,
    epicNumber: number,
  ): Promise<Map<SpecType, { commentId: number; content: string }>> {
    if (this.getSpecCommentsError !== null) {
      return Promise.reject(this.getSpecCommentsError);
    }

    const result = new Map<SpecType, { commentId: number; content: string }>();

    // Get all comments for this epic
    const epicComments = this.addedComments.filter(
      (c) => c.owner === owner && c.repo === repo && c.epicNumber === epicNumber,
    );

    // Build map (later comments override earlier ones for same spec type)
    for (const comment of epicComments) {
      result.set(comment.specType, {
        commentId: comment.commentId,
        content: comment.content,
      });
    }

    return Promise.resolve(result);
  }
}
