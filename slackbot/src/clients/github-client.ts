// ABOUTME: GitHub client for repository exploration, PR creation, and access validation.
// ABOUTME: Implements Property 5 (access validation) and Property 11 (retry with exponential backoff).

import { RetryHandler } from "../errors/retry.ts";
import type { RetryConfig } from "../errors/retry.ts";
import { GitHubAccessError, GitHubRateLimitError, NetworkTimeoutError } from "../errors/types.ts";
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
   * Clear all configured errors.
   */
  clear(): void {
    this.exploreError = null;
    this.checkAccessError = null;
    this.getDefaultBranchError = null;
    this.createPullRequestError = null;
  }

  checkAccess(_owner: string, _repo: string): Promise<boolean> {
    if (this.checkAccessError !== null) {
      return Promise.reject(this.checkAccessError);
    }
    return Promise.resolve(true);
  }

  exploreRepository(owner: string, repo: string): Promise<RepositoryContext> {
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
   * @param githubApi - GitHub API object with get/post methods
   * @param token - GitHub personal access token
   * @param retryConfig - Optional retry configuration (defaults to 3 attempts)
   */
  constructor(
    private readonly githubApi: {
      get: (url: string, headers?: Record<string, string>) => Promise<Response>;
      post: (
        url: string,
        body: unknown,
        headers?: Record<string, string>,
      ) => Promise<Response>;
    },
    private readonly token: string,
    retryConfig?: Partial<RetryConfig>,
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
}
