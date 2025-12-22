// ABOUTME: Tests for slash command handler covering parsing, validation, and session creation.
// ABOUTME: Follows TDD approach to ensure all slash command functionality works correctly.

import { assertEquals, assertThrows } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import { ValidationError } from "../../src/errors/types.ts";
import {
  handleSlashCommand,
  parseCommand,
  validateChannel,
} from "../../src/handlers/slash-command.ts";

describe("parseCommand", () => {
  describe("repo flag extraction", () => {
    it("should parse command with --repo flag", () => {
      const result = parseCommand("--repo owner/repo build a feature");

      assertEquals(result.repository, "owner/repo");
      assertEquals(result.idea, "build a feature");
    });

    it("should parse command without --repo flag", () => {
      const result = parseCommand("build a feature");

      assertEquals(result.repository, undefined);
      assertEquals(result.idea, "build a feature");
    });

    it("should handle multiple spaces in idea text", () => {
      const result = parseCommand("--repo owner/repo   build   a   feature");

      assertEquals(result.repository, "owner/repo");
      assertEquals(result.idea, "build   a   feature");
    });

    it("should handle empty string after --repo flag", () => {
      const result = parseCommand("--repo owner/repo");

      assertEquals(result.repository, "owner/repo");
      assertEquals(result.idea, "");
    });

    it("should handle only idea text without flag", () => {
      const result = parseCommand("just an idea");

      assertEquals(result.repository, undefined);
      assertEquals(result.idea, "just an idea");
    });

    it("should preserve --repo in idea if not at start", () => {
      const result = parseCommand("build feature with --repo owner/repo");

      assertEquals(result.repository, undefined);
      assertEquals(result.idea, "build feature with --repo owner/repo");
    });
  });

  describe("repository format validation", () => {
    it("should accept valid owner/repo format", () => {
      const result = parseCommand("--repo stickystyle/regent test idea");

      assertEquals(result.repository, "stickystyle/regent");
    });

    it("should throw ValidationError for invalid repo format without slash", () => {
      assertThrows(
        () => parseCommand("--repo invalidrepo test idea"),
        ValidationError,
        "Invalid repository format",
      );
    });

    it("should throw ValidationError for repo with multiple slashes", () => {
      assertThrows(
        () => parseCommand("--repo owner/repo/extra test idea"),
        ValidationError,
        "Invalid repository format",
      );
    });

    it("should throw ValidationError for repo with empty owner", () => {
      assertThrows(
        () => parseCommand("--repo /repo test idea"),
        ValidationError,
        "Invalid repository format",
      );
    });

    it("should throw ValidationError for repo with empty name", () => {
      assertThrows(
        () => parseCommand("--repo owner/ test idea"),
        ValidationError,
        "Invalid repository format",
      );
    });

    it("should throw ValidationError for --repo with no value", () => {
      assertThrows(
        () => parseCommand("--repo"),
        ValidationError,
        "Invalid repository format",
      );
    });
  });

  describe("edge cases", () => {
    it("should handle empty command text", () => {
      const result = parseCommand("");

      assertEquals(result.repository, undefined);
      assertEquals(result.idea, "");
    });

    it("should handle command with only whitespace", () => {
      const result = parseCommand("   ");

      assertEquals(result.repository, undefined);
      assertEquals(result.idea, "");
    });

    it("should trim whitespace from idea", () => {
      const result = parseCommand("  build feature  ");

      assertEquals(result.repository, undefined);
      assertEquals(result.idea, "build feature");
    });

    it("should trim whitespace from repo and idea", () => {
      const result = parseCommand("--repo  owner/repo   build feature  ");

      assertEquals(result.repository, "owner/repo");
      assertEquals(result.idea, "build feature");
    });
  });
});

describe("validateChannel", () => {
  describe("channel type validation", () => {
    it("should accept public channel type", () => {
      // Should not throw
      validateChannel("channel");
    });

    it("should accept private channel type (group)", () => {
      // Should not throw
      validateChannel("group");
    });

    it("should reject DM channel type", () => {
      assertThrows(
        () => validateChannel("im"),
        ValidationError,
        "direct messages",
      );
    });

    it("should reject multi-party DM type", () => {
      assertThrows(
        () => validateChannel("mpim"),
        ValidationError,
        "direct messages",
      );
    });

    it("should throw ValidationError with helpful message for DMs", () => {
      assertThrows(
        () => validateChannel("im"),
        ValidationError,
        "Cannot use /brainstorm in direct messages",
      );
    });
  });

  describe("edge cases", () => {
    it("should reject unknown channel types", () => {
      assertThrows(
        () => validateChannel("unknown"),
        ValidationError,
        "Unsupported channel type",
      );
    });

    it("should reject empty channel type", () => {
      assertThrows(
        () => validateChannel(""),
        ValidationError,
        "Unsupported channel type",
      );
    });
  });
});

