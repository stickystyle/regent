// ABOUTME: Tests for error type hierarchy validating transient vs permanent categorization.
// ABOUTME: Ensures error types meet requirements for Slack message formatting and disclosure.

import { assertEquals, assertInstanceOf } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import {
  AnthropicInputError,
  AnthropicModelError,
  AnthropicRateLimitError,
  BaseError,
  GitHubAccessError,
  GitHubRateLimitError,
  NetworkTimeoutError,
  PermanentError,
  SlackCanvasError,
  SlackRateLimitError,
  TransientError,
  ValidationError,
} from "../../src/errors/types.ts";

describe("Error Type Hierarchy", () => {
  describe("BaseError", () => {
    it("should have type, message, details, and suggestedAction properties", () => {
      const error = new ValidationError("Invalid input", "Email format wrong", "Use valid email");
      assertEquals(error.type, "ValidationError");
      assertEquals(error.message, "Invalid input");
      assertEquals(error.details, "Email format wrong");
      assertEquals(error.suggestedAction, "Use valid email");
    });

    it("should extend native Error", () => {
      const error = new ValidationError("Test", "Details", "Action");
      assertInstanceOf(error, Error);
      assertInstanceOf(error, BaseError);
    });
  });

  describe("TransientError (retryable)", () => {
    it("should mark errors as retryable", () => {
      const error = new NetworkTimeoutError("Timeout", "Connection timed out", "Retry later");
      assertEquals(error.isRetryable, true);
      assertInstanceOf(error, TransientError);
    });

    it("should include GitHubRateLimitError", () => {
      const resetTime = new Date(Date.now() + 60000);
      const error = new GitHubRateLimitError(
        "Rate limited",
        "API limit exceeded",
        "Wait for reset",
        resetTime,
      );
      assertEquals(error.isRetryable, true);
      assertEquals(error.resetTime, resetTime);
      assertInstanceOf(error, TransientError);
    });

    it("should include SlackRateLimitError", () => {
      const error = new SlackRateLimitError(
        "Slack rate limit",
        "Too many requests",
        "Slow down",
        30,
      );
      assertEquals(error.isRetryable, true);
      assertEquals(error.retryAfterSeconds, 30);
      assertInstanceOf(error, TransientError);
    });

    it("should include SlackCanvasError", () => {
      const error = new SlackCanvasError(
        "Canvas failed",
        "Could not create canvas",
        "Try file upload instead",
      );
      assertEquals(error.isRetryable, true);
      assertInstanceOf(error, TransientError);
    });

    it("should include AnthropicRateLimitError", () => {
      const error = new AnthropicRateLimitError(
        "Anthropic rate limit",
        "Too many tokens",
        "Wait and retry",
        45,
      );
      assertEquals(error.isRetryable, true);
      assertEquals(error.retryAfterSeconds, 45);
      assertInstanceOf(error, TransientError);
    });

    it("should include NetworkTimeoutError", () => {
      const error = new NetworkTimeoutError(
        "Network timeout",
        "Request timed out after 30s",
        "Check connection and retry",
      );
      assertEquals(error.isRetryable, true);
      assertInstanceOf(error, TransientError);
    });
  });

  describe("PermanentError (not retryable)", () => {
    it("should mark errors as not retryable", () => {
      const error = new ValidationError("Invalid", "Bad format", "Fix input");
      assertEquals(error.isRetryable, false);
      assertInstanceOf(error, PermanentError);
    });

    it("should include GitHubAccessError", () => {
      const error = new GitHubAccessError(
        "Access denied",
        "Token lacks repo scope",
        "Update token permissions",
      );
      assertEquals(error.isRetryable, false);
      assertInstanceOf(error, PermanentError);
    });

    it("should include AnthropicModelError", () => {
      const error = new AnthropicModelError(
        "Model error",
        "Model refused request",
        "Modify your prompt",
      );
      assertEquals(error.isRetryable, false);
      assertInstanceOf(error, PermanentError);
    });

    it("should include AnthropicInputError", () => {
      const error = new AnthropicInputError(
        "Input too long",
        "Exceeded 200k tokens",
        "Reduce context size",
      );
      assertEquals(error.isRetryable, false);
      assertInstanceOf(error, PermanentError);
    });

    it("should include ValidationError", () => {
      const error = new ValidationError(
        "Invalid repository",
        "Format must be owner/repo",
        "Use correct format like 'user/repo'",
      );
      assertEquals(error.isRetryable, false);
      assertInstanceOf(error, PermanentError);
    });
  });
});

