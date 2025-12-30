// ABOUTME: SessionOrchestrator coordinates the /brainstorm command initialization flow.
// ABOUTME: Handles session creation, repository exploration, first question generation, and Q&A loop.

import type { AnthropicClient } from "../clients/anthropic-client.ts";
import type { GitHubClient } from "../clients/github-client.ts";
import type { SlackMessagingClient } from "../clients/messaging-client.ts";
import { BaseError, GitHubAccessError, ValidationError } from "../errors/types.ts";
import type { CanvasManager } from "../managers/canvas-manager.ts";
import type { MessageCache } from "../managers/message-cache.ts";
import type { SessionManager } from "../managers/session-manager.ts";
import type { Message } from "../types/message.ts";
import type { RelevantFile, RepositoryContext } from "../types/repository-context.ts";
import { Framework } from "../types/repository-context.ts";
import type { ExplorationContext } from "../types/exploration-callback.ts";
import { formatSessionId, parseSessionId, Phase } from "../types/session.ts";
import type { Session } from "../types/session.ts";
import type { SlashCommand } from "../types/slash-command.ts";
import type { ExplorationCallback } from "../types/exploration-callback.ts";
import { isExplorationSuccess } from "../types/exploration-callback.ts";
import type { SpecDocument } from "../types/spec-document.ts";

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
  private readonly canvasManager: CanvasManager | null;

  /**
   * Create a new SessionOrchestrator.
   *
   * @param sessionManager - Manager for session persistence
   * @param githubClient - Client for GitHub repository exploration
   * @param anthropicClient - Client for Claude question generation
   * @param messagingClient - Client for Slack message posting
   * @param messageCache - Optional message cache for conversation history
   * @param canvasManager - Optional Canvas manager for spec display during review
   */
  constructor(
    sessionManager: SessionManager,
    githubClient: GitHubClient,
    anthropicClient: AnthropicClient,
    messagingClient: SlackMessagingClient,
    messageCache?: MessageCache,
    canvasManager?: CanvasManager,
  ) {
    this.sessionManager = sessionManager;
    this.githubClient = githubClient;
    this.anthropicClient = anthropicClient;
    this.messagingClient = messagingClient;
    this.messageCache = messageCache ?? null;
    this.repositoryContextCache = new Map();
    this.canvasManager = canvasManager ?? null;
  }

  /**
   * Handle a /brainstorm slash command by initializing a session.
   *
   * Flow with --repo:
   * 1. Post acknowledgment message
   * 2. Create session in Initializing phase
   * 3. Post "Exploring codebase..." status
   * 4. Trigger async GitHub Actions workflow
   * 5. Return immediately (webhook will continue the flow)
   *
   * Flow without --repo:
   * 1. Post acknowledgment message
   * 2. Create session in Questioning phase
   * 3. Generate and post first question
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

    // Step 2: Determine initial phase based on repo presence
    const initialPhase = command.repository ? Phase.Initializing : Phase.Questioning;

    // Step 3: Create session with appropriate phase
    await this.sessionManager.createSession(
      command.channelId,
      threadTs,
      command.repository ?? "",
      command.userId,
      initialPhase,
    );

    // Step 4: Handle repo vs no-repo flows
    if (command.repository) {
      // Async exploration flow - trigger workflow and return immediately
      await this.startAsyncExploration(command, threadTs);
    } else {
      // Immediate questioning flow (existing behavior)
      await this.generateAndPostFirstQuestion(command, threadTs, null);
    }
  }

  /**
   * Start async exploration by triggering GitHub Actions workflow.
   *
   * Posts a status message and triggers the exploration workflow.
   * Does not wait for exploration to complete - webhook will continue the flow.
   *
   * @param command - Parsed slash command
   * @param threadTs - Thread timestamp
   */
  private async startAsyncExploration(
    command: SlashCommand,
    threadTs: string,
  ): Promise<void> {
    // Validate callback URL configuration
    const callbackUrl = Deno.env.get("EXPLORATION_CALLBACK_URL") ?? "";
    if (!callbackUrl) {
      // Post configuration error and continue without exploration
      await this.messagingClient.postMessage(
        command.channelId,
        threadTs,
        "Exploration is not configured (missing EXPLORATION_CALLBACK_URL).\n\n" +
          "I'll continue without repository context.",
      );
      await this.transitionToQuestioningPhase(command.channelId, threadTs);
      await this.generateAndPostFirstQuestion(command, threadTs, null);
      return;
    }

    // Post "exploring" message
    await this.messagingClient.postMessage(
      command.channelId,
      threadTs,
      "Exploring codebase... (this may take a few minutes)",
    );

    // Trigger exploration workflow
    try {
      const sessionId = formatSessionId(command.channelId, threadTs);

      await this.githubClient.triggerExploration(
        command.repository!,
        command.idea ?? "",
        callbackUrl,
        sessionId,
      );
    } catch (error) {
      // Handle trigger failure gracefully - posts error message and continues without context
      await this.handleExplorationTriggerError(command, threadTs, error);

      // Continue with questioning flow despite the error
      await this.transitionToQuestioningPhase(command.channelId, threadTs);
      await this.generateAndPostFirstQuestion(command, threadTs, null);
    }
  }

  /**
   * Handle exploration workflow trigger error.
   *
   * Posts an error message to Slack and offers to continue without context.
   *
   * @param command - Parsed slash command
   * @param threadTs - Thread timestamp
   * @param error - The error that occurred
   */
  private async handleExplorationTriggerError(
    command: SlashCommand,
    threadTs: string,
    error: unknown,
  ): Promise<void> {
    let message: string;

    if (error instanceof BaseError) {
      message = `Unable to start exploration.\n\n${error.toSlackMessage()}\n\n` +
        "I'll continue without repository context.";
    } else if (error instanceof Error) {
      message = `Unable to start exploration.\n\n` +
        `*Error:* ${error.message}\n\n` +
        "I'll continue without repository context.";
    } else {
      message = "Unable to start exploration due to an unexpected error.\n\n" +
        "I'll continue without repository context.";
    }

    await this.messagingClient.postMessage(command.channelId, threadTs, message);
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

      // Step 6: Check for phase transition to Review
      if (response.confidence_score >= REVIEW_PHASE_THRESHOLD) {
        await this.transitionToReviewPhase(session, channelId, threadTs);
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

  /**
   * Handle exploration result callback from GitHub Actions workflow.
   *
   * Flow:
   * 1. Parse session_id to extract channelId and threadTs
   * 2. Load session from SessionManager
   * 3. If success: store exploration_context, update phase, post summary
   * 4. If error: post error message and offer to continue
   *
   * @param callback - The exploration callback from GitHub Actions
   */
  async handleExplorationResult(callback: ExplorationCallback): Promise<void> {
    // Parse session ID to get channelId and threadTs
    const sessionParts = parseSessionId(callback.session_id);
    if (!sessionParts) {
      // Invalid session ID format - nothing to do
      return;
    }

    const { channelId, threadTs } = sessionParts;

    // Load session
    const session = await this.sessionManager.loadSession(channelId, threadTs);
    if (!session) {
      // Session not found - nothing to do
      return;
    }

    if (isExplorationSuccess(callback)) {
      // Handle success case
      await this.handleExplorationSuccess(callback, session, channelId, threadTs);
    } else {
      // Handle error case - posts message and continues with first question
      await this.handleExplorationFailure(callback, session, channelId, threadTs);
    }
  }

  /**
   * Transition a session from Initializing to Questioning phase.
   *
   * @param channelId - Slack channel ID
   * @param threadTs - Thread timestamp
   */
  private async transitionToQuestioningPhase(
    channelId: string,
    threadTs: string,
  ): Promise<void> {
    const session = await this.sessionManager.loadSession(channelId, threadTs);
    if (session && session.phase === Phase.Initializing) {
      session.phase = Phase.Questioning;
      await this.sessionManager.updateSession(session);
    }
  }

  /**
   * Handle successful exploration callback.
   *
   * @param callback - Success callback with exploration context
   * @param session - The active session
   * @param channelId - Slack channel ID
   * @param threadTs - Thread timestamp
   */
  private async handleExplorationSuccess(
    callback: ExplorationCallback & { status: "success" },
    session: Session,
    channelId: string,
    threadTs: string,
  ): Promise<void> {
    // Convert and store exploration context
    const repositoryContext = this.convertExplorationContext(
      callback.exploration_context,
      session.repository ?? "",
    );
    const sessionId = `${channelId}:${threadTs}`;
    this.repositoryContextCache.set(sessionId, repositoryContext);

    // Post exploration summary
    const summaryMessage = this.formatExplorationSummaryFromCallback(callback);
    await this.messagingClient.postMessage(channelId, threadTs, summaryMessage);

    // Ensure session is in questioning phase
    if (session.phase !== Phase.Questioning) {
      session.phase = Phase.Questioning;
      await this.sessionManager.updateSession(session);
    }

    // Generate and post first question
    await this.generateFirstQuestionFromCallback(
      session,
      channelId,
      threadTs,
      repositoryContext,
    );
  }

  /**
   * Convert ExplorationContext from callback to RepositoryContext format.
   *
   * @param ctx - Exploration context from callback
   * @param repository - Repository name in owner/repo format
   * @returns Converted RepositoryContext
   */
  private convertExplorationContext(
    ctx: ExplorationContext,
    repository: string,
  ): RepositoryContext {
    // Convert key_files to RelevantFile format
    const relevantFiles: RelevantFile[] = (ctx.key_files ?? []).map(
      (path) => ({
        path,
        description: "",
      }),
    );

    return {
      repository,
      framework: Framework.Unknown,
      patterns: ctx.relevant_patterns ?? [],
      relevant_files: relevantFiles,
      structure: ctx.file_tree ?? "",
    };
  }

  /**
   * Generate and post first question after exploration callback.
   *
   * @param _session - The active session (currently unused, reserved for future use)
   * @param channelId - Slack channel ID
   * @param threadTs - Thread timestamp
   * @param repositoryContext - Repository context from exploration, or null if unavailable
   */
  private async generateFirstQuestionFromCallback(
    _session: Session,
    channelId: string,
    threadTs: string,
    repositoryContext: RepositoryContext | null,
  ): Promise<void> {
    try {
      // Build initial messages (empty for callback flow - no initial idea)
      const messages: Message[] = [];

      // Generate first question from Claude
      const response = await this.anthropicClient.continueConversation(
        messages,
        repositoryContext,
      );

      // Post the question to the thread
      await this.messagingClient.postMessage(channelId, threadTs, response.question);
    } catch (error) {
      // Post error message to Slack thread
      await this.postToolLoopError(channelId, threadTs, error);
    }
  }

  /**
   * Format exploration summary from callback context.
   *
   * @param callback - Success callback with exploration context
   * @returns Formatted message string
   */
  private formatExplorationSummaryFromCallback(
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
   * Handle failed exploration callback.
   *
   * Posts an error message and continues with questioning flow without context.
   *
   * @param callback - Error callback with error details
   * @param session - The active session
   * @param channelId - Slack channel ID
   * @param threadTs - Thread timestamp
   */
  private async handleExplorationFailure(
    callback: ExplorationCallback & { status: "error" },
    session: Session,
    channelId: string,
    threadTs: string,
  ): Promise<void> {
    const lines: string[] = [
      `:warning: *Exploration failed*`,
      "",
      `*Error:* ${callback.error.message}`,
      `*Code:* ${callback.error.code}`,
      "",
      "I'll continue without repository context.",
    ];

    await this.messagingClient.postMessage(channelId, threadTs, lines.join("\n"));

    // Transition to questioning phase and generate first question
    if (session.phase !== Phase.Questioning) {
      session.phase = Phase.Questioning;
      await this.sessionManager.updateSession(session);
    }

    // Generate and post first question without repository context
    await this.generateFirstQuestionFromCallback(session, channelId, threadTs, null);
  }

  /**
   * Transition session from Questioning to Review phase.
   *
   * Flow:
   * 1. Synthesize spec from conversation history
   * 2. Create Canvas with spec content
   * 3. Post review instructions
   * 4. Update session phase and canvas_id
   *
   * @param session - The active session
   * @param channelId - Slack channel ID
   * @param threadTs - Thread timestamp
   */
  private async transitionToReviewPhase(
    session: Session,
    channelId: string,
    threadTs: string,
  ): Promise<void> {
    // Get conversation history
    const messages = this.messageCache?.get(session.session_id) ?? [];

    try {
      // Step 1: Synthesize spec from conversation
      const spec = await this.anthropicClient.synthesizeSpec(messages);

      // Step 2: Create Canvas with spec content
      if (this.canvasManager) {
        const canvasId = await this.canvasManager.createCanvas(
          spec,
          threadTs,
          channelId,
        );
        session.canvas_id = canvasId;
      }

      // Step 3: Update session phase
      session.phase = Phase.Review;

      // Step 4: Post review instructions
      await this.postReviewInstructions(channelId, threadTs);
    } catch (error) {
      // Handle synthesis/canvas errors gracefully
      await this.postReviewTransitionError(channelId, threadTs, error);
    }
  }

  /**
   * Post review instructions message to Slack thread.
   *
   * Informs the user that the spec is ready for review and provides
   * guidance on how to provide feedback or approve.
   *
   * @param channelId - Slack channel ID
   * @param threadTs - Thread timestamp
   */
  private async postReviewInstructions(
    channelId: string,
    threadTs: string,
  ): Promise<void> {
    const message = [
      "*Spec Ready for Review*",
      "",
      "I've synthesized your requirements into a specification document. " +
      "Please review the Canvas above.",
      "",
      "To provide feedback, reply with your comments. " +
      'When you\'re satisfied, say "approve" to finalize.',
    ].join("\n");

    await this.messagingClient.postMessage(channelId, threadTs, message);
  }

  /**
   * Post error message when review transition fails.
   *
   * @param channelId - Slack channel ID
   * @param threadTs - Thread timestamp
   * @param error - The error that occurred
   */
  private async postReviewTransitionError(
    channelId: string,
    threadTs: string,
    error: unknown,
  ): Promise<void> {
    let message: string;

    if (error instanceof BaseError) {
      message = `Unable to prepare the spec for review.\n\n${error.toSlackMessage()}`;
    } else if (error instanceof Error) {
      message = `Unable to prepare the spec for review.\n\n` +
        `*Error:* ${error.message}\n\n` +
        "Please try again or contact support if the issue persists.";
    } else {
      message = "Unable to prepare the spec for review due to an unexpected error.\n\n" +
        "Please try again or contact support if the issue persists.";
    }

    await this.messagingClient.postMessage(channelId, threadTs, message);
  }

  /**
   * Handle review feedback from a user.
   *
   * If the feedback is an approval, the spec is finalized.
   * Otherwise, the spec is revised based on the feedback.
   *
   * @param session - The active session in Review phase
   * @param feedbackText - The user's feedback text
   * @param userId - Slack user ID of the feedback author
   * @param messageTs - Slack message timestamp
   */
  async handleReviewFeedback(
    session: Session,
    feedbackText: string,
    _userId: string,
    _messageTs: string,
  ): Promise<void> {
    // Parse channel ID and thread timestamp from session ID
    const [channelId, threadTs] = session.session_id.split(":");

    try {
      // Check if this is an approval
      if (this.isApprovalIntent(feedbackText)) {
        await this.handleApproval(session, channelId, threadTs);
        return;
      }

      // Handle revision feedback
      await this.handleRevisionFeedback(session, channelId, threadTs, feedbackText);
    } catch (error) {
      await this.postReviewFeedbackError(channelId, threadTs, error);
    }
  }

  /**
   * Check if the feedback text indicates approval intent.
   *
   * Uses word boundary matching and checks for negation words to avoid
   * false positives like "I do NOT approve" being detected as approval.
   * Note: "no" is excluded from the negation words list because substring
   * matching would cause false positives with words like "know" or "innovation".
   * Explicit rejections like "No, I don't approve" are handled by "don't".
   *
   * @param feedbackText - The user's feedback text
   * @returns True if the user is approving the spec
   */
  private isApprovalIntent(feedbackText: string): boolean {
    const normalizedText = feedbackText.toLowerCase();

    // Negation words that would negate approval intent.
    // Note: "no" is intentionally excluded because it causes false positives
    // when matching substrings in words like "know", "innovation", etc.
    const negationWords = ["not", "don't", "dont", "do not", "never", "n't"];

    const approvalPhrases = [
      "approve",
      "approved",
      "lgtm",
      "looks good",
      "ship it",
    ];

    // Check if any approval phrase is present
    for (const phrase of approvalPhrases) {
      const phraseIndex = normalizedText.indexOf(phrase);
      if (phraseIndex === -1) {
        continue;
      }

      // Check for negation words before the approval phrase
      const textBeforePhrase = normalizedText.slice(0, phraseIndex);

      // Check if any negation word appears in the 30 characters before the phrase
      // This handles cases like "I do not approve" or "don't approve"
      const recentContext = textBeforePhrase.slice(-30);
      const hasNegation = negationWords.some((negation) =>
        recentContext.includes(negation)
      );

      if (!hasNegation) {
        return true;
      }
    }

    return false;
  }

  /**
   * Handle approval of the spec.
   *
   * @param session - The active session
   * @param channelId - Slack channel ID
   * @param threadTs - Thread timestamp
   */
  private async handleApproval(
    _session: Session,
    channelId: string,
    threadTs: string,
  ): Promise<void> {
    // Post approval confirmation
    await this.messagingClient.postMessage(
      channelId,
      threadTs,
      "Spec approved! Ready for finalization.",
    );
  }

  /**
   * Handle revision feedback for the spec.
   *
   * Flow:
   * 1. Get current spec from Canvas
   * 2. Call reviseSpec with feedback
   * 3. Update Canvas with revised spec
   * 4. Post confirmation
   *
   * @param session - The active session
   * @param channelId - Slack channel ID
   * @param threadTs - Thread timestamp
   * @param feedback - The user's feedback text
   */
  private async handleRevisionFeedback(
    session: Session,
    channelId: string,
    threadTs: string,
    feedback: string,
  ): Promise<void> {
    // Check for canvas_id
    if (!session.canvas_id) {
      await this.messagingClient.postMessage(
        channelId,
        threadTs,
        "Unable to process feedback: Canvas not found. " +
          "The spec may need to be re-synthesized.",
      );
      return;
    }

    if (!this.canvasManager) {
      await this.messagingClient.postMessage(
        channelId,
        threadTs,
        "Unable to process feedback: Canvas manager not configured.",
      );
      return;
    }

    // Get current spec from Canvas
    const currentContent = await this.canvasManager.getCanvasContent(session.canvas_id);

    // Parse the current spec (simplified - assumes well-formed spec)
    const currentSpec = this.parseSpecFromMarkdown(currentContent);

    // Call reviseSpec with feedback
    const revisedSpec = await this.anthropicClient.reviseSpec(currentSpec, feedback);

    // Update Canvas with revised spec
    await this.canvasManager.updateCanvas(session.canvas_id, revisedSpec);

    // Post confirmation
    await this.messagingClient.postMessage(
      channelId,
      threadTs,
      "Spec updated based on your feedback. Please review the changes.",
    );
  }

  /**
   * Parse a SpecDocument from markdown content.
   *
   * This parser extracts all fields from the Canvas markdown format,
   * which follows the Regent brainstorm.md format produced by toMarkdown().
   *
   * @param markdown - Markdown content from Canvas
   * @returns Parsed SpecDocument
   */
  private parseSpecFromMarkdown(markdown: string): SpecDocument {
    // Default empty spec
    const spec: SpecDocument = {
      title: "",
      overview: "",
      problem_statement: "",
      goals: [],
      non_goals: [],
      personas: [],
      use_cases: [],
      technical_details: "",
      open_questions: [],
    };

    // Extract title from first heading
    const titleMatch = markdown.match(/^#\s+(.+)$/m);
    if (titleMatch) {
      spec.title = titleMatch[1];
    }

    // Extract overview section
    const overviewMatch = markdown.match(/##\s+Overview\s*\n\n([\s\S]*?)(?=\n##|$)/i);
    if (overviewMatch) {
      spec.overview = overviewMatch[1].trim();
    }

    // Extract problem statement section
    const problemMatch = markdown.match(/##\s+Problem\s+Statement\s*\n\n([\s\S]*?)(?=\n##|$)/i);
    if (problemMatch) {
      spec.problem_statement = problemMatch[1].trim();
    }

    // Extract goals from "### Goals" subsection
    const goalsMatch = markdown.match(/###\s+Goals\s*\n\n([\s\S]*?)(?=\n###|\n##|$)/i);
    if (goalsMatch) {
      spec.goals = this.parseBulletList(goalsMatch[1]);
    }

    // Extract non-goals from "### Non-Goals" subsection
    const nonGoalsMatch = markdown.match(/###\s+Non-Goals\s*\n\n([\s\S]*?)(?=\n###|\n##|$)/i);
    if (nonGoalsMatch) {
      spec.non_goals = this.parseBulletList(nonGoalsMatch[1]);
    }

    // Extract personas from "## User Personas" section
    const personasMatch = markdown.match(/##\s+User\s+Personas\s*\n\n([\s\S]*?)(?=\n##(?!\s*#)|$)/i);
    if (personasMatch) {
      spec.personas = this.parsePersonas(personasMatch[1]);
    }

    // Extract use cases from "## Use Cases" section
    const useCasesMatch = markdown.match(/##\s+Use\s+Cases\s*\n\n([\s\S]*?)(?=\n##(?!\s*#)|$)/i);
    if (useCasesMatch) {
      spec.use_cases = this.parseUseCases(useCasesMatch[1]);
    }

    // Extract technical details from "## Technical Details" section
    const technicalMatch = markdown.match(/##\s+Technical\s+Details\s*\n\n([\s\S]*?)(?=\n##|$)/i);
    if (technicalMatch) {
      spec.technical_details = technicalMatch[1].trim();
    }

    // Extract open questions from "## Open Questions" section
    const questionsMatch = markdown.match(/##\s+Open\s+Questions\s*\n\n([\s\S]*?)(?=\n##|$)/i);
    if (questionsMatch) {
      spec.open_questions = this.parseBulletList(questionsMatch[1]);
    }

    return spec;
  }

  /**
   * Parse a bulleted list from markdown into an array of strings.
   *
   * @param content - Markdown content containing a bulleted list
   * @returns Array of list items with leading "- " removed
   */
  private parseBulletList(content: string): string[] {
    const lines = content.split("\n");
    const items: string[] = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith("- ")) {
        items.push(trimmed.slice(2));
      }
    }

    return items;
  }

  /**
   * Parse personas from markdown into Persona objects.
   *
   * Expected format:
   * ### Persona Name
   *
   * Description text...
   *
   * @param content - Markdown content containing persona subsections
   * @returns Array of Persona objects
   */
  private parsePersonas(
    content: string,
  ): Array<{ name: string; description: string }> {
    const personas: Array<{ name: string; description: string }> = [];
    const personaRegex = /###\s+(.+?)\s*\n\n([\s\S]*?)(?=\n###|$)/g;

    let match;
    while ((match = personaRegex.exec(content)) !== null) {
      personas.push({
        name: match[1].trim(),
        description: match[2].trim(),
      });
    }

    return personas;
  }

  /**
   * Parse use cases from markdown into UseCase objects.
   *
   * Expected format:
   * ### UC1: Use Case Title
   *
   * Description text...
   *
   * @param content - Markdown content containing use case subsections
   * @returns Array of UseCase objects
   */
  private parseUseCases(
    content: string,
  ): Array<{ id: string; title: string; description: string }> {
    const useCases: Array<{ id: string; title: string; description: string }> = [];
    const useCaseRegex = /###\s+(\w+):\s+(.+?)\s*\n\n([\s\S]*?)(?=\n###|$)/g;

    let match;
    while ((match = useCaseRegex.exec(content)) !== null) {
      useCases.push({
        id: match[1].trim(),
        title: match[2].trim(),
        description: match[3].trim(),
      });
    }

    return useCases;
  }

  /**
   * Post error message when review feedback processing fails.
   *
   * @param channelId - Slack channel ID
   * @param threadTs - Thread timestamp
   * @param error - The error that occurred
   */
  private async postReviewFeedbackError(
    channelId: string,
    threadTs: string,
    error: unknown,
  ): Promise<void> {
    let message: string;

    if (error instanceof BaseError) {
      message = `Unable to process your feedback.\n\n${error.toSlackMessage()}`;
    } else if (error instanceof Error) {
      message = `Unable to process your feedback.\n\n` +
        `*Error:* ${error.message}\n\n` +
        "Please try again or contact support if the issue persists.";
    } else {
      message = "Unable to process your feedback due to an unexpected error.\n\n" +
        "Please try again or contact support if the issue persists.";
    }

    await this.messagingClient.postMessage(channelId, threadTs, message);
  }
}
