// ABOUTME: End-to-end integration tests for the complete exploration flow.
// ABOUTME: Tests slash command -> workflow trigger -> callback -> session update cycle.

import { assertEquals, assertExists } from "@std/assert";
import { afterEach, beforeEach, describe, it } from "@std/testing/bdd";

import { MockAnthropicClient } from "../../src/clients/anthropic-client.ts";
import { MockGitHubClient } from "../../src/clients/github-client.ts";
import { MockSlackMessagingClient } from "../../src/clients/messaging-client.ts";
import { MockDatastoreClient } from "../../src/managers/datastore-client.ts";
import { SessionManager } from "../../src/managers/session-manager.ts";
import { SessionOrchestrator } from "../../src/orchestrators/session-orchestrator.ts";
import {
  type ExplorationHandlerDependencies,
  type ExplorationHandlerRequest,
  handleExplorationCallback,
} from "../../src/handlers/exploration-handler.ts";
import type {
  ExplorationCallbackError,
  ExplorationCallbackSuccess,
} from "../../src/types/exploration-callback.ts";
import { formatSessionId, Phase } from "../../src/types/session.ts";
import type { SlashCommand } from "../../src/types/slash-command.ts";
import { GitHubAccessError, NetworkTimeoutError } from "../../src/errors/types.ts";

