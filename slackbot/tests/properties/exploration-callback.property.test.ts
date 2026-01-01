// ABOUTME: Property-based tests for exploration callback handler.
// ABOUTME: Validates correctness properties 1, 2, 4, 6, and 8 from the design document.

import { assertEquals, assertExists } from "@std/assert";
import { afterEach, beforeEach, describe, it } from "@std/testing/bdd";
import fc from "npm:fast-check@3";
import {
  type ExplorationHandlerDependencies,
  type ExplorationHandlerRequest,
  handleExplorationCallback,
} from "../../src/handlers/exploration-handler.ts";
import type { ExplorationCallbackSuccess } from "../../src/types/exploration-callback.ts";
import { MockSlackMessagingClient } from "../../src/clients/messaging-client.ts";
import { MockDatastoreClient } from "../../src/managers/datastore-client.ts";
import { SessionManager } from "../../src/managers/session-manager.ts";
import { Phase, type Session } from "../../src/types/session.ts";

/**
 * Extended MockDatastoreClient with helper methods for testing.
 */
class TestDatastoreClient extends MockDatastoreClient {
  setSession(session: Session): void {
    this.put(session);
  }

  async getSession(sessionId: string): Promise<Session | undefined> {
    const result = await this.get(sessionId);
    return result.item;
  }
}

/**
 * Arbitrary generator for random exploration context data.
 */
const explorationContextArb = fc.record({
  project_overview: fc.string({ minLength: 0, maxLength: 1000 }),
  architecture_summary: fc.string({ minLength: 0, maxLength: 1000 }),
  relevant_patterns: fc.array(fc.string({ minLength: 1, maxLength: 50 }), { maxLength: 10 }),
  key_files: fc.array(fc.string({ minLength: 1, maxLength: 100 }), { maxLength: 20 }),
  testing_approach: fc.string({ minLength: 0, maxLength: 500 }),
});

/**
 * Arbitrary generator for session phases.
 */
const phaseArb = fc.constantFrom(
  Phase.Initializing,
  Phase.Questioning,
  Phase.Review,
  Phase.Finalized,
);

