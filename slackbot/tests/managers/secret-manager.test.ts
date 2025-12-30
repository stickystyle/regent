// ABOUTME: Tests for SecretManager covering environment variable loading and secret validation.
// ABOUTME: Includes Property 12 tests for secure credential storage (secrets never in datastore/logs).

import { assertEquals, assertInstanceOf, assertThrows } from "@std/assert";
import { afterEach, beforeEach, describe, it } from "@std/testing/bdd";
import { MockSecretManager, SecretManagerImpl } from "../../src/managers/secret-manager.ts";
import { ValidationError } from "../../src/errors/types.ts";

describe("SecretManager", () => {
  describe("SecretManagerImpl", () => {
    describe("initialize", () => {
      it("should throw ValidationError when ANTHROPIC_API_KEY is missing", () => {
        const envProvider = () => ({
          GITHUB_TOKEN: "ghp_test123",
          EXPLORATION_CALLBACK_URL: "https://example.com/callback",
        });

        const manager = new SecretManagerImpl(envProvider);

        assertThrows(
          () => manager.initialize(),
          ValidationError,
          "ANTHROPIC_API_KEY",
        );
      });

      it("should throw ValidationError when GITHUB_TOKEN is missing", () => {
        const envProvider = () => ({
          ANTHROPIC_API_KEY: "sk-ant-test123",
          EXPLORATION_CALLBACK_URL: "https://example.com/callback",
        });

        const manager = new SecretManagerImpl(envProvider);

        assertThrows(
          () => manager.initialize(),
          ValidationError,
          "GITHUB_TOKEN",
        );
      });

      it("should throw ValidationError when EXPLORATION_CALLBACK_URL is missing", () => {
        const envProvider = () => ({
          ANTHROPIC_API_KEY: "sk-ant-test123",
          GITHUB_TOKEN: "ghp_test123",
        });

        const manager = new SecretManagerImpl(envProvider);

        assertThrows(
          () => manager.initialize(),
          ValidationError,
          "EXPLORATION_CALLBACK_URL",
        );
      });

      it("should throw ValidationError when ANTHROPIC_API_KEY is empty string", () => {
        const envProvider = () => ({
          ANTHROPIC_API_KEY: "",
          GITHUB_TOKEN: "ghp_test123",
          EXPLORATION_CALLBACK_URL: "https://example.com/callback",
        });

        const manager = new SecretManagerImpl(envProvider);

        assertThrows(
          () => manager.initialize(),
          ValidationError,
          "ANTHROPIC_API_KEY",
        );
      });

      it("should throw ValidationError when GITHUB_TOKEN is empty string", () => {
        const envProvider = () => ({
          ANTHROPIC_API_KEY: "sk-ant-test123",
          GITHUB_TOKEN: "",
          EXPLORATION_CALLBACK_URL: "https://example.com/callback",
        });

        const manager = new SecretManagerImpl(envProvider);

        assertThrows(
          () => manager.initialize(),
          ValidationError,
          "GITHUB_TOKEN",
        );
      });

      it("should throw ValidationError when EXPLORATION_CALLBACK_URL is empty string", () => {
        const envProvider = () => ({
          ANTHROPIC_API_KEY: "sk-ant-test123",
          GITHUB_TOKEN: "ghp_test123",
          EXPLORATION_CALLBACK_URL: "",
        });

        const manager = new SecretManagerImpl(envProvider);

        assertThrows(
          () => manager.initialize(),
          ValidationError,
          "EXPLORATION_CALLBACK_URL",
        );
      });

      it("should succeed when all required secrets are present", () => {
        const envProvider = () => ({
          ANTHROPIC_API_KEY: "sk-ant-test123",
          GITHUB_TOKEN: "ghp_test123",
          EXPLORATION_CALLBACK_URL: "https://example.com/callback",
        });

        const manager = new SecretManagerImpl(envProvider);

        // Should not throw
        manager.initialize();
      });

      it("should throw ValidationError when multiple secrets are missing", () => {
        const envProvider = () => ({});

        const manager = new SecretManagerImpl(envProvider);

        // Should throw for the first missing secret it checks
        assertThrows(
          () => manager.initialize(),
          ValidationError,
        );
      });

      it("should throw error when initialize is called twice", () => {
        const envProvider = () => ({
          ANTHROPIC_API_KEY: "sk-ant-test123",
          GITHUB_TOKEN: "ghp_test123",
          EXPLORATION_CALLBACK_URL: "https://example.com/callback",
        });

        const manager = new SecretManagerImpl(envProvider);
        manager.initialize();

        // Second call should throw
        assertThrows(
          () => manager.initialize(),
          Error,
          "already initialized",
        );
      });
    });

    describe("getAnthropicApiKey", () => {
      it("should return the API key after initialization", () => {
        const envProvider = () => ({
          ANTHROPIC_API_KEY: "sk-ant-test123",
          GITHUB_TOKEN: "ghp_test123",
          EXPLORATION_CALLBACK_URL: "https://example.com/callback",
        });

        const manager = new SecretManagerImpl(envProvider);
        manager.initialize();

        assertEquals(manager.getAnthropicApiKey(), "sk-ant-test123");
      });

      it("should throw error when accessed before initialization", () => {
        const envProvider = () => ({
          ANTHROPIC_API_KEY: "sk-ant-test123",
          GITHUB_TOKEN: "ghp_test123",
          EXPLORATION_CALLBACK_URL: "https://example.com/callback",
        });

        const manager = new SecretManagerImpl(envProvider);

        assertThrows(
          () => manager.getAnthropicApiKey(),
          Error,
          "not initialized",
        );
      });
    });

    describe("getGitHubToken", () => {
      it("should return the token after initialization", () => {
        const envProvider = () => ({
          ANTHROPIC_API_KEY: "sk-ant-test123",
          GITHUB_TOKEN: "ghp_test456",
          EXPLORATION_CALLBACK_URL: "https://example.com/callback",
        });

        const manager = new SecretManagerImpl(envProvider);
        manager.initialize();

        assertEquals(manager.getGitHubToken(), "ghp_test456");
      });

      it("should throw error when accessed before initialization", () => {
        const envProvider = () => ({
          ANTHROPIC_API_KEY: "sk-ant-test123",
          GITHUB_TOKEN: "ghp_test123",
          EXPLORATION_CALLBACK_URL: "https://example.com/callback",
        });

        const manager = new SecretManagerImpl(envProvider);

        assertThrows(
          () => manager.getGitHubToken(),
          Error,
          "not initialized",
        );
      });
    });

    describe("getExplorationCallbackUrl", () => {
      it("should return the callback URL after initialization", () => {
        const envProvider = () => ({
          ANTHROPIC_API_KEY: "sk-ant-test123",
          GITHUB_TOKEN: "ghp_test123",
          EXPLORATION_CALLBACK_URL: "https://example.com/callback",
        });

        const manager = new SecretManagerImpl(envProvider);
        manager.initialize();

        assertEquals(
          manager.getExplorationCallbackUrl(),
          "https://example.com/callback",
        );
      });

      it("should throw error when accessed before initialization", () => {
        const envProvider = () => ({
          ANTHROPIC_API_KEY: "sk-ant-test123",
          GITHUB_TOKEN: "ghp_test123",
          EXPLORATION_CALLBACK_URL: "https://example.com/callback",
        });

        const manager = new SecretManagerImpl(envProvider);

        assertThrows(
          () => manager.getExplorationCallbackUrl(),
          Error,
          "not initialized",
        );
      });
    });

    describe("error message security", () => {
      it("should not include actual API key value in error message", () => {
        const secretApiKey = "sk-ant-super-secret-key-12345";
        const envProvider = () => ({
          ANTHROPIC_API_KEY: secretApiKey,
          // Missing GITHUB_TOKEN
          EXPLORATION_CALLBACK_URL: "https://example.com/callback",
        });

        const manager = new SecretManagerImpl(envProvider);

        let errorMessage = "";
        try {
          manager.initialize();
        } catch (error) {
          errorMessage = (error as Error).message;
        }

        // Error message should NOT contain the actual secret
        assertEquals(
          errorMessage.includes(secretApiKey),
          false,
          "Error message should not contain actual API key",
        );
      });

      it("should not include actual token value in error message", () => {
        const secretToken = "ghp_super-secret-token-67890";
        const envProvider = () => ({
          // Missing ANTHROPIC_API_KEY
          GITHUB_TOKEN: secretToken,
          EXPLORATION_CALLBACK_URL: "https://example.com/callback",
        });

        const manager = new SecretManagerImpl(envProvider);

        let errorMessage = "";
        try {
          manager.initialize();
        } catch (error) {
          errorMessage = (error as Error).message;
        }

        // Error message should NOT contain the actual secret
        assertEquals(
          errorMessage.includes(secretToken),
          false,
          "Error message should not contain actual token",
        );
      });

      it("should produce ValidationError with safe error details", () => {
        const envProvider = () => ({
          ANTHROPIC_API_KEY: "sk-ant-test123",
          // Missing GITHUB_TOKEN
          EXPLORATION_CALLBACK_URL: "https://example.com/callback",
        });

        const manager = new SecretManagerImpl(envProvider);

        try {
          manager.initialize();
        } catch (error) {
          assertInstanceOf(error, ValidationError);
          const validationError = error as ValidationError;

          // Check the error has proper structure
          assertEquals(validationError.type, "ValidationError");
          assertEquals(validationError.isRetryable, false);

          // Details should mention the missing variable name, not its value
          assertEquals(
            validationError.details.includes("GITHUB_TOKEN"),
            true,
            "Details should reference the environment variable name",
          );
        }
      });
    });
  });

  describe("MockSecretManager", () => {
    let mockManager: MockSecretManager;

    beforeEach(() => {
      mockManager = new MockSecretManager();
    });

    afterEach(() => {
      mockManager.clear();
    });

    it("should return configured API key", () => {
      mockManager.setAnthropicApiKey("mock-api-key");
      assertEquals(mockManager.getAnthropicApiKey(), "mock-api-key");
    });

    it("should return configured GitHub token", () => {
      mockManager.setGitHubToken("mock-token");
      assertEquals(mockManager.getGitHubToken(), "mock-token");
    });

    it("should return configured callback URL", () => {
      mockManager.setExplorationCallbackUrl("https://mock.com/callback");
      assertEquals(
        mockManager.getExplorationCallbackUrl(),
        "https://mock.com/callback",
      );
    });

    it("should have default values after construction", () => {
      // MockSecretManager should have default test values
      assertEquals(mockManager.getAnthropicApiKey(), "mock-anthropic-key");
      assertEquals(mockManager.getGitHubToken(), "mock-github-token");
      assertEquals(
        mockManager.getExplorationCallbackUrl(),
        "https://mock.example.com/callback",
      );
    });

    it("should reset to defaults after clear()", () => {
      mockManager.setAnthropicApiKey("custom-key");
      mockManager.setGitHubToken("custom-token");
      mockManager.setExplorationCallbackUrl("https://custom.com/callback");

      mockManager.clear();

      assertEquals(mockManager.getAnthropicApiKey(), "mock-anthropic-key");
      assertEquals(mockManager.getGitHubToken(), "mock-github-token");
      assertEquals(
        mockManager.getExplorationCallbackUrl(),
        "https://mock.example.com/callback",
      );
    });

    it("should be no-op for initialize()", () => {
      // MockSecretManager.initialize() should not throw
      mockManager.initialize();
    });
  });

  describe("Property 12: Secure Credential Storage", () => {
    it("should load secrets from environment variables only", () => {
      // Verify that SecretManagerImpl only reads from the environment provider
      // and does not accept secrets through other means
      const envProvider = () => ({
        ANTHROPIC_API_KEY: "sk-ant-env-key",
        GITHUB_TOKEN: "ghp_env-token",
        EXPLORATION_CALLBACK_URL: "https://env.example.com/callback",
      });

      const manager = new SecretManagerImpl(envProvider);
      manager.initialize();

      // Values should come from environment provider
      assertEquals(manager.getAnthropicApiKey(), "sk-ant-env-key");
      assertEquals(manager.getGitHubToken(), "ghp_env-token");
      assertEquals(
        manager.getExplorationCallbackUrl(),
        "https://env.example.com/callback",
      );
    });

    it("should fail fast at initialization if secrets are missing", () => {
      const envProvider = () => ({});

      const manager = new SecretManagerImpl(envProvider);

      // Should throw immediately during initialization
      assertThrows(
        () => manager.initialize(),
        ValidationError,
      );
    });

    it("should validate all required secrets are present before proceeding", () => {
      // Test that partial configuration fails
      const partialEnvProvider = () => ({
        ANTHROPIC_API_KEY: "sk-ant-test",
        // Missing GITHUB_TOKEN and EXPLORATION_CALLBACK_URL
      });

      const manager = new SecretManagerImpl(partialEnvProvider);

      assertThrows(
        () => manager.initialize(),
        ValidationError,
      );
    });

    it("should never expose secrets in ValidationError details for any secret type", () => {
      const testCases = [
        {
          name: "missing Anthropic key",
          env: {
            GITHUB_TOKEN: "ghp_secret",
            EXPLORATION_CALLBACK_URL: "https://example.com/callback",
          },
          presentSecret: "ghp_secret",
        },
        {
          name: "missing GitHub token",
          env: {
            ANTHROPIC_API_KEY: "sk-ant-secret",
            EXPLORATION_CALLBACK_URL: "https://example.com/callback",
          },
          presentSecret: "sk-ant-secret",
        },
        {
          name: "missing callback URL",
          env: {
            ANTHROPIC_API_KEY: "sk-ant-secret",
            GITHUB_TOKEN: "ghp_secret",
          },
          presentSecret: "sk-ant-secret",
        },
      ];

      for (const testCase of testCases) {
        const manager = new SecretManagerImpl(() => testCase.env);

        try {
          manager.initialize();
        } catch (error) {
          const validationError = error as ValidationError;
          const fullMessage = validationError.message +
            validationError.details +
            validationError.suggestedAction;

          assertEquals(
            fullMessage.includes(testCase.presentSecret),
            false,
            `${testCase.name}: Error should not expose present secret value`,
          );
        }
      }
    });

    it("should be usable for dependency injection in clients", () => {
      // Demonstrate that SecretManager can be injected into client constructors
      const envProvider = () => ({
        ANTHROPIC_API_KEY: "sk-ant-test123",
        GITHUB_TOKEN: "ghp_test456",
        EXPLORATION_CALLBACK_URL: "https://example.com/callback",
      });

      const secretManager = new SecretManagerImpl(envProvider);
      secretManager.initialize();

      // Simulate how a client would use the secret manager
      const anthropicApiKey = secretManager.getAnthropicApiKey();
      const githubToken = secretManager.getGitHubToken();

      assertEquals(typeof anthropicApiKey, "string");
      assertEquals(typeof githubToken, "string");
      assertEquals(anthropicApiKey.length > 0, true);
      assertEquals(githubToken.length > 0, true);
    });
  });
});