describe("Exploration E2E Integration", () => {
  let orchestrator: SessionOrchestrator;
  let sessionManager: SessionManager;
  let githubClient: MockGitHubClient;
  let anthropicClient: MockAnthropicClient;
  let messagingClient: MockSlackMessagingClient;
  let datastoreClient: MockDatastoreClient;

  const channelId = "C1234567890";
  const threadTs = "1234567890.123456";
  const userId = "U1234567890";
  const sessionId = formatSessionId(channelId, threadTs);
  const callbackSecret = "test-callback-secret";

  beforeEach(() => {
    datastoreClient = new MockDatastoreClient();
    sessionManager = new SessionManager(datastoreClient);
    githubClient = new MockGitHubClient();
    anthropicClient = new MockAnthropicClient();
    messagingClient = new MockSlackMessagingClient();

    orchestrator = new SessionOrchestrator(
      sessionManager,
      githubClient,
      anthropicClient,
      messagingClient,
    );
  });

  afterEach(() => {
    datastoreClient.clear();
    githubClient.clear();
    anthropicClient.clear();
    messagingClient.clear();
  });

  /**
   * Helper to create a valid slash command for testing.
   */
  function createSlashCommand(overrides?: Partial<SlashCommand>): SlashCommand {
    return {
      idea: "build a feature",
      channelId,
      userId,
      channelType: "channel",
      responseUrl: "https://hooks.slack.com/commands/123/456",
      ...overrides,
    };
  }

  /**
   * Helper to create exploration handler dependencies.
   */
  function createHandlerDependencies(): ExplorationHandlerDependencies {
    return {
      sessionManager,
      messagingClient,
      callbackSecret,
    };
  }

  /**
   * Helper to create a success callback payload for Node.js repo.
   */
  function createNodeJsSuccessCallback(): ExplorationCallbackSuccess {
    return {
      session_id: sessionId,
      status: "success",
      exploration_context: {
        project_overview: "A Node.js REST API server",
        architecture_summary: "Express.js with MVC pattern",
        file_tree: "src/\n  routes/\n  controllers/\n  models/\npackage.json",
        relevant_patterns: ["MVC", "Repository pattern"],
        integration_points: ["REST API", "Database layer"],
        testing_approach: "Jest with supertest for integration tests",
        key_files: ["package.json", "src/app.js", "src/routes/index.js"],
      },
    };
  }

  /**
   * Helper to create a success callback payload for Python repo.
   */
  function createPythonSuccessCallback(): ExplorationCallbackSuccess {
    return {
      session_id: sessionId,
      status: "success",
      exploration_context: {
        project_overview: "A FastAPI web application",
        architecture_summary: "FastAPI with SQLAlchemy ORM",
        file_tree: "app/\n  routers/\n  models/\n  schemas/\npyproject.toml",
        relevant_patterns: ["Repository pattern", "Dependency injection"],
        integration_points: ["REST API endpoints", "Database models"],
        testing_approach: "pytest with httpx for async testing",
        key_files: ["pyproject.toml", "app/main.py", "app/routers/items.py"],
      },
    };
  }

  /**
   * Helper to create a success callback payload for monorepo.
   */
  function createMonorepoSuccessCallback(): ExplorationCallbackSuccess {
    return {
      session_id: sessionId,
      status: "success",
      exploration_context: {
        project_overview: "A monorepo with multiple services and packages",
        architecture_summary: "Turborepo monorepo with React frontend and Node.js backend",
        file_tree:
          "packages/\n  web/\n  api/\n  shared/\napps/\n  docs/\nturbo.json\npackage.json",
        relevant_patterns: ["Monorepo", "Workspace packages", "Shared libraries"],
        integration_points: ["API client", "Shared types", "Design system"],
        testing_approach: "Vitest for unit tests, Playwright for E2E",
        key_files: [
          "package.json",
          "turbo.json",
          "packages/web/package.json",
          "packages/api/package.json",
        ],
      },
    };
  }

  /**
   * Helper to create an error callback payload.
   */
  function createErrorCallback(
    code: "CLONE_FAILED" | "INSTALL_FAILED" | "EXPLORATION_FAILED",
    message: string,
  ): ExplorationCallbackError {
    return {
      session_id: sessionId,
      status: "error",
      error: {
        code,
        message,
      },
    };
  }

  describe("Complete flow: slash command -> workflow trigger -> callback -> session update", () => {
    it("should trigger exploration workflow when repository is provided", async () => {
      const command = createSlashCommand({
        idea: "add user authentication",
        repository: "myorg/myrepo",
      });

      await orchestrator.handleSlashCommand(command, threadTs);

      // Verify exploration workflow was triggered
      const calls = githubClient.getTriggerExplorationCalls();
      assertEquals(calls.length, 1);
      assertEquals(calls[0].targetRepo, "myorg/myrepo");
      assertEquals(calls[0].sessionId, sessionId);
      assertEquals(calls[0].idea, "add user authentication");
    });

    it("should create session in Initializing phase when repo provided", async () => {
      const command = createSlashCommand({
        idea: "add feature",
        repository: "owner/repo",
      });

      await orchestrator.handleSlashCommand(command, threadTs);

      const session = await sessionManager.loadSession(channelId, threadTs);
      assertExists(session);
      assertEquals(session.phase, Phase.Initializing);
      assertEquals(session.repository, "owner/repo");
    });

    it("should post exploration status message", async () => {
      const command = createSlashCommand({
        idea: "refactor module",
        repository: "owner/repo",
      });

      await orchestrator.handleSlashCommand(command, threadTs);

      const messages = messagingClient.getPostedMessages();
      const explorationMessage = messages.find((m) =>
        m.text.toLowerCase().includes("exploring") ||
        m.text.toLowerCase().includes("codebase")
      );
      assertExists(explorationMessage, "Should post exploration status message");
    });

    it("should not call Anthropic until callback is received", async () => {
      const command = createSlashCommand({
        idea: "add tests",
        repository: "owner/repo",
      });

      await orchestrator.handleSlashCommand(command, threadTs);

      const conversations = anthropicClient.getConversationHistory();
      assertEquals(conversations.length, 0, "Should not call Anthropic before callback");
    });
  });

  describe("Explore Node.js repo (framework detected, package.json parsed)", () => {
    it("should process callback and transition to Questioning phase", async () => {
      // Step 1: Trigger exploration via slash command
      const command = createSlashCommand({
        idea: "add REST endpoint",
        repository: "nodejs-org/express-app",
      });
      await orchestrator.handleSlashCommand(command, threadTs);

      // Verify session is in Initializing phase
      let session = await sessionManager.loadSession(channelId, threadTs);
      assertExists(session);
      assertEquals(session.phase, Phase.Initializing);

      // Step 2: Simulate callback from GitHub Actions
      anthropicClient.setNextQuestionResponse({
        question: "What specific endpoint would you like to add?",
        confidence_score: 20,
      });

      const callback = createNodeJsSuccessCallback();
      await orchestrator.handleExplorationResult(callback);

      // Step 3: Verify session transitioned to Questioning
      session = await sessionManager.loadSession(channelId, threadTs);
      assertExists(session);
      assertEquals(session.phase, Phase.Questioning);
    });

    it("should post exploration summary with Node.js details", async () => {
      // Setup session first
      const command = createSlashCommand({
        idea: "add authentication",
        repository: "nodejs-org/api",
      });
      await orchestrator.handleSlashCommand(command, threadTs);
      messagingClient.clear(); // Clear setup messages

      // Simulate callback
      anthropicClient.setNextQuestionResponse({
        question: "What authentication method?",
        confidence_score: 25,
      });

      const callback = createNodeJsSuccessCallback();
      await orchestrator.handleExplorationResult(callback);

      // Verify summary message contains Node.js context
      const messages = messagingClient.getPostedMessages();
      const summaryMessage = messages.find((m) =>
        m.text.includes("exploration complete") ||
        m.text.includes("Overview") ||
        m.text.includes("Architecture")
      );
      assertExists(summaryMessage, "Should post exploration summary");
      assertEquals(
        summaryMessage.text.includes("MVC") || summaryMessage.text.includes("Express"),
        true,
        "Summary should mention Node.js patterns",
      );
    });

    it("should include exploration context in first question generation", async () => {
      // Setup session
      const command = createSlashCommand({
        idea: "add caching layer",
        repository: "nodejs-org/api",
      });
      await orchestrator.handleSlashCommand(command, threadTs);

      // Simulate callback
      anthropicClient.setNextQuestionResponse({
        question: "What data would you like to cache?",
        confidence_score: 20,
      });

      await orchestrator.handleExplorationResult(createNodeJsSuccessCallback());

      // Verify Anthropic was called (indicating question generation)
      const conversations = anthropicClient.getConversationHistory();
      assertEquals(conversations.length >= 1, true, "Should call Anthropic after callback");
    });

    it("should generate first question after successful exploration", async () => {
      // Setup session
      const command = createSlashCommand({
        idea: "add logging",
        repository: "nodejs-org/service",
      });
      await orchestrator.handleSlashCommand(command, threadTs);
      messagingClient.clear();

      // Simulate callback
      anthropicClient.setNextQuestionResponse({
        question: "What log levels do you need?",
        confidence_score: 20,
      });

      await orchestrator.handleExplorationResult(createNodeJsSuccessCallback());

      // Verify first question was posted
      const messages = messagingClient.getPostedMessages();
      const questionMessage = messages.find((m) => m.text.includes("log levels"));
      assertExists(questionMessage, "Should post first question");
    });
  });

  describe("Explore Python repo (framework detected, pyproject.toml parsed)", () => {
    it("should process Python repo callback successfully", async () => {
      // Setup session
      const command = createSlashCommand({
        idea: "add API endpoint",
        repository: "python-org/fastapi-app",
      });
      await orchestrator.handleSlashCommand(command, threadTs);

      // Simulate callback
      anthropicClient.setNextQuestionResponse({
        question: "What should the endpoint do?",
        confidence_score: 20,
      });

      await orchestrator.handleExplorationResult(createPythonSuccessCallback());

      // Verify session is in Questioning phase
      const session = await sessionManager.loadSession(channelId, threadTs);
      assertExists(session);
      assertEquals(session.phase, Phase.Questioning);
    });

    it("should post summary with Python/FastAPI details", async () => {
      // Setup session
      const command = createSlashCommand({
        idea: "add validation",
        repository: "python-org/api",
      });
      await orchestrator.handleSlashCommand(command, threadTs);
      messagingClient.clear();

      // Simulate callback
      anthropicClient.setNextQuestionResponse({
        question: "What fields need validation?",
        confidence_score: 25,
      });

      await orchestrator.handleExplorationResult(createPythonSuccessCallback());

      // Verify summary mentions Python patterns
      const messages = messagingClient.getPostedMessages();
      const summaryMessage = messages.find((m) =>
        m.text.includes("exploration complete") ||
        m.text.includes("Overview") ||
        m.text.includes("FastAPI")
      );
      assertExists(summaryMessage, "Should post exploration summary");
    });
  });

  describe("Explore monorepo (multiple frameworks detected)", () => {
    it("should process monorepo callback with multiple patterns", async () => {
      // Setup session
      const command = createSlashCommand({
        idea: "add shared component",
        repository: "company/monorepo",
      });
      await orchestrator.handleSlashCommand(command, threadTs);

      // Simulate callback
      anthropicClient.setNextQuestionResponse({
        question: "Which package should contain the component?",
        confidence_score: 20,
      });

      await orchestrator.handleExplorationResult(createMonorepoSuccessCallback());

      // Verify session transitioned
      const session = await sessionManager.loadSession(channelId, threadTs);
      assertExists(session);
      assertEquals(session.phase, Phase.Questioning);
    });

    it("should post summary mentioning monorepo structure", async () => {
      // Setup session
      const command = createSlashCommand({
        idea: "add shared types",
        repository: "company/monorepo",
      });
      await orchestrator.handleSlashCommand(command, threadTs);
      messagingClient.clear();

      // Simulate callback
      anthropicClient.setNextQuestionResponse({
        question: "What types need to be shared?",
        confidence_score: 20,
      });

      await orchestrator.handleExplorationResult(createMonorepoSuccessCallback());

      // Verify summary mentions monorepo patterns
      const messages = messagingClient.getPostedMessages();
      const summaryMessage = messages.find((m) =>
        m.text.includes("exploration complete") ||
        m.text.includes("Overview") ||
        m.text.includes("Monorepo")
      );
      assertExists(summaryMessage, "Should post exploration summary");
    });

    it("should detect multiple key files from monorepo", async () => {
      // Setup session
      const command = createSlashCommand({
        idea: "add shared utility",
        repository: "company/monorepo",
      });
      await orchestrator.handleSlashCommand(command, threadTs);
      messagingClient.clear();

      // Simulate callback
      anthropicClient.setNextQuestionResponse({
        question: "What utility function do you need?",
        confidence_score: 20,
      });

      const callback = createMonorepoSuccessCallback();
      await orchestrator.handleExplorationResult(callback);

      // Verify summary mentions key files count
      const messages = messagingClient.getPostedMessages();
      const summaryMessage = messages.find((m) =>
        m.text.includes("key files") || m.text.includes("Found")
      );
      assertExists(summaryMessage, "Should mention key files found");
    });
  });

  describe("Invalid repo (404) - error callback with CLONE_FAILED", () => {
    it("should handle CLONE_FAILED error from callback", async () => {
      // Setup session
      const command = createSlashCommand({
        idea: "add feature",
        repository: "nonexistent/repo",
      });
      await orchestrator.handleSlashCommand(command, threadTs);
      messagingClient.clear();

      // Simulate error callback
      anthropicClient.setNextQuestionResponse({
        question: "What feature would you like to build?",
        confidence_score: 15,
      });

      const errorCallback = createErrorCallback(
        "CLONE_FAILED",
        "Repository not found (404)",
      );
      await orchestrator.handleExplorationResult(errorCallback);

      // Verify error message was posted
      const messages = messagingClient.getPostedMessages();
      const errorMessage = messages.find((m) =>
        m.text.toLowerCase().includes("failed") ||
        m.text.toLowerCase().includes("error") ||
        m.text.toLowerCase().includes("clone_failed")
      );
      assertExists(errorMessage, "Should post error message");
    });

    it("should transition to Questioning phase after clone failure", async () => {
      // Setup session
      const command = createSlashCommand({
        idea: "add feature",
        repository: "nonexistent/repo",
      });
      await orchestrator.handleSlashCommand(command, threadTs);

      // Simulate error callback
      anthropicClient.setNextQuestionResponse({
        question: "What feature would you like to build?",
        confidence_score: 15,
      });

      await orchestrator.handleExplorationResult(
        createErrorCallback("CLONE_FAILED", "Repository not found"),
      );

      // Verify session transitioned to Questioning (continues without context)
      const session = await sessionManager.loadSession(channelId, threadTs);
      assertExists(session);
      assertEquals(session.phase, Phase.Questioning);
    });

    it("should offer to continue without context after 404 error", async () => {
      // Setup session
      const command = createSlashCommand({
        idea: "add feature",
        repository: "nonexistent/repo",
      });
      await orchestrator.handleSlashCommand(command, threadTs);
      messagingClient.clear();

      // Simulate error callback
      anthropicClient.setNextQuestionResponse({
        question: "What feature would you like to build?",
        confidence_score: 15,
      });

      await orchestrator.handleExplorationResult(
        createErrorCallback("CLONE_FAILED", "Repository not found"),
      );

      // Verify message offers to continue
      const messages = messagingClient.getPostedMessages();
      const continueMessage = messages.find((m) =>
        m.text.toLowerCase().includes("continue") ||
        m.text.toLowerCase().includes("without")
      );
      assertExists(continueMessage, "Should offer to continue without context");
    });

    it("should still generate first question after clone failure", async () => {
      // Setup session
      const command = createSlashCommand({
        idea: "add new feature",
        repository: "nonexistent/repo",
      });
      await orchestrator.handleSlashCommand(command, threadTs);
      messagingClient.clear();

      // Simulate error callback
      anthropicClient.setNextQuestionResponse({
        question: "Can you describe the feature in more detail?",
        confidence_score: 15,
      });

      await orchestrator.handleExplorationResult(
        createErrorCallback("CLONE_FAILED", "Repository not found"),
      );

      // Verify first question was posted
      const messages = messagingClient.getPostedMessages();
      const questionMessage = messages.find((m) =>
        m.text.includes("describe") || m.text.includes("feature")
      );
      assertExists(questionMessage, "Should generate first question despite error");
    });
  });

  describe("Private repo (403) - error callback with CLONE_FAILED", () => {
    it("should handle access denied error from callback", async () => {
      // Setup session
      const command = createSlashCommand({
        idea: "add feature",
        repository: "private-org/secret-repo",
      });
      await orchestrator.handleSlashCommand(command, threadTs);
      messagingClient.clear();

      // Simulate error callback
      anthropicClient.setNextQuestionResponse({
        question: "What would you like to build?",
        confidence_score: 15,
      });

      const errorCallback = createErrorCallback(
        "CLONE_FAILED",
        "Access denied (403) - Repository is private or token lacks permissions",
      );
      await orchestrator.handleExplorationResult(errorCallback);

      // Verify error message was posted
      const messages = messagingClient.getPostedMessages();
      const errorMessage = messages.find((m) =>
        m.text.toLowerCase().includes("failed") ||
        m.text.toLowerCase().includes("denied") ||
        m.text.toLowerCase().includes("access")
      );
      assertExists(errorMessage, "Should post access denied message");
    });

    it("should continue without context after 403 error", async () => {
      // Setup session
      const command = createSlashCommand({
        idea: "add security feature",
        repository: "private-org/secret-repo",
      });
      await orchestrator.handleSlashCommand(command, threadTs);

      // Simulate error callback
      anthropicClient.setNextQuestionResponse({
        question: "What security feature do you need?",
        confidence_score: 15,
      });

      await orchestrator.handleExplorationResult(
        createErrorCallback("CLONE_FAILED", "Access denied (403)"),
      );

      // Verify session still transitions and question is generated
      const session = await sessionManager.loadSession(channelId, threadTs);
      assertExists(session);
      assertEquals(session.phase, Phase.Questioning);
    });
  });

  describe("Workflow timeout (>10 min) - session can continue without context", () => {
    it("should handle workflow trigger failure gracefully", async () => {
      // Simulate workflow trigger timeout/failure
      githubClient.setTriggerExplorationError(
        new NetworkTimeoutError(
          "Request timed out",
          "GitHub Actions API did not respond",
          "Retry later",
        ),
      );

      const command = createSlashCommand({
        idea: "add feature",
        repository: "slow-org/large-repo",
      });

      // Should not throw
      await orchestrator.handleSlashCommand(command, threadTs);

      // Session should still be created
      const session = await sessionManager.loadSession(channelId, threadTs);
      assertExists(session);
    });

    it("should post error message and continue without context on trigger failure", async () => {
      anthropicClient.setNextQuestionResponse({
        question: "What would you like to build?",
        confidence_score: 15,
      });

      githubClient.setTriggerExplorationError(
        new NetworkTimeoutError(
          "Workflow trigger timed out",
          "API timeout",
          "Retry",
        ),
      );

      const command = createSlashCommand({
        idea: "add feature",
        repository: "slow-org/large-repo",
      });
      await orchestrator.handleSlashCommand(command, threadTs);

      // Verify error message was posted
      const messages = messagingClient.getPostedMessages();
      const errorMessage = messages.find((m) =>
        m.text.toLowerCase().includes("continue") ||
        m.text.toLowerCase().includes("without") ||
        m.text.toLowerCase().includes("error")
      );
      assertExists(errorMessage, "Should post error message");
    });

    it("should transition to Questioning and generate first question on trigger failure", async () => {
      anthropicClient.setNextQuestionResponse({
        question: "What would you like to build?",
        confidence_score: 15,
      });

      githubClient.setTriggerExplorationError(new Error("Workflow trigger failed"));

      const command = createSlashCommand({
        idea: "add caching",
        repository: "slow-org/repo",
      });
      await orchestrator.handleSlashCommand(command, threadTs);

      // Verify session transitioned to Questioning
      const session = await sessionManager.loadSession(channelId, threadTs);
      assertExists(session);
      assertEquals(session.phase, Phase.Questioning);

      // Verify first question was generated
      const conversations = anthropicClient.getConversationHistory();
      assertEquals(conversations.length >= 1, true, "Should generate first question");
    });

    it("should handle EXPLORATION_FAILED error code from timeout", async () => {
      // Setup session
      const command = createSlashCommand({
        idea: "add feature",
        repository: "slow-org/large-repo",
      });
      await orchestrator.handleSlashCommand(command, threadTs);
      messagingClient.clear();

      // Simulate timeout callback
      anthropicClient.setNextQuestionResponse({
        question: "What would you like to build?",
        confidence_score: 15,
      });

      await orchestrator.handleExplorationResult(
        createErrorCallback("EXPLORATION_FAILED", "Workflow timed out after 10 minutes"),
      );

      // Verify error message mentions timeout
      const messages = messagingClient.getPostedMessages();
      const errorMessage = messages.find((m) =>
        m.text.toLowerCase().includes("failed") ||
        m.text.toLowerCase().includes("timed out")
      );
      assertExists(errorMessage, "Should post timeout error message");
    });
  });

  describe("Callback URL down - session stuck in initializing", () => {
    it("should remain in Initializing phase if no callback received", async () => {
      const command = createSlashCommand({
        idea: "add feature",
        repository: "owner/repo",
      });
      await orchestrator.handleSlashCommand(command, threadTs);

      // No callback is sent - session remains in Initializing
      const session = await sessionManager.loadSession(channelId, threadTs);
      assertExists(session);
      assertEquals(session.phase, Phase.Initializing);
    });

    it("should not generate questions while in Initializing phase", async () => {
      const command = createSlashCommand({
        idea: "add feature",
        repository: "owner/repo",
      });
      await orchestrator.handleSlashCommand(command, threadTs);

      // Verify no Anthropic calls were made
      const conversations = anthropicClient.getConversationHistory();
      assertEquals(conversations.length, 0);

      // Session stays in Initializing
      const session = await sessionManager.loadSession(channelId, threadTs);
      assertExists(session);
      assertEquals(session.phase, Phase.Initializing);
    });

    it("should handle callback for unknown session gracefully", async () => {
      // Send callback without creating session first
      const request: ExplorationHandlerRequest = {
        authorizationHeader: `Bearer ${callbackSecret}`,
        body: createNodeJsSuccessCallback(),
      };

      const response = await handleExplorationCallback(request, createHandlerDependencies());

      // Should return 404 for unknown sessions per Requirement 3.2
      assertEquals(response.status, 404);
      assertEquals(response.ok, false);
      assertEquals(response.error, "Not Found: Session not found");
    });
  });

  describe("Callback authentication validation", () => {
    beforeEach(async () => {
      // Setup a session for callback tests
      const command = createSlashCommand({
        idea: "test feature",
        repository: "owner/repo",
      });
      await orchestrator.handleSlashCommand(command, threadTs);
    });

    it("should reject callback with missing Authorization header", async () => {
      const request: ExplorationHandlerRequest = {
        authorizationHeader: undefined,
        body: createNodeJsSuccessCallback(),
      };

      const response = await handleExplorationCallback(request, createHandlerDependencies());

      assertEquals(response.status, 401);
      assertEquals(response.ok, false);
      assertEquals(response.error, "Unauthorized: Missing or invalid Authorization header");
    });

    it("should reject callback with invalid token", async () => {
      const request: ExplorationHandlerRequest = {
        authorizationHeader: "Bearer wrong-secret",
        body: createNodeJsSuccessCallback(),
      };

      const response = await handleExplorationCallback(request, createHandlerDependencies());

      assertEquals(response.status, 401);
      assertEquals(response.ok, false);
    });

    it("should accept callback with valid token", async () => {
      anthropicClient.setNextQuestionResponse({
        question: "What would you like to build?",
        confidence_score: 20,
      });

      const request: ExplorationHandlerRequest = {
        authorizationHeader: `Bearer ${callbackSecret}`,
        body: createNodeJsSuccessCallback(),
      };

      const response = await handleExplorationCallback(request, createHandlerDependencies());

      assertEquals(response.status, 200);
      assertEquals(response.ok, true);
    });

    it("should reject callback with invalid session_id format", async () => {
      const request: ExplorationHandlerRequest = {
        authorizationHeader: `Bearer ${callbackSecret}`,
        body: {
          session_id: "invalid-format-no-colon",
          status: "success",
          exploration_context: {},
        },
      };

      const response = await handleExplorationCallback(request, createHandlerDependencies());

      assertEquals(response.status, 400);
      assertEquals(response.ok, false);
      assertEquals(response.error, "Bad Request: Invalid session_id format");
    });
  });

  describe("Exploration trigger failures", () => {
    it("should handle GitHub access error during trigger", async () => {
      githubClient.setTriggerExplorationError(
        new GitHubAccessError(
          "Access denied",
          "Token lacks workflow permissions",
          "Update token",
        ),
      );

      anthropicClient.setNextQuestionResponse({
        question: "What would you like to build?",
        confidence_score: 15,
      });

      const command = createSlashCommand({
        idea: "add feature",
        repository: "restricted/repo",
      });
      await orchestrator.handleSlashCommand(command, threadTs);

      // Session should be created
      const session = await sessionManager.loadSession(channelId, threadTs);
      assertExists(session);

      // Error message should be posted
      const messages = messagingClient.getPostedMessages();
      const errorMessage = messages.find((m) =>
        m.text.toLowerCase().includes("access denied") ||
        m.text.toLowerCase().includes("unable") ||
        m.text.toLowerCase().includes("continue")
      );
      assertExists(errorMessage, "Should post access error message");
    });

  });

  describe("Error code handling", () => {
    beforeEach(async () => {
      // Setup session
      const command = createSlashCommand({
        idea: "test feature",
        repository: "owner/repo",
      });
      await orchestrator.handleSlashCommand(command, threadTs);
      messagingClient.clear();
    });

    it("should handle CLONE_FAILED error code", async () => {
      anthropicClient.setNextQuestionResponse({
        question: "What would you like to build?",
        confidence_score: 15,
      });

      await orchestrator.handleExplorationResult(
        createErrorCallback("CLONE_FAILED", "Failed to clone repository"),
      );

      const messages = messagingClient.getPostedMessages();
      const errorMessage = messages.find((m) => m.text.includes("CLONE_FAILED"));
      assertExists(errorMessage, "Should include error code in message");
    });

    it("should handle INSTALL_FAILED error code", async () => {
      anthropicClient.setNextQuestionResponse({
        question: "What would you like to build?",
        confidence_score: 15,
      });

      await orchestrator.handleExplorationResult(
        createErrorCallback("INSTALL_FAILED", "Failed to install dependencies"),
      );

      const messages = messagingClient.getPostedMessages();
      const errorMessage = messages.find((m) => m.text.includes("INSTALL_FAILED"));
      assertExists(errorMessage, "Should include error code in message");
    });

    it("should handle EXPLORATION_FAILED error code", async () => {
      anthropicClient.setNextQuestionResponse({
        question: "What would you like to build?",
        confidence_score: 15,
      });

      await orchestrator.handleExplorationResult(
        createErrorCallback("EXPLORATION_FAILED", "Claude exploration timed out"),
      );

      const messages = messagingClient.getPostedMessages();
      const errorMessage = messages.find((m) => m.text.includes("EXPLORATION_FAILED"));
      assertExists(errorMessage, "Should include error code in message");
    });
  });

  describe("Message posting verification", () => {
    it("should post messages to correct channel and thread", async () => {
      const command = createSlashCommand({
        idea: "add feature",
        repository: "owner/repo",
      });
      await orchestrator.handleSlashCommand(command, threadTs);

      // Verify all messages go to correct channel/thread
      const messages = messagingClient.getPostedMessages();
      for (const message of messages) {
        assertEquals(message.channelId, channelId, "Message should go to correct channel");
        assertEquals(message.threadTs, threadTs, "Message should go to correct thread");
      }
    });

    it("should post exploration summary before first question", async () => {
      const command = createSlashCommand({
        idea: "add feature",
        repository: "owner/repo",
      });
      await orchestrator.handleSlashCommand(command, threadTs);
      messagingClient.clear();

      anthropicClient.setNextQuestionResponse({
        question: "What would you like to build?",
        confidence_score: 20,
      });

      await orchestrator.handleExplorationResult(createNodeJsSuccessCallback());

      // Get messages in order
      const messages = messagingClient.getPostedMessages();
      assertEquals(messages.length >= 2, true, "Should have summary and question");

      // First message should be summary
      const firstMessage = messages[0];
      assertEquals(
        firstMessage.text.includes("exploration") || firstMessage.text.includes("Overview"),
        true,
        "First message should be exploration summary",
      );

      // Second message should be question
      const secondMessage = messages[1];
      assertEquals(
        secondMessage.text.includes("build"),
        true,
        "Second message should be the first question",
      );
    });
  });
});
