// ABOUTME: Deployment validation tests for required environment variables.
// ABOUTME: Verifies env var detection and validation logic.

import { assertEquals, assertThrows } from "@std/assert";
import { afterEach, beforeEach, describe, it } from "@std/testing/bdd";

/**
 * Validates that all required environment variables are set.
 *
 * @param requiredVars - List of required environment variable names
 * @returns Object with validation result and any missing variables
 */
export function validateEnvironment(
  requiredVars: readonly string[],
): { valid: boolean; missing: string[] } {
  const missing: string[] = [];

  for (const varName of requiredVars) {
    const value = Deno.env.get(varName);
    if (value === undefined || value.trim() === "") {
      missing.push(varName);
    }
  }

  return {
    valid: missing.length === 0,
    missing,
  };
}

/**
 * Asserts that all required environment variables are set.
 * Throws an error with details about missing variables.
 *
 * @param requiredVars - List of required environment variable names
 * @throws Error if any required variables are missing
 */
export function assertEnvironmentValid(requiredVars: readonly string[]): void {
  const result = validateEnvironment(requiredVars);

  if (!result.valid) {
    throw new Error(
      `Missing required environment variables: ${result.missing.join(", ")}`,
    );
  }
}

// Required environment variables for Regent Slack Bot
const REQUIRED_ENV_VARS = [
  "ANTHROPIC_API_KEY",
  "GITHUB_TOKEN",
  "CALLBACK_SECRET",
] as const;

