// ABOUTME: Tests for ExplorationCallback types validating success/error variants and type guards.
// ABOUTME: Ensures ExplorationContext, ExplorationCallback, and type guards meet requirements.

import { assertEquals, assertExists } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import {
  ExplorationCallback,
  ExplorationCallbackError,
  ExplorationCallbackSuccess,
  ExplorationContext,
  ExplorationError,
  ExplorationErrorCode,
  IdeaRelatedCode,
  isExplorationError,
  isExplorationSuccess,
} from "../../src/types/exploration-callback.ts";

describe("ExplorationCallback Types", () => {
  describe("ExplorationContext interface", () => {
    it("should create a valid context with all fields", () => {
      const context: ExplorationContext = {
        file_tree: "src/\n  index.ts\n  utils/",
        project_overview: "A TypeScript project for testing",
        architecture_summary: "Modular architecture with clean separation",
        relevant_patterns: ["singleton", "factory"],
        integration_points: ["api/routes.ts", "services/index.ts"],
        testing_approach: "Unit tests with Vitest, E2E with Playwright",
        key_files: ["src/index.ts", "src/config.ts"],
        idea_related_code: {
          summary: "Similar feature exists in auth module",
          existing_similar_features: ["auth/login.ts"],
          relevant_files: ["src/auth/index.ts"],
          suggested_integration_points: ["src/auth/middleware.ts"],
        },
      };

      assertEquals(context.file_tree, "src/\n  index.ts\n  utils/");
      assertEquals(context.project_overview, "A TypeScript project for testing");
      assertEquals(context.architecture_summary, "Modular architecture with clean separation");
      assertEquals(context.relevant_patterns, ["singleton", "factory"]);
      assertEquals(context.integration_points, ["api/routes.ts", "services/index.ts"]);
      assertEquals(context.testing_approach, "Unit tests with Vitest, E2E with Playwright");
      assertEquals(context.key_files, ["src/index.ts", "src/config.ts"]);
      assertExists(context.idea_related_code);
    });

    it("should create a valid context with required design fields only", () => {
      const context: ExplorationContext = {
        file_tree: "project/",
        key_files: ["main.ts"],
        relevant_patterns: ["MVC"],
        project_overview: "A sample project",
        architecture_summary: "Standard MVC pattern",
        testing_approach: "Jest unit tests",
      };

      assertEquals(context.file_tree, "project/");
      assertEquals(context.key_files, ["main.ts"]);
      assertEquals(context.relevant_patterns, ["MVC"]);
      assertEquals(context.project_overview, "A sample project");
      assertEquals(context.architecture_summary, "Standard MVC pattern");
      assertEquals(context.testing_approach, "Jest unit tests");
    });

    it("should allow empty context (all fields optional)", () => {
      const context: ExplorationContext = {};

      assertEquals(context.file_tree, undefined);
      assertEquals(context.project_overview, undefined);
      assertEquals(context.architecture_summary, undefined);
      assertEquals(context.relevant_patterns, undefined);
      assertEquals(context.integration_points, undefined);
      assertEquals(context.testing_approach, undefined);
      assertEquals(context.key_files, undefined);
      assertEquals(context.idea_related_code, undefined);
    });

    it("should allow partial context with only some fields", () => {
      const context: ExplorationContext = {
        file_tree: "src/",
        project_overview: "Partial project",
      };

      assertEquals(context.file_tree, "src/");
      assertEquals(context.project_overview, "Partial project");
      assertEquals(context.architecture_summary, undefined);
      assertEquals(context.key_files, undefined);
    });

    it("should allow empty arrays for array fields", () => {
      const context: ExplorationContext = {
        relevant_patterns: [],
        integration_points: [],
        key_files: [],
      };

      assertEquals(context.relevant_patterns, []);
      assertEquals(context.integration_points, []);
      assertEquals(context.key_files, []);
    });
  });

  describe("IdeaRelatedCode interface", () => {
    it("should create valid idea-related code with all fields", () => {
      const ideaCode: IdeaRelatedCode = {
        summary: "Feature relates to existing user management",
        existing_similar_features: ["user/create.ts", "user/update.ts"],
        relevant_files: ["src/user/index.ts", "src/user/types.ts"],
        suggested_integration_points: ["src/user/handlers.ts"],
      };

      assertEquals(ideaCode.summary, "Feature relates to existing user management");
      assertEquals(ideaCode.existing_similar_features, ["user/create.ts", "user/update.ts"]);
      assertEquals(ideaCode.relevant_files, ["src/user/index.ts", "src/user/types.ts"]);
      assertEquals(ideaCode.suggested_integration_points, ["src/user/handlers.ts"]);
    });

    it("should allow empty arrays for array fields", () => {
      const ideaCode: IdeaRelatedCode = {
        summary: "No related code found",
        existing_similar_features: [],
        relevant_files: [],
        suggested_integration_points: [],
      };

      assertEquals(ideaCode.summary, "No related code found");
      assertEquals(ideaCode.existing_similar_features, []);
      assertEquals(ideaCode.relevant_files, []);
      assertEquals(ideaCode.suggested_integration_points, []);
    });
  });

  describe("ExplorationErrorCode type", () => {
    it("should allow CLONE_FAILED error code", () => {
      const code: ExplorationErrorCode = "CLONE_FAILED";
      assertEquals(code, "CLONE_FAILED");
    });

    it("should allow INSTALL_FAILED error code", () => {
      const code: ExplorationErrorCode = "INSTALL_FAILED";
      assertEquals(code, "INSTALL_FAILED");
    });

    it("should allow EXPLORATION_FAILED error code", () => {
      const code: ExplorationErrorCode = "EXPLORATION_FAILED";
      assertEquals(code, "EXPLORATION_FAILED");
    });
  });

  describe("ExplorationError interface", () => {
    it("should create valid error with CLONE_FAILED code", () => {
      const error: ExplorationError = {
        message: "Failed to clone repository",
        code: "CLONE_FAILED",
      };

      assertEquals(error.message, "Failed to clone repository");
      assertEquals(error.code, "CLONE_FAILED");
    });

    it("should create valid error with INSTALL_FAILED code", () => {
      const error: ExplorationError = {
        message: "Failed to install dependencies",
        code: "INSTALL_FAILED",
      };

      assertEquals(error.message, "Failed to install dependencies");
      assertEquals(error.code, "INSTALL_FAILED");
    });

    it("should create valid error with EXPLORATION_FAILED code", () => {
      const error: ExplorationError = {
        message: "Exploration timed out",
        code: "EXPLORATION_FAILED",
      };

      assertEquals(error.message, "Exploration timed out");
      assertEquals(error.code, "EXPLORATION_FAILED");
    });
  });

  describe("ExplorationCallbackSuccess interface", () => {
    it("should create valid success callback with all fields", () => {
      const callback: ExplorationCallbackSuccess = {
        session_id: "C1234567890:1234567890.123456",
        status: "success",
        exploration_context: {
          file_tree: "src/",
          project_overview: "Test project",
          architecture_summary: "Clean architecture",
          relevant_patterns: ["DDD"],
          key_files: ["src/main.ts"],
          testing_approach: "TDD with Jest",
        },
      };

      assertEquals(callback.session_id, "C1234567890:1234567890.123456");
      assertEquals(callback.status, "success");
      assertExists(callback.exploration_context);
      assertEquals(callback.exploration_context.file_tree, "src/");
    });

    it("should create success callback with minimal context", () => {
      const callback: ExplorationCallbackSuccess = {
        session_id: "C9999999999:9999999999.999999",
        status: "success",
        exploration_context: {},
      };

      assertEquals(callback.session_id, "C9999999999:9999999999.999999");
      assertEquals(callback.status, "success");
      assertEquals(callback.exploration_context.file_tree, undefined);
    });

    it("should create success callback with full exploration context", () => {
      const callback: ExplorationCallbackSuccess = {
        session_id: "C1111111111:1111111111.111111",
        status: "success",
        exploration_context: {
          file_tree: "root/\n  src/\n  tests/",
          project_overview: "Full-featured application",
          architecture_summary: "Microservices with event-driven design",
          relevant_patterns: ["CQRS", "Event Sourcing"],
          integration_points: ["gateway/api.ts", "events/bus.ts"],
          testing_approach: "Integration tests with testcontainers",
          key_files: ["src/app.ts", "src/config/index.ts"],
          idea_related_code: {
            summary: "Relates to existing notification system",
            existing_similar_features: ["notifications/email.ts"],
            relevant_files: ["src/notifications/"],
            suggested_integration_points: ["src/notifications/handlers.ts"],
          },
        },
      };

      assertExists(callback.exploration_context.idea_related_code);
      assertEquals(
        callback.exploration_context.idea_related_code.summary,
        "Relates to existing notification system",
      );
    });
  });

  describe("ExplorationCallbackError interface", () => {
    it("should create valid error callback with CLONE_FAILED", () => {
      const callback: ExplorationCallbackError = {
        session_id: "C1234567890:1234567890.123456",
        status: "error",
        error: {
          message: "Repository not found or access denied",
          code: "CLONE_FAILED",
        },
      };

      assertEquals(callback.session_id, "C1234567890:1234567890.123456");
      assertEquals(callback.status, "error");
      assertEquals(callback.error.message, "Repository not found or access denied");
      assertEquals(callback.error.code, "CLONE_FAILED");
    });

    it("should create valid error callback with INSTALL_FAILED", () => {
      const callback: ExplorationCallbackError = {
        session_id: "C2222222222:2222222222.222222",
        status: "error",
        error: {
          message: "npm install failed with exit code 1",
          code: "INSTALL_FAILED",
        },
      };

      assertEquals(callback.status, "error");
      assertEquals(callback.error.code, "INSTALL_FAILED");
    });

    it("should create valid error callback with EXPLORATION_FAILED", () => {
      const callback: ExplorationCallbackError = {
        session_id: "C3333333333:3333333333.333333",
        status: "error",
        error: {
          message: "Claude exploration timed out after 5 minutes",
          code: "EXPLORATION_FAILED",
        },
      };

      assertEquals(callback.status, "error");
      assertEquals(callback.error.code, "EXPLORATION_FAILED");
    });
  });

  describe("ExplorationCallback union type", () => {
    it("should accept success callback", () => {
      const callback: ExplorationCallback = {
        session_id: "C1234567890:1234567890.123456",
        status: "success",
        exploration_context: {
          file_tree: "src/",
        },
      };

      assertEquals(callback.status, "success");
    });

    it("should accept error callback", () => {
      const callback: ExplorationCallback = {
        session_id: "C1234567890:1234567890.123456",
        status: "error",
        error: {
          message: "Something went wrong",
          code: "EXPLORATION_FAILED",
        },
      };

      assertEquals(callback.status, "error");
    });
  });

  describe("isExplorationSuccess type guard", () => {
    it("should return true for success callback", () => {
      const callback: ExplorationCallback = {
        session_id: "C1234567890:1234567890.123456",
        status: "success",
        exploration_context: {
          file_tree: "src/",
          project_overview: "Test",
        },
      };

      assertEquals(isExplorationSuccess(callback), true);
    });

    it("should return false for error callback", () => {
      const callback: ExplorationCallback = {
        session_id: "C1234567890:1234567890.123456",
        status: "error",
        error: {
          message: "Failed",
          code: "CLONE_FAILED",
        },
      };

      assertEquals(isExplorationSuccess(callback), false);
    });

    it("should correctly narrow type to success callback", () => {
      const callback: ExplorationCallback = {
        session_id: "C1234567890:1234567890.123456",
        status: "success",
        exploration_context: {
          file_tree: "narrowed/",
        },
      };

      if (isExplorationSuccess(callback)) {
        // TypeScript should allow access to exploration_context here
        assertEquals(callback.exploration_context.file_tree, "narrowed/");
      }
    });

    it("should return false for all error codes", () => {
      const errorCodes: ExplorationErrorCode[] = [
        "CLONE_FAILED",
        "INSTALL_FAILED",
        "EXPLORATION_FAILED",
      ];

      errorCodes.forEach((code) => {
        const callback: ExplorationCallback = {
          session_id: "C1234567890:1234567890.123456",
          status: "error",
          error: {
            message: `Error: ${code}`,
            code,
          },
        };

        assertEquals(isExplorationSuccess(callback), false);
      });
    });
  });

  describe("isExplorationError type guard", () => {
    it("should return true for error callback", () => {
      const callback: ExplorationCallback = {
        session_id: "C1234567890:1234567890.123456",
        status: "error",
        error: {
          message: "Clone failed",
          code: "CLONE_FAILED",
        },
      };

      assertEquals(isExplorationError(callback), true);
    });

    it("should return false for success callback", () => {
      const callback: ExplorationCallback = {
        session_id: "C1234567890:1234567890.123456",
        status: "success",
        exploration_context: {
          project_overview: "Success",
        },
      };

      assertEquals(isExplorationError(callback), false);
    });

    it("should correctly narrow type to error callback", () => {
      const callback: ExplorationCallback = {
        session_id: "C1234567890:1234567890.123456",
        status: "error",
        error: {
          message: "Narrowed error",
          code: "EXPLORATION_FAILED",
        },
      };

      if (isExplorationError(callback)) {
        // TypeScript should allow access to error here
        assertEquals(callback.error.message, "Narrowed error");
        assertEquals(callback.error.code, "EXPLORATION_FAILED");
      }
    });

    it("should return true for all error codes", () => {
      const errorCodes: ExplorationErrorCode[] = [
        "CLONE_FAILED",
        "INSTALL_FAILED",
        "EXPLORATION_FAILED",
      ];

      errorCodes.forEach((code) => {
        const callback: ExplorationCallback = {
          session_id: "C1234567890:1234567890.123456",
          status: "error",
          error: {
            message: `Error: ${code}`,
            code,
          },
        };

        assertEquals(isExplorationError(callback), true);
      });
    });
  });

  describe("Type guards are mutually exclusive", () => {
    it("should have exactly one guard return true for success callback", () => {
      const callback: ExplorationCallback = {
        session_id: "C1234567890:1234567890.123456",
        status: "success",
        exploration_context: {},
      };

      const successResult = isExplorationSuccess(callback);
      const errorResult = isExplorationError(callback);

      assertEquals(successResult, true);
      assertEquals(errorResult, false);
      assertEquals(successResult !== errorResult, true);
    });

    it("should have exactly one guard return true for error callback", () => {
      const callback: ExplorationCallback = {
        session_id: "C1234567890:1234567890.123456",
        status: "error",
        error: {
          message: "Error",
          code: "CLONE_FAILED",
        },
      };

      const successResult = isExplorationSuccess(callback);
      const errorResult = isExplorationError(callback);

      assertEquals(successResult, false);
      assertEquals(errorResult, true);
      assertEquals(successResult !== errorResult, true);
    });
  });
});
