// ABOUTME: GitHub client for repository exploration, PR creation, and access validation.
// ABOUTME: Implements Property 5 (access validation) and Property 11 (retry with exponential backoff).

import { RetryHandler } from "../errors/retry.ts";
import type { RetryConfig } from "../errors/retry.ts";
import { GitHubAccessError, GitHubRateLimitError, NetworkTimeoutError } from "../errors/types.ts";
import type { GitHubComment, GitHubIssue } from "../types/github.ts";
import { Framework, RelevantFile, RepositoryContext } from "../types/repository-context.ts";
import { SpecDocument } from "../types/spec-document.ts";

/**
 * GitHubClient abstracts GitHub REST API operations for repository access.
 *
 * This interface enables dependency injection, allowing tests to use mock
 * implementations while production code uses the real GitHub API client.
 */
export interface GitHubClient {
  /**
   * Read README, manifests, and directory structure.
   *
   * @param owner - Repository owner (user or organization)
   * @param repo - Repository name
   * @returns Repository context with framework, patterns, and relevant files
   */
  exploreRepository(owner: string, repo: string): Promise<RepositoryContext>;

  /**
   * Create PR with brainstorm.md in .regent/{spec-name}/ directory.
   *
   * @param owner - Repository owner
   * @param repo - Repository name
   * @param spec - Spec document to create PR for
   * @param threadUrl - Slack thread URL where spec was created
   * @param participants - List of Slack users who participated
   * @returns Pull request URL
   */
  createPullRequest(
    owner: string,
    repo: string,
    spec: SpecDocument,
    threadUrl: string,
    participants: string[],
  ): Promise<string>;

  /**
   * Determine target branch from .regent/config.yml or repo default.
   *
   * @param owner - Repository owner
   * @param repo - Repository name
   * @returns Default branch name (e.g., "main", "develop")
   */
  getDefaultBranch(owner: string, repo: string): Promise<string>;

  /**
   * Verify token has read/write access to repository.
   *
   * @param owner - Repository owner
   * @param repo - Repository name
   * @returns True if access is granted, false if repo not found
   * @throws GitHubAccessError if token lacks permissions
   */
  checkAccess(owner: string, repo: string): Promise<boolean>;

  /**
   * Create a new issue in the repository.
   *
   * @param owner - Repository owner
   * @param repo - Repository name
   * @param title - Issue title
   * @param body - Issue body in markdown
   * @param labels - Optional labels to apply to the issue
   * @returns Created issue number and URL
   */
  createIssue(
    owner: string,
    repo: string,
    title: string,
    body: string,
    labels?: string[],
  ): Promise<{ number: number; url: string }>;

  /**
   * Get an issue by number.
   *
   * @param owner - Repository owner
   * @param repo - Repository name
   * @param issueNumber - Issue number
   * @returns Issue details
   */
  getIssue(
    owner: string,
    repo: string,
    issueNumber: number,
  ): Promise<GitHubIssue>;

  /**
   * Get all comments on an issue.
   *
   * @param owner - Repository owner
   * @param repo - Repository name
   * @param issueNumber - Issue number
   * @returns Array of comments on the issue
   */
  getIssueComments(
    owner: string,
    repo: string,
    issueNumber: number,
  ): Promise<GitHubComment[]>;

  /**
   * Create a comment on an issue.
   *
   * @param owner - Repository owner
   * @param repo - Repository name
   * @param issueNumber - Issue number
   * @param body - Comment body in markdown
   * @returns Created comment
   */
  createIssueComment(
    owner: string,
    repo: string,
    issueNumber: number,
    body: string,
  ): Promise<GitHubComment>;

  /**
   * Update an existing issue comment.
   *
   * @param owner - Repository owner
   * @param repo - Repository name
   * @param commentId - Comment ID to update
   * @param body - Updated comment body in markdown
   * @returns Updated comment
   */
  updateIssueComment(
    owner: string,
    repo: string,
    commentId: number,
    body: string,
  ): Promise<GitHubComment>;

  /**
   * Trigger exploration workflow in regent-exploration-service via workflow_dispatch.
   *
   * @param targetRepo - Repository to explore in owner/repo format
   * @param idea - The idea/feature being brainstormed
   * @param sessionId - Session ID for correlation (channel_id:thread_ts format)
   */
  triggerExploration(
    targetRepo: string,
    idea: string,
    sessionId: string,
  ): Promise<void>;
}

/**
 * Mock GitHub client for testing.
 *
 * Provides configurable responses and error injection for testing retry logic.
 */
export class MockGitHubClient implements GitHubClient {
  private exploreError: Error | null = null;
  private checkAccessError: Error | null = null;
  private getDefaultBranchError: Error | null = null;
  private createPullRequestError: Error | null = null;
  private createIssueError: Error | null = null;
  private getIssueError: Error | null = null;
  private getIssueCommentsError: Error | null = null;
  private createIssueCommentError: Error | null = null;
  private updateIssueCommentError: Error | null = null;
  private triggerExplorationError: Error | null = null;
  private triggerExplorationDelay = 0;

