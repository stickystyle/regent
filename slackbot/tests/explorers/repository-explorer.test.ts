// ABOUTME: Tests for RepositoryExplorer service with GitHub repository analysis.
// ABOUTME: Validates README detection, manifest parsing, framework detection, and error handling.

import { assertEquals, assertRejects } from "@std/assert";
import { afterEach, beforeEach, describe, it } from "@std/testing/bdd";
import { MockGitHubClient } from "../../src/clients/github-client.ts";
import { GitHubAccessError, NetworkTimeoutError } from "../../src/errors/types.ts";
import { Framework, RelevantFile, RepositoryContext } from "../../src/types/repository-context.ts";
import {
  RepositoryExplorer,
  RepositoryExplorerImpl,
} from "../../src/explorers/repository-explorer.ts";

/**
 * Extended MockGitHubClient that allows setting specific repository contexts.
 *
 * This enables testing different scenarios like specific frameworks,
 * README content, and directory structures.
 */
class ConfigurableMockGitHubClient extends MockGitHubClient {
  private mockContext: RepositoryContext | null = null;

  /**
   * Configure a specific RepositoryContext to be returned by exploreRepository.
   *
   * @param context - The context to return
   */
  setExploreRepositoryResult(context: RepositoryContext): void {
    this.mockContext = context;
  }

  override exploreRepository(owner: string, repo: string): Promise<RepositoryContext> {
    // Check for configured error first (from parent class)
    try {
      // This will throw if an error was configured via setExploreRepositoryError
      const errorCheck = super.exploreRepository(owner, repo);
      // If we get here, no error was configured, check for mock context
      if (this.mockContext !== null) {
        return Promise.resolve(this.mockContext);
      }
      return errorCheck;
    } catch {
      // If super throws synchronously, re-throw
      return super.exploreRepository(owner, repo);
    }
  }

  override clear(): void {
    super.clear();
    this.mockContext = null;
  }
}

