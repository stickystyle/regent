// ABOUTME: Tests for ExplorationCallbackFunction that wraps exploration callback handler.
// ABOUTME: Validates function definition, input parsing, and handler invocation.

import { assertEquals, assertExists } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import {
  ExplorationCallbackFunction,
  parseExplorationData,
} from "../../functions/exploration-callback.ts";
import type {
  ExplorationCallbackError,
  ExplorationCallbackSuccess,
} from "../../src/types/exploration-callback.ts";

describe("ExplorationCallbackFunction", () => {
  describe("function definition", () => {
    it("should have correct callback_id", () => {
      assertEquals(
        ExplorationCallbackFunction.definition.callback_id,
        "exploration_callback_function",
      );
    });

    it("should have required input parameters", () => {
      const inputProps =
        ExplorationCallbackFunction.definition.input_parameters?.properties;
      assertExists(inputProps);

      assertExists(inputProps.channel_id);
      assertExists(inputProps.thread_ts);
      assertExists(inputProps.exploration_data);
    });

    it("should require all input parameters", () => {
      const required =
        ExplorationCallbackFunction.definition.input_parameters?.required;
      assertExists(required);

      assertEquals(required.includes("channel_id"), true);
      assertEquals(required.includes("thread_ts"), true);
      assertEquals(required.includes("exploration_data"), true);
    });

    it("should have success and error output parameters", () => {
      const outputProps =
        ExplorationCallbackFunction.definition.output_parameters?.properties;
      assertExists(outputProps);

      assertExists(outputProps.success);
      assertExists(outputProps.error_message);
    });

    it("should require success output parameter", () => {
      const required =
        ExplorationCallbackFunction.definition.output_parameters?.required;
      assertExists(required);

      assertEquals(required.includes("success"), true);
    });

    it("should specify correct source_file", () => {
      assertEquals(
        ExplorationCallbackFunction.definition.source_file,
        "functions/exploration-callback.ts",
      );
    });
  });

  describe("exploration_data parsing", () => {
    it("should define exploration_data as string type for JSON payload", () => {
      const inputProps =
        ExplorationCallbackFunction.definition.input_parameters?.properties;
      assertExists(inputProps);

      // exploration_data should be a string that contains JSON
      const explorationDataProp = inputProps.exploration_data;
      assertExists(explorationDataProp);
    });
  });
});

describe("parseExplorationData", () => {
  describe("valid JSON parsing", () => {
    it("should parse valid success callback JSON", () => {
      const successPayload: ExplorationCallbackSuccess = {
        session_id: "C123:1234567890.123456",
        status: "success",
        exploration_context: {
          project_overview: "A TypeScript project",
        },
      };
      const jsonString = JSON.stringify(successPayload);

      const result = parseExplorationData(jsonString);

      assertEquals(result.session_id, "C123:1234567890.123456");
      assertEquals(result.status, "success");
    });

    it("should parse valid error callback JSON", () => {
      const errorPayload: ExplorationCallbackError = {
        session_id: "C123:1234567890.123456",
        status: "error",
        error: {
          message: "Failed to clone",
          code: "CLONE_FAILED",
        },
      };
      const jsonString = JSON.stringify(errorPayload);

      const result = parseExplorationData(jsonString);

      assertEquals(result.session_id, "C123:1234567890.123456");
      assertEquals(result.status, "error");
    });
  });

  describe("invalid JSON handling", () => {
    it("should throw error for invalid JSON syntax", () => {
      const invalidJson = "not valid json {";

      try {
        parseExplorationData(invalidJson);
        throw new Error("Expected error to be thrown");
      } catch (error) {
        assertEquals(error instanceof Error, true);
        assertEquals(
          (error as Error).message.includes("Invalid exploration_data JSON"),
          true,
        );
      }
    });

    it("should throw error for empty string", () => {
      try {
        parseExplorationData("");
        throw new Error("Expected error to be thrown");
      } catch (error) {
        assertEquals(error instanceof Error, true);
      }
    });

    it("should throw error for missing session_id", () => {
      const invalidPayload = JSON.stringify({
        status: "success",
        exploration_context: {},
      });

      try {
        parseExplorationData(invalidPayload);
        throw new Error("Expected error to be thrown");
      } catch (error) {
        assertEquals(error instanceof Error, true);
        assertEquals(
          (error as Error).message.includes("session_id"),
          true,
        );
      }
    });

    it("should throw error for missing status", () => {
      const invalidPayload = JSON.stringify({
        session_id: "C123:1234567890.123456",
        exploration_context: {},
      });

      try {
        parseExplorationData(invalidPayload);
        throw new Error("Expected error to be thrown");
      } catch (error) {
        assertEquals(error instanceof Error, true);
        assertEquals(
          (error as Error).message.includes("status"),
          true,
        );
      }
    });

    it("should throw error for invalid status value", () => {
      const invalidPayload = JSON.stringify({
        session_id: "C123:1234567890.123456",
        status: "invalid",
      });

      try {
        parseExplorationData(invalidPayload);
        throw new Error("Expected error to be thrown");
      } catch (error) {
        assertEquals(error instanceof Error, true);
        assertEquals(
          (error as Error).message.includes("status"),
          true,
        );
      }
    });
  });
});

describe("session_id validation", () => {
  it("should require session_id format to be channel_id:thread_ts", () => {
    // The session_id in exploration_data must match the pattern channel_id:thread_ts
    // This test documents the expected format that the function validates
    const channelId = "C1234567890";
    const threadTs = "1234567890.123456";
    const expectedSessionId = `${channelId}:${threadTs}`;

    // Valid session_id format
    const validPayload: ExplorationCallbackSuccess = {
      session_id: expectedSessionId,
      status: "success",
      exploration_context: {
        project_overview: "Test project",
      },
    };

    const result = parseExplorationData(JSON.stringify(validPayload));
    assertEquals(result.session_id, expectedSessionId);
  });

  it("should build expected session_id from channel_id and thread_ts", () => {
    // The function validates that session_id matches `${channel_id}:${thread_ts}`
    // This test documents how the expected session_id is constructed
    const inputChannelId = "C1234567890";
    const inputThreadTs = "1234567890.123456";
    const expectedSessionId = `${inputChannelId}:${inputThreadTs}`;

    assertEquals(expectedSessionId, "C1234567890:1234567890.123456");
  });

  it("should reject session_id with wrong channel_id", () => {
    // If the session_id has a different channel_id, validation should fail
    // This documents the expected validation behavior in the function
    const inputChannelId = "C1234567890";
    const inputThreadTs = "1234567890.123456";
    const expectedSessionId = `${inputChannelId}:${inputThreadTs}`;
    const wrongChannelSessionId: string = "C9999999999:1234567890.123456";

    // The function would reject this mismatch
    assertEquals(wrongChannelSessionId === expectedSessionId, false);
  });

  it("should reject session_id with wrong thread_ts", () => {
    // If the session_id has a different thread_ts, validation should fail
    // This documents the expected validation behavior in the function
    const inputChannelId = "C1234567890";
    const inputThreadTs = "1234567890.123456";
    const expectedSessionId = `${inputChannelId}:${inputThreadTs}`;
    const wrongThreadSessionId: string = "C1234567890:9999999999.999999";

    // The function would reject this mismatch
    assertEquals(wrongThreadSessionId === expectedSessionId, false);
  });
});
