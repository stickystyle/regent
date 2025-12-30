// ABOUTME: Tests for EpicManager service that stores spec documents on GitHub Epic issues.
// ABOUTME: Validates collapsible comment format with markers for spec identification.

import { assertEquals, assertRejects } from "@std/assert";
import { afterEach, beforeEach, describe, it } from "@std/testing/bdd";
import {
  EpicManagerImpl,
  extractSpecContent,
  formatSpecComment,
  MockEpicManager,
  parseSpecMarker,
} from "../../src/managers/epic-manager.ts";
import { MockGitHubClient } from "../../src/clients/github-client.ts";
import { GitHubAccessError } from "../../src/errors/types.ts";

describe("EpicManager", () => {
  describe("Helper Functions", () => {
    describe("formatSpecComment", () => {
      it("should format brainstorm spec with correct marker and summary", () => {
        const content = "# My Brainstorm\n\nSome brainstorm content here.";

        const formatted = formatSpecComment("brainstorm", content);

        assertEquals(formatted.includes("<!-- REGENT_SPEC:brainstorm -->"), true);
        assertEquals(formatted.includes("<summary>📋 Brainstorm Specification</summary>"), true);
        assertEquals(formatted.includes(content), true);
        assertEquals(formatted.includes("<details>"), true);
        assertEquals(formatted.includes("</details>"), true);
      });

      it("should format requirements spec with correct marker and summary", () => {
        const content = "# Requirements\n\nR1: The system shall...";

        const formatted = formatSpecComment("requirements", content);

        assertEquals(formatted.includes("<!-- REGENT_SPEC:requirements -->"), true);
        assertEquals(formatted.includes("<summary>📝 Requirements Specification</summary>"), true);
        assertEquals(formatted.includes(content), true);
      });

      it("should format design spec with correct marker and summary", () => {
        const content = "# Design\n\n## Architecture\n\nComponent diagram...";

        const formatted = formatSpecComment("design", content);

        assertEquals(formatted.includes("<!-- REGENT_SPEC:design -->"), true);
        assertEquals(formatted.includes("<summary>🏗️ Design Specification</summary>"), true);
        assertEquals(formatted.includes(content), true);
      });

      it("should preserve content with special characters", () => {
        const content = "Code block:\n```typescript\nconst x = 1;\n```\n\n<div>HTML</div>";

        const formatted = formatSpecComment("brainstorm", content);

        assertEquals(formatted.includes(content), true);
      });
    });

    describe("parseSpecMarker", () => {
      it("should parse brainstorm marker", () => {
        const comment = "<!-- REGENT_SPEC:brainstorm -->\n<details>...";

        const specType = parseSpecMarker(comment);

        assertEquals(specType, "brainstorm");
      });

      it("should parse requirements marker", () => {
        const comment = "<!-- REGENT_SPEC:requirements -->\n<details>...";

        const specType = parseSpecMarker(comment);

        assertEquals(specType, "requirements");
      });

      it("should parse design marker", () => {
        const comment = "<!-- REGENT_SPEC:design -->\n<details>...";

        const specType = parseSpecMarker(comment);

        assertEquals(specType, "design");
      });

      it("should return null for comment without marker", () => {
        const comment = "This is a regular comment without any spec marker.";

        const specType = parseSpecMarker(comment);

        assertEquals(specType, null);
      });

      it("should return null for invalid spec type", () => {
        const comment = "<!-- REGENT_SPEC:invalid -->\n<details>...";

        const specType = parseSpecMarker(comment);

        assertEquals(specType, null);
      });

      it("should return null for malformed marker", () => {
        const comment = "<!-- REGENT_SPEC brainstorm -->\n<details>...";

        const specType = parseSpecMarker(comment);

        assertEquals(specType, null);
      });
    });

    describe("extractSpecContent", () => {
      it("should extract content from between summary and details tags", () => {
        const comment = `<!-- REGENT_SPEC:brainstorm -->
<details>
<summary>📋 Brainstorm Specification</summary>

# My Spec

Content here.

</details>`;

        const content = extractSpecContent(comment);

        assertEquals(content, "# My Spec\n\nContent here.");
      });

      it("should handle multiline content with code blocks", () => {
        const comment = `<!-- REGENT_SPEC:design -->
<details>
<summary>🏗️ Design Specification</summary>

# Design

\`\`\`typescript
const foo = "bar";
\`\`\`

More content.

</details>`;

        const content = extractSpecContent(comment);

        assertEquals(content.includes("# Design"), true);
        assertEquals(content.includes('const foo = "bar";'), true);
        assertEquals(content.includes("More content."), true);
      });

      it("should return empty string for comment without details", () => {
        const comment = "Regular comment without details tags.";

        const content = extractSpecContent(comment);

        assertEquals(content, "");
      });

      it("should handle content with HTML entities", () => {
        const comment = `<details>
<summary>Test</summary>

Content with <div> tags &amp; entities.

</details>`;

        const content = extractSpecContent(comment);

        assertEquals(content, "Content with <div> tags &amp; entities.");
      });
    });
  });

  describe("MockEpicManager", () => {
    let manager: MockEpicManager;

    beforeEach(() => {
      manager = new MockEpicManager();
    });

    afterEach(() => {
      manager.clear();
    });

    describe("createEpic", () => {
      it("should create epic and return number and URL", async () => {
        const result = await manager.createEpic(
          "owner",
          "repo",
          "My Epic",
          "Epic summary",
        );

        assertEquals(typeof result.number, "number");
        assertEquals(result.number > 0, true);
        assertEquals(result.url.includes("owner/repo"), true);
        assertEquals(result.url.includes("issues"), true);
      });

      it("should record created epics", async () => {
        await manager.createEpic("owner", "repo", "Epic 1", "Summary 1");
        await manager.createEpic("owner2", "repo2", "Epic 2", "Summary 2");

        const created = manager.getCreatedEpics();
        assertEquals(created.length, 2);
        assertEquals(created[0].title, "Epic 1");
        assertEquals(created[1].title, "Epic 2");
      });

      it("should generate unique epic numbers", async () => {
        const result1 = await manager.createEpic("owner", "repo", "Epic 1", "Summary");
        const result2 = await manager.createEpic("owner", "repo", "Epic 2", "Summary");

        assertEquals(result1.number !== result2.number, true);
      });

      it("should throw configured error", async () => {
        const error = new GitHubAccessError("Failed", "Details", "Recovery");
        manager.setCreateEpicError(error);

        await assertRejects(
          () => manager.createEpic("owner", "repo", "Epic", "Summary"),
          GitHubAccessError,
          "Failed",
        );
      });
    });

    describe("addSpecComment", () => {
      it("should add spec comment and return comment ID", async () => {
        const commentId = await manager.addSpecComment(
          "owner",
          "repo",
          1,
          "brainstorm",
          "# Brainstorm content",
        );

        assertEquals(typeof commentId, "number");
        assertEquals(commentId > 0, true);
      });

      it("should record added comments with spec type", async () => {
        await manager.addSpecComment("owner", "repo", 1, "brainstorm", "Content 1");
        await manager.addSpecComment("owner", "repo", 1, "requirements", "Content 2");

        const added = manager.getAddedComments();
        assertEquals(added.length, 2);
        assertEquals(added[0].specType, "brainstorm");
        assertEquals(added[1].specType, "requirements");
      });

      it("should throw configured error", async () => {
        const error = new GitHubAccessError("Failed", "Details", "Recovery");
        manager.setAddSpecCommentError(error);

        await assertRejects(
          () => manager.addSpecComment("owner", "repo", 1, "brainstorm", "Content"),
          GitHubAccessError,
          "Failed",
        );
      });
    });

    describe("updateSpecComment", () => {
      it("should update spec comment", async () => {
        await manager.updateSpecComment(
          "owner",
          "repo",
          123,
          "brainstorm",
          "Updated content",
        );

        const updated = manager.getUpdatedComments();
        assertEquals(updated.length, 1);
        assertEquals(updated[0].commentId, 123);
        assertEquals(updated[0].specType, "brainstorm");
        assertEquals(updated[0].content, "Updated content");
      });

      it("should throw configured error", async () => {
        const error = new GitHubAccessError("Failed", "Details", "Recovery");
        manager.setUpdateSpecCommentError(error);

        await assertRejects(
          () => manager.updateSpecComment("owner", "repo", 123, "brainstorm", "Content"),
          GitHubAccessError,
          "Failed",
        );
      });
    });

    describe("getSpecContent", () => {
      it("should return null when no spec exists", async () => {
        const content = await manager.getSpecContent("owner", "repo", 1, "brainstorm");

        assertEquals(content, null);
      });

      it("should return content after spec is added", async () => {
        await manager.addSpecComment("owner", "repo", 1, "brainstorm", "My content");

        const content = await manager.getSpecContent("owner", "repo", 1, "brainstorm");

        assertEquals(content, "My content");
      });

      it("should return updated content after update", async () => {
        const commentId = await manager.addSpecComment(
          "owner",
          "repo",
          1,
          "brainstorm",
          "Original",
        );
        await manager.updateSpecComment("owner", "repo", commentId, "brainstorm", "Updated");

        const content = await manager.getSpecContent("owner", "repo", 1, "brainstorm");

        assertEquals(content, "Updated");
      });

      it("should throw configured error", async () => {
        const error = new GitHubAccessError("Failed", "Details", "Recovery");
        manager.setGetSpecContentError(error);

        await assertRejects(
          () => manager.getSpecContent("owner", "repo", 1, "brainstorm"),
          GitHubAccessError,
          "Failed",
        );
      });
    });

    describe("getSpecComments", () => {
      it("should return empty map when no specs exist", async () => {
        const specs = await manager.getSpecComments("owner", "repo", 1);

        assertEquals(specs.size, 0);
      });

      it("should return map of all spec types", async () => {
        const id1 = await manager.addSpecComment("owner", "repo", 1, "brainstorm", "B content");
        const id2 = await manager.addSpecComment("owner", "repo", 1, "requirements", "R content");
        const id3 = await manager.addSpecComment("owner", "repo", 1, "design", "D content");

        const specs = await manager.getSpecComments("owner", "repo", 1);

        assertEquals(specs.size, 3);
        assertEquals(specs.get("brainstorm")?.commentId, id1);
        assertEquals(specs.get("brainstorm")?.content, "B content");
        assertEquals(specs.get("requirements")?.commentId, id2);
        assertEquals(specs.get("design")?.commentId, id3);
      });

      it("should throw configured error", async () => {
        const error = new GitHubAccessError("Failed", "Details", "Recovery");
        manager.setGetSpecCommentsError(error);

        await assertRejects(
          () => manager.getSpecComments("owner", "repo", 1),
          GitHubAccessError,
          "Failed",
        );
      });
    });

    describe("clear", () => {
      it("should clear all configured errors", async () => {
        manager.setCreateEpicError(new Error("Test"));
        manager.setAddSpecCommentError(new Error("Test"));
        manager.setUpdateSpecCommentError(new Error("Test"));
        manager.setGetSpecContentError(new Error("Test"));
        manager.setGetSpecCommentsError(new Error("Test"));

        manager.clear();

        // Should not throw after clear
        await manager.createEpic("owner", "repo", "Title", "Summary");
        await manager.addSpecComment("owner", "repo", 1, "brainstorm", "Content");
      });

      it("should clear all recorded operations", async () => {
        await manager.createEpic("owner", "repo", "Epic", "Summary");
        await manager.addSpecComment("owner", "repo", 1, "brainstorm", "Content");
        await manager.updateSpecComment("owner", "repo", 1, "brainstorm", "Updated");

        manager.clear();

        assertEquals(manager.getCreatedEpics().length, 0);
        assertEquals(manager.getAddedComments().length, 0);
        assertEquals(manager.getUpdatedComments().length, 0);
      });
    });
  });

  describe("EpicManagerImpl", () => {
    let manager: EpicManagerImpl;
    let mockGitHubClient: MockGitHubClient;

    beforeEach(() => {
      mockGitHubClient = new MockGitHubClient();
      manager = new EpicManagerImpl(mockGitHubClient);
    });

    afterEach(() => {
      mockGitHubClient.clear();
    });

    describe("createEpic", () => {
      it("should create issue with Epic label", async () => {
        const result = await manager.createEpic(
          "owner",
          "repo",
          "My Feature",
          "Feature summary",
        );

        assertEquals(typeof result.number, "number");
        assertEquals(result.url.includes("github.com"), true);

        const issues = mockGitHubClient.getCreatedIssues();
        assertEquals(issues.length, 1);
        assertEquals(issues[0].title, "[Epic] My Feature");
        assertEquals(issues[0].body?.includes("Feature summary"), true);
        assertEquals(issues[0].labels?.includes("epic"), true);
      });

      it("should format epic body with summary", async () => {
        await manager.createEpic(
          "owner",
          "repo",
          "Authentication System",
          "Implement OAuth2 authentication with multiple providers.",
        );

        const issues = mockGitHubClient.getCreatedIssues();
        assertEquals(issues[0].body?.includes("Implement OAuth2"), true);
      });

      it("should propagate GitHubClient errors", async () => {
        const error = new GitHubAccessError("Failed", "API error", "Retry");
        mockGitHubClient.setCreateIssueError(error);

        await assertRejects(
          () => manager.createEpic("owner", "repo", "Title", "Summary"),
          GitHubAccessError,
          "Failed",
        );
      });
    });

    describe("addSpecComment", () => {
      it("should create comment with formatted spec content", async () => {
        const content = "# Brainstorm\n\nSome ideas here.";

        const commentId = await manager.addSpecComment(
          "owner",
          "repo",
          1,
          "brainstorm",
          content,
        );

        assertEquals(typeof commentId, "number");

        const comments = mockGitHubClient.getCreatedComments();
        assertEquals(comments.length, 1);
        assertEquals(comments[0].body.includes("<!-- REGENT_SPEC:brainstorm -->"), true);
        assertEquals(comments[0].body.includes("<details>"), true);
        assertEquals(comments[0].body.includes(content), true);
      });

      it("should add correct summary for each spec type", async () => {
        await manager.addSpecComment("owner", "repo", 1, "brainstorm", "B");
        await manager.addSpecComment("owner", "repo", 1, "requirements", "R");
        await manager.addSpecComment("owner", "repo", 1, "design", "D");

        const comments = mockGitHubClient.getCreatedComments();
        assertEquals(comments[0].body.includes("📋 Brainstorm Specification"), true);
        assertEquals(comments[1].body.includes("📝 Requirements Specification"), true);
        assertEquals(comments[2].body.includes("🏗️ Design Specification"), true);
      });

      it("should propagate GitHubClient errors", async () => {
        const error = new GitHubAccessError("Failed", "API error", "Retry");
        mockGitHubClient.setCreateIssueCommentError(error);

        await assertRejects(
          () => manager.addSpecComment("owner", "repo", 1, "brainstorm", "Content"),
          GitHubAccessError,
          "Failed",
        );
      });
    });

    describe("updateSpecComment", () => {
      it("should update comment with formatted spec content", async () => {
        const content = "# Updated Brainstorm\n\nRevised ideas.";

        await manager.updateSpecComment(
          "owner",
          "repo",
          123,
          "brainstorm",
          content,
        );

        const updates = mockGitHubClient.getUpdatedComments();
        assertEquals(updates.length, 1);
        assertEquals(updates[0].commentId, 123);
        assertEquals(updates[0].body.includes("<!-- REGENT_SPEC:brainstorm -->"), true);
        assertEquals(updates[0].body.includes(content), true);
      });

      it("should propagate GitHubClient errors", async () => {
        const error = new GitHubAccessError("Failed", "API error", "Retry");
        mockGitHubClient.setUpdateIssueCommentError(error);

        await assertRejects(
          () => manager.updateSpecComment("owner", "repo", 123, "brainstorm", "Content"),
          GitHubAccessError,
          "Failed",
        );
      });
    });

    describe("getSpecContent", () => {
      it("should return null when no matching spec comment exists", async () => {
        // No comments added to the mock
        const content = await manager.getSpecContent("owner", "repo", 1, "brainstorm");

        assertEquals(content, null);
      });

      it("should extract content from matching spec comment", async () => {
        // Add a spec comment first
        await manager.addSpecComment(
          "owner",
          "repo",
          1,
          "brainstorm",
          "# My Spec Content",
        );

        const content = await manager.getSpecContent("owner", "repo", 1, "brainstorm");

        assertEquals(content, "# My Spec Content");
      });

      it("should return null for non-matching spec type", async () => {
        await manager.addSpecComment(
          "owner",
          "repo",
          1,
          "brainstorm",
          "Brainstorm content",
        );

        const content = await manager.getSpecContent("owner", "repo", 1, "requirements");

        assertEquals(content, null);
      });

      it("should propagate GitHubClient errors", async () => {
        const error = new GitHubAccessError("Failed", "API error", "Retry");
        mockGitHubClient.setGetIssueCommentsError(error);

        await assertRejects(
          () => manager.getSpecContent("owner", "repo", 1, "brainstorm"),
          GitHubAccessError,
          "Failed",
        );
      });
    });

    describe("getSpecComments", () => {
      it("should return empty map when no spec comments exist", async () => {
        const specs = await manager.getSpecComments("owner", "repo", 1);

        assertEquals(specs.size, 0);
      });

      it("should return map of all spec types with comment IDs and content", async () => {
        await manager.addSpecComment("owner", "repo", 1, "brainstorm", "Brainstorm");
        await manager.addSpecComment("owner", "repo", 1, "requirements", "Requirements");
        await manager.addSpecComment("owner", "repo", 1, "design", "Design");

        const specs = await manager.getSpecComments("owner", "repo", 1);

        assertEquals(specs.size, 3);
        assertEquals(specs.has("brainstorm"), true);
        assertEquals(specs.has("requirements"), true);
        assertEquals(specs.has("design"), true);
        assertEquals(specs.get("brainstorm")?.content, "Brainstorm");
        assertEquals(specs.get("requirements")?.content, "Requirements");
        assertEquals(specs.get("design")?.content, "Design");
      });

      it("should ignore non-spec comments", async () => {
        // Create a regular comment directly through the GitHub client
        await mockGitHubClient.createIssueComment(
          "owner",
          "repo",
          1,
          "This is a regular comment without spec markers.",
        );
        await manager.addSpecComment("owner", "repo", 1, "brainstorm", "Spec content");

        const specs = await manager.getSpecComments("owner", "repo", 1);

        assertEquals(specs.size, 1);
        assertEquals(specs.has("brainstorm"), true);
      });

      it("should propagate GitHubClient errors", async () => {
        const error = new GitHubAccessError("Failed", "API error", "Retry");
        mockGitHubClient.setGetIssueCommentsError(error);

        await assertRejects(
          () => manager.getSpecComments("owner", "repo", 1),
          GitHubAccessError,
          "Failed",
        );
      });
    });
  });
});