describe("handleSlashCommand", () => {
  describe("command parsing integration", () => {
    it("should parse repo flag from slash command", () => {
      const command = {
        text: "--repo owner/repo build feature",
        channel_id: "C1234567890",
        user_id: "U1234567890",
        channel_type: "channel",
        response_url: "https://hooks.slack.com/commands/123/456",
      };

      // This will fail until implementation exists
      // Testing that parsing happens correctly
      const result = handleSlashCommand(command);

      assertEquals(result.repository, "owner/repo");
      assertEquals(result.idea, "build feature");
    });

    it("should handle command without repo flag", () => {
      const command = {
        text: "build feature",
        channel_id: "C1234567890",
        user_id: "U1234567890",
        channel_type: "channel",
        response_url: "https://hooks.slack.com/commands/123/456",
      };

      const result = handleSlashCommand(command);

      assertEquals(result.repository, undefined);
      assertEquals(result.idea, "build feature");
    });
  });

  describe("channel validation integration", () => {
    it("should accept public channels", () => {
      const command = {
        text: "build feature",
        channel_id: "C1234567890",
        user_id: "U1234567890",
        channel_type: "channel",
        response_url: "https://hooks.slack.com/commands/123/456",
      };

      // Should not throw
      handleSlashCommand(command);
    });

    it("should accept private channels", () => {
      const command = {
        text: "build feature",
        channel_id: "C1234567890",
        user_id: "U1234567890",
        channel_type: "group",
        response_url: "https://hooks.slack.com/commands/123/456",
      };

      // Should not throw
      handleSlashCommand(command);
    });

    it("should reject DM channels", () => {
      const command = {
        text: "build feature",
        channel_id: "D1234567890",
        user_id: "U1234567890",
        channel_type: "im",
        response_url: "https://hooks.slack.com/commands/123/456",
      };

      assertThrows(
        () => handleSlashCommand(command),
        ValidationError,
        "direct messages",
      );
    });
  });

  describe("return value structure", () => {
    it("should return parsed command with all required fields", () => {
      const command = {
        text: "--repo owner/repo build feature",
        channel_id: "C1234567890",
        user_id: "U1234567890",
        channel_type: "channel",
        response_url: "https://hooks.slack.com/commands/123/456",
      };

      const result = handleSlashCommand(command);

      assertEquals(result.idea, "build feature");
      assertEquals(result.repository, "owner/repo");
      assertEquals(result.channelId, "C1234567890");
      assertEquals(result.userId, "U1234567890");
      assertEquals(result.channelType, "channel");
      assertEquals(result.responseUrl, "https://hooks.slack.com/commands/123/456");
    });

    it("should include channel_id in result", () => {
      const command = {
        text: "test",
        channel_id: "C9999999999",
        user_id: "U1234567890",
        channel_type: "channel",
        response_url: "https://hooks.slack.com/commands/123/456",
      };

      const result = handleSlashCommand(command);

      assertEquals(result.channelId, "C9999999999");
    });

    it("should include user_id in result", () => {
      const command = {
        text: "test",
        channel_id: "C1234567890",
        user_id: "U9999999999",
        channel_type: "channel",
        response_url: "https://hooks.slack.com/commands/123/456",
      };

      const result = handleSlashCommand(command);

      assertEquals(result.userId, "U9999999999");
    });
  });

  describe("error handling", () => {
    it("should propagate parsing errors", () => {
      const command = {
        text: "--repo invalid build feature",
        channel_id: "C1234567890",
        user_id: "U1234567890",
        channel_type: "channel",
        response_url: "https://hooks.slack.com/commands/123/456",
      };

      assertThrows(
        () => handleSlashCommand(command),
        ValidationError,
        "Invalid repository format",
      );
    });

    it("should propagate validation errors", () => {
      const command = {
        text: "build feature",
        channel_id: "D1234567890",
        user_id: "U1234567890",
        channel_type: "im",
        response_url: "https://hooks.slack.com/commands/123/456",
      };

      assertThrows(
        () => handleSlashCommand(command),
        ValidationError,
      );
    });
  });
});