  private issueCounter = 0;
  private commentCounter = 0;
  private triggerExplorationCalls: Array<{
    targetRepo: string;
    idea: string;
    sessionId: string;
  }> = [];
  private exploreRepositoryCalls: Array<{
    owner: string;
    repo: string;
  }> = [];
  private createdIssues: Array<{
    owner: string;
    repo: string;
    title: string;
    body: string;
    labels?: string[];
  }> = [];
  private createdComments: Array<{
    owner: string;
    repo: string;
    issueNumber: number;
    body: string;
  }> = [];
  private updatedComments: Array<{
    owner: string;
    repo: string;
    commentId: number;
    body: string;
  }> = [];

  /**
   * Configure an error to be thrown by exploreRepository.
   *
   * @param error - Error to throw on next exploreRepository call
   */
  setExploreRepositoryError(error: Error): void {
    this.exploreError = error;
  }

  /**
   * Configure an error to be thrown by checkAccess.
   *
   * @param error - Error to throw on next checkAccess call
   */
  setCheckAccessError(error: Error): void {
    this.checkAccessError = error;
  }

  /**
   * Configure an error to be thrown by getDefaultBranch.
   *
   * @param error - Error to throw on next getDefaultBranch call
   */
  setGetDefaultBranchError(error: Error): void {
    this.getDefaultBranchError = error;
  }

  /**
   * Configure an error to be thrown by createPullRequest.
   *
   * @param error - Error to throw on next createPullRequest call
   */
  setCreatePullRequestError(error: Error): void {
    this.createPullRequestError = error;
  }

  /**
   * Configure an error to be thrown by createIssue.
   *
   * @param error - Error to throw on next createIssue call
   */
  setCreateIssueError(error: Error): void {
    this.createIssueError = error;
  }

  /**
   * Configure an error to be thrown by getIssue.
   *
   * @param error - Error to throw on next getIssue call
   */
  setGetIssueError(error: Error): void {
    this.getIssueError = error;
  }

  /**
   * Configure an error to be thrown by getIssueComments.
   *
   * @param error - Error to throw on next getIssueComments call
   */
  setGetIssueCommentsError(error: Error): void {
    this.getIssueCommentsError = error;
  }

  /**
   * Configure an error to be thrown by createIssueComment.
   *
   * @param error - Error to throw on next createIssueComment call
   */
  setCreateIssueCommentError(error: Error): void {
    this.createIssueCommentError = error;
  }

  /**
   * Configure an error to be thrown by updateIssueComment.
   *
   * @param error - Error to throw on next updateIssueComment call
   */
  setUpdateIssueCommentError(error: Error): void {
    this.updateIssueCommentError = error;
  }

  /**
   * Configure an error to be thrown by triggerExploration.
   *
   * @param error - Error to throw on next triggerExploration call
   */
  setTriggerExplorationError(error: Error): void {
    this.triggerExplorationError = error;
  }

  /**
   * Configure a delay for triggerExploration (for testing async behavior).
   *
   * @param delayMs - Delay in milliseconds
   */
  setTriggerExplorationDelay(delayMs: number): void {
    this.triggerExplorationDelay = delayMs;
  }

  /**
   * Get all triggerExploration calls made through this mock client.
   *
   * @returns Array of triggerExploration call records
   */
  getTriggerExplorationCalls(): Array<{
    targetRepo: string;
    idea: string;
    sessionId: string;
  }> {
    return [...this.triggerExplorationCalls];
  }

  /**
   * Get all exploreRepository calls made through this mock client.
   *
   * @returns Array of exploreRepository call records
   */
  getExploreRepositoryCalls(): Array<{
    owner: string;
    repo: string;
  }> {
    return [...this.exploreRepositoryCalls];
  }

  /**
   * Get all issues created through this mock client.
   *
   * @returns Array of created issue records
   */
  getCreatedIssues(): Array<{
    owner: string;
    repo: string;
    title: string;
    body: string;
    labels?: string[];
  }> {
    return [...this.createdIssues];
  }

  /**
   * Get all comments created through this mock client.
   *
   * @returns Array of created comment records
   */
  getCreatedComments(): Array<{
    owner: string;
    repo: string;
    issueNumber: number;
    body: string;
  }> {
    return [...this.createdComments];
  }

  /**
   * Get all comments updated through this mock client.
   *
   * @returns Array of updated comment records
   */
  getUpdatedComments(): Array<{
    owner: string;
    repo: string;
    commentId: number;
    body: string;
  }> {
    return [...this.updatedComments];
  }

