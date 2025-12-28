// ABOUTME: SessionOrchestrator coordinates the /brainstorm command initialization flow.
// ABOUTME: Handles session creation, repository exploration, first question generation, and Q&A loop.

import type { AnthropicClient } from "../clients/anthropic-client.ts";
import type { GitHubClient } from "../clients/github-client.ts";
import type { SlackMessagingClient } from "../clients/messaging-client.ts";
import { BaseError, GitHubAccessError, ValidationError } from "../errors/types.ts";
import type { MessageCache } from "../managers/message-cache.ts";
import type { SessionManager } from "../managers/session-manager.ts";
import type { Message } from "../types/message.ts";
import type { RepositoryContext } from "../types/repository-context.ts";
import { Phase } from "../types/session.ts";
import type { Session } from "../types/session.ts";
import type { SlashCommand } from "../types/slash-command.ts";

/**
 * Confidence threshold for transitioning from questioning to review phase.
 */
const REVIEW_PHASE_THRESHOLD = 95;

/**
 * SessionOrchestrator coordinates the initialization flow for /brainstorm command.
 *
 * Responsibilities:
 * - Post acknowledgment message to Slack thread
 * - Create session record with correct metadata
 * - Explore repository when --repo flag is provided
 * - Generate and post first question from Claude
 * - Execute tool loop for question-answer flow
 * - Handle errors gracefully with fallback to continue without context
 */
export class SessionOrchestrator {
  private readonly sessionManager: SessionManager;
  private readonly githubClient: GitHubClient;
  private readonly anthropicClient: AnthropicClient;
  private readonly messagingClient: SlackMessagingClient;
  private readonly messageCache: MessageCache | null;
  private readonly repositoryContextCache: Map<string, RepositoryContext>;

  /**
   * Create a new SessionOrchestrator.
   *
   * @param sessionManager - Manager for session persistence
   * @param githubClient - Client for GitHub repository exploration
   * @param anthropicClient - Client for Claude question generation
   * @param messagingClient - Client for Slack message posting
   * @param messageCache - Optional message cache for conversation history
   */
  constructor(
    sessionManager: SessionManager,
    githubClient: GitHubClient,
    anthropicClient: AnthropicClient,
    messagingClient: SlackMessagingClient,
    messageCache?: MessageCache,
  ) {
    this.sessionManager = sessionManager;
    this.githubClient = githubClient;
    this.anthropicClient = anthropicClient;
    this.messagingClient = messagingClient;
    this.messageCache = messageCache ?? null;
    this.repositoryContextCache = new Map();
  }

  /**
   * Handle a /brainstorm slash command by initializing a session.
   *
   * Flow:
   * 1. Post acknowledgment message
   * 2. Create session record
   * 3. If --repo provided:
   *    a. Post "Exploring codebase..." status
   *    b. Call GitHubClient.exploreRepository()
   *    c. Post exploration summary
   * 4. Generate and post first question
   *
   * @param command - Parsed slash command from handleSlashCommand
   * @param threadTs - Slack thread timestamp for the session
   */
  async handleSlashCommand(
    command: SlashCommand,
    threadTs: string,
  ): Promise<void> {
    // Step 1: Post acknowledgment message
    await this.postAcknowledgment(command, threadTs);

    // Step 2: Create session record
    await this.sessionManager.createSession(
      command.channelId,
      threadTs,
      command.repository ?? "",
      command.userId,
    );

    // Step 3: Explore repository if provided
    let repositoryContext: RepositoryContext | null = null;
    const sessionId = `${command.channelId}:${threadTs}`;

    if (command.repository) {
      repositoryContext = await this.exploreRepositoryWithErrorHandling(
        command,
        threadTs,
      );

      // Cache repository context for use in tool loop
      if (repositoryContext) {
        this.repositoryContextCache.set(sessionId, repositoryContext);
      }
    }

    // Step 4: Generate and post first question
    await this.generateAndPostFirstQuestion(command, threadTs, repositoryContext);
  }

  /**
   * Post acknowledgment message to Slack thread.
   *
   * @param command - Parsed slash command
   * @param threadTs - Thread timestamp
   */
  private async postAcknowledgment(
    command: SlashCommand,
    threadTs: string,
  ): Promise<void> {
    let message = "Starting brainstorm session...";

    if (command.idea && command.idea.trim().length > 0) {
      message = `Starting brainstorm session for: "${command.idea}"`;
    }

    if (command.repository) {
      message += `\nRepository: \`${command.repository}\``;
    }

    await this.messagingClient.postMessage(
      command.channelId,
      threadTs,
      message,
    );
  }

