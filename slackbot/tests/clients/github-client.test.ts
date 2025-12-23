// ABOUTME: Tests for GitHub client with repository exploration and PR creation.
// ABOUTME: Validates retry logic, access checks, rate limit handling per Property 5 and Property 11.

import { assertEquals, assertRejects } from "@std/assert";
import { afterEach, beforeEach, describe, it } from "@std/testing/bdd";
import { GitHubClientImpl, MockGitHubClient } from "../../src/clients/github-client.ts";
import { Framework } from "../../src/types/repository-context.ts";
import { SpecDocument } from "../../src/types/spec-document.ts";
import {
  GitHubAccessError,
  GitHubRateLimitError,
  NetworkTimeoutError,
} from "../../src/errors/types.ts";

/**
 * Type for mock GitHub API object used in tests.
 */
interface MockGitHubApi {
  get: (url: string, headers?: Record<string, string>) => Promise<Response>;
  post: (
    url: string,
    body: unknown,
    headers?: Record<string, string>,
  ) => Promise<Response>;
}

describe("GitHubClient", () => {
  describe("MockGitHubClient", () => {
    let client: MockGitHubClient;

    beforeEach(() => {
      client = new MockGitHubClient();
    });

    afterEach(() => {
      client.clear();
    });

    describe("checkAccess", () => {
      it("should return true for accessible repository", async () => {
        const hasAccess = await client.checkAccess("owner", "repo");

        assertEquals(hasAccess, true);
      });

      it("should throw configured error", async () => {
        const error = new GitHubAccessError(
          "Access denied",
          "Token lacks permissions",
          "Update token permissions",
        );
        client.setCheckAccessError(error);

        await assertRejects(
          () => client.checkAccess("owner", "repo"),
          GitHubAccessError,
        );
      });
    });

    describe("exploreRepository", () => {
      it("should return mock repository context", async () => {
        const context = await client.exploreRepository("owner", "repo");

        assertEquals(context.repository, "owner/repo");
        assertEquals(context.framework, Framework.Unknown);
        assertEquals(Array.isArray(context.patterns), true);
        assertEquals(Array.isArray(context.relevant_files), true);
        assertEquals(typeof context.structure, "string");
      });

      it("should throw configured error", async () => {
        const error = new NetworkTimeoutError(
          "Timeout",
          "Request timed out",
          "Retry",
        );
        client.setExploreRepositoryError(error);

        await assertRejects(
          () => client.exploreRepository("owner", "repo"),
          NetworkTimeoutError,
        );
      });
    });

    describe("getDefaultBranch", () => {
      it("should return main as default branch", async () => {
        const branch = await client.getDefaultBranch("owner", "repo");

        assertEquals(branch, "main");
      });

      it("should throw configured error", async () => {
        const error = new GitHubAccessError(
          "Access denied",
          "Cannot read repo",
          "Check permissions",
        );
        client.setGetDefaultBranchError(error);

        await assertRejects(
          () => client.getDefaultBranch("owner", "repo"),
          GitHubAccessError,
        );
      });
    });

    describe("createPullRequest", () => {
      it("should return PR URL", async () => {
        const spec: SpecDocument = {
          title: "Test Feature",
          overview: "Overview",
          problem_statement: "Problem",
          goals: ["Goal 1"],
          non_goals: [],
          personas: [],
          use_cases: [],
          technical_details: "",
          open_questions: [],
        };

        const prUrl = await client.createPullRequest(
          "owner",
          "repo",
          spec,
          "https://slack.com/thread/123",
          ["@alice", "@bob"],
        );

        assertEquals(
          prUrl,
          "https://github.com/owner/repo/pull/1",
        );
      });

      it("should throw configured error", async () => {
        const spec: SpecDocument = {
          title: "Test",
          overview: "Overview",
          problem_statement: "Problem",
          goals: [],
          non_goals: [],
          personas: [],
          use_cases: [],
          technical_details: "",
          open_questions: [],
        };

        const error = new GitHubAccessError(
          "Cannot create PR",
          "Missing write permissions",
          "Grant write access",
        );
        client.setCreatePullRequestError(error);

        await assertRejects(
          () =>
            client.createPullRequest(
              "owner",
              "repo",
              spec,
              "https://slack.com/thread/123",
              [],
            ),
          GitHubAccessError,
        );
      });
    });

    describe("Mock state management", () => {
      it("should clear all configured errors", async () => {
        const error = new NetworkTimeoutError("Test", "Test", "Test");
        client.setCheckAccessError(error);
        client.setExploreRepositoryError(error);
        client.clear();

        // Should succeed after clear
        await client.checkAccess("owner", "repo");
        await client.exploreRepository("owner", "repo");
      });
    });
  });

  describe("GitHubClientImpl with RetryHandler", () => {
    let mockApi: MockGitHubApi;
    let client: GitHubClientImpl;

    beforeEach(() => {
      mockApi = {
        get: (_url: string) =>
          Promise.resolve(
            new Response(
              JSON.stringify({
                default_branch: "main",
              }),
              { status: 200 },
            ),
          ),
        post: (_url: string, _body: unknown) =>
          Promise.resolve(
            new Response(
              JSON.stringify({
                html_url: "https://github.com/owner/repo/pull/42",
              }),
              { status: 201 },
            ),
          ),
      };

      client = new GitHubClientImpl(mockApi, "test-token");
    });

    describe("checkAccess", () => {
      it("should return true for 200 response", async () => {
        mockApi.get = (_url) =>
          Promise.resolve(
            new Response(
              JSON.stringify({ default_branch: "main" }),
              { status: 200 },
            ),
          );

        const hasAccess = await client.checkAccess("owner", "repo");

        assertEquals(hasAccess, true);
      });

      it("should return false for 404 response", async () => {
        mockApi.get = (_url) =>
          Promise.resolve(
            new Response("Not Found", { status: 404 }),
          );

        const hasAccess = await client.checkAccess("owner", "repo");

        assertEquals(hasAccess, false);
      });

      it("should throw GitHubAccessError for 401 response", async () => {
        mockApi.get = (_url) =>
          Promise.resolve(
            new Response("Unauthorized", { status: 401 }),
          );

        await assertRejects(
          () => client.checkAccess("owner", "repo"),
          GitHubAccessError,
          "Authentication failed",
        );
      });

      it("should throw GitHubAccessError for 403 response", async () => {
        mockApi.get = (_url) =>
          Promise.resolve(
            new Response("Forbidden", { status: 403 }),
          );

        await assertRejects(
          () => client.checkAccess("owner", "repo"),
          GitHubAccessError,
          "Access denied",
        );
      });

      it("should throw GitHubRateLimitError for 429 response", async () => {
        mockApi.get = (_url) => {
          const headers = new Headers();
          headers.set("x-ratelimit-reset", String(Date.now() / 1000 + 60));
          return Promise.resolve(
            new Response("Rate limit exceeded", { status: 429, headers }),
          );
        };

        await assertRejects(
          () => client.checkAccess("owner", "repo"),
          GitHubRateLimitError,
        );
      });

      it("should throw NetworkTimeoutError for 5xx response", async () => {
        mockApi.get = (_url) =>
          Promise.resolve(
            new Response("Internal Server Error", { status: 500 }),
          );

        await assertRejects(
          () => client.checkAccess("owner", "repo"),
          NetworkTimeoutError,
        );
      });

      it("should retry transient errors", async () => {
        let attempts = 0;
        mockApi.get = (_url) => {
          attempts++;
          if (attempts < 2) {
            return Promise.resolve(
              new Response("Server Error", { status: 503 }),
            );
          }
          return Promise.resolve(
            new Response(
              JSON.stringify({ default_branch: "main" }),
              { status: 200 },
            ),
          );
        };

        const hasAccess = await client.checkAccess("owner", "repo");

        assertEquals(hasAccess, true);
        assertEquals(attempts, 2);
      });

      it("should not retry permanent errors", async () => {
        let attempts = 0;
        mockApi.get = (_url) => {
          attempts++;
          return Promise.resolve(
            new Response("Forbidden", { status: 403 }),
          );
        };

        await assertRejects(
          () => client.checkAccess("owner", "repo"),
          GitHubAccessError,
        );

        assertEquals(attempts, 1, "Should not retry permanent errors");
      });

      it("should include Authorization header", async () => {
        let capturedHeaders: Record<string, string> | undefined;
        mockApi.get = (_url, headers) => {
          capturedHeaders = headers;
          return Promise.resolve(
            new Response(
              JSON.stringify({ default_branch: "main" }),
              { status: 200 },
            ),
          );
        };

        await client.checkAccess("owner", "repo");

        assertEquals(capturedHeaders!["Authorization"], "Bearer test-token");
        assertEquals(
          capturedHeaders!["Accept"],
          "application/vnd.github.v3+json",
        );
      });
    });

    describe("getDefaultBranch", () => {
      it("should return default branch from API", async () => {
        mockApi.get = (_url) =>
          Promise.resolve(
            new Response(
              JSON.stringify({ default_branch: "develop" }),
              { status: 200 },
            ),
          );

        const branch = await client.getDefaultBranch("owner", "repo");

        assertEquals(branch, "develop");
      });

      it("should read from .regent/config.yml if present", async () => {
        let requestedUrl = "";
        mockApi.get = (url) => {
          requestedUrl = url;
          if (url.includes(".regent/config.yml")) {
            const configContent = "target_branch: custom-branch\n";
            return Promise.resolve(
              new Response(
                JSON.stringify({
                  content: btoa(configContent),
                  encoding: "base64",
                }),
                { status: 200 },
              ),
            );
          }
          return Promise.resolve(
            new Response(
              JSON.stringify({ default_branch: "main" }),
              { status: 200 },
            ),
          );
        };

        const branch = await client.getDefaultBranch("owner", "repo");

        assertEquals(branch, "custom-branch");
        assertEquals(requestedUrl.includes(".regent/config.yml"), true);
      });

      it("should fall back to repo default if config missing", async () => {
        mockApi.get = (url) => {
          if (url.includes(".regent/config.yml")) {
            return Promise.resolve(
              new Response("Not Found", { status: 404 }),
            );
          }
          return Promise.resolve(
            new Response(
              JSON.stringify({ default_branch: "main" }),
              { status: 200 },
            ),
          );
        };

        const branch = await client.getDefaultBranch("owner", "repo");

        assertEquals(branch, "main");
      });

      it("should fall back to repo default if config.yml has no parseable target_branch", async () => {
        mockApi.get = (url) => {
          if (url.includes(".regent/config.yml")) {
            // YAML content that doesn't contain target_branch at all
            const configContent = "# Just a comment\nsome_other_key: value\n";
            return Promise.resolve(
              new Response(
                JSON.stringify({
                  content: btoa(configContent),
                  encoding: "base64",
                }),
                { status: 200 },
              ),
            );
          }
          return Promise.resolve(
            new Response(
              JSON.stringify({ default_branch: "main" }),
              { status: 200 },
            ),
          );
        };

        const branch = await client.getDefaultBranch("owner", "repo");

        // Should fall back to repo default when target_branch not found
        assertEquals(branch, "main");
      });

      it("should fall back to repo default if config.yml has no target_branch field", async () => {
        mockApi.get = (url) => {
          if (url.includes(".regent/config.yml")) {
            // Valid YAML but no target_branch field
            const configContent = "other_setting: value\nanother_key: 123\n";
            return Promise.resolve(
              new Response(
                JSON.stringify({
                  content: btoa(configContent),
                  encoding: "base64",
                }),
                { status: 200 },
              ),
            );
          }
          return Promise.resolve(
            new Response(
              JSON.stringify({ default_branch: "develop" }),
              { status: 200 },
            ),
          );
        };

        const branch = await client.getDefaultBranch("owner", "repo");

        assertEquals(branch, "develop");
      });

      it("should handle empty config.yml file", async () => {
        mockApi.get = (url) => {
          if (url.includes(".regent/config.yml")) {
            // Empty content
            const configContent = "";
            return Promise.resolve(
              new Response(
                JSON.stringify({
                  content: btoa(configContent),
                  encoding: "base64",
                }),
                { status: 200 },
              ),
            );
          }
          return Promise.resolve(
            new Response(
              JSON.stringify({ default_branch: "master" }),
              { status: 200 },
            ),
          );
        };

        const branch = await client.getDefaultBranch("owner", "repo");

        assertEquals(branch, "master");
      });

      it("should throw on repository access error", async () => {
        mockApi.get = (_url) =>
          Promise.resolve(
            new Response("Forbidden", { status: 403 }),
          );

        await assertRejects(
          () => client.getDefaultBranch("owner", "repo"),
          GitHubAccessError,
        );
      });
    });

    describe("exploreRepository", () => {
      it("should detect React framework from package.json", async () => {
        mockApi.get = (url) => {
          if (url.includes("package.json")) {
            const packageJson = {
              dependencies: { react: "^18.0.0" },
            };
            return Promise.resolve(
              new Response(
                JSON.stringify({
                  content: btoa(JSON.stringify(packageJson)),
                  encoding: "base64",
                }),
                { status: 200 },
              ),
            );
          }
          if (url.includes("contents/src") || url.includes("contents/")) {
            return Promise.resolve(
              new Response(
                JSON.stringify([
                  { name: "index.tsx", type: "file", path: "src/index.tsx" },
                ]),
                { status: 200 },
              ),
            );
          }
          return Promise.resolve(
            new Response("Not Found", { status: 404 }),
          );
        };

        const context = await client.exploreRepository("owner", "repo");

        assertEquals(context.repository, "owner/repo");
        assertEquals(context.framework, Framework.React);
      });

      it("should detect FastAPI framework from pyproject.toml", async () => {
        mockApi.get = (url) => {
          if (url.includes("pyproject.toml")) {
            const pyproject =
              '[tool.poetry]\nname = "api"\n\n[tool.poetry.dependencies]\nfastapi = "^0.100.0"\n';
            return Promise.resolve(
              new Response(
                JSON.stringify({
                  content: btoa(pyproject),
                  encoding: "base64",
                }),
                { status: 200 },
              ),
            );
          }
          if (url.includes("contents/")) {
            return Promise.resolve(
              new Response(
                JSON.stringify([
                  { name: "main.py", type: "file", path: "main.py" },
                ]),
                { status: 200 },
              ),
            );
          }
          return Promise.resolve(
            new Response("Not Found", { status: 404 }),
          );
        };

        const context = await client.exploreRepository("owner", "repo");

        assertEquals(context.repository, "owner/repo");
        assertEquals(context.framework, Framework.FastAPI);
      });

      it("should detect Deno framework from deno.json", async () => {
        mockApi.get = (url) => {
          if (url.includes("deno.json")) {
            const denoJson = { tasks: { dev: "deno run main.ts" } };
            return Promise.resolve(
              new Response(
                JSON.stringify({
                  content: btoa(JSON.stringify(denoJson)),
                  encoding: "base64",
                }),
                { status: 200 },
              ),
            );
          }
          if (url.includes("contents/")) {
            return Promise.resolve(
              new Response(
                JSON.stringify([
                  { name: "main.ts", type: "file", path: "main.ts" },
                ]),
                { status: 200 },
              ),
            );
          }
          return Promise.resolve(
            new Response("Not Found", { status: 404 }),
          );
        };

        const context = await client.exploreRepository("owner", "repo");

        assertEquals(context.repository, "owner/repo");
        assertEquals(context.framework, Framework.Deno);
      });

      it("should include README.md in relevant files", async () => {
        mockApi.get = (url) => {
          if (url.includes("README.md")) {
            const readme = "# Project\n\nDescription here.";
            return Promise.resolve(
              new Response(
                JSON.stringify({
                  content: btoa(readme),
                  encoding: "base64",
                }),
                { status: 200 },
              ),
            );
          }
          if (url.includes("contents/")) {
            return Promise.resolve(
              new Response(
                JSON.stringify([
                  { name: "README.md", type: "file", path: "README.md" },
                ]),
                { status: 200 },
              ),
            );
          }
          return Promise.resolve(
            new Response("Not Found", { status: 404 }),
          );
        };

        const context = await client.exploreRepository("owner", "repo");

        const readmeFile = context.relevant_files.find((f: { path: string }) =>
          f.path === "README.md"
        );
        assertEquals(readmeFile !== undefined, true);
        assertEquals(readmeFile!.content!.includes("Description here"), true);
      });

      it("should build directory structure tree", async () => {
        mockApi.get = (url) => {
          if (url.includes("contents/") && !url.includes("contents/src")) {
            return Promise.resolve(
              new Response(
                JSON.stringify([
                  { name: "src", type: "dir", path: "src" },
                  { name: "tests", type: "dir", path: "tests" },
                  { name: "README.md", type: "file", path: "README.md" },
                ]),
                { status: 200 },
              ),
            );
          }
          if (url.includes("contents/src")) {
            return Promise.resolve(
              new Response(
                JSON.stringify([
                  { name: "index.ts", type: "file", path: "src/index.ts" },
                ]),
                { status: 200 },
              ),
            );
          }
          return Promise.resolve(
            new Response("Not Found", { status: 404 }),
          );
        };

        const context = await client.exploreRepository("owner", "repo");

        assertEquals(context.structure.includes("src/"), true);
        assertEquals(context.structure.includes("tests/"), true);
      });

      it("should retry on transient errors", async () => {
        let attempts = 0;
        mockApi.get = (_url) => {
          attempts++;
          if (attempts < 2) {
            return Promise.resolve(
              new Response("Server Error", { status: 500 }),
            );
          }
          return Promise.resolve(
            new Response(
              JSON.stringify([
                { name: "README.md", type: "file", path: "README.md" },
              ]),
              { status: 200 },
            ),
          );
        };

        const context = await client.exploreRepository("owner", "repo");

        assertEquals(context.repository, "owner/repo");
        assertEquals(attempts >= 2, true);
      });

      it("should throw on access error", async () => {
        mockApi.get = (_url) =>
          Promise.resolve(
            new Response("Forbidden", { status: 403 }),
          );

        await assertRejects(
          () => client.exploreRepository("owner", "repo"),
          GitHubAccessError,
        );
      });
    });

    describe("createPullRequest", () => {
      it("should create PR with brainstorm.md in .regent directory", async () => {
        let capturedPrUrl = "";
        let capturedPrBody: unknown;

        // Mock GET requests for getDefaultBranch and get ref
        mockApi.get = (url: string) => {
          if (url.includes("/git/refs/heads/")) {
            return Promise.resolve(
              new Response(
                JSON.stringify({
                  object: { sha: "abc123" },
                }),
                { status: 200 },
              ),
            );
          }
          // Default: return repo info
          return Promise.resolve(
            new Response(
              JSON.stringify({ default_branch: "main" }),
              { status: 200 },
            ),
          );
        };

        // Mock POST requests for creating ref, file, and PR
        mockApi.post = (url: string, body: unknown) => {
          if (url.includes("/pulls")) {
            capturedPrUrl = url;
            capturedPrBody = body;
            return Promise.resolve(
              new Response(
                JSON.stringify({
                  html_url: "https://github.com/owner/repo/pull/42",
                }),
                { status: 201 },
              ),
            );
          }
          // Create ref or file
          return Promise.resolve(
            new Response(
              JSON.stringify({ sha: "def456" }),
              { status: 201 },
            ),
          );
        };

        const spec: SpecDocument = {
          title: "New Feature",
          overview: "Feature overview",
          problem_statement: "Problem description",
          goals: ["Goal 1"],
          non_goals: [],
          personas: [],
          use_cases: [],
          technical_details: "",
          open_questions: [],
        };

        const prUrl = await client.createPullRequest(
          "owner",
          "repo",
          spec,
          "https://slack.com/thread/123",
          ["@alice", "@bob"],
        );

        assertEquals(
          prUrl,
          "https://github.com/owner/repo/pull/42",
        );
        assertEquals(capturedPrUrl.includes("/pulls"), true);

        const body = capturedPrBody as {
          title: string;
          body: string;
          head: string;
          base: string;
        };
        assertEquals(body.title.includes("New Feature"), true);
        assertEquals(body.body.includes("https://slack.com/thread/123"), true);
        assertEquals(body.body.includes("@alice"), true);
        assertEquals(body.body.includes("@bob"), true);
      });

      it("should use kebab-case for branch and directory names", async () => {
        let capturedPrBody: unknown;

        // Mock GET requests
        mockApi.get = (url: string) => {
          if (url.includes("/git/refs/heads/")) {
            return Promise.resolve(
              new Response(
                JSON.stringify({
                  object: { sha: "abc123" },
                }),
                { status: 200 },
              ),
            );
          }
          return Promise.resolve(
            new Response(
              JSON.stringify({ default_branch: "main" }),
              { status: 200 },
            ),
          );
        };

        // Mock POST requests
        mockApi.post = (url: string, body: unknown) => {
          if (url.includes("/pulls")) {
            capturedPrBody = body;
            return Promise.resolve(
              new Response(
                JSON.stringify({
                  html_url: "https://github.com/owner/repo/pull/1",
                }),
                { status: 201 },
              ),
            );
          }
          return Promise.resolve(
            new Response(
              JSON.stringify({ sha: "def456" }),
              { status: 201 },
            ),
          );
        };

        const spec: SpecDocument = {
          title: "New Cool Feature",
          overview: "Overview",
          problem_statement: "Problem",
          goals: [],
          non_goals: [],
          personas: [],
          use_cases: [],
          technical_details: "",
          open_questions: [],
        };

        await client.createPullRequest(
          "owner",
          "repo",
          spec,
          "https://slack.com/thread/123",
          [],
        );

        const body = capturedPrBody as { head: string };
        assertEquals(body.head.includes("new-cool-feature"), true);
      });

      it("should retry on transient errors", async () => {
        let attempts = 0;

        // Mock GET requests
        mockApi.get = (url: string) => {
          if (url.includes("/git/refs/heads/")) {
            return Promise.resolve(
              new Response(
                JSON.stringify({
                  object: { sha: "abc123" },
                }),
                { status: 200 },
              ),
            );
          }
          return Promise.resolve(
            new Response(
              JSON.stringify({ default_branch: "main" }),
              { status: 200 },
            ),
          );
        };

        // Mock POST requests - fail once then succeed
        mockApi.post = (_url: string, _body: unknown) => {
          attempts++;
          if (attempts < 2) {
            return Promise.resolve(
              new Response("Server Error", { status: 500 }),
            );
          }
          return Promise.resolve(
            new Response(
              JSON.stringify({
                html_url: "https://github.com/owner/repo/pull/1",
              }),
              { status: 201 },
            ),
          );
        };

        const spec: SpecDocument = {
          title: "Test",
          overview: "Overview",
          problem_statement: "Problem",
          goals: [],
          non_goals: [],
          personas: [],
          use_cases: [],
          technical_details: "",
          open_questions: [],
        };

        await client.createPullRequest(
          "owner",
          "repo",
          spec,
          "https://slack.com/thread/123",
          [],
        );

        // Should have retried the GET ref call and succeeded on the second attempt
        assertEquals(attempts >= 2, true);
      });

      it("should throw on access error", async () => {
        // Mock GET requests
        mockApi.get = (url: string) => {
          if (url.includes("/git/refs/heads/")) {
            return Promise.resolve(
              new Response("Forbidden", { status: 403 }),
            );
          }
          return Promise.resolve(
            new Response(
              JSON.stringify({ default_branch: "main" }),
              { status: 200 },
            ),
          );
        };

        mockApi.post = (_url: string, _body: unknown) =>
          Promise.resolve(
            new Response("Forbidden", { status: 403 }),
          );

        const spec: SpecDocument = {
          title: "Test",
          overview: "Overview",
          problem_statement: "Problem",
          goals: [],
          non_goals: [],
          personas: [],
          use_cases: [],
          technical_details: "",
          open_questions: [],
        };

        await assertRejects(
          () =>
            client.createPullRequest(
              "owner",
              "repo",
              spec,
              "https://slack.com/thread/123",
              [],
            ),
          GitHubAccessError,
        );
      });

      it("should throw GitHubAccessError for 422 validation error", async () => {
        // Mock GET requests
        mockApi.get = (url: string) => {
          if (url.includes("/git/refs/heads/")) {
            return Promise.resolve(
              new Response(
                JSON.stringify({
                  object: { sha: "abc123" },
                }),
                { status: 200 },
              ),
            );
          }
          return Promise.resolve(
            new Response(
              JSON.stringify({ default_branch: "main" }),
              { status: 200 },
            ),
          );
        };

        // Mock POST requests - return 422 for PR creation
        mockApi.post = (url: string, _body: unknown) => {
          if (url.includes("/pulls")) {
            return Promise.resolve(
              new Response(
                JSON.stringify({
                  message: "Validation Failed",
                  errors: [{ message: "Pull request already exists" }],
                }),
                { status: 422 },
              ),
            );
          }
          // Other POST requests succeed
          return Promise.resolve(
            new Response(
              JSON.stringify({ sha: "def456" }),
              { status: 201 },
            ),
          );
        };

        const spec: SpecDocument = {
          title: "Test",
          overview: "Overview",
          problem_statement: "Problem",
          goals: [],
          non_goals: [],
          personas: [],
          use_cases: [],
          technical_details: "",
          open_questions: [],
        };

        await assertRejects(
          () =>
            client.createPullRequest(
              "owner",
              "repo",
              spec,
              "https://slack.com/thread/123",
              [],
            ),
          GitHubAccessError,
          "Validation failed",
        );
      });

      it("should create branch with brainstorm/{spec-name} pattern", async () => {
        let capturedRefPayload: unknown;

        mockApi.get = (url: string) => {
          if (url.includes("/git/refs/heads/")) {
            return Promise.resolve(
              new Response(
                JSON.stringify({ object: { sha: "abc123" } }),
                { status: 200 },
              ),
            );
          }
          return Promise.resolve(
            new Response(
              JSON.stringify({ default_branch: "main" }),
              { status: 200 },
            ),
          );
        };

        mockApi.post = (url: string, body: unknown) => {
          if (url.includes("/git/refs") && !url.includes("/heads/")) {
            capturedRefPayload = body;
          }
          if (url.includes("/pulls")) {
            return Promise.resolve(
              new Response(
                JSON.stringify({ html_url: "https://github.com/owner/repo/pull/1" }),
                { status: 201 },
              ),
            );
          }
          return Promise.resolve(
            new Response(JSON.stringify({ sha: "def456" }), { status: 201 }),
          );
        };

        const spec: SpecDocument = {
          title: "My Cool Feature",
          overview: "Overview",
          problem_statement: "Problem",
          goals: [],
          non_goals: [],
          personas: [],
          use_cases: [],
          technical_details: "",
          open_questions: [],
        };

        await client.createPullRequest(
          "owner",
          "repo",
          spec,
          "https://slack.com/thread/123",
          [],
        );

        const payload = capturedRefPayload as { ref: string; sha: string };
        assertEquals(payload.ref, "refs/heads/brainstorm/my-cool-feature");
        assertEquals(payload.sha, "abc123");
      });

      it("should commit file to .regent/{spec-name}/brainstorm.md path", async () => {
        let capturedFileUrl = "";
        let capturedFilePayload: unknown;

        mockApi.get = (url: string) => {
          if (url.includes("/git/refs/heads/")) {
            return Promise.resolve(
              new Response(
                JSON.stringify({ object: { sha: "abc123" } }),
                { status: 200 },
              ),
            );
          }
          return Promise.resolve(
            new Response(
              JSON.stringify({ default_branch: "main" }),
              { status: 200 },
            ),
          );
        };

        mockApi.post = (url: string, body: unknown) => {
          if (url.includes("/contents/.regent/")) {
            capturedFileUrl = url;
            capturedFilePayload = body;
          }
          if (url.includes("/pulls")) {
            return Promise.resolve(
              new Response(
                JSON.stringify({ html_url: "https://github.com/owner/repo/pull/1" }),
                { status: 201 },
              ),
            );
          }
          return Promise.resolve(
            new Response(JSON.stringify({ sha: "def456" }), { status: 201 }),
          );
        };

        const spec: SpecDocument = {
          title: "Test Feature",
          overview: "Overview",
          problem_statement: "Problem",
          goals: [],
          non_goals: [],
          personas: [],
          use_cases: [],
          technical_details: "",
          open_questions: [],
        };

        await client.createPullRequest(
          "owner",
          "repo",
          spec,
          "https://slack.com/thread/123",
          [],
        );

        assertEquals(
          capturedFileUrl.includes(".regent/test-feature/brainstorm.md"),
          true,
        );

        const payload = capturedFilePayload as {
          message: string;
          content: string;
          branch: string;
        };
        assertEquals(payload.branch, "brainstorm/test-feature");
        assertEquals(payload.message.includes("Test Feature"), true);
      });

      it("should base64 encode file content correctly", async () => {
        let capturedContent = "";

        mockApi.get = (url: string) => {
          if (url.includes("/git/refs/heads/")) {
            return Promise.resolve(
              new Response(
                JSON.stringify({ object: { sha: "abc123" } }),
                { status: 200 },
              ),
            );
          }
          return Promise.resolve(
            new Response(
              JSON.stringify({ default_branch: "main" }),
              { status: 200 },
            ),
          );
        };

        mockApi.post = (url: string, body: unknown) => {
          if (url.includes("/contents/.regent/")) {
            const payload = body as { content: string };
            capturedContent = payload.content;
          }
          if (url.includes("/pulls")) {
            return Promise.resolve(
              new Response(
                JSON.stringify({ html_url: "https://github.com/owner/repo/pull/1" }),
                { status: 201 },
              ),
            );
          }
          return Promise.resolve(
            new Response(JSON.stringify({ sha: "def456" }), { status: 201 }),
          );
        };

        const spec: SpecDocument = {
          title: "Encoding Test",
          overview: "Test overview content",
          problem_statement: "Test problem",
          goals: ["Goal 1"],
          non_goals: [],
          personas: [],
          use_cases: [],
          technical_details: "",
          open_questions: [],
        };

        await client.createPullRequest(
          "owner",
          "repo",
          spec,
          "https://slack.com/thread/123",
          [],
        );

        // Decode the base64 content and verify it contains the spec data
        const decoded = atob(capturedContent);
        assertEquals(decoded.includes("# Encoding Test"), true);
        assertEquals(decoded.includes("Test overview content"), true);
        assertEquals(decoded.includes("Goal 1"), true);
      });

      it("should use commit message format: docs: add brainstorm for {title}", async () => {
        let capturedCommitMessage = "";

        mockApi.get = (url: string) => {
          if (url.includes("/git/refs/heads/")) {
            return Promise.resolve(
              new Response(
                JSON.stringify({ object: { sha: "abc123" } }),
                { status: 200 },
              ),
            );
          }
          return Promise.resolve(
            new Response(
              JSON.stringify({ default_branch: "main" }),
              { status: 200 },
            ),
          );
        };

        mockApi.post = (url: string, body: unknown) => {
          if (url.includes("/contents/.regent/")) {
            const payload = body as { message: string };
            capturedCommitMessage = payload.message;
          }
          if (url.includes("/pulls")) {
            return Promise.resolve(
              new Response(
                JSON.stringify({ html_url: "https://github.com/owner/repo/pull/1" }),
                { status: 201 },
              ),
            );
          }
          return Promise.resolve(
            new Response(JSON.stringify({ sha: "def456" }), { status: 201 }),
          );
        };

        const spec: SpecDocument = {
          title: "User Authentication",
          overview: "Overview",
          problem_statement: "Problem",
          goals: [],
          non_goals: [],
          personas: [],
          use_cases: [],
          technical_details: "",
          open_questions: [],
        };

        await client.createPullRequest(
          "owner",
          "repo",
          spec,
          "https://slack.com/thread/123",
          [],
        );

        assertEquals(capturedCommitMessage, "docs: add brainstorm for User Authentication");
      });

      it("should use PR title format: Brainstorm: {spec title}", async () => {
        let capturedPrTitle = "";

        mockApi.get = (url: string) => {
          if (url.includes("/git/refs/heads/")) {
            return Promise.resolve(
              new Response(
                JSON.stringify({ object: { sha: "abc123" } }),
                { status: 200 },
              ),
            );
          }
          return Promise.resolve(
            new Response(
              JSON.stringify({ default_branch: "main" }),
              { status: 200 },
            ),
          );
        };

        mockApi.post = (url: string, body: unknown) => {
          if (url.includes("/pulls")) {
            const payload = body as { title: string };
            capturedPrTitle = payload.title;
            return Promise.resolve(
              new Response(
                JSON.stringify({ html_url: "https://github.com/owner/repo/pull/1" }),
                { status: 201 },
              ),
            );
          }
          return Promise.resolve(
            new Response(JSON.stringify({ sha: "def456" }), { status: 201 }),
          );
        };

        const spec: SpecDocument = {
          title: "API Refactoring",
          overview: "Overview",
          problem_statement: "Problem",
          goals: [],
          non_goals: [],
          personas: [],
          use_cases: [],
          technical_details: "",
          open_questions: [],
        };

        await client.createPullRequest(
          "owner",
          "repo",
          spec,
          "https://slack.com/thread/123",
          [],
        );

        assertEquals(capturedPrTitle, "Brainstorm: API Refactoring");
      });

      it("should include thread URL in PR body", async () => {
        let capturedPrBody = "";

        mockApi.get = (url: string) => {
          if (url.includes("/git/refs/heads/")) {
            return Promise.resolve(
              new Response(
                JSON.stringify({ object: { sha: "abc123" } }),
                { status: 200 },
              ),
            );
          }
          return Promise.resolve(
            new Response(
              JSON.stringify({ default_branch: "main" }),
              { status: 200 },
            ),
          );
        };

        mockApi.post = (url: string, body: unknown) => {
          if (url.includes("/pulls")) {
            const payload = body as { body: string };
            capturedPrBody = payload.body;
            return Promise.resolve(
              new Response(
                JSON.stringify({ html_url: "https://github.com/owner/repo/pull/1" }),
                { status: 201 },
              ),
            );
          }
          return Promise.resolve(
            new Response(JSON.stringify({ sha: "def456" }), { status: 201 }),
          );
        };

        const spec: SpecDocument = {
          title: "Test",
          overview: "Overview",
          problem_statement: "Problem",
          goals: [],
          non_goals: [],
          personas: [],
          use_cases: [],
          technical_details: "",
          open_questions: [],
        };

        const threadUrl = "https://myorg.slack.com/archives/C123/p456789";

        await client.createPullRequest(
          "owner",
          "repo",
          spec,
          threadUrl,
          [],
        );

        assertEquals(capturedPrBody.includes(threadUrl), true);
        assertEquals(capturedPrBody.includes("**Thread:**"), true);
      });

      it("should include participants list in PR body", async () => {
        let capturedPrBody = "";

        mockApi.get = (url: string) => {
          if (url.includes("/git/refs/heads/")) {
            return Promise.resolve(
              new Response(
                JSON.stringify({ object: { sha: "abc123" } }),
                { status: 200 },
              ),
            );
          }
          return Promise.resolve(
            new Response(
              JSON.stringify({ default_branch: "main" }),
              { status: 200 },
            ),
          );
        };

        mockApi.post = (url: string, body: unknown) => {
          if (url.includes("/pulls")) {
            const payload = body as { body: string };
            capturedPrBody = payload.body;
            return Promise.resolve(
              new Response(
                JSON.stringify({ html_url: "https://github.com/owner/repo/pull/1" }),
                { status: 201 },
              ),
            );
          }
          return Promise.resolve(
            new Response(JSON.stringify({ sha: "def456" }), { status: 201 }),
          );
        };

        const spec: SpecDocument = {
          title: "Test",
          overview: "Overview",
          problem_statement: "Problem",
          goals: [],
          non_goals: [],
          personas: [],
          use_cases: [],
          technical_details: "",
          open_questions: [],
        };

        await client.createPullRequest(
          "owner",
          "repo",
          spec,
          "https://slack.com/thread/123",
          ["@alice", "@bob", "@charlie"],
        );

        assertEquals(capturedPrBody.includes("**Participants:**"), true);
        assertEquals(capturedPrBody.includes("@alice"), true);
        assertEquals(capturedPrBody.includes("@bob"), true);
        assertEquals(capturedPrBody.includes("@charlie"), true);
      });

      it("should omit participants section when list is empty", async () => {
        let capturedPrBody = "";

        mockApi.get = (url: string) => {
          if (url.includes("/git/refs/heads/")) {
            return Promise.resolve(
              new Response(
                JSON.stringify({ object: { sha: "abc123" } }),
                { status: 200 },
              ),
            );
          }
          return Promise.resolve(
            new Response(
              JSON.stringify({ default_branch: "main" }),
              { status: 200 },
            ),
          );
        };

        mockApi.post = (url: string, body: unknown) => {
          if (url.includes("/pulls")) {
            const payload = body as { body: string };
            capturedPrBody = payload.body;
            return Promise.resolve(
              new Response(
                JSON.stringify({ html_url: "https://github.com/owner/repo/pull/1" }),
                { status: 201 },
              ),
            );
          }
          return Promise.resolve(
            new Response(JSON.stringify({ sha: "def456" }), { status: 201 }),
          );
        };

        const spec: SpecDocument = {
          title: "Test",
          overview: "Overview",
          problem_statement: "Problem",
          goals: [],
          non_goals: [],
          personas: [],
          use_cases: [],
          technical_details: "",
          open_questions: [],
        };

        await client.createPullRequest(
          "owner",
          "repo",
          spec,
          "https://slack.com/thread/123",
          [],
        );

        assertEquals(capturedPrBody.includes("**Participants:**"), false);
      });

      it("should convert special characters to kebab-case in spec name", async () => {
        let capturedPrBody: unknown;

        mockApi.get = (url: string) => {
          if (url.includes("/git/refs/heads/")) {
            return Promise.resolve(
              new Response(
                JSON.stringify({ object: { sha: "abc123" } }),
                { status: 200 },
              ),
            );
          }
          return Promise.resolve(
            new Response(
              JSON.stringify({ default_branch: "main" }),
              { status: 200 },
            ),
          );
        };

        mockApi.post = (url: string, body: unknown) => {
          if (url.includes("/pulls")) {
            capturedPrBody = body;
            return Promise.resolve(
              new Response(
                JSON.stringify({ html_url: "https://github.com/owner/repo/pull/1" }),
                { status: 201 },
              ),
            );
          }
          return Promise.resolve(
            new Response(JSON.stringify({ sha: "def456" }), { status: 201 }),
          );
        };

        const spec: SpecDocument = {
          title: "User's API (v2.0) - Feature!",
          overview: "Overview",
          problem_statement: "Problem",
          goals: [],
          non_goals: [],
          personas: [],
          use_cases: [],
          technical_details: "",
          open_questions: [],
        };

        await client.createPullRequest(
          "owner",
          "repo",
          spec,
          "https://slack.com/thread/123",
          [],
        );

        const body = capturedPrBody as { head: string };
        // Special chars converted to dashes, consecutive dashes collapsed
        assertEquals(body.head, "brainstorm/user-s-api-v2-0-feature");
      });
    });
  });
});