  /**
   * Clear all configured errors and recorded operations.
   */
  clear(): void {
    this.exploreError = null;
    this.checkAccessError = null;
    this.getDefaultBranchError = null;
    this.createPullRequestError = null;
    this.createIssueError = null;
    this.getIssueError = null;
    this.getIssueCommentsError = null;
    this.createIssueCommentError = null;
    this.updateIssueCommentError = null;
    this.triggerExplorationError = null;
    this.triggerExplorationDelay = 0;
    this.issueCounter = 0;
    this.commentCounter = 0;
    this.createdIssues = [];
    this.createdComments = [];
    this.updatedComments = [];
    this.triggerExplorationCalls = [];
    this.exploreRepositoryCalls = [];
  }

  checkAccess(_owner: string, _repo: string): Promise<boolean> {
    if (this.checkAccessError !== null) {
      return Promise.reject(this.checkAccessError);
    }
    return Promise.resolve(true);
  }

  exploreRepository(owner: string, repo: string): Promise<RepositoryContext> {
    // Record the call for test assertions
    this.exploreRepositoryCalls.push({ owner, repo });

    if (this.exploreError !== null) {
      return Promise.reject(this.exploreError);
    }

    return Promise.resolve({
      repository: `${owner}/${repo}`,
      framework: Framework.Unknown,
      patterns: [],
      relevant_files: [],
      structure: "",
    });
  }

  triggerExploration(
    targetRepo: string,
    idea: string,
    sessionId: string,
  ): Promise<void> {
    // Record the call for test assertions
    this.triggerExplorationCalls.push({ targetRepo, idea, sessionId });

    if (this.triggerExplorationError !== null) {
      return Promise.reject(this.triggerExplorationError);
    }

    // Always return immediately - the delay field is reserved for future use
    // The actual workflow runs asynchronously after the API call returns
    return Promise.resolve();
  }

  getDefaultBranch(_owner: string, _repo: string): Promise<string> {
    if (this.getDefaultBranchError !== null) {
      return Promise.reject(this.getDefaultBranchError);
    }
    return Promise.resolve("main");
  }

  createPullRequest(
    owner: string,
    repo: string,
    _spec: SpecDocument,
    _threadUrl: string,
    _participants: string[],
  ): Promise<string> {
    if (this.createPullRequestError !== null) {
      return Promise.reject(this.createPullRequestError);
    }
    return Promise.resolve(`https://github.com/${owner}/${repo}/pull/1`);
  }

  createIssue(
    owner: string,
    repo: string,
    title: string,
    body: string,
    labels?: string[],
  ): Promise<{ number: number; url: string }> {
    if (this.createIssueError !== null) {
      return Promise.reject(this.createIssueError);
    }

    // Record the operation
    this.createdIssues.push({ owner, repo, title, body, labels });

    // Generate mock issue number
    this.issueCounter++;
    const issueNumber = this.issueCounter;

    return Promise.resolve({
      number: issueNumber,
      url: `https://github.com/${owner}/${repo}/issues/${issueNumber}`,
    });
  }