  /**
   * Explore repository with error handling.
   *
   * If exploration fails (access denied, repo not found), posts an error message
   * and offers to continue without repository context.
   *
   * @param command - Parsed slash command
   * @param threadTs - Thread timestamp
   * @returns Repository context or null if exploration failed
   */
  private async exploreRepositoryWithErrorHandling(
    command: SlashCommand,
    threadTs: string,
  ): Promise<RepositoryContext | null> {
    // Post exploration status
    await this.messagingClient.postMessage(
      command.channelId,
      threadTs,
      "Exploring codebase...",
    );

    try {
      // Parse owner/repo from repository string
      const { owner, repo } = this.parseRepository(command.repository!);

      // Explore repository
      const context = await this.githubClient.exploreRepository(owner, repo);

      // Post exploration summary
      await this.postExplorationSummary(command, threadTs, context);

      return context;
    } catch (error) {
      // Handle validation errors (e.g., invalid repository format) gracefully
      if (error instanceof ValidationError) {
        await this.postValidationError(command, threadTs, error);
        return null;
      }

      // Handle GitHub access errors gracefully
      if (error instanceof GitHubAccessError) {
        await this.postExplorationError(command, threadTs, error);
        return null;
      }

      // Re-throw unexpected errors
      throw error;
    }
  }

  /**
   * Parse owner and repo from repository string.
   *
   * @param repository - Repository in owner/repo format
   * @returns Object with owner and repo fields
   * @throws {ValidationError} If repository format is invalid
   */
  private parseRepository(repository: string): { owner: string; repo: string } {
    const parts = repository.split("/");
    if (parts.length !== 2 || !parts[0] || !parts[1]) {
      throw new ValidationError(
        "Invalid repository format",
        `Repository must be in 'owner/repo' format, got: ${repository}`,
        "Use --repo owner/repo format",
      );
    }
    return {
      owner: parts[0],
      repo: parts[1],
    };
  }

  /**
   * Post exploration summary to Slack thread.
   *
   * @param command - Parsed slash command
   * @param threadTs - Thread timestamp
   * @param context - Repository context from exploration
   */
  private async postExplorationSummary(
    command: SlashCommand,
    threadTs: string,
    context: RepositoryContext,
  ): Promise<void> {
    const lines: string[] = ["Repository analysis complete:"];

    // Add framework if detected
    if (context.framework && context.framework !== "unknown") {
      lines.push(`- Framework: ${context.framework}`);
    }

    // Add patterns if any
    if (context.patterns.length > 0) {
      lines.push(`- Patterns: ${context.patterns.join(", ")}`);
    }

    // Add relevant files count
    if (context.relevant_files.length > 0) {
      lines.push(`- Found ${context.relevant_files.length} relevant files`);
    }

    await this.messagingClient.postMessage(
      command.channelId,
      threadTs,
      lines.join("\n"),
    );
  }

  /**
   * Post exploration error message with offer to continue without context.
   *
   * @param command - Parsed slash command
   * @param threadTs - Thread timestamp
   * @param error - The GitHubAccessError that occurred
   */
  private async postExplorationError(
    command: SlashCommand,
    threadTs: string,
    error: GitHubAccessError,
  ): Promise<void> {
    let message: string;

    if (error.message.toLowerCase().includes("not found")) {
      message = `Could not find repository \`${command.repository}\`. ` +
        "The repository may not exist or may be private.\n\n" +
        "I'll continue without repository context.";
    } else {
      message = `Access denied to repository \`${command.repository}\`. ` +
        "Please verify the repository exists and the bot has access.\n\n" +
        "I'll continue without repository context.";
    }

    await this.messagingClient.postMessage(
      command.channelId,
      threadTs,
      message,
    );
  }

  /**
   * Post validation error message with offer to continue without context.
   *
   * @param command - Parsed slash command
   * @param threadTs - Thread timestamp
   * @param error - The ValidationError that occurred
   */
  private async postValidationError(
    command: SlashCommand,
    threadTs: string,
    error: ValidationError,
  ): Promise<void> {
    const message = `Invalid repository format: \`${command.repository}\`\n\n` +
      `${error.suggestedAction}\n\n` +
      "I'll continue without repository context.";

    await this.messagingClient.postMessage(
      command.channelId,
      threadTs,
      message,
    );
  }

  /**
   * Generate and post the first question from Claude.
   *
   * If the Anthropic API call fails, posts an error message to the thread
   * informing the user about the issue.
   *
   * @param command - Parsed slash command
   * @param threadTs - Thread timestamp
   * @param repositoryContext - Optional repository context from exploration
   */
  private async generateAndPostFirstQuestion(
    command: SlashCommand,
    threadTs: string,
    repositoryContext: RepositoryContext | null,
  ): Promise<void> {
    // Build initial messages with the idea
    const messages: Message[] = [];

    if (command.idea && command.idea.trim().length > 0) {
      messages.push({
        sender: command.userId,
        text: command.idea,
        timestamp: threadTs,
      });
    }

    try {
      // Generate first question from Claude
      const response = await this.anthropicClient.continueConversation(
        messages,
        repositoryContext,
      );

      // Post the question to the thread
      await this.messagingClient.postMessage(
        command.channelId,
        threadTs,
        response.question,
      );
    } catch (error) {
      // Post error message to Slack thread
      await this.postQuestionGenerationError(command, threadTs, error);
    }
  }

