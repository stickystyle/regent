// ABOUTME: SecretManager handles secure loading and validation of secrets from environment variables.
// ABOUTME: Implements Property 12 - Secure Credential Storage (secrets only in env vars, never in datastore/logs).

import { ValidationError } from "../errors/types.ts";

/**
 * Environment variable provider function type.
 *
 * Abstracts environment variable access for testability.
 * In production, this wraps Deno.env; in tests, a mock can be provided.
 */
export type EnvProvider = () => Record<string, string | undefined>;

/**
 * Default environment provider using Deno.env.
 *
 * @returns Object with environment variable values
 */
export function defaultEnvProvider(): Record<string, string | undefined> {
  return {
    ANTHROPIC_API_KEY: Deno.env.get("ANTHROPIC_API_KEY"),
    GITHUB_TOKEN: Deno.env.get("GITHUB_TOKEN"),
    EXPLORATION_CALLBACK_URL: Deno.env.get("EXPLORATION_CALLBACK_URL"),
  };
}

/**
 * SecretManager provides secure access to application secrets.
 *
 * This interface abstracts secret management to enable dependency injection
 * and testing with mock implementations.
 */
export interface SecretManager {
  /**
   * Initialize the secret manager by loading and validating secrets.
   *
   * Must be called before accessing any secrets.
   * Throws ValidationError if required secrets are missing or invalid.
   */
  initialize(): void;

  /**
   * Get the Anthropic API key.
   *
   * @returns The API key for Anthropic Claude API
   * @throws Error if called before initialize()
   */
  getAnthropicApiKey(): string;

  /**
   * Get the GitHub personal access token.
   *
   * @returns The GitHub PAT for API access
   * @throws Error if called before initialize()
   */
  getGitHubToken(): string;

  /**
   * Get the exploration callback URL.
   *
   * @returns The URL for exploration service callbacks
   * @throws Error if called before initialize()
   */
  getExplorationCallbackUrl(): string;
}

/**
 * Required environment variable names for the application.
 */
const REQUIRED_SECRETS = [
  "ANTHROPIC_API_KEY",
  "GITHUB_TOKEN",
  "EXPLORATION_CALLBACK_URL",
] as const;

/**
 * SecretManagerImpl loads secrets from Slack environment variables.
 *
 * Security guarantees:
 * - Secrets are loaded only from environment variables (Property 12)
 * - Error messages never contain actual secret values
 * - Fail-fast validation at initialization
 * - Accessors throw if not initialized
 */
export class SecretManagerImpl implements SecretManager {
  private initialized = false;
  private anthropicApiKey: string | null = null;
  private githubToken: string | null = null;
  private explorationCallbackUrl: string | null = null;

  /**
   * Create a new SecretManagerImpl.
   *
   * @param envProvider - Function that returns environment variable values.
   *                      Defaults to reading from Deno.env.
   */
  constructor(private readonly envProvider: EnvProvider = defaultEnvProvider) {}

  /**
   * Initialize the secret manager by loading and validating all required secrets.
   *
   * @throws ValidationError if any required secret is missing or empty
   */
  initialize(): void {
    if (this.initialized) {
      throw new Error("SecretManager is already initialized");
    }

    const env = this.envProvider();

    // Validate all required secrets are present and non-empty
    for (const secretName of REQUIRED_SECRETS) {
      const value = env[secretName];
      if (value === undefined || value === "") {
        throw new ValidationError(
          `Missing required secret: ${secretName}`,
          `The environment variable ${secretName} is not set or is empty`,
          `Configure ${secretName} in your Slack app environment variables`,
        );
      }
    }

    // Store validated secrets
    this.anthropicApiKey = env.ANTHROPIC_API_KEY!;
    this.githubToken = env.GITHUB_TOKEN!;
    this.explorationCallbackUrl = env.EXPLORATION_CALLBACK_URL!;
    this.initialized = true;
  }

  /**
   * Ensure the manager has been initialized.
   *
   * @throws Error if initialize() has not been called
   */
  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error("SecretManager is not initialized. Call initialize() first.");
    }
  }

  /**
   * Get the Anthropic API key.
   *
   * @returns The API key for Anthropic Claude API
   * @throws Error if called before initialize()
   */
  getAnthropicApiKey(): string {
    this.ensureInitialized();
    return this.anthropicApiKey!;
  }

  /**
   * Get the GitHub personal access token.
   *
   * @returns The GitHub PAT for API access
   * @throws Error if called before initialize()
   */
  getGitHubToken(): string {
    this.ensureInitialized();
    return this.githubToken!;
  }

  /**
   * Get the exploration callback URL.
   *
   * @returns The URL for exploration service callbacks
   * @throws Error if called before initialize()
   */
  getExplorationCallbackUrl(): string {
    this.ensureInitialized();
    return this.explorationCallbackUrl!;
  }
}

/**
 * Mock SecretManager for testing.
 *
 * Provides configurable secret values without requiring actual environment variables.
 * Default values are provided for convenience in tests.
 */
export class MockSecretManager implements SecretManager {
  private anthropicApiKey = "mock-anthropic-key";
  private githubToken = "mock-github-token";
  private explorationCallbackUrl = "https://mock.example.com/callback";

  /**
   * No-op initialization for mock.
   *
   * MockSecretManager is always "initialized" with default values.
   */
  initialize(): void {
    // No-op - mock is always ready
  }

  /**
   * Set the Anthropic API key for testing.
   *
   * @param key - The API key to return from getAnthropicApiKey()
   */
  setAnthropicApiKey(key: string): void {
    this.anthropicApiKey = key;
  }

  /**
   * Set the GitHub token for testing.
   *
   * @param token - The token to return from getGitHubToken()
   */
  setGitHubToken(token: string): void {
    this.githubToken = token;
  }

  /**
   * Set the exploration callback URL for testing.
   *
   * @param url - The URL to return from getExplorationCallbackUrl()
   */
  setExplorationCallbackUrl(url: string): void {
    this.explorationCallbackUrl = url;
  }

  /**
   * Get the configured Anthropic API key.
   *
   * @returns The configured API key (default: "mock-anthropic-key")
   */
  getAnthropicApiKey(): string {
    return this.anthropicApiKey;
  }

  /**
   * Get the configured GitHub token.
   *
   * @returns The configured token (default: "mock-github-token")
   */
  getGitHubToken(): string {
    return this.githubToken;
  }

  /**
   * Get the configured exploration callback URL.
   *
   * @returns The configured URL (default: "https://mock.example.com/callback")
   */
  getExplorationCallbackUrl(): string {
    return this.explorationCallbackUrl;
  }

  /**
   * Reset all values to defaults.
   *
   * Useful in test teardown to ensure clean state between tests.
   */
  clear(): void {
    this.anthropicApiKey = "mock-anthropic-key";
    this.githubToken = "mock-github-token";
    this.explorationCallbackUrl = "https://mock.example.com/callback";
  }
}