  getIssue(
    owner: string,
    repo: string,
    issueNumber: number,
  ): Promise<GitHubIssue> {
    if (this.getIssueError !== null) {
      return Promise.reject(this.getIssueError);
    }

    return Promise.resolve({
      number: issueNumber,
      title: `Mock Issue #${issueNumber}`,
      body: "Mock issue body",
      state: "open",
      html_url: `https://github.com/${owner}/${repo}/issues/${issueNumber}`,
      user: { id: 1, login: "mock-user" },
      labels: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  }

  getIssueComments(
    owner: string,
    repo: string,
    issueNumber: number,
  ): Promise<GitHubComment[]> {
    if (this.getIssueCommentsError !== null) {
      return Promise.reject(this.getIssueCommentsError);
    }

    // Return comments that were created for this issue
    const issueComments = this.createdComments
      .filter(
        (c) => c.owner === owner && c.repo === repo && c.issueNumber === issueNumber,
      )
      .map((c, index) => ({
        id: index + 1,
        body: c.body,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        user: { id: 1, login: "mock-user" },
        html_url: `https://github.com/${owner}/${repo}/issues/${issueNumber}#issuecomment-${
          index + 1
        }`,
      }));

    return Promise.resolve(issueComments);
  }

  createIssueComment(
    owner: string,
    repo: string,
    issueNumber: number,
    body: string,
  ): Promise<GitHubComment> {
    if (this.createIssueCommentError !== null) {
      return Promise.reject(this.createIssueCommentError);
    }

    // Record the operation
    this.createdComments.push({ owner, repo, issueNumber, body });

    // Generate mock comment ID
    this.commentCounter++;
    const commentId = this.commentCounter;

    return Promise.resolve({
      id: commentId,
      body,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      user: { id: 1, login: "mock-user" },
      html_url:
        `https://github.com/${owner}/${repo}/issues/${issueNumber}#issuecomment-${commentId}`,
    });
  }

  updateIssueComment(
    owner: string,
    repo: string,
    commentId: number,
    body: string,
  ): Promise<GitHubComment> {
    if (this.updateIssueCommentError !== null) {
      return Promise.reject(this.updateIssueCommentError);
    }

    // Record the operation
    this.updatedComments.push({ owner, repo, commentId, body });

    return Promise.resolve({
      id: commentId,
      body,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      user: { id: 1, login: "mock-user" },
      html_url: `https://github.com/${owner}/${repo}/issues/1#issuecomment-${commentId}`,
    });
  }
}

/**
 * Real implementation of GitHubClient that integrates with GitHub REST API.
 *
 * Wraps GitHub API calls with retry logic for transient errors (Property 11).
 * Validates token permissions before accessing repositories (Property 5).
 */
export class GitHubClientImpl implements GitHubClient {
  private readonly retryHandler: RetryHandler;
  private readonly baseUrl = "https://api.github.com";

  /**
   * Create a new GitHub client.
   *
   * @param githubApi - GitHub API object with get/post/patch methods
   * @param token - GitHub personal access token
   * @param retryConfig - Optional retry configuration (defaults to 3 attempts)
   * @param explorationServiceRepo - Repository hosting the exploration workflow (owner/repo format)
   */
  constructor(
    private readonly githubApi: {
      get: (url: string, headers?: Record<string, string>) => Promise<Response>;
      post: (
        url: string,
        body: unknown,
        headers?: Record<string, string>,
      ) => Promise<Response>;
      patch: (
        url: string,
        body: unknown,
        headers?: Record<string, string>,
      ) => Promise<Response>;
    },
    private readonly token: string,
    retryConfig?: Partial<RetryConfig>,
    private readonly explorationServiceRepo: string = "stickystyle/regent",
  ) {
    this.retryHandler = new RetryHandler(retryConfig);
  }

  /**
   * Get standard headers for GitHub API requests.
   */
  private getHeaders(): Record<string, string> {
    return {
      "Authorization": `Bearer ${this.token}`,
      "Accept": "application/vnd.github.v3+json",
    };
  }

  /**
   * Decode base64 string with proper UTF-8 handling.
   *
   * @param base64 - Base64 encoded string
   * @returns Decoded UTF-8 string
   */
  private decodeBase64(base64: string): string {
    // Remove whitespace that GitHub may include in base64 content
    const cleanBase64 = base64.replace(/\s/g, "");

    // Decode base64 to binary string
    const binaryString = atob(cleanBase64);

    // Convert binary string to byte array
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    // Decode bytes as UTF-8
    const decoder = new TextDecoder("utf-8");
    return decoder.decode(bytes);
  }

  /**
   * Encode text to base64 with proper UTF-8 handling.
   *
   * @param text - Text to encode
   * @returns Base64 encoded string
   */
  private encodeBase64(text: string): string {
    // Encode text as UTF-8 bytes
    const encoder = new TextEncoder();
    const bytes = encoder.encode(text);

    // Convert bytes to binary string
    const binaryString = String.fromCharCode(...bytes);

    // Encode binary string as base64
    return btoa(binaryString);
  }

  /**
   * Handle GitHub API response, throwing appropriate errors for non-2xx responses.
   *
   * @param response - Fetch Response object
   * @returns The response if successful
   * @throws GitHubAccessError for 401, 403, and 422 responses
   * @throws GitHubRateLimitError for 429 responses
   * @throws NetworkTimeoutError for 5xx responses
   */
  private handleResponse(response: Response): Response {
    if (response.ok) {
      return response;
    }

    if (response.status === 401) {
      throw new GitHubAccessError(
        "Authentication failed",
        "GitHub token is invalid or expired (HTTP 401)",
        "Update GitHub token with a valid token",
      );
    }

    if (response.status === 403) {
      throw new GitHubAccessError(
        "Access denied",
        "GitHub token lacks permissions (HTTP 403)",
        "Update token permissions or use a different token",
      );
    }

    if (response.status === 422) {
      throw new GitHubAccessError(
        "Validation failed",
        "GitHub API validation failed (HTTP 422)",
        "Check request parameters and try again",
      );
    }

    if (response.status === 429) {
      const resetHeader = response.headers.get("x-ratelimit-reset");
      const resetTime = resetHeader
        ? new Date(parseInt(resetHeader) * 1000)
        : new Date(Date.now() + 60000);

      throw new GitHubRateLimitError(
        "Rate limit exceeded",
        "GitHub API rate limit exceeded",
        "Wait for rate limit to reset",
        resetTime,
      );
    }

    if (response.status >= 500) {
      throw new NetworkTimeoutError(
        "Server error",
        `GitHub API returned HTTP ${response.status}`,
        "Retry the request",
      );
    }

    return response;
  }

  async checkAccess(owner: string, repo: string): Promise<boolean> {
    return await this.retryHandler.execute(async () => {
      const url = `${this.baseUrl}/repos/${owner}/${repo}`;
      const response = await this.githubApi.get(url, this.getHeaders());

      if (response.status === 404) {
        return false;
      }

      this.handleResponse(response);
      return true;
    });
  }

  async getDefaultBranch(owner: string, repo: string): Promise<string> {
    return await this.retryHandler.execute(async () => {
      // Try to read .regent/config.yml first
      try {
        const configUrl = `${this.baseUrl}/repos/${owner}/${repo}/contents/.regent/config.yml`;
        const configResponse = await this.githubApi.get(configUrl, this.getHeaders());

        if (configResponse.ok) {
          const configData = await configResponse.json();
          const content = this.decodeBase64(configData.content as string);
          const match = content.match(/target_branch:\s*(\S+)/);
          if (match) {
            return match[1];
          }
        }
      } catch (_error) {
        // Fall through to default branch detection
      }

      // Fall back to repository default branch
      const repoUrl = `${this.baseUrl}/repos/${owner}/${repo}`;
      const response = await this.githubApi.get(repoUrl, this.getHeaders());
      this.handleResponse(response);

      const data = await response.json();
      return data.default_branch as string;
    });
  }

  async exploreRepository(owner: string, repo: string): Promise<RepositoryContext> {
    return await this.retryHandler.execute(async () => {
      const repository = `${owner}/${repo}`;
      const relevantFiles: RelevantFile[] = [];
      let framework = Framework.Unknown;
      const patterns: string[] = [];

      // Read root directory
      const rootUrl = `${this.baseUrl}/repos/${owner}/${repo}/contents/`;
      const rootResponse = await this.githubApi.get(rootUrl, this.getHeaders());
      this.handleResponse(rootResponse);

      const rootContents = await rootResponse.json() as Array<{
        name: string;
        type: string;
        path: string;
      }>;

      // Detect framework from manifests
      framework = await this.detectFramework(owner, repo);

      // Read README.md if present
      const readmeFile = rootContents.find((f) => f.name === "README.md");
      if (readmeFile) {
        const readme = await this.readFile(owner, repo, "README.md");
        if (readme) {
          relevantFiles.push({
            path: "README.md",
            description: "Project README",
            content: readme,
          });
        }
      }

      // Build directory structure
      const structure = await this.buildStructure(owner, repo, rootContents);

      return {
        repository,
        framework,
        patterns,
        relevant_files: relevantFiles,
        structure,
      };
    });
  }

  async createPullRequest(
    owner: string,
    repo: string,
    spec: SpecDocument,
    threadUrl: string,
    participants: string[],
  ): Promise<string> {
    // Get base branch outside retry handler (not retryable)
    const baseBranch = await this.getDefaultBranch(owner, repo);

    // Convert title to kebab-case for branch and directory names
    const specName = spec.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");

    const branchName = `brainstorm/${specName}`;

    // Format brainstorm.md content
    const brainstormContent = this.formatBrainstormMarkdown(spec, threadUrl, participants);

    return await this.retryHandler.execute(async () => {
      // 1. Get the SHA of the latest commit on the base branch
      const refUrl = `${this.baseUrl}/repos/${owner}/${repo}/git/refs/heads/${baseBranch}`;
      const refResponse = await this.githubApi.get(refUrl, this.getHeaders());
      this.handleResponse(refResponse);
      const refData = await refResponse.json();
      const baseSha = refData.object.sha as string;

      // 2. Create a new branch reference pointing to that SHA
      const createRefUrl = `${this.baseUrl}/repos/${owner}/${repo}/git/refs`;
      const createRefPayload = {
        ref: `refs/heads/${branchName}`,
        sha: baseSha,
      };
      const createRefResponse = await this.githubApi.post(
        createRefUrl,
        createRefPayload,
        this.getHeaders(),
      );
      this.handleResponse(createRefResponse);

      // 3. Create/update the .regent/{spec-name}/brainstorm.md file with a commit
      const filePath = `.regent/${specName}/brainstorm.md`;
      const fileUrl = `${this.baseUrl}/repos/${owner}/${repo}/contents/${filePath}`;

      // Encode content as base64
      const encodedContent = this.encodeBase64(brainstormContent);

      const filePayload = {
        message: `docs: add brainstorm for ${spec.title}`,
        content: encodedContent,
        branch: branchName,
      };

      const fileResponse = await this.githubApi.post(
        fileUrl,
        filePayload,
        this.getHeaders(),
      );
      this.handleResponse(fileResponse);

      // 4. Create the pull request
      const participantsList = participants.length > 0
        ? `\n\n**Participants:** ${participants.join(", ")}`
        : "";

      const prBody = `Brainstorm session completed in Slack.\n\n` +
        `**Thread:** ${threadUrl}${participantsList}\n\n` +
        `This PR adds the brainstorm document to \`.regent/${specName}/brainstorm.md\` for review.`;

      const prTitle = `Brainstorm: ${spec.title}`;

      const prUrl = `${this.baseUrl}/repos/${owner}/${repo}/pulls`;
      const prPayload = {
        title: prTitle,
        body: prBody,
        head: branchName,
        base: baseBranch,
      };

      const response = await this.githubApi.post(
        prUrl,
        prPayload,
        this.getHeaders(),
      );
      this.handleResponse(response);

      const data = await response.json();
      return data.html_url as string;
    });
  }

  /**
   * Format brainstorm document as markdown.
   *
   * @param spec - Spec document
   * @param threadUrl - Slack thread URL
   * @param participants - List of participants
   * @returns Formatted markdown content
   */
  private formatBrainstormMarkdown(
    spec: SpecDocument,
    threadUrl: string,
    participants: string[],
  ): string {
    const sections: string[] = [
      `# ${spec.title}`,
      "",
      `**Slack Thread:** ${threadUrl}`,
    ];

    if (participants.length > 0) {
      sections.push(`**Participants:** ${participants.join(", ")}`);
    }

    sections.push("", "## Overview", spec.overview);

    if (spec.problem_statement) {
      sections.push("", "## Problem Statement", spec.problem_statement);
    }

    if (spec.goals.length > 0) {
      sections.push("", "## Goals");
      spec.goals.forEach((goal) => sections.push(`- ${goal}`));
    }

    if (spec.non_goals.length > 0) {
      sections.push("", "## Non-Goals");
      spec.non_goals.forEach((goal) => sections.push(`- ${goal}`));
    }

    if (spec.personas.length > 0) {
      sections.push("", "## User Personas");
      spec.personas.forEach((persona) => {
        sections.push(
          "",
          `### ${persona.name}`,
          persona.description,
        );
      });
    }

    if (spec.use_cases.length > 0) {
      sections.push("", "## Use Cases");
      spec.use_cases.forEach((useCase, idx) => {
        sections.push(
          "",
          `### Use Case ${idx + 1}: ${useCase.title}`,
          useCase.description,
        );
      });
    }

    if (spec.technical_details) {
      sections.push("", "## Technical Details", spec.technical_details);
    }

    if (spec.open_questions.length > 0) {
      sections.push("", "## Open Questions");
      spec.open_questions.forEach((q) => sections.push(`- ${q}`));
    }

    return sections.join("\n");
  }

  /**
   * Detect framework from package manifests.
   */
  private async detectFramework(
    owner: string,
    repo: string,
  ): Promise<Framework> {
    // Check for package.json (Node.js/JavaScript)
    const packageJson = await this.readFile(owner, repo, "package.json");
    if (packageJson) {
      try {
        const pkg = JSON.parse(packageJson);
        const deps = { ...pkg.dependencies, ...pkg.devDependencies };

        if (deps.next) return Framework.NextJS;
        if (deps.react) return Framework.React;
        if (deps.express) return Framework.Express;
      } catch (_error) {
        // Ignore parse errors
      }
    }

    // Check for pyproject.toml (Python)
    const pyproject = await this.readFile(owner, repo, "pyproject.toml");
    if (pyproject) {
      if (pyproject.includes("fastapi")) return Framework.FastAPI;
      if (pyproject.includes("django")) return Framework.Django;
      return Framework.Unknown;
    }

    // Check for deno.json (Deno)
    const denoJson = await this.readFile(owner, repo, "deno.json");
    if (denoJson) {
      return Framework.Deno;
    }

    const denoJsonc = await this.readFile(owner, repo, "deno.jsonc");
    if (denoJsonc) {
      return Framework.Deno;
    }

    return Framework.Unknown;
  }

  /**
   * Read a file from the repository.
   *
   * @param owner - Repository owner
   * @param repo - Repository name
   * @param path - File path
   * @returns File content or null if not found
   */
  private async readFile(
    owner: string,
    repo: string,
    path: string,
  ): Promise<string | null> {
    try {
      const url = `${this.baseUrl}/repos/${owner}/${repo}/contents/${path}`;
      const response = await this.githubApi.get(url, this.getHeaders());

      if (response.status === 404) {
        return null;
      }

      this.handleResponse(response);

      const data = await response.json();
      return this.decodeBase64(data.content as string);
    } catch (_error) {
      return null;
    }
  }

  /**
   * Build a directory structure tree.
   *
   * @param owner - Repository owner
   * @param repo - Repository name
   * @param contents - Root directory contents
   * @returns Directory structure as string
   */
  private async buildStructure(
    owner: string,
    repo: string,
    contents: Array<{ name: string; type: string; path: string }>,
  ): Promise<string> {
    const lines: string[] = [];

    for (const item of contents) {
      if (item.type === "dir") {
        lines.push(`${item.name}/`);

        // Read one level deep
        try {
          const dirUrl = `${this.baseUrl}/repos/${owner}/${repo}/contents/${item.path}`;
          const dirResponse = await this.githubApi.get(dirUrl, this.getHeaders());

          if (dirResponse.ok) {
            const dirContents = await dirResponse.json() as Array<{
              name: string;
              type: string;
            }>;

            for (const subItem of dirContents.slice(0, 5)) {
              const suffix = subItem.type === "dir" ? "/" : "";
              lines.push(`  ${subItem.name}${suffix}`);
            }

            if (dirContents.length > 5) {
              lines.push(`  ... (${dirContents.length - 5} more)`);
            }
          }
        } catch (_error) {
          // Ignore errors reading subdirectories
        }
      }
    }

    return lines.join("\n");
  }

  /**
   * Create a new issue in the repository.
   *
   * @param owner - Repository owner
   * @param repo - Repository name
   * @param title - Issue title
   * @param body - Issue body in markdown
   * @param labels - Optional labels to apply to the issue
   * @returns Created issue number and URL
   * @throws GitHubAccessError for authentication/permission errors
   * @throws GitHubRateLimitError when rate limited
   */
  async createIssue(
    owner: string,
    repo: string,
    title: string,
    body: string,
    labels?: string[],
  ): Promise<{ number: number; url: string }> {
    return await this.retryHandler.execute(async () => {
      const url = `${this.baseUrl}/repos/${owner}/${repo}/issues`;
      const response = await this.githubApi.post(
        url,
        {
          title,
          body,
          labels: labels ?? [],
        },
        this.getHeaders(),
      );

      this.handleResponse(response);

      const data = await response.json();
      return {
        number: data.number as number,
        url: data.html_url as string,
      };
    });
  }

  /**
   * Get an issue by number.
   *
   * @param owner - Repository owner
   * @param repo - Repository name
   * @param issueNumber - Issue number
   * @returns Issue details
   * @throws GitHubAccessError if issue not found or access denied
   * @throws GitHubRateLimitError when rate limited
   */
  async getIssue(
    owner: string,
    repo: string,
    issueNumber: number,
  ): Promise<GitHubIssue> {
    return await this.retryHandler.execute(async () => {
      const url = `${this.baseUrl}/repos/${owner}/${repo}/issues/${issueNumber}`;
      const response = await this.githubApi.get(url, this.getHeaders());

      if (response.status === 404) {
        throw new GitHubAccessError(
          "Issue not found",
          `Issue #${issueNumber} does not exist in ${owner}/${repo}`,
          "Verify the issue number and repository",
        );
      }

      this.handleResponse(response);

      const data = await response.json();
      return {
        number: data.number as number,
        title: data.title as string,
        body: (data.body as string | null) ?? null,
        state: data.state as "open" | "closed",
        html_url: data.html_url as string,
        user: {
          id: data.user.id as number,
          login: data.user.login as string,
        },
        labels: (data.labels as Array<{ name: string }>).map((l) => ({
          name: l.name,
        })),
        created_at: data.created_at as string,
        updated_at: data.updated_at as string,
      };
    });
  }

  /**
   * Get all comments on an issue.
   *
   * Handles pagination automatically by following Link headers.
   *
   * @param owner - Repository owner
   * @param repo - Repository name
   * @param issueNumber - Issue number
   * @returns Array of all comments on the issue
   * @throws GitHubAccessError for authentication/permission errors or if issue not found
   * @throws GitHubRateLimitError when rate limited
   */
  async getIssueComments(
    owner: string,
    repo: string,
    issueNumber: number,
  ): Promise<GitHubComment[]> {
    return await this.retryHandler.execute(async () => {
      const allComments: GitHubComment[] = [];
      let url: string | null =
        `${this.baseUrl}/repos/${owner}/${repo}/issues/${issueNumber}/comments?per_page=100`;

      while (url !== null) {
        const response = await this.githubApi.get(url, this.getHeaders());

        // Handle 404 specifically for non-existent issues
        if (response.status === 404) {
          throw new GitHubAccessError(
            "Issue not found",
            `Issue #${issueNumber} does not exist in ${owner}/${repo}`,
            "Verify the issue number and repository",
          );
        }

        this.handleResponse(response);

        const data = await response.json() as Array<{
          id: number;
          body: string;
          created_at: string;
          updated_at: string;
          user: { id: number; login: string };
          html_url: string;
        }>;

        for (const comment of data) {
          allComments.push({
            id: comment.id,
            body: comment.body,
            created_at: comment.created_at,
            updated_at: comment.updated_at,
            user: {
              id: comment.user.id,
              login: comment.user.login,
            },
            html_url: comment.html_url,
          });
        }

        // Parse Link header for pagination
        url = this.parseNextPageUrl(response.headers.get("link"));
      }

      return allComments;
    });
  }

  /**
   * Parse the Link header to extract the URL for the next page.
   *
   * @param linkHeader - Value of the Link header from GitHub API response
   * @returns URL for next page, or null if no next page exists
   */
  private parseNextPageUrl(linkHeader: string | null): string | null {
    if (!linkHeader) {
      return null;
    }

    // Link header format: <url>; rel="next", <url>; rel="last"
    const links = linkHeader.split(",");
    for (const link of links) {
      const parts = link.trim().split(";");
      if (parts.length < 2) {
        continue;
      }

      const urlMatch = parts[0].trim().match(/<(.+)>/);
      const relMatch = parts[1].trim().match(/rel="(.+)"/);

      if (urlMatch && relMatch && relMatch[1] === "next") {
        return urlMatch[1];
      }
    }

    return null;
  }

  /**
   * Create a comment on an issue.
   *
   * @param owner - Repository owner
   * @param repo - Repository name
   * @param issueNumber - Issue number
   * @param body - Comment body in markdown
   * @returns Created comment
   * @throws GitHubAccessError for authentication/permission errors
   * @throws GitHubRateLimitError when rate limited
   */
  async createIssueComment(
    owner: string,
    repo: string,
    issueNumber: number,
    body: string,
  ): Promise<GitHubComment> {
    return await this.retryHandler.execute(async () => {
      const url = `${this.baseUrl}/repos/${owner}/${repo}/issues/${issueNumber}/comments`;
      const response = await this.githubApi.post(
        url,
        { body },
        this.getHeaders(),
      );

      this.handleResponse(response);

      const data = await response.json();
      return {
        id: data.id as number,
        body: data.body as string,
        created_at: data.created_at as string,
        updated_at: data.updated_at as string,
        user: {
          id: data.user.id as number,
          login: data.user.login as string,
        },
        html_url: data.html_url as string,
      };
    });
  }

  /**
   * Update an existing issue comment.
   *
   * @param owner - Repository owner
   * @param repo - Repository name
   * @param commentId - Comment ID to update
   * @param body - Updated comment body in markdown
   * @returns Updated comment
   * @throws GitHubAccessError for authentication/permission errors
   * @throws GitHubRateLimitError when rate limited
   */
  async updateIssueComment(
    owner: string,
    repo: string,
    commentId: number,
    body: string,
  ): Promise<GitHubComment> {
    return await this.retryHandler.execute(async () => {
      const url = `${this.baseUrl}/repos/${owner}/${repo}/issues/comments/${commentId}`;
      const response = await this.githubApi.patch(
        url,
        { body },
        this.getHeaders(),
      );

      this.handleResponse(response);

      const data = await response.json();
      return {
        id: data.id as number,
        body: data.body as string,
        created_at: data.created_at as string,
        updated_at: data.updated_at as string,
        user: {
          id: data.user.id as number,
          login: data.user.login as string,
        },
        html_url: data.html_url as string,
      };
    });
  }

  /**
   * Trigger exploration workflow in regent-exploration-service via workflow_dispatch.
   *
   * Sends a workflow_dispatch event to the exploration service repository
   * which will clone and analyze the target repository, then POST results
   * to the webhook configured via SLACK_WEBHOOK_TRIGGER_URL secret.
   *
   * @param targetRepo - Repository to explore in owner/repo format
   * @param idea - The idea/feature being brainstormed
   * @param sessionId - Session ID for correlation (channel_id:thread_ts format)
   * @throws GitHubAccessError for authentication/permission errors
   * @throws GitHubRateLimitError when rate limited
   */
  async triggerExploration(
    targetRepo: string,
    idea: string,
    sessionId: string,
  ): Promise<void> {
    return await this.retryHandler.execute(async () => {
      // Parse the exploration service repository from configuration
      const [explorationOwner, explorationRepo] = this.explorationServiceRepo.split("/");
      const workflowId = "explore-codebase.yml";

      const url =
        `${this.baseUrl}/repos/${explorationOwner}/${explorationRepo}/actions/workflows/${workflowId}/dispatches`;

      const response = await this.githubApi.post(
        url,
        {
          ref: "main",
          inputs: {
            target_repo: targetRepo,
            idea: idea,
            session_id: sessionId,
          },
        },
        this.getHeaders(),
      );

      // workflow_dispatch returns 204 No Content on success
      if (response.status !== 204) {
        this.handleResponse(response);
      }
    });
  }
}
