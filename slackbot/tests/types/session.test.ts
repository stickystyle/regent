// ABOUTME: Tests for Session data model validating composite ID, phase transitions, and TTL.
// ABOUTME: Ensures Session type meets requirements for session initialization and persistence.

import { assertEquals, assertExists } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import { formatSessionId, Phase, Session } from "../../src/types/session.ts";

describe("Session Type", () => {
  describe("formatSessionId", () => {
    it("should format session ID as channel_id:thread_ts", () => {
      const channelId = "C1234567890";
      const threadTs = "1234567890.123456";
      const sessionId = formatSessionId(channelId, threadTs);
      assertEquals(sessionId, "C1234567890:1234567890.123456");
    });

    it("should handle different channel ID formats", () => {
      const sessionId = formatSessionId("C9876543210", "9876543210.654321");
      assertEquals(sessionId, "C9876543210:9876543210.654321");
    });

    it("should create unique IDs for different threads in same channel", () => {
      const channelId = "C1111111111";
      const id1 = formatSessionId(channelId, "1111111111.111111");
      const id2 = formatSessionId(channelId, "2222222222.222222");
      assertEquals(id1 !== id2, true);
    });

    it("should create unique IDs for same timestamp in different channels", () => {
      const threadTs = "1234567890.123456";
      const id1 = formatSessionId("C1111111111", threadTs);
      const id2 = formatSessionId("C2222222222", threadTs);
      assertEquals(id1 !== id2, true);
    });
  });

  describe("Phase enum", () => {
    it("should have questioning phase", () => {
      assertEquals(Phase.Questioning, "questioning");
    });

    it("should have review phase", () => {
      assertEquals(Phase.Review, "review");
    });

    it("should have finalized phase", () => {
      assertEquals(Phase.Finalized, "finalized");
    });

    it("should only have three valid phases", () => {
      const phases = Object.values(Phase);
      assertEquals(phases.length, 3);
      assertEquals(phases.includes(Phase.Questioning), true);
      assertEquals(phases.includes(Phase.Review), true);
      assertEquals(phases.includes(Phase.Finalized), true);
    });
  });

  describe("Session interface", () => {
    it("should create a valid session with all required fields", () => {
      const createdAt = new Date("2025-01-01T00:00:00.000Z");
      const ttl = new Date("2025-01-31T00:00:00.000Z");

      const session: Session = {
        session_id: "C1234567890:1234567890.123456",
        phase: Phase.Questioning,
        initiator_user_id: "U1234567890",
        confidence_score: 75,
        created_at: createdAt.toISOString(),
        ttl: ttl.toISOString(),
      };

      assertEquals(session.session_id, "C1234567890:1234567890.123456");
      assertEquals(session.phase, Phase.Questioning);
      assertEquals(session.initiator_user_id, "U1234567890");
      assertEquals(session.confidence_score, 75);
      assertExists(session.created_at);
      assertExists(session.ttl);
    });

    it("should allow optional repository field", () => {
      const session: Session = {
        session_id: "C1234567890:1234567890.123456",
        repository: "owner/repo",
        phase: Phase.Questioning,
        initiator_user_id: "U1234567890",
        confidence_score: 50,
        created_at: new Date().toISOString(),
        ttl: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      };

      assertEquals(session.repository, "owner/repo");
    });

    it("should allow optional canvas_id field", () => {
      const session: Session = {
        session_id: "C1234567890:1234567890.123456",
        phase: Phase.Review,
        initiator_user_id: "U1234567890",
        canvas_id: "F1234567890",
        confidence_score: 80,
        created_at: new Date().toISOString(),
        ttl: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      };

      assertEquals(session.canvas_id, "F1234567890");
    });

    it("should work without optional fields", () => {
      const session: Session = {
        session_id: "C1234567890:1234567890.123456",
        phase: Phase.Questioning,
        initiator_user_id: "U1234567890",
        confidence_score: 0,
        created_at: new Date().toISOString(),
        ttl: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      };

      assertEquals(session.repository, undefined);
      assertEquals(session.canvas_id, undefined);
    });
  });

  describe("TTL calculation", () => {
    it("should calculate TTL as created_at plus 30 days", () => {
      const createdAt = new Date("2025-01-01T00:00:00.000Z");
      const expectedTtl = new Date("2025-01-31T00:00:00.000Z");

      const session: Session = {
        session_id: "C1234567890:1234567890.123456",
        phase: Phase.Questioning,
        initiator_user_id: "U1234567890",
        confidence_score: 50,
        created_at: createdAt.toISOString(),
        ttl: expectedTtl.toISOString(),
      };

      const createdDate = new Date(session.created_at);
      const ttlDate = new Date(session.ttl);
      const daysDiff = (ttlDate.getTime() - createdDate.getTime()) / (24 * 60 * 60 * 1000);

      assertEquals(daysDiff, 30);
    });

    it("should handle TTL calculation across month boundaries", () => {
      const createdAt = new Date("2025-02-15T12:30:00.000Z");
      const expectedTtl = new Date("2025-03-17T12:30:00.000Z");

      const session: Session = {
        session_id: "C1234567890:1234567890.123456",
        phase: Phase.Questioning,
        initiator_user_id: "U1234567890",
        confidence_score: 50,
        created_at: createdAt.toISOString(),
        ttl: expectedTtl.toISOString(),
      };

      const createdDate = new Date(session.created_at);
      const ttlDate = new Date(session.ttl);
      const daysDiff = (ttlDate.getTime() - createdDate.getTime()) / (24 * 60 * 60 * 1000);

      assertEquals(daysDiff, 30);
    });
  });

  describe("Confidence score", () => {
    it("should allow confidence score of 0", () => {
      const session: Session = {
        session_id: "C1234567890:1234567890.123456",
        phase: Phase.Questioning,
        initiator_user_id: "U1234567890",
        confidence_score: 0,
        created_at: new Date().toISOString(),
        ttl: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      };

      assertEquals(session.confidence_score, 0);
    });

    it("should allow confidence score of 100", () => {
      const session: Session = {
        session_id: "C1234567890:1234567890.123456",
        phase: Phase.Questioning,
        initiator_user_id: "U1234567890",
        confidence_score: 100,
        created_at: new Date().toISOString(),
        ttl: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      };

      assertEquals(session.confidence_score, 100);
    });

    it("should allow confidence scores in valid range", () => {
      const scores = [0, 25, 50, 75, 100];

      scores.forEach((score) => {
        const session: Session = {
          session_id: "C1234567890:1234567890.123456",
          phase: Phase.Questioning,
          initiator_user_id: "U1234567890",
          confidence_score: score,
          created_at: new Date().toISOString(),
          ttl: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        };

        assertEquals(session.confidence_score, score);
      });
    });
  });

  describe("Phase transitions", () => {
    it("should allow phase transition from questioning to review", () => {
      const session: Session = {
        session_id: "C1234567890:1234567890.123456",
        phase: Phase.Questioning,
        initiator_user_id: "U1234567890",
        confidence_score: 80,
        created_at: new Date().toISOString(),
        ttl: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      };

      const updatedSession: Session = {
        ...session,
        phase: Phase.Review,
        canvas_id: "F1234567890",
      };

      assertEquals(updatedSession.phase, Phase.Review);
      assertEquals(updatedSession.canvas_id, "F1234567890");
    });

    it("should allow phase transition from review to finalized", () => {
      const session: Session = {
        session_id: "C1234567890:1234567890.123456",
        phase: Phase.Review,
        initiator_user_id: "U1234567890",
        canvas_id: "F1234567890",
        confidence_score: 95,
        created_at: new Date().toISOString(),
        ttl: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      };

      const updatedSession: Session = {
        ...session,
        phase: Phase.Finalized,
      };

      assertEquals(updatedSession.phase, Phase.Finalized);
    });
  });

  describe("Timestamp format", () => {
    it("should store timestamps in ISO 8601 format", () => {
      const now = new Date();
      const session: Session = {
        session_id: "C1234567890:1234567890.123456",
        phase: Phase.Questioning,
        initiator_user_id: "U1234567890",
        confidence_score: 50,
        created_at: now.toISOString(),
        ttl: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      };

      // Verify ISO format by parsing
      assertEquals(typeof session.created_at, "string");
      assertEquals(typeof session.ttl, "string");

      const parsedCreatedAt = new Date(session.created_at);
      const parsedTtl = new Date(session.ttl);

      assertEquals(parsedCreatedAt instanceof Date, true);
      assertEquals(parsedTtl instanceof Date, true);
      assertEquals(isNaN(parsedCreatedAt.getTime()), false);
      assertEquals(isNaN(parsedTtl.getTime()), false);
    });
  });
});
