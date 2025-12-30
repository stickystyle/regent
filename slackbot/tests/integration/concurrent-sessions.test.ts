// ABOUTME: Integration tests for concurrent session isolation.
// ABOUTME: Verifies that multiple simultaneous sessions do not affect each other.

import { assertEquals, assertExists } from "@std/assert";
import { afterEach, beforeEach, describe, it } from "@std/testing/bdd";

import { MockAnthropicClient } from "../../src/clients/anthropic-client.ts";
import { MockGitHubClient } from "../../src/clients/github-client.ts";
import { MockSlackMessagingClient } from "../../src/clients/messaging-client.ts";
import { MockDatastoreClient } from "../../src/managers/datastore-client.ts";
import { SessionManager } from "../../src/managers/session-manager.ts";
import { SessionOrchestrator } from "../../src/orchestrators/session-orchestrator.ts";
import { Phase, type Session } from "../../src/types/session.ts";
import type { SlashCommand } from "../../src/types/slash-command.ts";

describe("Concurrent Sessions Integration", () => {
  let sessionManager: SessionManager;
  let githubClient: MockGitHubClient;
  let anthropicClient: MockAnthropicClient;
  let messagingClient: MockSlackMessagingClient;
  let datastoreClient: MockDatastoreClient;
  let orchestrator: SessionOrchestrator;
  let originalCallbackUrl: string | undefined;

  // Session configurations for multiple concurrent sessions
  const sessions = [
    { channelId: "C1111111111", threadTs: "1111111111.111111", userId: "U1111111111", repo: "org1/repo1" },
    { channelId: "C2222222222", threadTs: "2222222222.222222", userId: "U2222222222", repo: "org2/repo2" },
    { channelId: "C3333333333", threadTs: "3333333333.333333", userId: "U3333333333", repo: "" },
    { channelId: "C1111111111", threadTs: "4444444444.444444", userId: "U4444444444", repo: "org4/repo4" },
  ];

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
   * Helper to create a slash command for a session config.
   */
  function createCommand(sessionConfig: typeof sessions[0], idea: string): SlashCommand {
    return {
      idea,
      channelId: sessionConfig.channelId,
      userId: sessionConfig.userId,
      channelType: "channel",
      responseUrl: "https://hooks.slack.com/commands/123/456",
      repository: sessionConfig.repo || undefined,
    };
  }

  describe("creating multiple concurrent sessions", () => {
    it("should create 3+ sessions in different channels", async () => {
      // Create sessions in parallel
      anthropicClient.setNextQuestionResponse({
        question: "What is your goal?",
        confidence_score: 20,
      });

      const createPromises = sessions.slice(0, 3).map(async (config, i) => {
        // Set different question responses for sessions without repo
        if (!config.repo) {
          anthropicClient.setNextQuestionResponse({
            question: `Question for session ${i + 1}`,
            confidence_score: 20 + i * 5,
          });
        }
        await orchestrator.handleSlashCommand(
          createCommand(config, `Feature ${i + 1}`),
          config.threadTs,
        );
      });

      await Promise.all(createPromises);

      // Verify all sessions were created
      for (let i = 0; i < 3; i++) {
        const session = await sessionManager.loadSession(
          sessions[i].channelId,
          sessions[i].threadTs,
        );
        assertExists(session, `Session ${i + 1} should exist`);
        // Sessions with repo start as Initializing, sessions without repo start as Questioning
        const expectedPhase = sessions[i].repo ? Phase.Initializing : Phase.Questioning;
        assertEquals(session.phase, expectedPhase, `Session ${i + 1} phase`);
      }
    });

    it("should allow multiple sessions in same channel with different threads", async () => {
      // Create two sessions in the same channel (C1111111111)
      anthropicClient.setNextQuestionResponse({
        question: "First question?",
        confidence_score: 20,
      });

      await orchestrator.handleSlashCommand(
        createCommand(sessions[0], "First feature"),
        sessions[0].threadTs,
      );

      anthropicClient.setNextQuestionResponse({
        question: "Second question?",
        confidence_score: 25,
      });

      await orchestrator.handleSlashCommand(
        createCommand(sessions[3], "Second feature"),
        sessions[3].threadTs,
      );

      // Both sessions should exist independently
      const session1 = await sessionManager.loadSession(
        sessions[0].channelId,
        sessions[0].threadTs,
      );
      const session2 = await sessionManager.loadSession(
        sessions[3].channelId,
        sessions[3].threadTs,
      );

      assertExists(session1);
      assertExists(session2);
      assertEquals(session1.session_id !== session2.session_id, true);
      assertEquals(session1.initiator_user_id, "U1111111111");
      assertEquals(session2.initiator_user_id, "U4444444444");
    });
  });

  describe("session isolation - interleaved operations", () => {
    it("should isolate phase state between concurrent sessions", async () => {
      // Create sessions directly in datastore for controlled testing
      const session1: Session = {
        session_id: `${sessions[0].channelId}:${sessions[0].threadTs}`,
        phase: Phase.Questioning,
        repository: sessions[0].repo,
        initiator_user_id: sessions[0].userId,
        confidence_score: 25,
        created_at: new Date().toISOString(),
        ttl: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      };

      const session2: Session = {
        session_id: `${sessions[1].channelId}:${sessions[1].threadTs}`,
        phase: Phase.Questioning,
        repository: sessions[1].repo,
        initiator_user_id: sessions[1].userId,
        confidence_score: 30,
        created_at: new Date().toISOString(),
        ttl: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      };

      const session3: Session = {
        session_id: `${sessions[2].channelId}:${sessions[2].threadTs}`,
        phase: Phase.Questioning,
        repository: undefined,
        initiator_user_id: sessions[2].userId,
        confidence_score: 35,
        created_at: new Date().toISOString(),
        ttl: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      };

      await datastoreClient.put(session1);
      await datastoreClient.put(session2);
      await datastoreClient.put(session3);

      // Update session1 to Review phase
      session1.phase = Phase.Review;
      session1.canvas_id = "F1111111111";
      await sessionManager.updateSession(session1);

      // Update session3 to Finalized phase
      session3.phase = Phase.Finalized;
      session3.epic_number = 42;
      await sessionManager.updateSession(session3);

      // Verify each session has its own phase
      const loaded1 = await sessionManager.loadSession(sessions[0].channelId, sessions[0].threadTs);
      const loaded2 = await sessionManager.loadSession(sessions[1].channelId, sessions[1].threadTs);
      const loaded3 = await sessionManager.loadSession(sessions[2].channelId, sessions[2].threadTs);

      assertExists(loaded1);
      assertExists(loaded2);
      assertExists(loaded3);

      assertEquals(loaded1.phase, Phase.Review);
      assertEquals(loaded2.phase, Phase.Questioning);
      assertEquals(loaded3.phase, Phase.Finalized);
    });

    it("should isolate confidence_score between concurrent sessions", async () => {
      const session1: Session = {
        session_id: `${sessions[0].channelId}:${sessions[0].threadTs}`,
        phase: Phase.Questioning,
        repository: sessions[0].repo,
        initiator_user_id: sessions[0].userId,
        confidence_score: 0,
        created_at: new Date().toISOString(),
        ttl: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      };

      const session2: Session = {
        session_id: `${sessions[1].channelId}:${sessions[1].threadTs}`,
        phase: Phase.Questioning,
        repository: sessions[1].repo,
        initiator_user_id: sessions[1].userId,
        confidence_score: 0,
        created_at: new Date().toISOString(),
        ttl: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      };

      const session3: Session = {
        session_id: `${sessions[2].channelId}:${sessions[2].threadTs}`,
        phase: Phase.Questioning,
        repository: undefined,
        initiator_user_id: sessions[2].userId,
        confidence_score: 0,
        created_at: new Date().toISOString(),
        ttl: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      };

      await datastoreClient.put(session1);
      await datastoreClient.put(session2);
      await datastoreClient.put(session3);

      // Interleaved confidence updates
      session1.confidence_score = 25;
      await sessionManager.updateSession(session1);

      session2.confidence_score = 50;
      await sessionManager.updateSession(session2);

      session1.confidence_score = 40;
      await sessionManager.updateSession(session1);

      session3.confidence_score = 75;
      await sessionManager.updateSession(session3);

      session2.confidence_score = 85;
      await sessionManager.updateSession(session2);

      // Verify each has its own confidence
      const loaded1 = await sessionManager.loadSession(sessions[0].channelId, sessions[0].threadTs);
      const loaded2 = await sessionManager.loadSession(sessions[1].channelId, sessions[1].threadTs);
      const loaded3 = await sessionManager.loadSession(sessions[2].channelId, sessions[2].threadTs);

      assertExists(loaded1);
      assertExists(loaded2);
      assertExists(loaded3);

      assertEquals(loaded1.confidence_score, 40);
      assertEquals(loaded2.confidence_score, 85);
      assertEquals(loaded3.confidence_score, 75);
    });

    it("should isolate canvas_id between concurrent sessions", async () => {
      const session1: Session = {
        session_id: `${sessions[0].channelId}:${sessions[0].threadTs}`,
        phase: Phase.Review,
        repository: sessions[0].repo,
        initiator_user_id: sessions[0].userId,
        confidence_score: 95,
        created_at: new Date().toISOString(),
        ttl: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      };

      const session2: Session = {
        session_id: `${sessions[1].channelId}:${sessions[1].threadTs}`,
        phase: Phase.Review,
        repository: sessions[1].repo,
        initiator_user_id: sessions[1].userId,
        confidence_score: 95,
        created_at: new Date().toISOString(),
        ttl: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      };

      const session3: Session = {
        session_id: `${sessions[2].channelId}:${sessions[2].threadTs}`,
        phase: Phase.Questioning,
        repository: undefined,
        initiator_user_id: sessions[2].userId,
        confidence_score: 50,
        created_at: new Date().toISOString(),
        ttl: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      };

      await datastoreClient.put(session1);
      await datastoreClient.put(session2);
      await datastoreClient.put(session3);

      // Set Canvas IDs
      session1.canvas_id = "F1111111111";
      await sessionManager.updateSession(session1);

      session2.canvas_id = "F2222222222";
      await sessionManager.updateSession(session2);

      // session3 has no canvas (still Questioning)

      // Verify Canvas isolation
      const loaded1 = await sessionManager.loadSession(sessions[0].channelId, sessions[0].threadTs);
      const loaded2 = await sessionManager.loadSession(sessions[1].channelId, sessions[1].threadTs);
      const loaded3 = await sessionManager.loadSession(sessions[2].channelId, sessions[2].threadTs);

      assertExists(loaded1);
      assertExists(loaded2);
      assertExists(loaded3);

      assertEquals(loaded1.canvas_id, "F1111111111");
      assertEquals(loaded2.canvas_id, "F2222222222");
      assertEquals(loaded3.canvas_id, undefined);
    });

    it("should isolate epic fields between concurrent sessions", async () => {
      const session1: Session = {
        session_id: `${sessions[0].channelId}:${sessions[0].threadTs}`,
        phase: Phase.Finalized,
        repository: sessions[0].repo,
        initiator_user_id: sessions[0].userId,
        confidence_score: 95,
        created_at: new Date().toISOString(),
        ttl: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      };

      const session2: Session = {
        session_id: `${sessions[1].channelId}:${sessions[1].threadTs}`,
        phase: Phase.Finalized,
        repository: sessions[1].repo,
        initiator_user_id: sessions[1].userId,
        confidence_score: 95,
        created_at: new Date().toISOString(),
        ttl: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      };

      const session3: Session = {
        session_id: `${sessions[2].channelId}:${sessions[2].threadTs}`,
        phase: Phase.Review,
        repository: undefined,
        initiator_user_id: sessions[2].userId,
        confidence_score: 95,
        canvas_id: "F3333333333",
        created_at: new Date().toISOString(),
        ttl: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      };

      await datastoreClient.put(session1);
      await datastoreClient.put(session2);
      await datastoreClient.put(session3);

      // Set epic fields for session1
      session1.epic_number = 10;
      session1.epic_url = "https://github.com/org1/repo1/issues/10";
      session1.spec_comment_ids = { brainstorm: 100 };
      await sessionManager.updateSession(session1);

      // Set different epic fields for session2
      session2.epic_number = 20;
      session2.epic_url = "https://github.com/org2/repo2/issues/20";
      session2.spec_comment_ids = { brainstorm: 200, requirements: 201 };
      await sessionManager.updateSession(session2);

      // session3 has no epic (still in Review)

      // Verify epic field isolation
      const loaded1 = await sessionManager.loadSession(sessions[0].channelId, sessions[0].threadTs);
      const loaded2 = await sessionManager.loadSession(sessions[1].channelId, sessions[1].threadTs);
      const loaded3 = await sessionManager.loadSession(sessions[2].channelId, sessions[2].threadTs);

      assertExists(loaded1);
      assertExists(loaded2);
      assertExists(loaded3);

      assertEquals(loaded1.epic_number, 10);
      assertEquals(loaded1.epic_url, "https://github.com/org1/repo1/issues/10");
      assertEquals(loaded1.spec_comment_ids?.brainstorm, 100);
      assertEquals(loaded1.spec_comment_ids?.requirements, undefined);

      assertEquals(loaded2.epic_number, 20);
      assertEquals(loaded2.epic_url, "https://github.com/org2/repo2/issues/20");
      assertEquals(loaded2.spec_comment_ids?.brainstorm, 200);
      assertEquals(loaded2.spec_comment_ids?.requirements, 201);

      assertEquals(loaded3.epic_number, undefined);
      assertEquals(loaded3.epic_url, undefined);
      assertEquals(loaded3.spec_comment_ids, undefined);
    });
  });

  describe("no cross-contamination during concurrent updates", () => {
    it("should handle interleaved updates without cross-contamination", async () => {
      // Create three sessions
      const session1: Session = {
        session_id: `${sessions[0].channelId}:${sessions[0].threadTs}`,
        phase: Phase.Questioning,
        repository: sessions[0].repo,
        initiator_user_id: sessions[0].userId,
        confidence_score: 0,
        created_at: new Date().toISOString(),
        ttl: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      };

      const session2: Session = {
        session_id: `${sessions[1].channelId}:${sessions[1].threadTs}`,
        phase: Phase.Questioning,
        repository: sessions[1].repo,
        initiator_user_id: sessions[1].userId,
        confidence_score: 0,
        created_at: new Date().toISOString(),
        ttl: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      };

      const session3: Session = {
        session_id: `${sessions[2].channelId}:${sessions[2].threadTs}`,
        phase: Phase.Questioning,
        repository: undefined,
        initiator_user_id: sessions[2].userId,
        confidence_score: 0,
        created_at: new Date().toISOString(),
        ttl: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      };

      await datastoreClient.put(session1);
      await datastoreClient.put(session2);
      await datastoreClient.put(session3);

      // Interleaved updates simulating real-world concurrent usage
      session1.confidence_score = 25;
      await sessionManager.updateSession(session1);

      session2.phase = Phase.Review;
      session2.canvas_id = "F2222222222";
      await sessionManager.updateSession(session2);

      session1.confidence_score = 50;
      await sessionManager.updateSession(session1);

      session3.phase = Phase.Finalized;
      session3.epic_number = 99;
      await sessionManager.updateSession(session3);

      session1.phase = Phase.Review;
      session1.confidence_score = 75;
      await sessionManager.updateSession(session1);

      session2.confidence_score = 95;
      await sessionManager.updateSession(session2);

      // Final state verification - no cross-contamination
      const final1 = await sessionManager.loadSession(sessions[0].channelId, sessions[0].threadTs);
      const final2 = await sessionManager.loadSession(sessions[1].channelId, sessions[1].threadTs);
      const final3 = await sessionManager.loadSession(sessions[2].channelId, sessions[2].threadTs);

      assertExists(final1);
      assertExists(final2);
      assertExists(final3);

      // Session 1 assertions
      assertEquals(final1.phase, Phase.Review);
      assertEquals(final1.confidence_score, 75);
      assertEquals(final1.canvas_id, undefined);
      assertEquals(final1.epic_number, undefined);
      assertEquals(final1.repository, "org1/repo1");

      // Session 2 assertions
      assertEquals(final2.phase, Phase.Review);
      assertEquals(final2.confidence_score, 95);
      assertEquals(final2.canvas_id, "F2222222222");
      assertEquals(final2.epic_number, undefined);
      assertEquals(final2.repository, "org2/repo2");

      // Session 3 assertions
      assertEquals(final3.phase, Phase.Finalized);
      assertEquals(final3.confidence_score, 0);
      assertEquals(final3.canvas_id, undefined);
      assertEquals(final3.epic_number, 99);
      assertEquals(final3.repository, undefined);
    });

    it("should preserve independent initiator_user_id for each session", async () => {
      const session1: Session = {
        session_id: `${sessions[0].channelId}:${sessions[0].threadTs}`,
        phase: Phase.Questioning,
        repository: sessions[0].repo,
        initiator_user_id: sessions[0].userId,
        confidence_score: 0,
        created_at: new Date().toISOString(),
        ttl: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      };

      const session2: Session = {
        session_id: `${sessions[1].channelId}:${sessions[1].threadTs}`,
        phase: Phase.Questioning,
        repository: sessions[1].repo,
        initiator_user_id: sessions[1].userId,
        confidence_score: 0,
        created_at: new Date().toISOString(),
        ttl: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      };

      const session3: Session = {
        session_id: `${sessions[2].channelId}:${sessions[2].threadTs}`,
        phase: Phase.Questioning,
        repository: undefined,
        initiator_user_id: sessions[2].userId,
        confidence_score: 0,
        created_at: new Date().toISOString(),
        ttl: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      };

      await datastoreClient.put(session1);
      await datastoreClient.put(session2);
      await datastoreClient.put(session3);

      // Update sessions with various changes
      session1.confidence_score = 50;
      await sessionManager.updateSession(session1);

      session2.phase = Phase.Review;
      await sessionManager.updateSession(session2);

      session3.phase = Phase.Finalized;
      await sessionManager.updateSession(session3);

      // Verify initiator remains unchanged
      const loaded1 = await sessionManager.loadSession(sessions[0].channelId, sessions[0].threadTs);
      const loaded2 = await sessionManager.loadSession(sessions[1].channelId, sessions[1].threadTs);
      const loaded3 = await sessionManager.loadSession(sessions[2].channelId, sessions[2].threadTs);

      assertExists(loaded1);
      assertExists(loaded2);
      assertExists(loaded3);

      assertEquals(loaded1.initiator_user_id, "U1111111111");
      assertEquals(loaded2.initiator_user_id, "U2222222222");
      assertEquals(loaded3.initiator_user_id, "U3333333333");
    });

    it("should preserve independent repository for each session", async () => {
      const session1: Session = {
        session_id: `${sessions[0].channelId}:${sessions[0].threadTs}`,
        phase: Phase.Questioning,
        repository: "org1/repo1",
        initiator_user_id: sessions[0].userId,
        confidence_score: 0,
        created_at: new Date().toISOString(),
        ttl: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      };

      const session2: Session = {
        session_id: `${sessions[1].channelId}:${sessions[1].threadTs}`,
        phase: Phase.Questioning,
        repository: "org2/repo2",
        initiator_user_id: sessions[1].userId,
        confidence_score: 0,
        created_at: new Date().toISOString(),
        ttl: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      };

      const session3: Session = {
        session_id: `${sessions[2].channelId}:${sessions[2].threadTs}`,
        phase: Phase.Questioning,
        repository: undefined,
        initiator_user_id: sessions[2].userId,
        confidence_score: 0,
        created_at: new Date().toISOString(),
        ttl: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      };

      await datastoreClient.put(session1);
      await datastoreClient.put(session2);
      await datastoreClient.put(session3);

      // Various updates
      session1.phase = Phase.Finalized;
      session1.epic_number = 10;
      await sessionManager.updateSession(session1);

      session2.phase = Phase.Finalized;
      session2.epic_number = 20;
      await sessionManager.updateSession(session2);

      // Verify repositories remain unchanged
      const loaded1 = await sessionManager.loadSession(sessions[0].channelId, sessions[0].threadTs);
      const loaded2 = await sessionManager.loadSession(sessions[1].channelId, sessions[1].threadTs);
      const loaded3 = await sessionManager.loadSession(sessions[2].channelId, sessions[2].threadTs);

      assertExists(loaded1);
      assertExists(loaded2);
      assertExists(loaded3);

      assertEquals(loaded1.repository, "org1/repo1");
      assertEquals(loaded2.repository, "org2/repo2");
      assertEquals(loaded3.repository, undefined);
    });
  });

  describe("correct session identification", () => {
    it("should correctly identify sessions using channel ID and thread timestamp", async () => {
      // Create sessions with specific combinations
      const combinations = [
        { channelId: "C1234567890", threadTs: "1111111111.111111" },
        { channelId: "C1234567890", threadTs: "2222222222.222222" },
        { channelId: "C9876543210", threadTs: "1111111111.111111" },
        { channelId: "C9876543210", threadTs: "2222222222.222222" },
      ];

      // Create sessions with different confidence scores as markers
      for (let i = 0; i < combinations.length; i++) {
        const session: Session = {
          session_id: `${combinations[i].channelId}:${combinations[i].threadTs}`,
          phase: Phase.Questioning,
          initiator_user_id: `U${i}`,
          confidence_score: (i + 1) * 10, // 10, 20, 30, 40
          created_at: new Date().toISOString(),
          ttl: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        };
        await datastoreClient.put(session);
      }

      // Verify each session is correctly identified
      for (let i = 0; i < combinations.length; i++) {
        const loaded = await sessionManager.loadSession(
          combinations[i].channelId,
          combinations[i].threadTs,
        );
        assertExists(loaded);
        assertEquals(loaded.confidence_score, (i + 1) * 10);
        assertEquals(loaded.session_id, `${combinations[i].channelId}:${combinations[i].threadTs}`);
      }
    });

    it("should return null for non-existent channel/thread combinations", async () => {
      // Create one session
      const session: Session = {
        session_id: "C1234567890:1234567890.123456",
        phase: Phase.Questioning,
        initiator_user_id: "U1234567890",
        confidence_score: 50,
        created_at: new Date().toISOString(),
        ttl: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      };
      await datastoreClient.put(session);

      // Try to load non-existent sessions
      const nonExistent1 = await sessionManager.loadSession("C1234567890", "9999999999.999999");
      const nonExistent2 = await sessionManager.loadSession("C9999999999", "1234567890.123456");
      const nonExistent3 = await sessionManager.loadSession("C9999999999", "9999999999.999999");

      assertEquals(nonExistent1, null);
      assertEquals(nonExistent2, null);
      assertEquals(nonExistent3, null);
    });
  });
});