describe("Exploration Callback Property Tests", () => {
  let mockDatastore: TestDatastoreClient;
  let sessionManager: SessionManager;
  let messagingClient: MockSlackMessagingClient;
  let dependencies: ExplorationHandlerDependencies;

  const callbackSecret = "test-callback-secret";
  const channelId = "C1234567890";
  const threadTs = "1234567890.123456";
  const sessionId = `${channelId}:${threadTs}`;

  const createSession = (phase: Phase): Session => ({
    session_id: sessionId,
    phase,
    initiator_user_id: "U123",
    confidence_score: 0,
    created_at: new Date().toISOString(),
    ttl: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    repository: "owner/repo",
  });

  const createSuccessCallback = (
    context: Record<string, unknown>,
  ): ExplorationCallbackSuccess => ({
    session_id: sessionId,
    status: "success",
    exploration_context: context,
  });

  beforeEach(() => {
    mockDatastore = new TestDatastoreClient();
    sessionManager = new SessionManager(mockDatastore);
    messagingClient = new MockSlackMessagingClient();

    dependencies = {
      sessionManager,
      messagingClient,
      callbackSecret,
    };
  });

  afterEach(() => {
    mockDatastore.clear();
    messagingClient.clear();
  });

  describe("Property 1: Session State Transition Safety", () => {
    it("SHALL only process callbacks for sessions with phase=Initializing", async () => {
      await fc.assert(
        fc.asyncProperty(phaseArb, async (phase) => {
          // Reset state between runs
          mockDatastore.clear();
          messagingClient.clear();

          const session = createSession(phase);
          mockDatastore.setSession(session);

          const request: ExplorationHandlerRequest = {
            authorizationHeader: `Bearer ${callbackSecret}`,
            body: createSuccessCallback({ project_overview: "Test project" }),
          };

          const response = await handleExplorationCallback(request, dependencies);

          if (phase === Phase.Initializing) {
            // Should succeed for Initializing state
            assertEquals(response.status, 200);
            assertEquals(response.ok, true);
          } else {
            // Should reject for all other states
            assertEquals(response.status, 400);
            assertEquals(response.ok, false);
            assertEquals(response.error, "Bad Request: Session is not in Initializing state");
          }
        }),
        { numRuns: 100 },
      );
    });

    it("SHALL reject callbacks for non-existent sessions", async () => {
      // No session in datastore
      const request: ExplorationHandlerRequest = {
        authorizationHeader: `Bearer ${callbackSecret}`,
        body: createSuccessCallback({ project_overview: "Test project" }),
      };

      const response = await handleExplorationCallback(request, dependencies);

      assertEquals(response.status, 404);
      assertEquals(response.ok, false);
      assertEquals(response.error, "Not Found: Session not found");
    });
  });

  describe("Property 2: Exploration Data Durability", () => {
    it("SHALL persist exploration_data in session datastore for valid callbacks", async () => {
      await fc.assert(
        fc.asyncProperty(explorationContextArb, async (context) => {
          // Reset state between runs
          mockDatastore.clear();
          messagingClient.clear();

          const session = createSession(Phase.Initializing);
          mockDatastore.setSession(session);

          const request: ExplorationHandlerRequest = {
            authorizationHeader: `Bearer ${callbackSecret}`,
            body: createSuccessCallback(context),
          };

          const response = await handleExplorationCallback(request, dependencies);

          // Skip assertions if payload was too large (that's tested separately)
          if (response.status === 400 && response.error?.includes("100KB")) {
            return;
          }

          assertEquals(response.status, 200);

          // Verify exploration_data was persisted
          const updatedSession = await mockDatastore.getSession(sessionId);
          assertExists(updatedSession);
          assertExists(updatedSession.exploration_data);

          // Verify round-trip: parse the stored JSON and compare
          const storedData = JSON.parse(updatedSession.exploration_data);
          assertEquals(storedData.project_overview, context.project_overview);
          assertEquals(storedData.architecture_summary, context.architecture_summary);
          assertEquals(storedData.relevant_patterns, context.relevant_patterns);
          assertEquals(storedData.key_files, context.key_files);
          assertEquals(storedData.testing_approach, context.testing_approach);
        }),
        { numRuns: 50 },
      );
    });
  });

  describe("Property 4: Retry Idempotence", () => {
    it("SHALL reject subsequent callbacks after first successful processing", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 2, max: 10 }),
          explorationContextArb,
          async (retryCount, context) => {
            // Reset state between runs
            mockDatastore.clear();
            messagingClient.clear();

            const session = createSession(Phase.Initializing);
            mockDatastore.setSession(session);

            const request: ExplorationHandlerRequest = {
              authorizationHeader: `Bearer ${callbackSecret}`,
              body: createSuccessCallback(context),
            };

            // First callback should succeed
            const firstResponse = await handleExplorationCallback(request, dependencies);

            // Skip if first call failed due to payload size
            if (firstResponse.status === 400 && firstResponse.error?.includes("100KB")) {
              return;
            }

            assertEquals(firstResponse.status, 200);
            assertEquals(firstResponse.ok, true);

            // All subsequent callbacks should fail
            for (let i = 1; i < retryCount; i++) {
              const subsequentResponse = await handleExplorationCallback(request, dependencies);
              assertEquals(subsequentResponse.status, 400);
              assertEquals(subsequentResponse.ok, false);
              assertEquals(
                subsequentResponse.error,
                "Bad Request: Session is not in Initializing state",
              );
            }
          },
        ),
        { numRuns: 20 },
      );
    });
  });

  describe("Property 6: Phase Progression", () => {
    it("SHALL transition session from Initializing to Questioning on successful callback", async () => {
      await fc.assert(
        fc.asyncProperty(explorationContextArb, async (context) => {
          // Reset state between runs
          mockDatastore.clear();
          messagingClient.clear();

          const session = createSession(Phase.Initializing);
          mockDatastore.setSession(session);

          const request: ExplorationHandlerRequest = {
            authorizationHeader: `Bearer ${callbackSecret}`,
            body: createSuccessCallback(context),
          };

          const response = await handleExplorationCallback(request, dependencies);

          // Skip if payload was too large
          if (response.status === 400 && response.error?.includes("100KB")) {
            return;
          }

          assertEquals(response.status, 200);
          assertEquals(response.ok, true);

          // Verify phase transition occurred
          const updatedSession = await mockDatastore.getSession(sessionId);
          assertExists(updatedSession);
          assertEquals(updatedSession.phase, Phase.Questioning);
        }),
        { numRuns: 50 },
      );
    });

    it("SHALL NOT modify session phase for invalid callbacks", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom(Phase.Questioning, Phase.Review, Phase.Finalized),
          async (phase) => {
            mockDatastore.clear();
            messagingClient.clear();

            const session = createSession(phase);
            mockDatastore.setSession(session);

            const request: ExplorationHandlerRequest = {
              authorizationHeader: `Bearer ${callbackSecret}`,
              body: createSuccessCallback({ project_overview: "Test" }),
            };

            await handleExplorationCallback(request, dependencies);

            // Session phase should NOT be modified
            const updatedSession = await mockDatastore.getSession(sessionId);
            assertExists(updatedSession);
            assertEquals(updatedSession.phase, phase);
          },
        ),
        { numRuns: 30 },
      );
    });
  });

  describe("Property 8: Callback Payload Size Limit", () => {
    it("SHALL accept payloads up to 100KB", async () => {
      // Generate payloads of various sizes around the 100KB boundary
      const payloadSizeArb = fc.integer({ min: 90000, max: 110000 });

      await fc.assert(
        fc.asyncProperty(payloadSizeArb, async (targetSize) => {
          // Reset state between runs
          mockDatastore.clear();
          messagingClient.clear();

          const session = createSession(Phase.Initializing);
          mockDatastore.setSession(session);

          // Create a payload of approximately the target size
          const padding = "X".repeat(Math.max(0, targetSize));
          const context = {
            project_overview: padding,
          };

          const request: ExplorationHandlerRequest = {
            authorizationHeader: `Bearer ${callbackSecret}`,
            body: createSuccessCallback(context),
          };

          const response = await handleExplorationCallback(request, dependencies);
          const payloadSize = JSON.stringify(context).length;

          if (payloadSize <= 102400) {
            // Should accept payloads under 100KB
            assertEquals(response.status, 200);
            assertEquals(response.ok, true);
          } else {
            // Should reject payloads over 100KB
            assertEquals(response.status, 400);
            assertEquals(response.ok, false);
            assertEquals(response.error, "Bad Request: Payload exceeds 100KB limit");
          }
        }),
        { numRuns: 30 },
      );
    });

    it("SHALL accept exactly 100KB payload", async () => {
      const session = createSession(Phase.Initializing);
      mockDatastore.setSession(session);

      // Create a payload of exactly 100KB (102400 bytes)
      // JSON overhead for {"project_overview":""} is 23 chars
      const overhead = 23;
      const padding = "X".repeat(102400 - overhead);
      const context = { project_overview: padding };

      // Verify our calculation is correct
      const payloadSize = JSON.stringify(context).length;
      assertEquals(payloadSize, 102400, "Test setup: payload should be exactly 100KB");

      const request: ExplorationHandlerRequest = {
        authorizationHeader: `Bearer ${callbackSecret}`,
        body: createSuccessCallback(context),
      };

      const response = await handleExplorationCallback(request, dependencies);

      // Exactly 100KB should be accepted
      assertEquals(response.status, 200, "100KB payload should be accepted");
      assertEquals(response.ok, true);
    });

    it("SHALL reject payload just over 100KB", async () => {
      const session = createSession(Phase.Initializing);
      mockDatastore.setSession(session);

      // Create a payload just over 100KB
      const padding = "X".repeat(102401);
      const context = { project_overview: padding };

      const request: ExplorationHandlerRequest = {
        authorizationHeader: `Bearer ${callbackSecret}`,
        body: createSuccessCallback(context),
      };

      const response = await handleExplorationCallback(request, dependencies);

      assertEquals(response.status, 400);
      assertEquals(response.ok, false);
      assertEquals(response.error, "Bad Request: Payload exceeds 100KB limit");
    });
  });
});
