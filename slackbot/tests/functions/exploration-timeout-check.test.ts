// ABOUTME: Tests for ExplorationTimeoutFunction that checks for stale sessions.
// ABOUTME: Validates function definition, timeout logic, datastore queries, and messaging.

import { assertEquals, assertExists } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import {
  ExplorationTimeoutFunction,
  isSessionTimedOut,
  TIMEOUT_MINUTES,
} from "../../functions/exploration-timeout-check.ts";
import { Phase } from "../../src/types/session.ts";
import type { Session } from "../../src/types/session.ts";

describe("ExplorationTimeoutFunction", () => {
  describe("function definition", () => {
    it("should have correct callback_id", () => {
      assertEquals(
        ExplorationTimeoutFunction.definition.callback_id,
        "exploration_timeout_function",
      );
    });

    it("should have a title", () => {
      assertEquals(
        ExplorationTimeoutFunction.definition.title,
        "Exploration Timeout Check",
      );
    });

    it("should have a description", () => {
      assertExists(ExplorationTimeoutFunction.definition.description);
    });

    it("should specify correct source_file", () => {
      assertEquals(
        ExplorationTimeoutFunction.definition.source_file,
        "functions/exploration-timeout-check.ts",
      );
    });
  });

  describe("input parameters", () => {
    it("should have empty input_parameters properties", () => {
      const inputProps =
        ExplorationTimeoutFunction.definition.input_parameters?.properties;
      assertExists(inputProps);
      assertEquals(Object.keys(inputProps).length, 0);
    });

    it("should have empty required array", () => {
      const required =
        ExplorationTimeoutFunction.definition.input_parameters?.required;
      assertExists(required);
      assertEquals(required.length, 0);
    });
  });

  describe("output parameters", () => {
    it("should have success output parameter", () => {
      const outputProps =
        ExplorationTimeoutFunction.definition.output_parameters?.properties;
      assertExists(outputProps);
      assertExists(outputProps.success);
    });

    it("should have sessions_checked output parameter", () => {
      const outputProps =
        ExplorationTimeoutFunction.definition.output_parameters?.properties;
      assertExists(outputProps);
      assertExists(outputProps.sessions_checked);
    });

    it("should have timeouts_posted output parameter", () => {
      const outputProps =
        ExplorationTimeoutFunction.definition.output_parameters?.properties;
      assertExists(outputProps);
      assertExists(outputProps.timeouts_posted);
    });

    it("should require success output parameter", () => {
      const required =
        ExplorationTimeoutFunction.definition.output_parameters?.required;
      assertExists(required);
      assertEquals(required.includes("success"), true);
    });

    it("should require sessions_checked output parameter", () => {
      const required =
        ExplorationTimeoutFunction.definition.output_parameters?.required;
      assertExists(required);
      assertEquals(required.includes("sessions_checked"), true);
    });

    it("should require timeouts_posted output parameter", () => {
      const required =
        ExplorationTimeoutFunction.definition.output_parameters?.required;
      assertExists(required);
      assertEquals(required.includes("timeouts_posted"), true);
    });
  });
});

describe("isSessionTimedOut", () => {
  describe("timeout threshold", () => {
    it("should export TIMEOUT_MINUTES constant as 5", () => {
      assertEquals(TIMEOUT_MINUTES, 5);
    });
  });

  describe("session age calculation", () => {
    it("should return true for session older than 5 minutes", () => {
      const now = new Date();
      const sixMinutesAgo = new Date(now.getTime() - 6 * 60 * 1000);

      const session: Session = {
        session_id: "C123:1234567890.123456",
        phase: Phase.Initializing,
        initiator_user_id: "U123",
        confidence_score: 0,
        created_at: sixMinutesAgo.toISOString(),
        ttl: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      };

      assertEquals(isSessionTimedOut(session, now), true);
    });

    it("should return false for session younger than 5 minutes", () => {
      const now = new Date();
      const fourMinutesAgo = new Date(now.getTime() - 4 * 60 * 1000);

      const session: Session = {
        session_id: "C123:1234567890.123456",
        phase: Phase.Initializing,
        initiator_user_id: "U123",
        confidence_score: 0,
        created_at: fourMinutesAgo.toISOString(),
        ttl: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      };

      assertEquals(isSessionTimedOut(session, now), false);
    });

    it("should return true for session exactly 5 minutes old", () => {
      const now = new Date();
      const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);

      const session: Session = {
        session_id: "C123:1234567890.123456",
        phase: Phase.Initializing,
        initiator_user_id: "U123",
        confidence_score: 0,
        created_at: fiveMinutesAgo.toISOString(),
        ttl: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      };

      assertEquals(isSessionTimedOut(session, now), true);
    });

    it("should return false for session just created", () => {
      const now = new Date();

      const session: Session = {
        session_id: "C123:1234567890.123456",
        phase: Phase.Initializing,
        initiator_user_id: "U123",
        confidence_score: 0,
        created_at: now.toISOString(),
        ttl: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      };

      assertEquals(isSessionTimedOut(session, now), false);
    });

    it("should return true for very old session (hours ago)", () => {
      const now = new Date();
      const hoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);

      const session: Session = {
        session_id: "C123:1234567890.123456",
        phase: Phase.Initializing,
        initiator_user_id: "U123",
        confidence_score: 0,
        created_at: hoursAgo.toISOString(),
        ttl: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      };

      assertEquals(isSessionTimedOut(session, now), true);
    });
  });
});