describe("Property 5: Repository Access Validation", () => {
  /**
   * Property 5: The GitHub client MUST verify token permissions before
   * accessing repository contents. Invalid tokens should result in clear
   * error messages directing users to update permissions.
   */

  it("should validate token has read access before exploration", async () => {
    let checkAccessCalled = false;

    const mockApi: MockGitHubApi = {
      get: (url) => {
        if (url.includes("/repos/owner/repo") && !url.includes("/contents")) {
          checkAccessCalled = true;
          return Promise.resolve(
            new Response("Forbidden", { status: 403 }),
          );
        }
        return Promise.resolve(
          new Response("Forbidden", { status: 403 }),
        );
      },
      post: (_url, _body) =>
        Promise.resolve(
          new Response("Forbidden", { status: 403 }),
        ),
    };

    const client = new GitHubClientImpl(mockApi, "invalid-token");

    await assertRejects(
      () => client.checkAccess("owner", "repo"),
      GitHubAccessError,
      "Access denied",
    );

    assertEquals(checkAccessCalled, true);
  });

  it("should provide clear error message for 403 responses", async () => {
    const mockApi: MockGitHubApi = {
      get: (_url) =>
        Promise.resolve(
          new Response("Forbidden", { status: 403 }),
        ),
      post: (_url, _body) =>
        Promise.resolve(
          new Response("Forbidden", { status: 403 }),
        ),
    };

    const client = new GitHubClientImpl(mockApi, "invalid-token");

    try {
      await client.checkAccess("owner", "repo");
      throw new Error("Should have thrown GitHubAccessError");
    } catch (error) {
      assertEquals(error instanceof GitHubAccessError, true);
      const accessError = error as GitHubAccessError;
      assertEquals(accessError.type, "GitHubAccessError");
      assertEquals(accessError.isRetryable, false);
      assertEquals(accessError.details.length > 0, true);
      assertEquals(accessError.suggestedAction.length > 0, true);
    }
  });

  it("should distinguish between 403 (access) and 404 (not found)", async () => {
    const mockApi403: MockGitHubApi = {
      get: (_url) =>
        Promise.resolve(
          new Response("Forbidden", { status: 403 }),
        ),
      post: (_url, _body) =>
        Promise.resolve(
          new Response("Forbidden", { status: 403 }),
        ),
    };

    const mockApi404: MockGitHubApi = {
      get: (_url) =>
        Promise.resolve(
          new Response("Not Found", { status: 404 }),
        ),
      post: (_url, _body) =>
        Promise.resolve(
          new Response("Not Found", { status: 404 }),
        ),
    };

    const client403 = new GitHubClientImpl(mockApi403, "token");
    const client404 = new GitHubClientImpl(mockApi404, "token");

    // 403 should throw GitHubAccessError
    await assertRejects(
      () => client403.checkAccess("owner", "repo"),
      GitHubAccessError,
    );

    // 404 should return false (repo not found, not an access error)
    const hasAccess = await client404.checkAccess("owner", "repo");
    assertEquals(hasAccess, false);
  });

  it("should not retry permanent access errors", async () => {
    let attempts = 0;

    const mockApi: MockGitHubApi = {
      get: (_url) => {
        attempts++;
        return Promise.resolve(
          new Response("Forbidden", { status: 403 }),
        );
      },
      post: (_url, _body) =>
        Promise.resolve(
          new Response("Forbidden", { status: 403 }),
        ),
    };

    const client = new GitHubClientImpl(mockApi, "invalid-token");

    await assertRejects(
      () => client.checkAccess("owner", "repo"),
      GitHubAccessError,
    );

    assertEquals(
      attempts,
      1,
      "Should not retry permanent access errors (Property 11)",
    );
  });

  it("should only access explicitly specified repositories", async () => {
    const accessedRepos: string[] = [];

    const mockApi: MockGitHubApi = {
      get: (url) => {
        const match = url.match(/\/repos\/([^/]+\/[^/]+)/);
        if (match) {
          accessedRepos.push(match[1]);
        }
        return Promise.resolve(
          new Response(
            JSON.stringify({ default_branch: "main" }),
            { status: 200 },
          ),
        );
      },
      post: (_url, _body) =>
        Promise.resolve(
          new Response(
            JSON.stringify({ html_url: "https://github.com/owner/repo/pull/1" }),
            { status: 201 },
          ),
        ),
    };

    const client = new GitHubClientImpl(mockApi, "token");

    await client.checkAccess("owner", "repo");

    // Verify only the specified repo was accessed
    assertEquals(accessedRepos.length > 0, true);
    for (const repo of accessedRepos) {
      assertEquals(repo, "owner/repo");
    }
  });
});

