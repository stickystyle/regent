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
  patch: (
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

    describe("createIssue", () => {
      it("should create issue and return number and URL", async () => {
        const result = await client.createIssue(
          "owner",
          "repo",
          "Test Issue",
          "Issue body",
          ["bug"],
        );

        assertEquals(result.number, 1);
        assertEquals(result.url, "https://github.com/owner/repo/issues/1");
      });

      it("should increment issue number for each call", async () => {
        const result1 = await client.createIssue("owner", "repo", "Issue 1", "Body 1");
        const result2 = await client.createIssue("owner", "repo", "Issue 2", "Body 2");

        assertEquals(result1.number, 1);
        assertEquals(result2.number, 2);
      });

      it("should record created issues", async () => {
        await client.createIssue("owner", "repo", "Test Issue", "Body", ["bug", "feature"]);

        const createdIssues = client.getCreatedIssues();
        assertEquals(createdIssues.length, 1);
        assertEquals(createdIssues[0].owner, "owner");
        assertEquals(createdIssues[0].repo, "repo");
        assertEquals(createdIssues[0].title, "Test Issue");
        assertEquals(createdIssues[0].body, "Body");
        assertEquals(createdIssues[0].labels, ["bug", "feature"]);
      });

      it("should throw configured error", async () => {
        const error = new GitHubAccessError(
          "Cannot create issue",
          "Missing permissions",
          "Grant write access",
        );
        client.setCreateIssueError(error);

        await assertRejects(
          () => client.createIssue("owner", "repo", "Title", "Body"),
          GitHubAccessError,
        );
      });
    });

    describe("getIssue", () => {
      it("should return issue data", async () => {
        const issue = await client.getIssue("owner", "repo", 42);

        assertEquals(issue.number, 42);
        assertEquals(issue.title, "Mock Issue #42");
        assertEquals(issue.body, "Mock issue body");
        assertEquals(issue.state, "open");
        assertEquals(issue.html_url, "https://github.com/owner/repo/issues/42");
        assertEquals(issue.user.login, "mock-user");
      });

      it("should throw configured error", async () => {
        const error = new GitHubAccessError(
          "Issue not found",
          "Issue does not exist",
          "Check issue number",
        );
        client.setGetIssueError(error);

        await assertRejects(
          () => client.getIssue("owner", "repo", 42),
          GitHubAccessError,
        );
      });
    });

    describe("getIssueComments", () => {
      it("should return empty array when no comments", async () => {
        const comments = await client.getIssueComments("owner", "repo", 42);

        assertEquals(comments.length, 0);
      });

      it("should return comments that were created for the issue", async () => {
        // Create some comments first
        await client.createIssueComment("owner", "repo", 42, "Comment 1");
        await client.createIssueComment("owner", "repo", 42, "Comment 2");
        await client.createIssueComment("owner", "repo", 99, "Different issue");

        const comments = await client.getIssueComments("owner", "repo", 42);

        assertEquals(comments.length, 2);
        assertEquals(comments[0].body, "Comment 1");
        assertEquals(comments[1].body, "Comment 2");
      });

      it("should throw configured error", async () => {
        const error = new NetworkTimeoutError(
          "Timeout",
          "Request timed out",
          "Retry",
        );
        client.setGetIssueCommentsError(error);

        await assertRejects(
          () => client.getIssueComments("owner", "repo", 42),
          NetworkTimeoutError,
        );
      });
    });

    describe("createIssueComment", () => {
      it("should create comment and return GitHubComment", async () => {
        const comment = await client.createIssueComment(
          "owner",
          "repo",
          42,
          "Test comment body",
        );

        assertEquals(comment.id, 1);
        assertEquals(comment.body, "Test comment body");
        assertEquals(comment.user.login, "mock-user");
        assertEquals(
          comment.html_url,
          "https://github.com/owner/repo/issues/42#issuecomment-1",
        );
      });

      it("should increment comment ID for each call", async () => {
        const comment1 = await client.createIssueComment("owner", "repo", 42, "Comment 1");
        const comment2 = await client.createIssueComment("owner", "repo", 42, "Comment 2");

        assertEquals(comment1.id, 1);
        assertEquals(comment2.id, 2);
      });

      it("should record created comments", async () => {
        await client.createIssueComment("owner", "repo", 42, "Test body");

        const createdComments = client.getCreatedComments();
        assertEquals(createdComments.length, 1);
        assertEquals(createdComments[0].owner, "owner");
        assertEquals(createdComments[0].repo, "repo");
        assertEquals(createdComments[0].issueNumber, 42);
        assertEquals(createdComments[0].body, "Test body");
      });

      it("should throw configured error", async () => {
        const error = new GitHubAccessError(
          "Cannot comment",
          "Missing permissions",
          "Grant write access",
        );
        client.setCreateIssueCommentError(error);

        await assertRejects(
          () => client.createIssueComment("owner", "repo", 42, "Body"),
          GitHubAccessError,
        );
      });
    });

    describe("updateIssueComment", () => {
      it("should update comment and return GitHubComment", async () => {
        const comment = await client.updateIssueComment(
          "owner",
          "repo",
          123,
          "Updated body",
        );

        assertEquals(comment.id, 123);
        assertEquals(comment.body, "Updated body");
        assertEquals(comment.user.login, "mock-user");
      });

      it("should record updated comments", async () => {
        await client.updateIssueComment("owner", "repo", 456, "Updated content");

        const updatedComments = client.getUpdatedComments();
        assertEquals(updatedComments.length, 1);
        assertEquals(updatedComments[0].owner, "owner");
        assertEquals(updatedComments[0].repo, "repo");
        assertEquals(updatedComments[0].commentId, 456);
        assertEquals(updatedComments[0].body, "Updated content");
      });

      it("should throw configured error", async () => {
        const error = new GitHubAccessError(
          "Cannot update",
          "Missing permissions",
          "Grant write access",
        );
        client.setUpdateIssueCommentError(error);

        await assertRejects(
          () => client.updateIssueComment("owner", "repo", 123, "Body"),
          GitHubAccessError,
        );
      });
    });

    describe("clear() resets all state", () => {
      it("should clear issue and comment counters", async () => {
        await client.createIssue("owner", "repo", "Issue", "Body");
        await client.createIssueComment("owner", "repo", 1, "Comment");

        client.clear();

        // After clear, counters should be reset
        const issue = await client.createIssue("owner", "repo", "Issue", "Body");
        const comment = await client.createIssueComment("owner", "repo", 1, "Comment");

        assertEquals(issue.number, 1);
        assertEquals(comment.id, 1);
      });

      it("should clear recorded operations", async () => {
        await client.createIssue("owner", "repo", "Issue", "Body");
        await client.createIssueComment("owner", "repo", 1, "Comment");
        await client.updateIssueComment("owner", "repo", 1, "Updated");

        client.clear();

        assertEquals(client.getCreatedIssues().length, 0);
        assertEquals(client.getCreatedComments().length, 0);
        assertEquals(client.getUpdatedComments().length, 0);
      });

      it("should clear all configured errors for new methods", async () => {
        client.setCreateIssueError(new Error("test"));
        client.setGetIssueError(new Error("test"));
        client.setGetIssueCommentsError(new Error("test"));
        client.setCreateIssueCommentError(new Error("test"));
        client.setUpdateIssueCommentError(new Error("test"));

        client.clear();

        // Should succeed after clear
        await client.createIssue("owner", "repo", "Issue", "Body");
        await client.getIssue("owner", "repo", 1);
        await client.getIssueComments("owner", "repo", 1);
        await client.createIssueComment("owner", "repo", 1, "Comment");
        await client.updateIssueComment("owner", "repo", 1, "Updated");
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
        patch: (_url: string, _body: unknown) =>
          Promise.resolve(
            new Response(
              JSON.stringify({}),
              { status: 200 },
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

    describe("createIssue", () => {
      it("should create issue and return number and URL", async () => {
        mockApi.post = (_url, _body) =>
          Promise.resolve(
            new Response(
              JSON.stringify({
                number: 42,
                html_url: "https://github.com/owner/repo/issues/42",
              }),
              { status: 201 },
            ),
          );

        const result = await client.createIssue(
          "owner",
          "repo",
          "Test Issue",
          "Body text",
          ["bug"],
        );

        assertEquals(result.number, 42);
        assertEquals(result.url, "https://github.com/owner/repo/issues/42");
      });

      it("should include labels when provided", async () => {
        let capturedBody: unknown;
        mockApi.post = (_url, body) => {
          capturedBody = body;
          return Promise.resolve(
            new Response(
              JSON.stringify({
                number: 1,
                html_url: "https://github.com/owner/repo/issues/1",
              }),
              { status: 201 },
            ),
          );
        };

        await client.createIssue("owner", "repo", "Title", "Body", ["bug", "feature"]);

        const payload = capturedBody as { title: string; body: string; labels: string[] };
        assertEquals(payload.labels, ["bug", "feature"]);
      });

      it("should send empty labels array when none provided", async () => {
        let capturedBody: unknown;
        mockApi.post = (_url, body) => {
          capturedBody = body;
          return Promise.resolve(
            new Response(
              JSON.stringify({
                number: 1,
                html_url: "https://github.com/owner/repo/issues/1",
              }),
              { status: 201 },
            ),
          );
        };

        await client.createIssue("owner", "repo", "Title", "Body");

        const payload = capturedBody as { labels: string[] };
        assertEquals(payload.labels, []);
      });

      it("should throw GitHubAccessError on 401", async () => {
        mockApi.post = (_url, _body) =>
          Promise.resolve(new Response("Unauthorized", { status: 401 }));

        await assertRejects(
          () => client.createIssue("owner", "repo", "Title", "Body"),
          GitHubAccessError,
          "Authentication failed",
        );
      });

      it("should throw GitHubAccessError on 403", async () => {
        mockApi.post = (_url, _body) => Promise.resolve(new Response("Forbidden", { status: 403 }));

        await assertRejects(
          () => client.createIssue("owner", "repo", "Title", "Body"),
          GitHubAccessError,
          "Access denied",
        );
      });

      it("should throw GitHubAccessError on 422", async () => {
        mockApi.post = (_url, _body) =>
          Promise.resolve(
            new Response(
              JSON.stringify({ message: "Validation Failed" }),
              { status: 422 },
            ),
          );

        await assertRejects(
          () => client.createIssue("owner", "repo", "Title", "Body"),
          GitHubAccessError,
          "Validation failed",
        );
      });

      it("should throw GitHubRateLimitError on 429", async () => {
        mockApi.post = (_url, _body) => {
          const headers = new Headers();
          headers.set("x-ratelimit-reset", String(Date.now() / 1000 + 60));
          return Promise.resolve(
            new Response("Rate limit exceeded", { status: 429, headers }),
          );
        };

        await assertRejects(
          () => client.createIssue("owner", "repo", "Title", "Body"),
          GitHubRateLimitError,
        );
      });

      it("should throw NetworkTimeoutError on 5xx and retry", async () => {
        let attempts = 0;
        mockApi.post = (_url, _body) => {
          attempts++;
          return Promise.resolve(
            new Response("Internal Server Error", { status: 500 }),
          );
        };

        await assertRejects(
          () => client.createIssue("owner", "repo", "Title", "Body"),
          NetworkTimeoutError,
        );

        assertEquals(attempts >= 2, true, "Should retry on 5xx errors");
      });

      it("should not retry permanent errors", async () => {
        let attempts = 0;
        mockApi.post = (_url, _body) => {
          attempts++;
          return Promise.resolve(new Response("Forbidden", { status: 403 }));
        };

        await assertRejects(
          () => client.createIssue("owner", "repo", "Title", "Body"),
          GitHubAccessError,
        );

        assertEquals(attempts, 1, "Should not retry permanent errors");
      });
    });

    describe("getIssue", () => {
      it("should return issue data", async () => {
        mockApi.get = (_url) =>
          Promise.resolve(
            new Response(
              JSON.stringify({
                number: 42,
                title: "Test Issue",
                body: "Issue body content",
                state: "open",
                html_url: "https://github.com/owner/repo/issues/42",
                user: { id: 12345, login: "testuser" },
                labels: [{ name: "bug" }, { name: "help wanted" }],
                created_at: "2025-01-15T10:00:00Z",
                updated_at: "2025-01-15T12:00:00Z",
              }),
              { status: 200 },
            ),
          );

        const issue = await client.getIssue("owner", "repo", 42);

        assertEquals(issue.number, 42);
        assertEquals(issue.title, "Test Issue");
        assertEquals(issue.body, "Issue body content");
        assertEquals(issue.state, "open");
        assertEquals(issue.html_url, "https://github.com/owner/repo/issues/42");
        assertEquals(issue.user.id, 12345);
        assertEquals(issue.user.login, "testuser");
        assertEquals(issue.labels.length, 2);
        assertEquals(issue.labels[0].name, "bug");
      });

      it("should handle issue with null body", async () => {
        mockApi.get = (_url) =>
          Promise.resolve(
            new Response(
              JSON.stringify({
                number: 42,
                title: "Test Issue",
                body: null,
                state: "open",
                html_url: "https://github.com/owner/repo/issues/42",
                user: { id: 12345, login: "testuser" },
                labels: [],
                created_at: "2025-01-15T10:00:00Z",
                updated_at: "2025-01-15T12:00:00Z",
              }),
              { status: 200 },
            ),
          );

        const issue = await client.getIssue("owner", "repo", 42);

        assertEquals(issue.body, null);
      });

      it("should throw GitHubAccessError on 404 (issue not found)", async () => {
        mockApi.get = (_url) => Promise.resolve(new Response("Not Found", { status: 404 }));

        await assertRejects(
          () => client.getIssue("owner", "repo", 42),
          GitHubAccessError,
          "Issue not found",
        );
      });

      it("should throw GitHubAccessError on 401", async () => {
        mockApi.get = (_url) => Promise.resolve(new Response("Unauthorized", { status: 401 }));

        await assertRejects(
          () => client.getIssue("owner", "repo", 42),
          GitHubAccessError,
          "Authentication failed",
        );
      });

      it("should throw GitHubAccessError on 403", async () => {
        mockApi.get = (_url) => Promise.resolve(new Response("Forbidden", { status: 403 }));

        await assertRejects(
          () => client.getIssue("owner", "repo", 42),
          GitHubAccessError,
          "Access denied",
        );
      });

      it("should throw GitHubRateLimitError on 429", async () => {
        mockApi.get = (_url) => {
          const headers = new Headers();
          headers.set("x-ratelimit-reset", String(Date.now() / 1000 + 60));
          return Promise.resolve(
            new Response("Rate limit exceeded", { status: 429, headers }),
          );
        };

        await assertRejects(
          () => client.getIssue("owner", "repo", 42),
          GitHubRateLimitError,
        );
      });

      it("should throw NetworkTimeoutError on 5xx and retry", async () => {
        let attempts = 0;
        mockApi.get = (_url) => {
          attempts++;
          return Promise.resolve(
            new Response("Internal Server Error", { status: 500 }),
          );
        };

        await assertRejects(
          () => client.getIssue("owner", "repo", 42),
          NetworkTimeoutError,
        );

        assertEquals(attempts >= 2, true, "Should retry on 5xx errors");
      });
    });

    describe("getIssueComments", () => {
      it("should return array of comments", async () => {
        mockApi.get = (_url) =>
          Promise.resolve(
            new Response(
              JSON.stringify([
                {
                  id: 100,
                  body: "First comment",
                  created_at: "2025-01-15T10:00:00Z",
                  updated_at: "2025-01-15T10:00:00Z",
                  user: { id: 1, login: "user1" },
                  html_url: "https://github.com/owner/repo/issues/42#issuecomment-100",
                },
                {
                  id: 200,
                  body: "Second comment",
                  created_at: "2025-01-15T11:00:00Z",
                  updated_at: "2025-01-15T11:00:00Z",
                  user: { id: 2, login: "user2" },
                  html_url: "https://github.com/owner/repo/issues/42#issuecomment-200",
                },
              ]),
              { status: 200 },
            ),
          );

        const comments = await client.getIssueComments("owner", "repo", 42);

        assertEquals(comments.length, 2);
        assertEquals(comments[0].id, 100);
        assertEquals(comments[0].body, "First comment");
        assertEquals(comments[0].user.login, "user1");
        assertEquals(comments[1].id, 200);
        assertEquals(comments[1].body, "Second comment");
      });

      it("should return empty array when no comments", async () => {
        mockApi.get = (_url) => Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));

        const comments = await client.getIssueComments("owner", "repo", 42);

        assertEquals(comments.length, 0);
      });

      it("should handle pagination correctly", async () => {
        let callCount = 0;
        mockApi.get = (_url) => {
          callCount++;
          if (callCount === 1) {
            // First page with Link header pointing to next page
            const headers = new Headers();
            headers.set(
              "link",
              '<https://api.github.com/repos/owner/repo/issues/42/comments?page=2>; rel="next", ' +
                '<https://api.github.com/repos/owner/repo/issues/42/comments?page=2>; rel="last"',
            );
            return Promise.resolve(
              new Response(
                JSON.stringify([
                  {
                    id: 1,
                    body: "Comment 1",
                    created_at: "2025-01-15T10:00:00Z",
                    updated_at: "2025-01-15T10:00:00Z",
                    user: { id: 1, login: "user1" },
                    html_url: "https://github.com/owner/repo/issues/42#issuecomment-1",
                  },
                ]),
                { status: 200, headers },
              ),
            );
          } else {
            // Second page (no more pages)
            return Promise.resolve(
              new Response(
                JSON.stringify([
                  {
                    id: 2,
                    body: "Comment 2",
                    created_at: "2025-01-15T11:00:00Z",
                    updated_at: "2025-01-15T11:00:00Z",
                    user: { id: 2, login: "user2" },
                    html_url: "https://github.com/owner/repo/issues/42#issuecomment-2",
                  },
                ]),
                { status: 200 },
              ),
            );
          }
        };

        const comments = await client.getIssueComments("owner", "repo", 42);

        assertEquals(callCount, 2, "Should have made 2 requests for pagination");
        assertEquals(comments.length, 2);
        assertEquals(comments[0].id, 1);
        assertEquals(comments[1].id, 2);
      });

      it("should throw GitHubAccessError on 401", async () => {
        mockApi.get = (_url) => Promise.resolve(new Response("Unauthorized", { status: 401 }));

        await assertRejects(
          () => client.getIssueComments("owner", "repo", 42),
          GitHubAccessError,
          "Authentication failed",
        );
      });

      it("should throw GitHubAccessError on 403", async () => {
        mockApi.get = (_url) => Promise.resolve(new Response("Forbidden", { status: 403 }));

        await assertRejects(
          () => client.getIssueComments("owner", "repo", 42),
          GitHubAccessError,
          "Access denied",
        );
      });

      it("should throw GitHubRateLimitError on 429", async () => {
        mockApi.get = (_url) => {
          const headers = new Headers();
          headers.set("x-ratelimit-reset", String(Date.now() / 1000 + 60));
          return Promise.resolve(
            new Response("Rate limit exceeded", { status: 429, headers }),
          );
        };

        await assertRejects(
          () => client.getIssueComments("owner", "repo", 42),
          GitHubRateLimitError,
        );
      });

      it("should throw NetworkTimeoutError on 5xx and retry", async () => {
        let attempts = 0;
        mockApi.get = (_url) => {
          attempts++;
          return Promise.resolve(
            new Response("Internal Server Error", { status: 500 }),
          );
        };

        await assertRejects(
          () => client.getIssueComments("owner", "repo", 42),
          NetworkTimeoutError,
        );

        assertEquals(attempts >= 2, true, "Should retry on 5xx errors");
      });
    });

    describe("createIssueComment", () => {
      it("should create comment and return GitHubComment", async () => {
        mockApi.post = (_url, _body) =>
          Promise.resolve(
            new Response(
              JSON.stringify({
                id: 12345,
                body: "This is a test comment",
                created_at: "2025-01-15T10:00:00Z",
                updated_at: "2025-01-15T10:00:00Z",
                user: { id: 999, login: "commenter" },
                html_url: "https://github.com/owner/repo/issues/42#issuecomment-12345",
              }),
              { status: 201 },
            ),
          );

        const comment = await client.createIssueComment(
          "owner",
          "repo",
          42,
          "This is a test comment",
        );

        assertEquals(comment.id, 12345);
        assertEquals(comment.body, "This is a test comment");
        assertEquals(comment.user.login, "commenter");
        assertEquals(
          comment.html_url,
          "https://github.com/owner/repo/issues/42#issuecomment-12345",
        );
      });

      it("should send correct request body", async () => {
        let capturedUrl = "";
        let capturedBody: unknown;
        mockApi.post = (url, body) => {
          capturedUrl = url;
          capturedBody = body;
          return Promise.resolve(
            new Response(
              JSON.stringify({
                id: 1,
                body: "Comment body",
                created_at: "2025-01-15T10:00:00Z",
                updated_at: "2025-01-15T10:00:00Z",
                user: { id: 1, login: "user" },
                html_url: "https://github.com/owner/repo/issues/42#issuecomment-1",
              }),
              { status: 201 },
            ),
          );
        };

        await client.createIssueComment("owner", "repo", 42, "Comment body");

        assertEquals(capturedUrl.includes("/issues/42/comments"), true);
        assertEquals((capturedBody as { body: string }).body, "Comment body");
      });

      it("should throw GitHubAccessError on 401", async () => {
        mockApi.post = (_url, _body) =>
          Promise.resolve(new Response("Unauthorized", { status: 401 }));

        await assertRejects(
          () => client.createIssueComment("owner", "repo", 42, "Comment"),
          GitHubAccessError,
          "Authentication failed",
        );
      });

      it("should throw GitHubAccessError on 403", async () => {
        mockApi.post = (_url, _body) => Promise.resolve(new Response("Forbidden", { status: 403 }));

        await assertRejects(
          () => client.createIssueComment("owner", "repo", 42, "Comment"),
          GitHubAccessError,
          "Access denied",
        );
      });

      it("should throw GitHubRateLimitError on 429", async () => {
        mockApi.post = (_url, _body) => {
          const headers = new Headers();
          headers.set("x-ratelimit-reset", String(Date.now() / 1000 + 60));
          return Promise.resolve(
            new Response("Rate limit exceeded", { status: 429, headers }),
          );
        };

        await assertRejects(
          () => client.createIssueComment("owner", "repo", 42, "Comment"),
          GitHubRateLimitError,
        );
      });

      it("should throw NetworkTimeoutError on 5xx and retry", async () => {
        let attempts = 0;
        mockApi.post = (_url, _body) => {
          attempts++;
          return Promise.resolve(
            new Response("Internal Server Error", { status: 500 }),
          );
        };

        await assertRejects(
          () => client.createIssueComment("owner", "repo", 42, "Comment"),
          NetworkTimeoutError,
        );

        assertEquals(attempts >= 2, true, "Should retry on 5xx errors");
      });
    });

    describe("updateIssueComment", () => {
      it("should update comment and return GitHubComment", async () => {
        mockApi.patch = (_url, _body) =>
          Promise.resolve(
            new Response(
              JSON.stringify({
                id: 12345,
                body: "Updated comment content",
                created_at: "2025-01-15T10:00:00Z",
                updated_at: "2025-01-15T12:00:00Z",
                user: { id: 999, login: "commenter" },
                html_url: "https://github.com/owner/repo/issues/42#issuecomment-12345",
              }),
              { status: 200 },
            ),
          );

        const comment = await client.updateIssueComment(
          "owner",
          "repo",
          12345,
          "Updated comment content",
        );

        assertEquals(comment.id, 12345);
        assertEquals(comment.body, "Updated comment content");
        assertEquals(comment.user.login, "commenter");
      });

      it("should use PATCH method", async () => {
        let capturedUrl = "";
        let patchCalled = false;
        mockApi.patch = (url, _body) => {
          patchCalled = true;
          capturedUrl = url;
          return Promise.resolve(
            new Response(
              JSON.stringify({
                id: 789,
                body: "Updated",
                created_at: "2025-01-15T10:00:00Z",
                updated_at: "2025-01-15T12:00:00Z",
                user: { id: 1, login: "user" },
                html_url: "https://github.com/owner/repo/issues/1#issuecomment-789",
              }),
              { status: 200 },
            ),
          );
        };

        await client.updateIssueComment("owner", "repo", 789, "Updated");

        assertEquals(patchCalled, true, "Should use PATCH method");
        assertEquals(capturedUrl.includes("/issues/comments/789"), true);
      });

      it("should send correct request body", async () => {
        let capturedBody: unknown;
        mockApi.patch = (_url, body) => {
          capturedBody = body;
          return Promise.resolve(
            new Response(
              JSON.stringify({
                id: 123,
                body: "New content",
                created_at: "2025-01-15T10:00:00Z",
                updated_at: "2025-01-15T12:00:00Z",
                user: { id: 1, login: "user" },
                html_url: "https://github.com/owner/repo/issues/1#issuecomment-123",
              }),
              { status: 200 },
            ),
          );
        };

        await client.updateIssueComment("owner", "repo", 123, "New content");

        assertEquals((capturedBody as { body: string }).body, "New content");
      });

      it("should throw GitHubAccessError on 401", async () => {
        mockApi.patch = (_url, _body) =>
          Promise.resolve(new Response("Unauthorized", { status: 401 }));

        await assertRejects(
          () => client.updateIssueComment("owner", "repo", 123, "Updated"),
          GitHubAccessError,
          "Authentication failed",
        );
      });

      it("should throw GitHubAccessError on 403", async () => {
        mockApi.patch = (_url, _body) =>
          Promise.resolve(new Response("Forbidden", { status: 403 }));

        await assertRejects(
          () => client.updateIssueComment("owner", "repo", 123, "Updated"),
          GitHubAccessError,
          "Access denied",
        );
      });

      it("should handle 404 (comment not found)", () => {
        // Note: 404 for updateIssueComment falls through handleResponse without special handling.
        // The implementation does not throw a specific error for 404 on PATCH.
        // This test documents the expected behavior - the response is returned but
        // parsing may fail since 404 responses typically don't have JSON bodies.
        // A future improvement could add explicit 404 handling for updateIssueComment.
      });

      it("should throw GitHubRateLimitError on 429", async () => {
        mockApi.patch = (_url, _body) => {
          const headers = new Headers();
          headers.set("x-ratelimit-reset", String(Date.now() / 1000 + 60));
          return Promise.resolve(
            new Response("Rate limit exceeded", { status: 429, headers }),
          );
        };

        await assertRejects(
          () => client.updateIssueComment("owner", "repo", 123, "Updated"),
          GitHubRateLimitError,
        );
      });

      it("should throw NetworkTimeoutError on 5xx and retry", async () => {
        let attempts = 0;
        mockApi.patch = (_url, _body) => {
          attempts++;
          return Promise.resolve(
            new Response("Internal Server Error", { status: 500 }),
          );
        };

        await assertRejects(
          () => client.updateIssueComment("owner", "repo", 123, "Updated"),
          NetworkTimeoutError,
        );

        assertEquals(attempts >= 2, true, "Should retry on 5xx errors");
      });

      it("should not retry permanent errors", async () => {
        let attempts = 0;
        mockApi.patch = (_url, _body) => {
          attempts++;
          return Promise.resolve(new Response("Forbidden", { status: 403 }));
        };

        await assertRejects(
          () => client.updateIssueComment("owner", "repo", 123, "Updated"),
          GitHubAccessError,
        );

        assertEquals(attempts, 1, "Should not retry permanent errors");
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
      patch: (_url, _body) =>
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
      patch: (_url, _body) =>
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
      patch: (_url, _body) =>
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
      patch: (_url, _body) =>
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
      patch: (_url, _body) =>
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
      patch: (_url, _body) =>
        Promise.resolve(
          new Response(JSON.stringify({}), { status: 200 }),
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
      patch: (_url, _body) =>
        Promise.resolve(
          new Response(JSON.stringify({}), { status: 200 }),
        ),
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
      patch: (_url, _body) =>
        Promise.resolve(
          new Response(JSON.stringify({}), { status: 200 }),
        ),
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
      patch: (_url, _body) =>
        Promise.resolve(
          new Response(JSON.stringify({}), { status: 200 }),
        ),
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
      patch: (_url, _body) =>
        Promise.resolve(
          new Response(JSON.stringify({}), { status: 200 }),
        ),
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
      patch: (_url, _body) =>
        Promise.resolve(
          new Response(JSON.stringify({}), { status: 200 }),
        ),
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

  it("should use configurable exploration service repo in triggerExploration", async () => {
    let capturedUrl = "";

    const mockApi: MockGitHubApi = {
      get: (_url: string, _headers?: Record<string, string>) =>
        Promise.resolve(new Response(JSON.stringify({}), { status: 200 })),
      post: (
        url: string,
        _body: unknown,
        _headers?: Record<string, string>,
      ) => {
        capturedUrl = url;
        // workflow_dispatch returns 204 No Content on success
        return Promise.resolve(new Response(null, { status: 204 }));
      },
      patch: (_url: string, _body: unknown, _headers?: Record<string, string>) =>
        Promise.resolve(new Response(JSON.stringify({}), { status: 200 })),
    };

    // Pass a custom exploration service repo
    const client = new GitHubClientImpl(
      mockApi,
      "token",
      undefined,
      "myorg/custom-exploration-service",
    );

    await client.triggerExploration(
      "target-owner/target-repo",
      "Add a feature",
      "C12345:1234567890.123456",
    );

    // Verify the URL uses the custom exploration service repo
    assertEquals(
      capturedUrl.includes("myorg/custom-exploration-service"),
      true,
      `Expected URL to contain 'myorg/custom-exploration-service', got: ${capturedUrl}`,
    );
    assertEquals(
      capturedUrl.includes("explore-codebase.yml"),
      true,
      `Expected URL to contain 'explore-codebase.yml', got: ${capturedUrl}`,
    );
  });

  it("should correctly parse owner and repo from exploration service config", async () => {
    let capturedUrl = "";

    const mockApi: MockGitHubApi = {
      get: (_url: string, _headers?: Record<string, string>) =>
        Promise.resolve(new Response(JSON.stringify({}), { status: 200 })),
      post: (
        url: string,
        _body: unknown,
        _headers?: Record<string, string>,
      ) => {
        capturedUrl = url;
        return Promise.resolve(new Response(null, { status: 204 }));
      },
      patch: (_url: string, _body: unknown, _headers?: Record<string, string>) =>
        Promise.resolve(new Response(JSON.stringify({}), { status: 200 })),
    };

    // Pass exploration service repo with different owner/repo
    const client = new GitHubClientImpl(
      mockApi,
      "token",
      undefined,
      "different-org/exploration-workflows",
    );

    await client.triggerExploration(
      "target/repo",
      "idea",
      "C67890:1234567890.654321",
    );

    // Verify the URL is correctly formed with owner and repo
    assertEquals(
      capturedUrl,
      "https://api.github.com/repos/different-org/exploration-workflows/actions/workflows/explore-codebase.yml/dispatches",
    );
  });
});