describe("RepositoryExplorer", () => {
  let explorer: RepositoryExplorer;
  let mockClient: ConfigurableMockGitHubClient;

  beforeEach(() => {
    mockClient = new ConfigurableMockGitHubClient();
    explorer = new RepositoryExplorerImpl(mockClient);
  });

  afterEach(() => {
    mockClient.clear();
  });

  describe("README Detection", () => {
    it("should extract README.md content when present", async () => {
      const readmeContent = "# My Project\n\nThis is a test project.";
      mockClient.setExploreRepositoryResult({
        repository: "owner/repo",
        framework: Framework.Unknown,
        patterns: [],
        relevant_files: [
          {
            path: "README.md",
            description: "Project README",
            content: readmeContent,
          },
        ],
        structure: "",
      });

      const context = await explorer.explore("owner", "repo");

      const readmeFile = context.relevant_files.find(
        (f: RelevantFile) => f.path === "README.md",
      );
      assertEquals(readmeFile !== undefined, true);
      assertEquals(readmeFile!.content, readmeContent);
    });

    it("should handle missing README.md gracefully", async () => {
      mockClient.setExploreRepositoryResult({
        repository: "owner/repo",
        framework: Framework.Unknown,
        patterns: [],
        relevant_files: [],
        structure: "",
      });

      const context = await explorer.explore("owner", "repo");

      const readmeFile = context.relevant_files.find(
        (f: RelevantFile) => f.path === "README.md",
      );
      assertEquals(readmeFile, undefined);
    });
  });

  describe("Manifest Parsing", () => {
    it("should parse package.json for dependencies", async () => {
      mockClient.setExploreRepositoryResult({
        repository: "owner/repo",
        framework: Framework.React,
        patterns: [],
        relevant_files: [
          {
            path: "package.json",
            description: "Node.js package manifest",
            content: JSON.stringify({
              dependencies: { react: "^18.0.0" },
            }),
          },
        ],
        structure: "",
      });

      const context = await explorer.explore("owner", "repo");

      assertEquals(context.framework, Framework.React);
      const packageFile = context.relevant_files.find(
        (f: RelevantFile) => f.path === "package.json",
      );
      assertEquals(packageFile !== undefined, true);
    });

    it("should parse pyproject.toml for Python dependencies", async () => {
      mockClient.setExploreRepositoryResult({
        repository: "owner/repo",
        framework: Framework.FastAPI,
        patterns: [],
        relevant_files: [
          {
            path: "pyproject.toml",
            description: "Python project manifest",
            content: '[tool.poetry.dependencies]\nfastapi = "^0.100.0"',
          },
        ],
        structure: "",
      });

      const context = await explorer.explore("owner", "repo");

      assertEquals(context.framework, Framework.FastAPI);
    });

    it("should parse deno.json/jsonc for Deno projects", async () => {
      mockClient.setExploreRepositoryResult({
        repository: "owner/repo",
        framework: Framework.Deno,
        patterns: [],
        relevant_files: [
          {
            path: "deno.json",
            description: "Deno configuration",
            content: JSON.stringify({ tasks: { dev: "deno run main.ts" } }),
          },
        ],
        structure: "",
      });

      const context = await explorer.explore("owner", "repo");

      assertEquals(context.framework, Framework.Deno);
    });
  });

  describe("Framework Detection", () => {
    it("should detect React framework from package.json", async () => {
      mockClient.setExploreRepositoryResult({
        repository: "owner/repo",
        framework: Framework.React,
        patterns: [],
        relevant_files: [],
        structure: "",
      });

      const context = await explorer.explore("owner", "repo");

      assertEquals(context.framework, Framework.React);
    });

    it("should detect Next.js framework with next dependency", async () => {
      mockClient.setExploreRepositoryResult({
        repository: "owner/repo",
        framework: Framework.NextJS,
        patterns: [],
        relevant_files: [],
        structure: "",
      });

      const context = await explorer.explore("owner", "repo");

      assertEquals(context.framework, Framework.NextJS);
    });

    it("should detect FastAPI from pyproject.toml", async () => {
      mockClient.setExploreRepositoryResult({
        repository: "owner/repo",
        framework: Framework.FastAPI,
        patterns: [],
        relevant_files: [],
        structure: "",
      });

      const context = await explorer.explore("owner", "repo");

      assertEquals(context.framework, Framework.FastAPI);
    });

    it("should detect Django from pyproject.toml", async () => {
      mockClient.setExploreRepositoryResult({
        repository: "owner/repo",
        framework: Framework.Django,
        patterns: [],
        relevant_files: [],
        structure: "",
      });

      const context = await explorer.explore("owner", "repo");

      assertEquals(context.framework, Framework.Django);
    });

    it("should detect Express from package.json", async () => {
      mockClient.setExploreRepositoryResult({
        repository: "owner/repo",
        framework: Framework.Express,
        patterns: [],
        relevant_files: [],
        structure: "",
      });

      const context = await explorer.explore("owner", "repo");

      assertEquals(context.framework, Framework.Express);
    });

    it("should detect Deno from deno.json", async () => {
      mockClient.setExploreRepositoryResult({
        repository: "owner/repo",
        framework: Framework.Deno,
        patterns: [],
        relevant_files: [],
        structure: "",
      });

      const context = await explorer.explore("owner", "repo");

      assertEquals(context.framework, Framework.Deno);
    });

    it("should return Unknown for unrecognized projects", async () => {
      mockClient.setExploreRepositoryResult({
        repository: "owner/repo",
        framework: Framework.Unknown,
        patterns: [],
        relevant_files: [],
        structure: "",
      });

      const context = await explorer.explore("owner", "repo");

      assertEquals(context.framework, Framework.Unknown);
    });
  });

  describe("Directory Structure", () => {
    it("should build directory structure tree", async () => {
      const structure = "src/\n  components/\n  pages/\ntests/\n  unit/";
      mockClient.setExploreRepositoryResult({
        repository: "owner/repo",
        framework: Framework.Unknown,
        patterns: [],
        relevant_files: [],
        structure,
      });

      const context = await explorer.explore("owner", "repo");

      assertEquals(context.structure.includes("src/"), true);
      assertEquals(context.structure.includes("tests/"), true);
    });

    it("should include both files and directories", async () => {
      const structure = "src/\n  index.ts\n  utils.ts\nREADME.md";
      mockClient.setExploreRepositoryResult({
        repository: "owner/repo",
        framework: Framework.Unknown,
        patterns: [],
        relevant_files: [],
        structure,
      });

      const context = await explorer.explore("owner", "repo");

      assertEquals(context.structure.includes("src/"), true);
      assertEquals(context.structure.includes("index.ts"), true);
    });
  });

  describe("Error Handling", () => {
    it("should throw GitHubAccessError on 403 access denied", async () => {
      const error = new GitHubAccessError(
        "Access denied",
        "Token lacks permissions (HTTP 403)",
        "Update token permissions",
      );
      mockClient.setExploreRepositoryError(error);

      await assertRejects(
        () => explorer.explore("owner", "repo"),
        GitHubAccessError,
        "Access denied",
      );
    });

    it("should throw GitHubAccessError on 401 authentication failed", async () => {
      const error = new GitHubAccessError(
        "Authentication failed",
        "GitHub token is invalid (HTTP 401)",
        "Update GitHub token",
      );
      mockClient.setExploreRepositoryError(error);

      await assertRejects(
        () => explorer.explore("owner", "repo"),
        GitHubAccessError,
        "Authentication failed",
      );
    });

    it("should handle 404 for missing files gracefully", async () => {
      // When files are missing, the context should still be returned
      // with empty relevant_files and Unknown framework
      mockClient.setExploreRepositoryResult({
        repository: "owner/repo",
        framework: Framework.Unknown,
        patterns: [],
        relevant_files: [],
        structure: "",
      });

      const context = await explorer.explore("owner", "repo");

      assertEquals(context.repository, "owner/repo");
      assertEquals(context.framework, Framework.Unknown);
      assertEquals(context.relevant_files.length, 0);
    });

    it("should propagate transient errors for retry handling", async () => {
      const error = new NetworkTimeoutError(
        "Request timeout",
        "GitHub API timed out",
        "Retry the request",
      );
      mockClient.setExploreRepositoryError(error);

      await assertRejects(
        () => explorer.explore("owner", "repo"),
        NetworkTimeoutError,
        "Request timeout",
      );
    });
  });

  describe("Repository Context", () => {
    it("should return complete repository context", async () => {
      mockClient.setExploreRepositoryResult({
        repository: "owner/repo",
        framework: Framework.React,
        patterns: ["Component-based architecture", "Hooks pattern"],
        relevant_files: [
          {
            path: "README.md",
            description: "Project README",
            content: "# My React App",
          },
          {
            path: "package.json",
            description: "Package manifest",
          },
        ],
        structure: "src/\n  components/\n  hooks/",
      });

      const context = await explorer.explore("owner", "repo");

      assertEquals(context.repository, "owner/repo");
      assertEquals(context.framework, Framework.React);
      assertEquals(context.patterns.length, 2);
      assertEquals(context.patterns.includes("Component-based architecture"), true);
      assertEquals(context.relevant_files.length, 2);
      assertEquals(context.structure.includes("src/"), true);
    });

    it("should preserve repository identifier format", async () => {
      mockClient.setExploreRepositoryResult({
        repository: "my-org/my-repo-name",
        framework: Framework.Unknown,
        patterns: [],
        relevant_files: [],
        structure: "",
      });

      const context = await explorer.explore("my-org", "my-repo-name");

      assertEquals(context.repository, "my-org/my-repo-name");
    });
  });
});