describe("Property 8: PR Creation Conditional", () => {
  /**
   * Property 8: If a session is finalized and has a repository configured,
   * then the system must create a pull request; otherwise it must only mark
   * the session complete.
   *
   * Validates: Requirements 6.2, 6.3, 6.5
   */

  it("should use custom target_branch from config.yml as PR base", async () => {
    let capturedPrPayload: unknown;

    const mockApi: MockGitHubApi = {
      get: (url) => {
        // Return custom branch from config.yml
        if (url.includes(".regent/config.yml")) {
          const configContent = "target_branch: develop\n";
          return Promise.resolve(
            new Response(
              JSON.stringify({
                content: btoa(configContent),
                encoding: "base64",
              }),
              { status: 200 },
            ),
          );
        }
        // Return ref for base branch lookup
        if (url.includes("/git/refs/heads/")) {
          return Promise.resolve(
            new Response(
              JSON.stringify({ object: { sha: "abc123" } }),
              { status: 200 },
            ),
          );
        }
        // Default repo response (should not be used for branch)
        return Promise.resolve(
          new Response(
            JSON.stringify({ default_branch: "main" }),
            { status: 200 },
          ),
        );
      },
      post: (url, body) => {
        if (url.includes("/pulls")) {
          capturedPrPayload = body;
          return Promise.resolve(
            new Response(
              JSON.stringify({ html_url: "https://github.com/owner/repo/pull/1" }),
              { status: 201 },
            ),
          );
        }
        return Promise.resolve(
          new Response(JSON.stringify({ sha: "def456" }), { status: 201 }),
        );
      },
    };

    const client = new GitHubClientImpl(mockApi, "token");

    const spec: SpecDocument = {
      title: "Config Test",
      overview: "Overview",
      problem_statement: "Problem",
      goals: [],
      non_goals: [],
      personas: [],
      use_cases: [],
      technical_details: "",
      open_questions: [],
    };

    await client.createPullRequest(
      "owner",
      "repo",
      spec,
      "https://slack.com/thread/123",
      ["@alice"],
    );

    const payload = capturedPrPayload as { base: string };
    assertEquals(payload.base, "develop");
  });

  it("should use repo default branch when config.yml is missing", async () => {
    let capturedPrPayload: unknown;

    const mockApi: MockGitHubApi = {
      get: (url) => {
        // config.yml not found
        if (url.includes(".regent/config.yml")) {
          return Promise.resolve(
            new Response("Not Found", { status: 404 }),
          );
        }
        // Return ref for base branch lookup
        if (url.includes("/git/refs/heads/")) {
          return Promise.resolve(
            new Response(
              JSON.stringify({ object: { sha: "abc123" } }),
              { status: 200 },
            ),
          );
        }
        // Return repo default branch
        return Promise.resolve(
          new Response(
            JSON.stringify({ default_branch: "master" }),
            { status: 200 },
          ),
        );
      },
      post: (url, body) => {
        if (url.includes("/pulls")) {
          capturedPrPayload = body;
          return Promise.resolve(
            new Response(
              JSON.stringify({ html_url: "https://github.com/owner/repo/pull/1" }),
              { status: 201 },
            ),
          );
        }
        return Promise.resolve(
          new Response(JSON.stringify({ sha: "def456" }), { status: 201 }),
        );
      },
    };

    const client = new GitHubClientImpl(mockApi, "token");

    const spec: SpecDocument = {
      title: "Fallback Test",
      overview: "Overview",
      problem_statement: "Problem",
      goals: [],
      non_goals: [],
      personas: [],
      use_cases: [],
      technical_details: "",
      open_questions: [],
    };

    await client.createPullRequest(
      "owner",
      "repo",
      spec,
      "https://slack.com/thread/123",
      [],
    );

    const payload = capturedPrPayload as { base: string };
    assertEquals(payload.base, "master");
  });

  it("should preserve thread URL in PR metadata", async () => {
    let capturedPrBody = "";

    const mockApi: MockGitHubApi = {
      get: (url) => {
        if (url.includes(".regent/config.yml")) {
          return Promise.resolve(
            new Response("Not Found", { status: 404 }),
          );
        }
        if (url.includes("/git/refs/heads/")) {
          return Promise.resolve(
            new Response(
              JSON.stringify({ object: { sha: "abc123" } }),
              { status: 200 },
            ),
          );
        }
        return Promise.resolve(
          new Response(
            JSON.stringify({ default_branch: "main" }),
            { status: 200 },
          ),
        );
      },
      post: (url, body) => {
        if (url.includes("/pulls")) {
          const payload = body as { body: string };
          capturedPrBody = payload.body;
          return Promise.resolve(
            new Response(
              JSON.stringify({ html_url: "https://github.com/owner/repo/pull/1" }),
              { status: 201 },
            ),
          );
        }
        return Promise.resolve(
          new Response(JSON.stringify({ sha: "def456" }), { status: 201 }),
        );
      },
    };

    const client = new GitHubClientImpl(mockApi, "token");

    const spec: SpecDocument = {
      title: "Metadata Test",
      overview: "Overview",
      problem_statement: "Problem",
      goals: [],
      non_goals: [],
      personas: [],
      use_cases: [],
      technical_details: "",
      open_questions: [],
    };

    const threadUrl = "https://workspace.slack.com/archives/C01ABC/p1234567890";

    await client.createPullRequest(
      "owner",
      "repo",
      spec,
      threadUrl,
      ["@user1", "@user2"],
    );

    // Verify thread URL is preserved
    assertEquals(capturedPrBody.includes(threadUrl), true);
    // Verify participants are preserved
    assertEquals(capturedPrBody.includes("@user1"), true);
    assertEquals(capturedPrBody.includes("@user2"), true);
  });

  it("should preserve participants in PR metadata", async () => {
    let capturedPrBody = "";
    let capturedFileContent = "";

    const mockApi: MockGitHubApi = {
      get: (url) => {
        if (url.includes(".regent/config.yml")) {
          return Promise.resolve(
            new Response("Not Found", { status: 404 }),
          );
        }
        if (url.includes("/git/refs/heads/")) {
          return Promise.resolve(
            new Response(
              JSON.stringify({ object: { sha: "abc123" } }),
              { status: 200 },
            ),
          );
        }
        return Promise.resolve(
          new Response(
            JSON.stringify({ default_branch: "main" }),
            { status: 200 },
          ),
        );
      },
      post: (url, body) => {
        if (url.includes("/contents/.regent/")) {
          const payload = body as { content: string };
          capturedFileContent = payload.content;
        }
        if (url.includes("/pulls")) {
          const payload = body as { body: string };
          capturedPrBody = payload.body;
          return Promise.resolve(
            new Response(
              JSON.stringify({ html_url: "https://github.com/owner/repo/pull/1" }),
              { status: 201 },
            ),
          );
        }
        return Promise.resolve(
          new Response(JSON.stringify({ sha: "def456" }), { status: 201 }),
        );
      },
    };

    const client = new GitHubClientImpl(mockApi, "token");

    const spec: SpecDocument = {
      title: "Participants Test",
      overview: "Overview",
      problem_statement: "Problem",
      goals: [],
      non_goals: [],
      personas: [],
      use_cases: [],
      technical_details: "",
      open_questions: [],
    };

    const participants = ["@alice", "@bob", "@charlie"];

    await client.createPullRequest(
      "owner",
      "repo",
      spec,
      "https://slack.com/thread/123",
      participants,
    );

    // Verify participants in PR body
    assertEquals(capturedPrBody.includes("@alice, @bob, @charlie"), true);

    // Verify participants also in brainstorm.md content
    const decodedContent = atob(capturedFileContent);
    assertEquals(decodedContent.includes("@alice"), true);
    assertEquals(decodedContent.includes("@bob"), true);
    assertEquals(decodedContent.includes("@charlie"), true);
  });

  it("should create branch from the config-specified base branch", async () => {
    let baseRefUrl = "";

    const mockApi: MockGitHubApi = {
      get: (url) => {
        if (url.includes(".regent/config.yml")) {
          const configContent = "target_branch: feature-base\n";
          return Promise.resolve(
            new Response(
              JSON.stringify({
                content: btoa(configContent),
                encoding: "base64",
              }),
              { status: 200 },
            ),
          );
        }
        if (url.includes("/git/refs/heads/")) {
          baseRefUrl = url;
          return Promise.resolve(
            new Response(
              JSON.stringify({ object: { sha: "abc123" } }),
              { status: 200 },
            ),
          );
        }
        return Promise.resolve(
          new Response(
            JSON.stringify({ default_branch: "main" }),
            { status: 200 },
          ),
        );
      },
      post: (_url, _body) => {
        return Promise.resolve(
          new Response(
            JSON.stringify({ html_url: "https://github.com/owner/repo/pull/1", sha: "def456" }),
            { status: 201 },
          ),
        );
      },
    };

    const client = new GitHubClientImpl(mockApi, "token");

    const spec: SpecDocument = {
      title: "Branch Base Test",
      overview: "Overview",
      problem_statement: "Problem",
      goals: [],
      non_goals: [],
      personas: [],
      use_cases: [],
      technical_details: "",
      open_questions: [],
    };

    await client.createPullRequest(
      "owner",
      "repo",
      spec,
      "https://slack.com/thread/123",
      [],
    );

    // Verify it requested the ref for the custom branch
    assertEquals(baseRefUrl.includes("feature-base"), true);
  });
});