  /**
   * Post error message when question generation fails.
   *
   * Uses BaseError.toSlackMessage() for safe Slack display of typed errors.
   *
   * @param command - Parsed slash command
   * @param threadTs - Thread timestamp
   * @param error - The error that occurred
   */
  private async postQuestionGenerationError(
    command: SlashCommand,
    threadTs: string,
    error: unknown,
  ): Promise<void> {
    let message: string;

    if (error instanceof BaseError) {
      message = `Unable to generate the first question.\n\n${error.toSlackMessage()}`;
    } else if (error instanceof Error) {
      message = `Unable to generate the first question.\n\n` +
        `*Error:* ${error.message}\n\n` +
        "Please try again or contact support if the issue persists.";
    } else {
      message = "Unable to generate the first question due to an unexpected error.\n\n" +
        "Please try again or contact support if the issue persists.";
    }

    await this.messagingClient.postMessage(
      command.channelId,
      threadTs,
      message,
    );
  }

  /**
   * Execute Claude Messages API tool loop for question-answer flow.
   *
   * Flow:
   * 1. Append user message to conversation history
   * 2. Call AnthropicClient.continueConversation() with full history
   * 3. Post Claude's question to Slack thread
   * 4. Update session confidence score
   * 5. Transition to review phase if confidence >= 95%
   *
   * @param session - The active session
   * @param userMessage - The user's answer/message
   * @param userId - Slack user ID of the message author (e.g., "U1234567890")
   * @param messageTs - Slack message timestamp (e.g., "1234567890.123456")
   */
  async runToolLoop(
    session: Session,
    userMessage: string,
    userId: string,
    messageTs: string,
  ): Promise<void> {
    // Parse channel ID and thread timestamp from session ID
    const [channelId, threadTs] = session.session_id.split(":");

    try {
      // Step 1: Get message history from cache and append new user message
      const messages = this.buildMessageHistory(session.session_id, userMessage, userId, messageTs);

      // Step 2: Call Anthropic client with message history
      const repositoryContext = this.getRepositoryContext(session);

      const response = await this.anthropicClient.continueConversation(
        messages,
        repositoryContext,
      );

      // Step 3: Append bot response to cache
      this.appendBotMessage(session.session_id, response.question, threadTs);

      // Step 4: Post Claude's question to Slack thread
      await this.messagingClient.postMessage(channelId, threadTs, response.question);

      // Step 5: Update session confidence score
      session.confidence_score = response.confidence_score;

      // Step 6: Check for phase transition
      if (response.confidence_score >= REVIEW_PHASE_THRESHOLD) {
        session.phase = Phase.Review;
      }

      // Persist session updates
      await this.sessionManager.updateSession(session);
    } catch (error) {
      // Post error message to Slack thread so user knows something went wrong
      await this.postToolLoopError(channelId, threadTs, error);
    }
  }

  /**
   * Post error message when tool loop fails.
   *
   * Uses BaseError.toSlackMessage() for safe Slack display of typed errors.
   *
   * @param channelId - Slack channel ID
   * @param threadTs - Thread timestamp
   * @param error - The error that occurred
   */
  private async postToolLoopError(
    channelId: string,
    threadTs: string,
    error: unknown,
  ): Promise<void> {
    let message: string;

    if (error instanceof BaseError) {
      message = `Unable to continue the conversation.\n\n${error.toSlackMessage()}`;
    } else if (error instanceof Error) {
      message = `Unable to continue the conversation.\n\n` +
        `*Error:* ${error.message}\n\n` +
        "Please try again or contact support if the issue persists.";
    } else {
      message = "Unable to continue the conversation due to an unexpected error.\n\n" +
        "Please try again or contact support if the issue persists.";
    }

    await this.messagingClient.postMessage(channelId, threadTs, message);
  }

  /**
   * Build message history from cache and append new user message.
   *
   * @param sessionId - Session identifier
   * @param userMessage - New user message to append
   * @param userId - Slack user ID of the message author
   * @param messageTs - Slack message timestamp
   * @returns Array of messages for Anthropic API
   */
  private buildMessageHistory(
    sessionId: string,
    userMessage: string,
    userId: string,
    messageTs: string,
  ): Message[] {
    // Get existing messages from cache
    const existingMessages = this.messageCache?.get(sessionId) ?? [];

    // Create new user message with actual user ID and timestamp
    const newMessage: Message = {
      sender: userId,
      text: userMessage,
      timestamp: messageTs,
    };

    // Append to cache
    this.messageCache?.append(sessionId, newMessage);

    // Return combined messages
    return [...existingMessages, newMessage];
  }

  /**
   * Append bot response message to cache.
   *
   * @param sessionId - Session identifier
   * @param text - Bot response text
   * @param threadTs - Thread timestamp for ordering
   */
  private appendBotMessage(sessionId: string, text: string, threadTs: string): void {
    const botMessage: Message = {
      sender: "bot",
      text,
      timestamp: threadTs,
    };

    this.messageCache?.append(sessionId, botMessage);
  }

  /**
   * Get repository context for session if available.
   *
   * Retrieves the repository context that was cached during session initialization.
   * Returns null if the session has no associated repository or if context was not cached.
   *
   * @param session - The active session
   * @returns Repository context or null
   */
  private getRepositoryContext(session: Session): RepositoryContext | null {
    return this.repositoryContextCache.get(session.session_id) ?? null;
  }
}
