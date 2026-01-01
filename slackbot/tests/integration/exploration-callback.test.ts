// ABOUTME: Integration tests for exploration callback webhook flow.
// ABOUTME: Tests complete callback flow, timeout detection, error recovery, and concurrent sessions.

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
import { isSessionTimedOut, TIMEOUT_MINUTES } from "../../functions/exploration-timeout-check.ts";
import type {
  ExplorationCallbackError,
  ExplorationCallbackSuccess,
} from "../../src/types/exploration-callback.ts";
import { formatSessionId, Phase, type Session } from "../../src/types/session.ts";

describe("Exploration Callback Integration", () => {
  let orchestrator: SessionOrchestrator;
  let sessionManager: SessionManager;
  let githubClient: MockGitHubClient;
  let anthropicClient: MockAnthropicClient;
  let messagingClient: MockSlackMessagingClient;
  let datastoreClient: MockDatastoreClient;
  let originalCallbackUrl: string | undefined;

  const channelId = "C1234567890";
  const threadTs = "1234567890.123456";
  const userId = "U1234567890";
  const sessionId = formatSessionId(channelId, threadTs);
  const callbackSecret = "test-callback-secret";

  beforeEach(() => {
    // Save and set default callback URL
    originalCallbackUrl = Deno.env.get("EXPLORATION_CALLBACK_URL");
    Deno.env.set("EXPLORATION_CALLBACK_URL", "https://example.com/callback");

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
    // Restore original callback URL
    if (originalCallbackUrl !== undefined) {
      Deno.env.set("EXPLORATION_CALLBACK_URL", originalCallbackUrl);
    } else {
      Deno.env.delete("EXPLORATION_CALLBACK_URL");
    }

    datastoreClient.clear();
    githubClient.clear();
    anthropicClient.clear();
    messagingClient.clear();
  });

  /**
   * Helper to create handler dependencies.
   */
  function createHandlerDependencies(): ExplorationHandlerDependencies {
    return {
      sessionManager,
      messagingClient,
      callbackSecret,
      orchestrator,
    };
  }

  /**
   * Helper to create a success callback payload.
   */
  function createSuccessCallback(
    overrides?: Partial<ExplorationCallbackSuccess>,
  ): ExplorationCallbackSuccess {
    return {
      session_id: sessionId,
      status: "success",
      exploration_context: {
        project_overview: "A TypeScript REST API server",
        architecture_summary: "Express.js with repository pattern",
        file_tree: "src/\n  routes/\n  services/\npackage.json",
        relevant_patterns: ["Repository pattern", "Dependency injection"],
        integration_points: ["REST API", "Database layer"],
        testing_approach: "Vitest with supertest for integration tests",
        key_files: ["package.json", "src/app.ts", "src/routes/index.ts"],
      },
      ...overrides,
    };
  }

  /**
   * Helper to create an error callback payload.
   */
  function createErrorCallback(
    code: "CLONE_FAILED" | "INSTALL_FAILED" | "EXPLORATION_FAILED",
    message: string,
    overrides?: Partial<ExplorationCallbackError>,
  ): ExplorationCallbackError {
    return {
      session_id: sessionId,
      status: "error",
      error: {
        code,
        message,
      },
      ...overrides,
    };
  }

  /**
   * Helper to create a session in Initializing phase.
   */
  function createInitializingSession(overrides: Partial<Session> = {}): Session {
    return {
      session_id: sessionId,
      phase: Phase.Initializing,
      repository: "owner/repo",
      initiator_user_id: userId,
      confidence_score: 0,
      created_at: new Date().toISOString(),
      ttl: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      ...overrides,
    };
  }

  describe("Complete Callback Flow", () => {
    it("should transition session from Initializing to Questioning on valid callback", async () => {
      // Setup: Create session in Initializing phase
      const session = createInitializingSession();
      await datastoreClient.put(session);

      // Setup: Mock Anthropic response for first question
      anthropicClient.setNextQuestionResponse({
        question: "What specific functionality would you like to add?",
        confidence_score: 20,
      });

      // Execute: Send valid callback
      const request: ExplorationHandlerRequest = {
        authorizationHeader: `Bearer ${callbackSecret}`,
        body: createSuccessCallback(),
      };

      const response = await handleExplorationCallback(request, createHandlerDependencies());

      // Verify: Response is successful
      assertEquals(response.status, 200);
      assertEquals(response.ok, true);

      // Verify: Session transitioned to Questioning
      const updatedSession = await sessionManager.loadSession(channelId, threadTs);
      assertExists(updatedSession);
      assertEquals(updatedSession.phase, Phase.Questioning);
    });

    it("should store exploration_data in session", async () => {
      // Setup: Create session in Initializing phase
      const session = createInitializingSession();
      await datastoreClient.put(session);

      anthropicClient.setNextQuestionResponse({
        question: "What feature would you like?",
        confidence_score: 20,
      });

      // Execute: Send callback with exploration context
      const callback = createSuccessCallback();
      const request: ExplorationHandlerRequest = {
        authorizationHeader: `Bearer ${callbackSecret}`,
        body: callback,
      };

      await handleExplorationCallback(request, createHandlerDependencies());

      // Verify: exploration_data is stored
      const updatedSession = await sessionManager.loadSession(channelId, threadTs);
      assertExists(updatedSession);
      assertExists(updatedSession.exploration_data);

      // Verify: Can parse stored data back
      const storedData = JSON.parse(updatedSession.exploration_data);
      assertExists(storedData);
    });

    it("should post exploration summary message", async () => {
      // Setup: Create session in Initializing phase
      const session = createInitializingSession();
      await datastoreClient.put(session);

      anthropicClient.setNextQuestionResponse({
        question: "What would you like to build?",
        confidence_score: 20,
      });

      // Execute: Send callback
      const request: ExplorationHandlerRequest = {
        authorizationHeader: `Bearer ${callbackSecret}`,
        body: createSuccessCallback(),
      };

      await handleExplorationCallback(request, createHandlerDependencies());

      // Verify: Summary message was posted
      const messages = messagingClient.getPostedMessages();
      const summaryMessage = messages.find((m) =>
        m.text.includes("exploration complete") ||
        m.text.includes("Overview") ||
        m.text.includes("Architecture")
      );
      assertExists(summaryMessage, "Should post exploration summary");
      assertEquals(summaryMessage.channelId, channelId);
      assertEquals(summaryMessage.threadTs, threadTs);
    });

    it("should generate first question after callback", async () => {
      // Setup: Create session in Initializing phase
      const session = createInitializingSession();
      await datastoreClient.put(session);

      const expectedQuestion = "What specific endpoints would you like to add?";
      anthropicClient.setNextQuestionResponse({
        question: expectedQuestion,
        confidence_score: 25,
      });

      // Execute: Send callback
      const request: ExplorationHandlerRequest = {
        authorizationHeader: `Bearer ${callbackSecret}`,
        body: createSuccessCallback(),
      };

      await handleExplorationCallback(request, createHandlerDependencies());

      // Verify: First question was posted
      const messages = messagingClient.getPostedMessages();
      const questionMessage = messages.find((m) => m.text.includes(expectedQuestion));
      assertExists(questionMessage, "Should post first question");
    });

    it("should call Anthropic API after callback", async () => {
      // Setup: Create session in Initializing phase
      const session = createInitializingSession();
      await datastoreClient.put(session);

      anthropicClient.setNextQuestionResponse({
        question: "What would you like to add?",
        confidence_score: 20,
      });

      // Execute: Send callback
      const request: ExplorationHandlerRequest = {
        authorizationHeader: `Bearer ${callbackSecret}`,
        body: createSuccessCallback(),
      };

      await handleExplorationCallback(request, createHandlerDependencies());

      // Verify: Anthropic was called
      const conversations = anthropicClient.getConversationHistory();
      assertEquals(conversations.length >= 1, true, "Should call Anthropic after callback");
    });
  });

  describe("Timeout Flow", () => {
    it("should detect session as timed out when older than 5 minutes", () => {
      // Setup: Create session with created_at > 5 minutes ago
      const sixMinutesAgo = new Date(Date.now() - 6 * 60 * 1000);
      const session = createInitializingSession({
        created_at: sixMinutesAgo.toISOString(),
      });

      const now = new Date();

      // Execute: Check if session is timed out
      const timedOut = isSessionTimedOut(session, now);

      // Verify: Session should be detected as timed out
      assertEquals(timedOut, true, "Session older than 5 minutes should be timed out");
    });

    it("should not detect session as timed out when younger than 5 minutes", () => {
      // Setup: Create session with recent created_at
      const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000);
      const session = createInitializingSession({
        created_at: twoMinutesAgo.toISOString(),
      });

      const now = new Date();

      // Execute: Check if session is timed out
      const timedOut = isSessionTimedOut(session, now);

      // Verify: Session should not be timed out
      assertEquals(timedOut, false, "Session younger than 5 minutes should not be timed out");
    });

    it("should NOT modify session state on timeout detection", async () => {
      // Setup: Create session in Initializing phase, older than 5 minutes
      const sixMinutesAgo = new Date(Date.now() - 6 * 60 * 1000);
      const session = createInitializingSession({
        created_at: sixMinutesAgo.toISOString(),
      });
      await datastoreClient.put(session);

      const now = new Date();

      // Execute: Check if session is timed out
      const timedOut = isSessionTimedOut(session, now);

      // Verify: Session is detected as timed out
      assertEquals(timedOut, true);

      // Verify: Session state is NOT modified (still Initializing)
      const loadedSession = await sessionManager.loadSession(channelId, threadTs);
      assertExists(loadedSession);
      assertEquals(
        loadedSession.phase,
        Phase.Initializing,
        "Session should remain in Initializing",
      );
    });

    it("should use correct timeout threshold value", () => {
      // Verify the timeout constant is 5 minutes
      assertEquals(TIMEOUT_MINUTES, 5, "Timeout should be 5 minutes");
    });

    it("should detect timeout at exactly 5 minute boundary", () => {
      // Setup: Create session at exactly 5 minutes ago
      const exactlyFiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
      const session = createInitializingSession({
        created_at: exactlyFiveMinutesAgo.toISOString(),
      });

      const now = new Date();

      // Execute: Check if session is timed out
      const timedOut = isSessionTimedOut(session, now);

      // Verify: Session at exactly 5 minutes should be timed out (>= threshold)
      assertEquals(timedOut, true, "Session at exactly 5 minutes should be timed out");
    });
  });

  describe("Error Recovery (Retry)", () => {
    it("should keep session in Initializing after auth failure", async () => {
      // Setup: Create session in Initializing phase
      const session = createInitializingSession();
      await datastoreClient.put(session);

      // Execute: First callback with invalid auth
      const badRequest: ExplorationHandlerRequest = {
        authorizationHeader: "Bearer wrong-secret",
        body: createSuccessCallback(),
      };

      const badResponse = await handleExplorationCallback(badRequest, createHandlerDependencies());

      // Verify: Request rejected with 401
      assertEquals(badResponse.status, 401);
      assertEquals(badResponse.ok, false);

      // Verify: Session remains in Initializing
      const loadedSession = await sessionManager.loadSession(channelId, threadTs);
      assertExists(loadedSession);
      assertEquals(
        loadedSession.phase,
        Phase.Initializing,
        "Session should stay in Initializing after auth failure",
      );
    });

    it("should successfully process callback after initial auth failure", async () => {
      // Setup: Create session in Initializing phase
      const session = createInitializingSession();
      await datastoreClient.put(session);

      anthropicClient.setNextQuestionResponse({
        question: "What would you like to add?",
        confidence_score: 20,
      });

      // Execute: First callback fails with auth error
      const badRequest: ExplorationHandlerRequest = {
        authorizationHeader: "Bearer wrong-secret",
        body: createSuccessCallback(),
      };
      await handleExplorationCallback(badRequest, createHandlerDependencies());

      // Verify session still in Initializing
      let loadedSession = await sessionManager.loadSession(channelId, threadTs);
      assertEquals(loadedSession?.phase, Phase.Initializing);

      // Execute: Second callback with valid auth
      const goodRequest: ExplorationHandlerRequest = {
        authorizationHeader: `Bearer ${callbackSecret}`,
        body: createSuccessCallback(),
      };
      const goodResponse = await handleExplorationCallback(
        goodRequest,
        createHandlerDependencies(),
      );

      // Verify: Second request succeeds
      assertEquals(goodResponse.status, 200);
      assertEquals(goodResponse.ok, true);

      // Verify: Session transitioned to Questioning
      loadedSession = await sessionManager.loadSession(channelId, threadTs);
      assertExists(loadedSession);
      assertEquals(
        loadedSession.phase,
        Phase.Questioning,
        "Session should transition after successful retry",
      );
    });

    it("should allow callback retry after invalid payload error", async () => {
      // Setup: Create session in Initializing phase
      const session = createInitializingSession();
      await datastoreClient.put(session);

      anthropicClient.setNextQuestionResponse({
        question: "What feature would you like?",
        confidence_score: 20,
      });

      // Execute: First callback with invalid session_id format
      const badRequest: ExplorationHandlerRequest = {
        authorizationHeader: `Bearer ${callbackSecret}`,
        body: {
          session_id: "invalid-no-colon",
          status: "success",
          exploration_context: {},
        },
      };
      const badResponse = await handleExplorationCallback(badRequest, createHandlerDependencies());

      // Verify: Request rejected with 400
      assertEquals(badResponse.status, 400);

      // Verify: Original session still in Initializing (different session_id)
      let loadedSession = await sessionManager.loadSession(channelId, threadTs);
      assertEquals(loadedSession?.phase, Phase.Initializing);

      // Execute: Retry with correct payload
      const goodRequest: ExplorationHandlerRequest = {
        authorizationHeader: `Bearer ${callbackSecret}`,
        body: createSuccessCallback(),
      };
      const goodResponse = await handleExplorationCallback(
        goodRequest,
        createHandlerDependencies(),
      );

      // Verify: Retry succeeds
      assertEquals(goodResponse.status, 200);

      // Verify: Session transitioned
      loadedSession = await sessionManager.loadSession(channelId, threadTs);
      assertEquals(loadedSession?.phase, Phase.Questioning);
    });
  });

  describe("Backwards Compatibility", () => {
    it("should work with session without exploration_data field", async () => {
      // Setup: Create session without exploration_data (pre-existing session)
      const session = createInitializingSession();
      // Explicitly ensure exploration_data is not set (already undefined by default)
      session.exploration_data = undefined;
      await datastoreClient.put(session);

      anthropicClient.setNextQuestionResponse({
        question: "What would you like to build?",
        confidence_score: 20,
      });

      // Execute: Process callback for this session
      const request: ExplorationHandlerRequest = {
        authorizationHeader: `Bearer ${callbackSecret}`,
        body: createSuccessCallback(),
      };

      const response = await handleExplorationCallback(request, createHandlerDependencies());

      // Verify: Callback succeeds
      assertEquals(response.status, 200);
      assertEquals(response.ok, true);

      // Verify: Session now has exploration_data
      const updatedSession = await sessionManager.loadSession(channelId, threadTs);
      assertExists(updatedSession?.exploration_data);
    });

    it("should generate first question without exploration context", async () => {
      // Setup: Create session in Questioning phase without exploration_data
      const session: Session = {
        session_id: sessionId,
        phase: Phase.Questioning,
        repository: "owner/repo",
        initiator_user_id: userId,
        confidence_score: 0,
        created_at: new Date().toISOString(),
        ttl: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        // No exploration_data
      };
      await datastoreClient.put(session);

      anthropicClient.setNextQuestionResponse({
        question: "Tell me about your project idea.",
        confidence_score: 15,
      });

      // Execute: Generate first question via orchestrator
      await orchestrator.generateFirstQuestion(channelId, threadTs);

      // Verify: Question was generated and posted
      const messages = messagingClient.getPostedMessages();
      const questionMessage = messages.find((m) => m.text.includes("project idea"));
      assertExists(questionMessage, "Should generate question without exploration context");
    });
  });

  describe("Concurrent Callbacks", () => {
    const sessions = [
      { channelId: "C1111111111", threadTs: "1111111111.111111", userId: "U1111111111" },
      { channelId: "C2222222222", threadTs: "2222222222.222222", userId: "U2222222222" },
      { channelId: "C3333333333", threadTs: "3333333333.333333", userId: "U3333333333" },
    ];

    it("should process callbacks for multiple sessions independently", async () => {
      // Setup: Create 3 sessions in Initializing phase
      for (const cfg of sessions) {
        const session: Session = {
          session_id: formatSessionId(cfg.channelId, cfg.threadTs),
          phase: Phase.Initializing,
          repository: `org/${cfg.channelId}`,
          initiator_user_id: cfg.userId,
          confidence_score: 0,
          created_at: new Date().toISOString(),
          ttl: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        };
        await datastoreClient.put(session);
      }

      // Setup: Mock Anthropic responses
      anthropicClient.setNextQuestionResponse({
        question: "Generic question?",
        confidence_score: 20,
      });

      // Execute: Process callbacks for each session
      for (const cfg of sessions) {
        const request: ExplorationHandlerRequest = {
          authorizationHeader: `Bearer ${callbackSecret}`,
          body: {
            session_id: formatSessionId(cfg.channelId, cfg.threadTs),
            status: "success",
            exploration_context: {
              project_overview: `Project for ${cfg.channelId}`,
            },
          },
        };

        const response = await handleExplorationCallback(request, createHandlerDependencies());
        assertEquals(response.status, 200, `Callback for ${cfg.channelId} should succeed`);
      }

      // Verify: Each session transitioned independently
      for (const cfg of sessions) {
        const loadedSession = await sessionManager.loadSession(cfg.channelId, cfg.threadTs);
        assertExists(loadedSession, `Session ${cfg.channelId} should exist`);
        assertEquals(
          loadedSession.phase,
          Phase.Questioning,
          `Session ${cfg.channelId} should be Questioning`,
        );
      }
    });

    it("should not cross-contaminate state between sessions", async () => {
      // Setup: Create 3 sessions in Initializing phase with different repos
      for (const cfg of sessions) {
        const session: Session = {
          session_id: formatSessionId(cfg.channelId, cfg.threadTs),
          phase: Phase.Initializing,
          repository: `org-${cfg.channelId.slice(-4)}/repo`,
          initiator_user_id: cfg.userId,
          confidence_score: 0,
          created_at: new Date().toISOString(),
          ttl: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        };
        await datastoreClient.put(session);
      }

      anthropicClient.setNextQuestionResponse({
        question: "What feature?",
        confidence_score: 20,
      });

      // Execute: Process callback only for first session
      const firstRequest: ExplorationHandlerRequest = {
        authorizationHeader: `Bearer ${callbackSecret}`,
        body: {
          session_id: formatSessionId(sessions[0].channelId, sessions[0].threadTs),
          status: "success",
          exploration_context: {
            project_overview: "First project",
            key_files: ["file1.ts", "file2.ts"],
          },
        },
      };
      await handleExplorationCallback(firstRequest, createHandlerDependencies());

      // Verify: Only first session transitioned
      const session1 = await sessionManager.loadSession(
        sessions[0].channelId,
        sessions[0].threadTs,
      );
      const session2 = await sessionManager.loadSession(
        sessions[1].channelId,
        sessions[1].threadTs,
      );
      const session3 = await sessionManager.loadSession(
        sessions[2].channelId,
        sessions[2].threadTs,
      );

      assertEquals(session1?.phase, Phase.Questioning, "First session should transition");
      assertEquals(
        session2?.phase,
        Phase.Initializing,
        "Second session should remain Initializing",
      );
      assertEquals(session3?.phase, Phase.Initializing, "Third session should remain Initializing");

      // Verify: Only first session has exploration_data
      assertExists(session1?.exploration_data, "First session should have exploration_data");
      assertEquals(
        session2?.exploration_data,
        undefined,
        "Second session should not have exploration_data",
      );
      assertEquals(
        session3?.exploration_data,
        undefined,
        "Third session should not have exploration_data",
      );
    });

    it("should preserve each session's unique properties", async () => {
      // Setup: Create sessions with unique repositories
      const repositories = ["alpha/repo", "beta/repo", "gamma/repo"];
      for (let i = 0; i < sessions.length; i++) {
        const cfg = sessions[i];
        const session: Session = {
          session_id: formatSessionId(cfg.channelId, cfg.threadTs),
          phase: Phase.Initializing,
          repository: repositories[i],
          initiator_user_id: cfg.userId,
          confidence_score: 0,
          created_at: new Date().toISOString(),
          ttl: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        };
        await datastoreClient.put(session);
      }

      anthropicClient.setNextQuestionResponse({
        question: "What?",
        confidence_score: 20,
      });

      // Execute: Process callbacks for all sessions
      for (let i = 0; i < sessions.length; i++) {
        const cfg = sessions[i];
        const request: ExplorationHandlerRequest = {
          authorizationHeader: `Bearer ${callbackSecret}`,
          body: {
            session_id: formatSessionId(cfg.channelId, cfg.threadTs),
            status: "success",
            exploration_context: {
              project_overview: `Project ${repositories[i]}`,
            },
          },
        };
        await handleExplorationCallback(request, createHandlerDependencies());
      }

      // Verify: Each session maintains its unique repository
      for (let i = 0; i < sessions.length; i++) {
        const cfg = sessions[i];
        const loaded = await sessionManager.loadSession(cfg.channelId, cfg.threadTs);
        assertExists(loaded);
        assertEquals(
          loaded.repository,
          repositories[i],
          `Session ${i} should have correct repository`,
        );
        assertEquals(
          loaded.initiator_user_id,
          cfg.userId,
          `Session ${i} should have correct initiator`,
        );
      }
    });
  });

  describe("Error Scenarios", () => {
    it("should return 404 for session not found", async () => {
      // Execute: Send callback for non-existent session
      const request: ExplorationHandlerRequest = {
        authorizationHeader: `Bearer ${callbackSecret}`,
        body: createSuccessCallback(),
      };

      const response = await handleExplorationCallback(request, createHandlerDependencies());

      // Verify: 404 response
      assertEquals(response.status, 404);
      assertEquals(response.ok, false);
      assertEquals(response.error, "Not Found: Session not found");
    });

    it("should return 401 for missing Authorization header", async () => {
      // Setup: Create session
      const session = createInitializingSession();
      await datastoreClient.put(session);

      // Execute: Send callback without auth header
      const request: ExplorationHandlerRequest = {
        authorizationHeader: undefined,
        body: createSuccessCallback(),
      };

      const response = await handleExplorationCallback(request, createHandlerDependencies());

      // Verify: 401 response
      assertEquals(response.status, 401);
      assertEquals(response.ok, false);
      assertEquals(response.error, "Unauthorized: Missing or invalid Authorization header");
    });

    it("should return 401 for invalid token", async () => {
      // Setup: Create session
      const session = createInitializingSession();
      await datastoreClient.put(session);

      // Execute: Send callback with wrong token
      const request: ExplorationHandlerRequest = {
        authorizationHeader: "Bearer wrong-token",
        body: createSuccessCallback(),
      };

      const response = await handleExplorationCallback(request, createHandlerDependencies());

      // Verify: 401 response
      assertEquals(response.status, 401);
      assertEquals(response.ok, false);
    });

    it("should return 400 for session not in Initializing phase", async () => {
      // Setup: Create session in Questioning phase
      const session = createInitializingSession({
        phase: Phase.Questioning,
      });
      await datastoreClient.put(session);

      // Execute: Send callback
      const request: ExplorationHandlerRequest = {
        authorizationHeader: `Bearer ${callbackSecret}`,
        body: createSuccessCallback(),
      };

      const response = await handleExplorationCallback(request, createHandlerDependencies());

      // Verify: 400 response
      assertEquals(response.status, 400);
      assertEquals(response.ok, false);
      assertEquals(response.error, "Bad Request: Session is not in Initializing state");
    });

    it("should return 400 for oversized payload", async () => {
      // Setup: Create session
      const session = createInitializingSession();
      await datastoreClient.put(session);

      // Create oversized payload (> 100KB)
      const largeString = "x".repeat(110 * 1024); // 110KB
      const request: ExplorationHandlerRequest = {
        authorizationHeader: `Bearer ${callbackSecret}`,
        body: {
          session_id: sessionId,
          status: "success",
          exploration_context: {
            project_overview: largeString,
          },
        },
      };

      const response = await handleExplorationCallback(request, createHandlerDependencies());

      // Verify: 400 response
      assertEquals(response.status, 400);
      assertEquals(response.ok, false);
      assertEquals(response.error, "Bad Request: Payload exceeds 100KB limit");
    });

    it("should return 400 for invalid session_id format", async () => {
      // Setup: Create session
      const session = createInitializingSession();
      await datastoreClient.put(session);

      // Execute: Send callback with invalid session_id format
      const request: ExplorationHandlerRequest = {
        authorizationHeader: `Bearer ${callbackSecret}`,
        body: {
          session_id: "invalid-format-no-colon",
          status: "success",
          exploration_context: {},
        },
      };

      const response = await handleExplorationCallback(request, createHandlerDependencies());

      // Verify: 400 response
      assertEquals(response.status, 400);
      assertEquals(response.ok, false);
      assertEquals(response.error, "Bad Request: Invalid session_id format");
    });

    it("should return 401 for malformed Bearer token", async () => {
      // Setup: Create session
      const session = createInitializingSession();
      await datastoreClient.put(session);

      // Execute: Send callback with malformed auth header (no "Bearer " prefix)
      const request: ExplorationHandlerRequest = {
        authorizationHeader: callbackSecret, // Missing "Bearer " prefix
        body: createSuccessCallback(),
      };

      const response = await handleExplorationCallback(request, createHandlerDependencies());

      // Verify: 401 response
      assertEquals(response.status, 401);
      assertEquals(response.ok, false);
    });
  });

  describe("Error Callback Handling", () => {
    it("should transition to Questioning on error callback", async () => {
      // Setup: Create session in Initializing phase
      const session = createInitializingSession();
      await datastoreClient.put(session);

      anthropicClient.setNextQuestionResponse({
        question: "What would you like to build?",
        confidence_score: 15,
      });

      // Execute: Send error callback
      const request: ExplorationHandlerRequest = {
        authorizationHeader: `Bearer ${callbackSecret}`,
        body: createErrorCallback("CLONE_FAILED", "Repository not found (404)"),
      };

      const response = await handleExplorationCallback(request, createHandlerDependencies());

      // Verify: Callback succeeds (200) even for error callbacks
      assertEquals(response.status, 200);
      assertEquals(response.ok, true);

      // Verify: Session transitions to Questioning
      const updatedSession = await sessionManager.loadSession(channelId, threadTs);
      assertExists(updatedSession);
      assertEquals(updatedSession.phase, Phase.Questioning);
    });

    it("should post error message for CLONE_FAILED", async () => {
      // Setup: Create session
      const session = createInitializingSession();
      await datastoreClient.put(session);

      anthropicClient.setNextQuestionResponse({
        question: "What would you like to build?",
        confidence_score: 15,
      });

      // Execute: Send CLONE_FAILED error
      const request: ExplorationHandlerRequest = {
        authorizationHeader: `Bearer ${callbackSecret}`,
        body: createErrorCallback("CLONE_FAILED", "Repository access denied"),
      };

      await handleExplorationCallback(request, createHandlerDependencies());

      // Verify: Error message was posted
      const messages = messagingClient.getPostedMessages();
      const errorMessage = messages.find((m) =>
        m.text.includes("CLONE_FAILED") ||
        m.text.toLowerCase().includes("failed")
      );
      assertExists(errorMessage, "Should post error message");
    });

    it("should still generate first question after error callback", async () => {
      // Setup: Create session
      const session = createInitializingSession();
      await datastoreClient.put(session);

      const expectedQuestion = "What would you like to build?";
      anthropicClient.setNextQuestionResponse({
        question: expectedQuestion,
        confidence_score: 15,
      });

      // Execute: Send error callback
      const request: ExplorationHandlerRequest = {
        authorizationHeader: `Bearer ${callbackSecret}`,
        body: createErrorCallback("EXPLORATION_FAILED", "Timeout"),
      };

      await handleExplorationCallback(request, createHandlerDependencies());

      // Verify: First question was still generated
      const messages = messagingClient.getPostedMessages();
      const questionMessage = messages.find((m) => m.text.includes(expectedQuestion));
      assertExists(questionMessage, "Should generate first question after error callback");
    });
  });

  describe("Message Ordering Verification", () => {
    it("should post summary before first question", async () => {
      // Setup: Create session
      const session = createInitializingSession();
      await datastoreClient.put(session);

      anthropicClient.setNextQuestionResponse({
        question: "First question text here?",
        confidence_score: 20,
      });

      // Execute: Send callback
      const request: ExplorationHandlerRequest = {
        authorizationHeader: `Bearer ${callbackSecret}`,
        body: createSuccessCallback(),
      };

      await handleExplorationCallback(request, createHandlerDependencies());

      // Verify: Messages are in correct order
      const messages = messagingClient.getPostedMessages();
      assertEquals(messages.length >= 2, true, "Should have at least summary and question");

      // First message should be summary (contains "exploration complete" or context info)
      const firstMessage = messages[0];
      assertEquals(
        firstMessage.text.includes("exploration complete") ||
          firstMessage.text.includes("Overview") ||
          firstMessage.text.includes("Architecture"),
        true,
        "First message should be exploration summary",
      );

      // Second message should be the question
      const secondMessage = messages[1];
      assertEquals(
        secondMessage.text.includes("First question text here"),
        true,
        "Second message should be the question",
      );
    });

    it("should post all messages to correct channel and thread", async () => {
      // Setup: Create session
      const session = createInitializingSession();
      await datastoreClient.put(session);

      anthropicClient.setNextQuestionResponse({
        question: "What?",
        confidence_score: 20,
      });

      // Execute: Send callback
      const request: ExplorationHandlerRequest = {
        authorizationHeader: `Bearer ${callbackSecret}`,
        body: createSuccessCallback(),
      };

      await handleExplorationCallback(request, createHandlerDependencies());

      // Verify: All messages go to correct channel and thread
      const messages = messagingClient.getPostedMessages();
      for (const message of messages) {
        assertEquals(message.channelId, channelId, "Message should go to correct channel");
        assertEquals(message.threadTs, threadTs, "Message should go to correct thread");
      }
    });
  });
});