describe("Error Type Names", () => {
  it("should have correct type names for all error classes", () => {
    assertEquals(
      new GitHubRateLimitError("", "", "", new Date()).type,
      "GitHubRateLimitError",
    );
    assertEquals(new GitHubAccessError("", "", "").type, "GitHubAccessError");
    assertEquals(new SlackRateLimitError("", "", "", 0).type, "SlackRateLimitError");
    assertEquals(new SlackCanvasError("", "", "").type, "SlackCanvasError");
    assertEquals(new AnthropicRateLimitError("", "", "", 0).type, "AnthropicRateLimitError");
    assertEquals(new AnthropicModelError("", "", "").type, "AnthropicModelError");
    assertEquals(new AnthropicInputError("", "", "").type, "AnthropicInputError");
    assertEquals(new NetworkTimeoutError("", "", "").type, "NetworkTimeoutError");
    assertEquals(new ValidationError("", "", "").type, "ValidationError");
  });
});

describe("Slack Message Formatting", () => {
  describe("toSlackMessage", () => {
    it("should format error with type, details, and suggested action", () => {
      const error = new ValidationError(
        "Invalid repository format",
        "Repository 'invalid' does not match owner/repo pattern",
        "Use format like 'stickystyle/regent'",
      );

      const slackMessage = error.toSlackMessage();

      assertEquals(slackMessage.includes("*Error Type:* ValidationError"), true);
      assertEquals(slackMessage.includes("Invalid repository format"), true);
      assertEquals(
        slackMessage.includes("Repository 'invalid' does not match owner/repo pattern"),
        true,
      );
      assertEquals(slackMessage.includes("Use format like 'stickystyle/regent'"), true);
    });

    it("should use Slack mrkdwn formatting", () => {
      const error = new NetworkTimeoutError(
        "Connection timed out",
        "GitHub API did not respond within 30 seconds",
        "Check your internet connection and try again",
      );

      const slackMessage = error.toSlackMessage();

      // Should use Slack bold markers
      assertEquals(slackMessage.includes("*Error Type:*"), true);
      assertEquals(slackMessage.includes("*Details:*"), true);
      assertEquals(slackMessage.includes("*Suggested Action:*"), true);
    });

    it("should include reset time for rate limit errors", () => {
      const resetTime = new Date("2025-01-15T12:30:00.000Z");
      const error = new GitHubRateLimitError(
        "GitHub API rate limit exceeded",
        "You have exceeded the rate limit for the GitHub API",
        "Wait for the rate limit to reset",
        resetTime,
      );

      const slackMessage = error.toSlackMessage();

      assertEquals(slackMessage.includes("*Rate Limit Resets:*"), true);
      assertEquals(slackMessage.includes("2025-01-15"), true);
    });

    it("should include retry-after seconds for Anthropic rate limit", () => {
      const error = new AnthropicRateLimitError(
        "Rate limited",
        "Too many requests to Claude API",
        "Automatic retry in progress",
        60,
      );

      const slackMessage = error.toSlackMessage();

      assertEquals(slackMessage.includes("*Retry After:*"), true);
      assertEquals(slackMessage.includes("60 seconds"), true);
    });
  });

  describe("Property 10: Error Disclosure", () => {
    it("should always include error type in Slack message", () => {
      const errors = [
        new GitHubAccessError("Access denied", "No permission", "Fix token"),
        new SlackCanvasError("Canvas failed", "Create failed", "Use file"),
        new AnthropicModelError("Model error", "Refused", "Modify prompt"),
        new ValidationError("Invalid", "Bad format", "Fix input"),
      ];

      for (const error of errors) {
        const message = error.toSlackMessage();
        assertEquals(
          message.includes(`*Error Type:* ${error.type}`),
          true,
          `Error type missing for ${error.type}`,
        );
      }
    });

    it("should always include specific details in Slack message", () => {
      const error = new GitHubAccessError(
        "Cannot access repository",
        "Token does not have 'repo' scope for private repositories",
        "Add 'repo' scope to your GitHub token",
      );

      const message = error.toSlackMessage();
      assertEquals(
        message.includes("Token does not have 'repo' scope for private repositories"),
        true,
      );
    });

    it("should always include suggested action in Slack message", () => {
      const error = new AnthropicInputError(
        "Context too large",
        "Input exceeds 200,000 tokens",
        "Reduce the number of files or message history",
      );

      const message = error.toSlackMessage();
      assertEquals(
        message.includes("Reduce the number of files or message history"),
        true,
      );
    });
  });
});

describe("Error Categorization", () => {
  describe("isTransientError helper", () => {
    it("should return true for transient errors", () => {
      const transientErrors = [
        new GitHubRateLimitError("", "", "", new Date()),
        new SlackRateLimitError("", "", "", 0),
        new SlackCanvasError("", "", ""),
        new AnthropicRateLimitError("", "", "", 0),
        new NetworkTimeoutError("", "", ""),
      ];

      for (const error of transientErrors) {
        assertEquals(error.isRetryable, true, `${error.type} should be retryable`);
      }
    });

    it("should return false for permanent errors", () => {
      const permanentErrors = [
        new GitHubAccessError("", "", ""),
        new AnthropicModelError("", "", ""),
        new AnthropicInputError("", "", ""),
        new ValidationError("", "", ""),
      ];

      for (const error of permanentErrors) {
        assertEquals(error.isRetryable, false, `${error.type} should not be retryable`);
      }
    });
  });
});
