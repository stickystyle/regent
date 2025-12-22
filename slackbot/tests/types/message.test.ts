// ABOUTME: Tests for Message data model validating official answer detection and attachments.
// ABOUTME: Ensures Message type meets requirements for recording user answers and bot questions.

import { assertEquals, assertExists } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import { isOfficialAnswer, Message, ProcessedAttachment } from "../../src/types/message.ts";

describe("Message Type", () => {
  describe("isOfficialAnswer", () => {
    it("should detect messages starting with @regent", () => {
      const text = "@regent This is my answer to the question.";
      assertEquals(isOfficialAnswer(text), true);
    });

    it("should detect @regent with extra spaces", () => {
      const text = "@regent   Answer with extra spaces";
      assertEquals(isOfficialAnswer(text), true);
    });

    it("should not detect messages without @regent prefix", () => {
      const text = "This is just a regular message";
      assertEquals(isOfficialAnswer(text), false);
    });

    it("should not detect @regent in the middle of text", () => {
      const text = "I'm going to mention @regent in the middle";
      assertEquals(isOfficialAnswer(text), false);
    });

    it("should not detect @regent with leading whitespace", () => {
      const text = "  @regent Answer with leading spaces";
      assertEquals(isOfficialAnswer(text), false);
    });

    it("should handle empty strings", () => {
      assertEquals(isOfficialAnswer(""), false);
    });

    it("should handle @regent as the only content", () => {
      assertEquals(isOfficialAnswer("@regent"), true);
    });

    it("should be case-sensitive (only lowercase @regent)", () => {
      assertEquals(isOfficialAnswer("@Regent answer"), false);
      assertEquals(isOfficialAnswer("@REGENT answer"), false);
      assertEquals(isOfficialAnswer("@regent answer"), true);
    });
  });

  describe("ProcessedAttachment interface", () => {
    it("should store file metadata", () => {
      const attachment: ProcessedAttachment = {
        file_id: "F1234567890",
        filename: "document.pdf",
        mimetype: "application/pdf",
        content: "Processed file content...",
      };

      assertEquals(attachment.file_id, "F1234567890");
      assertEquals(attachment.filename, "document.pdf");
      assertEquals(attachment.mimetype, "application/pdf");
      assertExists(attachment.content);
    });

    it("should handle text files", () => {
      const attachment: ProcessedAttachment = {
        file_id: "F9876543210",
        filename: "notes.txt",
        mimetype: "text/plain",
        content: "These are my notes for the spec.",
      };

      assertEquals(attachment.mimetype, "text/plain");
      assertEquals(attachment.content, "These are my notes for the spec.");
    });

    it("should handle various file types", () => {
      const types = [
        { mimetype: "application/pdf", filename: "doc.pdf" },
        { mimetype: "text/plain", filename: "notes.txt" },
        { mimetype: "text/markdown", filename: "spec.md" },
        { mimetype: "application/json", filename: "config.json" },
      ];

      types.forEach((type) => {
        const attachment: ProcessedAttachment = {
          file_id: "F1234567890",
          filename: type.filename,
          mimetype: type.mimetype,
          content: "content",
        };

        assertEquals(attachment.mimetype, type.mimetype);
        assertEquals(attachment.filename, type.filename);
      });
    });
  });

  describe("Message interface", () => {
    it("should create a message from bot", () => {
      const message: Message = {
        sender: "bot",
        text: "What problem are you trying to solve?",
        timestamp: "1234567890.123456",
        is_official_answer: false,
      };

      assertEquals(message.sender, "bot");
      assertEquals(message.is_official_answer, false);
      assertExists(message.text);
      assertExists(message.timestamp);
    });

    it("should create a message from user", () => {
      const message: Message = {
        sender: "U1234567890",
        text: "@regent We need to track user authentication state.",
        timestamp: "1234567890.123456",
        is_official_answer: true,
      };

      assertEquals(message.sender, "U1234567890");
      assertEquals(message.is_official_answer, true);
    });

    it("should support messages with attachments", () => {
      const attachment: ProcessedAttachment = {
        file_id: "F1234567890",
        filename: "spec.md",
        mimetype: "text/markdown",
        content: "# Specification\n\nDetails here...",
      };

      const message: Message = {
        sender: "U1234567890",
        text: "@regent Here's the spec document",
        timestamp: "1234567890.123456",
        is_official_answer: true,
        attachments: [attachment],
      };

      assertEquals(message.attachments?.length, 1);
      assertEquals(message.attachments?.[0].filename, "spec.md");
    });

    it("should support multiple attachments", () => {
      const attachments: ProcessedAttachment[] = [
        {
          file_id: "F1111111111",
          filename: "doc1.txt",
          mimetype: "text/plain",
          content: "First document",
        },
        {
          file_id: "F2222222222",
          filename: "doc2.txt",
          mimetype: "text/plain",
          content: "Second document",
        },
      ];

      const message: Message = {
        sender: "U1234567890",
        text: "@regent Multiple files attached",
        timestamp: "1234567890.123456",
        is_official_answer: true,
        attachments: attachments,
      };

      assertEquals(message.attachments?.length, 2);
      assertEquals(message.attachments?.[0].file_id, "F1111111111");
      assertEquals(message.attachments?.[1].file_id, "F2222222222");
    });

    it("should allow messages without attachments", () => {
      const message: Message = {
        sender: "U1234567890",
        text: "@regent Simple text answer",
        timestamp: "1234567890.123456",
        is_official_answer: true,
      };

      assertEquals(message.attachments, undefined);
    });

    it("should allow empty attachments array", () => {
      const message: Message = {
        sender: "U1234567890",
        text: "@regent Answer with empty attachments",
        timestamp: "1234567890.123456",
        is_official_answer: true,
        attachments: [],
      };

      assertEquals(message.attachments?.length, 0);
    });
  });

  describe("Sender tracking", () => {
    it('should use "bot" for bot-sent messages', () => {
      const message: Message = {
        sender: "bot",
        text: "What is your project about?",
        timestamp: "1234567890.123456",
        is_official_answer: false,
      };

      assertEquals(message.sender, "bot");
    });

    it("should use Slack user ID for user messages", () => {
      const userId = "U1234567890";
      const message: Message = {
        sender: userId,
        text: "My answer to the question",
        timestamp: "1234567890.123456",
        is_official_answer: false,
      };

      assertEquals(message.sender, userId);
    });

    it("should handle different user ID formats", () => {
      const userIds = ["U1234567890", "U9876543210", "USLACKBOT"];

      userIds.forEach((userId) => {
        const message: Message = {
          sender: userId,
          text: "Test message",
          timestamp: "1234567890.123456",
          is_official_answer: false,
        };

        assertEquals(message.sender, userId);
      });
    });
  });

  describe("Official answer detection", () => {
    it("should mark messages with @regent prefix as official answers", () => {
      const message: Message = {
        sender: "U1234567890",
        text: "@regent This is an official answer",
        timestamp: "1234567890.123456",
        is_official_answer: true,
      };

      assertEquals(message.is_official_answer, true);
      assertEquals(isOfficialAnswer(message.text), true);
    });

    it("should not mark messages without @regent as official answers", () => {
      const message: Message = {
        sender: "U1234567890",
        text: "Just a discussion message",
        timestamp: "1234567890.123456",
        is_official_answer: false,
      };

      assertEquals(message.is_official_answer, false);
      assertEquals(isOfficialAnswer(message.text), false);
    });

    it("should handle bot messages (never official answers)", () => {
      const message: Message = {
        sender: "bot",
        text: "What problem are you solving?",
        timestamp: "1234567890.123456",
        is_official_answer: false,
      };

      assertEquals(message.is_official_answer, false);
      assertEquals(message.sender, "bot");
    });
  });

  describe("Timestamp format", () => {
    it("should store Slack message timestamps", () => {
      const timestamp = "1234567890.123456";
      const message: Message = {
        sender: "U1234567890",
        text: "@regent Answer",
        timestamp: timestamp,
        is_official_answer: true,
      };

      assertEquals(message.timestamp, timestamp);
      assertEquals(typeof message.timestamp, "string");
    });

    it("should handle different Slack timestamp formats", () => {
      const timestamps = [
        "1234567890.123456",
        "9876543210.654321",
        "1111111111.111111",
      ];

      timestamps.forEach((ts) => {
        const message: Message = {
          sender: "bot",
          text: "Question",
          timestamp: ts,
          is_official_answer: false,
        };

        assertEquals(message.timestamp, ts);
      });
    });
  });

  describe("Text content", () => {
    it("should store message text content", () => {
      const text = "@regent We need to build a collaborative spec tool.";
      const message: Message = {
        sender: "U1234567890",
        text: text,
        timestamp: "1234567890.123456",
        is_official_answer: true,
      };

      assertEquals(message.text, text);
    });

    it("should handle long text content", () => {
      const longText = "@regent " + "A".repeat(3000);
      const message: Message = {
        sender: "U1234567890",
        text: longText,
        timestamp: "1234567890.123456",
        is_official_answer: true,
      };

      assertEquals(message.text.length, longText.length);
      assertEquals(message.text.startsWith("@regent"), true);
    });

    it("should handle text with special characters", () => {
      const text = "@regent Special chars: <>, &, \", ', emojis 🎉, newlines\n\nand tabs\t";
      const message: Message = {
        sender: "U1234567890",
        text: text,
        timestamp: "1234567890.123456",
        is_official_answer: true,
      };

      assertEquals(message.text, text);
    });

    it("should handle empty text", () => {
      const message: Message = {
        sender: "bot",
        text: "",
        timestamp: "1234567890.123456",
        is_official_answer: false,
      };

      assertEquals(message.text, "");
    });
  });
});
