// ABOUTME: Repository exploration service that analyzes GitHub repositories.
// ABOUTME: Delegates to GitHubClient for API calls, provides clean abstraction for callers.

import { GitHubClient } from "../clients/github-client.ts";
import { RepositoryContext } from "../types/repository-context.ts";

/**
 * RepositoryExplorer abstracts repository analysis operations.
 *
 * This interface enables dependency injection and provides a clean API
 * for callers that need to explore repository structure, detect frameworks,
 * and extract relevant files for context.
 *
 * Implements Requirements 2.1-2.5 for codebase exploration:
 * - 2.1: Status messaging during exploration (handled by caller)
 * - 2.2: Reading key files (README, manifests, structure)
 * - 2.3: Summary generation (returns context for caller to format)
 * - 2.4: Error handling for access failures
 * - 2.5: Context for questioning phase
 */
export interface RepositoryExplorer {
  /**
   * Explore a GitHub repository and extract context.
   *
   * Reads README, package manifests, and directory structure to build
   * a comprehensive context for brainstorming sessions.
   *
   * @param owner - Repository owner (user or organization)
   * @param repo - Repository name
   * @returns Repository context with framework, patterns, and relevant files
   * @throws GitHubAccessError if token lacks permissions
   * @throws NetworkTimeoutError on transient network failures
   */
  explore(owner: string, repo: string): Promise<RepositoryContext>;
}

/**
 * Implementation of RepositoryExplorer using GitHubClient.
 *
 * This implementation delegates to GitHubClient.exploreRepository() which
 * handles:
 * - README.md extraction
 * - Framework detection from package.json, pyproject.toml, deno.json
 * - Directory structure building
 * - Error handling with proper error types
 * - Retry logic for transient errors via RetryHandler
 *
 * The explorer provides a simplified interface that hides the complexity
 * of GitHub API interactions from higher-level components.
 */
export class RepositoryExplorerImpl implements RepositoryExplorer {
  /**
   * Create a new RepositoryExplorer.
   *
   * @param githubClient - GitHub client for API operations
   */
  constructor(private readonly githubClient: GitHubClient) {}

  /**
   * Explore a GitHub repository and extract context.
   *
   * Delegates to GitHubClient.exploreRepository() which:
   * 1. Reads root directory contents
   * 2. Detects framework from manifests (package.json, pyproject.toml, deno.json)
   * 3. Extracts README.md content if present
   * 4. Builds directory structure tree
   *
   * Missing files are handled gracefully - the context will have empty
   * relevant_files and Unknown framework if no manifests are found.
   *
   * @param owner - Repository owner
   * @param repo - Repository name
   * @returns Complete repository context
   * @throws GitHubAccessError on 401/403 responses
   * @throws NetworkTimeoutError on 5xx responses (retried via RetryHandler)
   */
  async explore(owner: string, repo: string): Promise<RepositoryContext> {
    return await this.githubClient.exploreRepository(owner, repo);
  }
}