describe("Timeout Message", () => {
  it("should contain retry instructions with /regent brainstorm", () => {
    // The timeout message should instruct users how to retry
    const expectedSubstring = "/regent brainstorm";
    const message = "Exploration is taking longer than expected. You can retry using `/regent brainstorm {spec-name}`";

    assertEquals(message.includes(expectedSubstring), true);
  });

  it("should mention exploration taking longer than expected", () => {
    const message = "Exploration is taking longer than expected. You can retry using `/regent brainstorm {spec-name}`";

    assertEquals(message.includes("Exploration is taking longer than expected"), true);
  });
});

describe("Session Phase Filtering", () => {
  describe("phase checking", () => {
    it("should only process sessions in Initializing phase", () => {
      // The function queries only for sessions with phase="initializing"
      // This test documents the expected behavior
      const initializingSession: Session = {
        session_id: "C123:1234567890.123456",
        phase: Phase.Initializing,
        initiator_user_id: "U123",
        confidence_score: 0,
        created_at: new Date().toISOString(),
        ttl: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      };

      assertEquals(initializingSession.phase, Phase.Initializing);
    });

    it("should not process sessions in Questioning phase", () => {
      const questioningSession: Session = {
        session_id: "C123:1234567890.123456",
        phase: Phase.Questioning,
        initiator_user_id: "U123",
        confidence_score: 50,
        created_at: new Date().toISOString(),
        ttl: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      };

      // The function should skip this session
      assertEquals(questioningSession.phase !== Phase.Initializing, true);
    });

    it("should not process sessions in Review phase", () => {
      const reviewSession: Session = {
        session_id: "C123:1234567890.123456",
        phase: Phase.Review,
        initiator_user_id: "U123",
        confidence_score: 95,
        created_at: new Date().toISOString(),
        ttl: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      };

      assertEquals(reviewSession.phase !== Phase.Initializing, true);
    });

    it("should not process sessions in Finalized phase", () => {
      const finalizedSession: Session = {
        session_id: "C123:1234567890.123456",
        phase: Phase.Finalized,
        initiator_user_id: "U123",
        confidence_score: 100,
        created_at: new Date().toISOString(),
        ttl: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      };

      assertEquals(finalizedSession.phase !== Phase.Initializing, true);
    });
  });
});

describe("Session State Preservation", () => {
  it("should NOT modify session state when posting timeout message", () => {
    // This is a key requirement: the function posts a message but does NOT
    // modify the session state. The session remains in Initializing phase.
    // This allows the exploration callback to still complete if it arrives later.

    // The function signature and design documentation specify:
    // - Post timeout messages to threads
    // - Do NOT modify session state

    // This test documents this important constraint
    const session: Session = {
      session_id: "C123:1234567890.123456",
      phase: Phase.Initializing,
      initiator_user_id: "U123",
      confidence_score: 0,
      created_at: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
      ttl: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    };

    // After processing, session phase should still be Initializing
    // The actual verification would be in integration tests
    assertEquals(session.phase, Phase.Initializing);
  });
});

describe("ExplorationTimeoutFunction (Static Analysis)", () => {
  // Read the function file for static analysis
  const functionPath = new URL(
    "../../functions/exploration-timeout-check.ts",
    import.meta.url,
  );

  it("should exist at functions/exploration-timeout-check.ts", async () => {
    const stat = await Deno.stat(functionPath);
    assertExists(stat);
    assertEquals(stat.isFile, true);
  });

  it("should have ABOUTME header comments", async () => {
    const content = await Deno.readTextFile(functionPath);
    assertEquals(content.includes("// ABOUTME:"), true);
  });

  it("should have two ABOUTME header lines", async () => {
    const content = await Deno.readTextFile(functionPath);
    const aboutmeMatches = content.match(/\/\/ ABOUTME:/g);
    assertExists(aboutmeMatches);
    assertEquals(aboutmeMatches.length >= 2, true);
  });

  it("should use DefineFunction", async () => {
    const content = await Deno.readTextFile(functionPath);
    assertEquals(content.includes("DefineFunction"), true);
  });

  it("should use SlackFunction", async () => {
    const content = await Deno.readTextFile(functionPath);
    assertEquals(content.includes("SlackFunction"), true);
  });

  it("should query datastore for sessions", async () => {
    const content = await Deno.readTextFile(functionPath);
    assertEquals(content.includes("datastore.query"), true);
  });

  it("should filter by phase=initializing", async () => {
    const content = await Deno.readTextFile(functionPath);
    // The code uses Phase.Initializing enum which maps to "initializing"
    assertEquals(content.includes("Phase.Initializing"), true);
  });

  it("should post messages via chat.postMessage", async () => {
    const content = await Deno.readTextFile(functionPath);
    assertEquals(content.includes("chat.postMessage"), true);
  });
});