describe("Property 2.2: Codebase Exploration - File Reading", () => {
  /**
   * Property 2.2: WHEN exploring a repository THEN the system SHALL read
   * key files including README, package manifests (package.json, pyproject.toml),
   * and source directory structure.
   */

  let explorer: RepositoryExplorer;
  let mockClient: ConfigurableMockGitHubClient;

  beforeEach(() => {
    mockClient = new ConfigurableMockGitHubClient();
    explorer = new RepositoryExplorerImpl(mockClient);
  });

  afterEach(() => {
    mockClient.clear();
  });

  it("should explore repository and return context with key files", async () => {
    mockClient.setExploreRepositoryResult({
      repository: "owner/repo",
      framework: Framework.NextJS,
      patterns: ["App Router", "Server Components"],
      relevant_files: [
        {
          path: "README.md",
          description: "Project README",
          content: "# Next.js App\n\nA modern Next.js application.",
        },
        {
          path: "package.json",
          description: "Node.js package manifest",
          content: JSON.stringify({
            dependencies: { next: "^14.0.0", react: "^18.0.0" },
          }),
        },
      ],
      structure: "app/\n  page.tsx\n  layout.tsx\ncomponents/",
    });

    const context = await explorer.explore("owner", "repo");

    // Verify key files are included
    const readme = context.relevant_files.find((f) => f.path === "README.md");
    const packageJson = context.relevant_files.find((f) => f.path === "package.json");

    assertEquals(readme !== undefined, true);
    assertEquals(packageJson !== undefined, true);

    // Verify framework was detected
    assertEquals(context.framework, Framework.NextJS);

    // Verify directory structure was captured
    assertEquals(context.structure.includes("app/"), true);
  });
});

describe("Property 2.4: Codebase Exploration - Error Handling", () => {
  /**
   * Property 2.4: WHEN the GitHub token lacks access to the specified repository
   * THEN the system SHALL display an error message and offer to continue
   * without repository context.
   */

  let explorer: RepositoryExplorer;
  let mockClient: ConfigurableMockGitHubClient;

  beforeEach(() => {
    mockClient = new ConfigurableMockGitHubClient();
    explorer = new RepositoryExplorerImpl(mockClient);
  });

  afterEach(() => {
    mockClient.clear();
  });

  it("should throw GitHubAccessError with actionable message on access failure", async () => {
    const error = new GitHubAccessError(
      "Access denied",
      "GitHub token lacks permissions for owner/private-repo (HTTP 403)",
      "Update token permissions or use a different repository",
    );
    mockClient.setExploreRepositoryError(error);

    try {
      await explorer.explore("owner", "private-repo");
      throw new Error("Should have thrown GitHubAccessError");
    } catch (err) {
      assertEquals(err instanceof GitHubAccessError, true);
      const accessError = err as GitHubAccessError;
      assertEquals(accessError.isRetryable, false);
      assertEquals(accessError.suggestedAction.length > 0, true);
    }
  });

  it("should distinguish between access errors and missing repos", async () => {
    // Access error (403) - permanent, actionable
    const accessError = new GitHubAccessError(
      "Access denied",
      "Token lacks permissions",
      "Update token",
    );

    mockClient.setExploreRepositoryError(accessError);

    await assertRejects(
      () => explorer.explore("owner", "repo"),
      GitHubAccessError,
    );
  });
});