describe("Environment Validation", () => {
  // Store original env values to restore after tests
  const originalEnv = new Map<string, string | undefined>();

  beforeEach(() => {
    // Save original values
    for (const varName of REQUIRED_ENV_VARS) {
      originalEnv.set(varName, Deno.env.get(varName));
    }
  });

  afterEach(() => {
    // Restore original values
    for (const [varName, value] of originalEnv) {
      if (value !== undefined) {
        Deno.env.set(varName, value);
      } else {
        Deno.env.delete(varName);
      }
    }
    originalEnv.clear();
  });

  describe("validateEnvironment", () => {
    it("should return valid when all required vars are set", () => {
      // Set all required vars
      Deno.env.set("ANTHROPIC_API_KEY", "sk-ant-test-key");
      Deno.env.set("GITHUB_TOKEN", "ghp_testtoken123");
      Deno.env.set("CALLBACK_SECRET", "test-callback-secret");

      const result = validateEnvironment(REQUIRED_ENV_VARS);

      assertEquals(result.valid, true);
      assertEquals(result.missing.length, 0);
    });

    it("should return invalid when ANTHROPIC_API_KEY is missing", () => {
      Deno.env.delete("ANTHROPIC_API_KEY");
      Deno.env.set("GITHUB_TOKEN", "ghp_testtoken123");
      Deno.env.set("CALLBACK_SECRET", "test-callback-secret");

      const result = validateEnvironment(REQUIRED_ENV_VARS);

      assertEquals(result.valid, false);
      assertEquals(result.missing.includes("ANTHROPIC_API_KEY"), true);
    });

    it("should return invalid when GITHUB_TOKEN is missing", () => {
      Deno.env.set("ANTHROPIC_API_KEY", "sk-ant-test-key");
      Deno.env.delete("GITHUB_TOKEN");
      Deno.env.set("CALLBACK_SECRET", "test-callback-secret");

      const result = validateEnvironment(REQUIRED_ENV_VARS);

      assertEquals(result.valid, false);
      assertEquals(result.missing.includes("GITHUB_TOKEN"), true);
    });

    it("should return invalid when CALLBACK_SECRET is missing", () => {
      Deno.env.set("ANTHROPIC_API_KEY", "sk-ant-test-key");
      Deno.env.set("GITHUB_TOKEN", "ghp_testtoken123");
      Deno.env.delete("CALLBACK_SECRET");

      const result = validateEnvironment(REQUIRED_ENV_VARS);

      assertEquals(result.valid, false);
      assertEquals(result.missing.includes("CALLBACK_SECRET"), true);
    });

    it("should return all missing vars when multiple are missing", () => {
      Deno.env.delete("ANTHROPIC_API_KEY");
      Deno.env.delete("GITHUB_TOKEN");
      Deno.env.set("CALLBACK_SECRET", "test-callback-secret");

      const result = validateEnvironment(REQUIRED_ENV_VARS);

      assertEquals(result.valid, false);
      assertEquals(result.missing.length, 2);
      assertEquals(result.missing.includes("ANTHROPIC_API_KEY"), true);
      assertEquals(result.missing.includes("GITHUB_TOKEN"), true);
    });

    it("should treat empty string as missing", () => {
      Deno.env.set("ANTHROPIC_API_KEY", "");
      Deno.env.set("GITHUB_TOKEN", "ghp_testtoken123");
      Deno.env.set("CALLBACK_SECRET", "test-callback-secret");

      const result = validateEnvironment(REQUIRED_ENV_VARS);

      assertEquals(result.valid, false);
      assertEquals(result.missing.includes("ANTHROPIC_API_KEY"), true);
    });

    it("should treat whitespace-only as missing", () => {
      Deno.env.set("ANTHROPIC_API_KEY", "   ");
      Deno.env.set("GITHUB_TOKEN", "ghp_testtoken123");
      Deno.env.set("CALLBACK_SECRET", "test-callback-secret");

      const result = validateEnvironment(REQUIRED_ENV_VARS);

      assertEquals(result.valid, false);
      assertEquals(result.missing.includes("ANTHROPIC_API_KEY"), true);
    });
  });

  describe("assertEnvironmentValid", () => {
    it("should not throw when all required vars are set", () => {
      Deno.env.set("ANTHROPIC_API_KEY", "sk-ant-test-key");
      Deno.env.set("GITHUB_TOKEN", "ghp_testtoken123");
      Deno.env.set("CALLBACK_SECRET", "test-callback-secret");

      // Should not throw
      assertEnvironmentValid(REQUIRED_ENV_VARS);
    });

    it("should throw error with missing var names", () => {
      Deno.env.delete("ANTHROPIC_API_KEY");
      Deno.env.delete("GITHUB_TOKEN");
      Deno.env.set("CALLBACK_SECRET", "test-callback-secret");

      assertThrows(
        () => assertEnvironmentValid(REQUIRED_ENV_VARS),
        Error,
        "ANTHROPIC_API_KEY",
      );
    });

    it("should include all missing vars in error message", () => {
      Deno.env.delete("ANTHROPIC_API_KEY");
      Deno.env.delete("GITHUB_TOKEN");
      Deno.env.set("CALLBACK_SECRET", "test-callback-secret");

      try {
        assertEnvironmentValid(REQUIRED_ENV_VARS);
        throw new Error("Should have thrown");
      } catch (error) {
        const message = (error as Error).message;
        assertEquals(message.includes("ANTHROPIC_API_KEY"), true);
        assertEquals(message.includes("GITHUB_TOKEN"), true);
      }
    });
  });

  describe("required variables list", () => {
    it("should require ANTHROPIC_API_KEY", () => {
      assertEquals(
        REQUIRED_ENV_VARS.includes("ANTHROPIC_API_KEY"),
        true,
        "ANTHROPIC_API_KEY should be required",
      );
    });

    it("should require GITHUB_TOKEN", () => {
      assertEquals(
        REQUIRED_ENV_VARS.includes("GITHUB_TOKEN"),
        true,
        "GITHUB_TOKEN should be required",
      );
    });

    it("should require CALLBACK_SECRET", () => {
      assertEquals(
        REQUIRED_ENV_VARS.includes("CALLBACK_SECRET"),
        true,
        "CALLBACK_SECRET should be required for webhook validation",
      );
    });
  });
});
