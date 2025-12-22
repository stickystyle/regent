// ABOUTME: Tests for RepositoryContext data model validating codebase exploration results.
// ABOUTME: Ensures RepositoryContext type stores framework detection and file metadata.

import { assertEquals, assertExists } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import {
  Framework,
  RelevantFile,
  RepositoryContext,
} from "../../src/types/repository-context.ts";

describe("RepositoryContext Type", () => {
  describe("Framework enum", () => {
    it("should have React framework", () => {
      assertEquals(Framework.React, "react");
    });

    it("should have NextJS framework", () => {
      assertEquals(Framework.NextJS, "nextjs");
    });

    it("should have FastAPI framework", () => {
      assertEquals(Framework.FastAPI, "fastapi");
    });

    it("should have Django framework", () => {
      assertEquals(Framework.Django, "django");
    });

    it("should have Express framework", () => {
      assertEquals(Framework.Express, "express");
    });

    it("should have Deno framework", () => {
      assertEquals(Framework.Deno, "deno");
    });

    it("should have Unknown framework for unrecognized projects", () => {
      assertEquals(Framework.Unknown, "unknown");
    });

    it("should have expected number of frameworks", () => {
      const frameworks = Object.values(Framework);
      // React, NextJS, FastAPI, Django, Express, Deno, Unknown
      assertEquals(frameworks.length, 7);
    });
  });

  describe("RelevantFile interface", () => {
    it("should create a relevant file with path and description", () => {
      const file: RelevantFile = {
        path: "src/models/user.py",
        description: "User model with authentication fields",
      };

      assertEquals(file.path, "src/models/user.py");
      assertEquals(file.description, "User model with authentication fields");
    });

    it("should handle various file paths", () => {
      const files = [
        { path: "package.json", description: "NPM package manifest" },
        { path: "pyproject.toml", description: "Python project configuration" },
        { path: "README.md", description: "Project documentation" },
        { path: "src/index.ts", description: "Application entry point" },
        { path: ".github/workflows/ci.yml", description: "CI/CD configuration" },
      ];

      files.forEach((f) => {
        const file: RelevantFile = f;
        assertExists(file.path);
        assertExists(file.description);
      });
    });

    it("should handle optional content field", () => {
      const fileWithContent: RelevantFile = {
        path: "README.md",
        description: "Project readme",
        content: "# My Project\n\nThis is a sample project.",
      };

      assertEquals(fileWithContent.content, "# My Project\n\nThis is a sample project.");
    });

    it("should allow files without content", () => {
      const file: RelevantFile = {
        path: "src/app.ts",
        description: "Main application file",
      };

      assertEquals(file.content, undefined);
    });
  });

  describe("RepositoryContext interface", () => {
    it("should create a context with all required fields", () => {
      const context: RepositoryContext = {
        repository: "owner/repo",
        framework: Framework.React,
        patterns: ["Component-based architecture", "Redux state management"],
        relevant_files: [
          { path: "src/App.tsx", description: "Root component" },
          { path: "package.json", description: "Dependencies" },
        ],
        structure: "src/\n  components/\n  pages/\n  utils/",
      };

      assertEquals(context.repository, "owner/repo");
      assertEquals(context.framework, Framework.React);
      assertEquals(context.patterns.length, 2);
      assertEquals(context.relevant_files.length, 2);
      assertExists(context.structure);
    });

    it("should handle different frameworks", () => {
      const frameworks = [
        Framework.React,
        Framework.NextJS,
        Framework.FastAPI,
        Framework.Django,
        Framework.Express,
        Framework.Deno,
        Framework.Unknown,
      ];

      frameworks.forEach((fw) => {
        const context: RepositoryContext = {
          repository: "test/repo",
          framework: fw,
          patterns: [],
          relevant_files: [],
          structure: "",
        };

        assertEquals(context.framework, fw);
      });
    });

    it("should handle empty patterns array", () => {
      const context: RepositoryContext = {
        repository: "owner/repo",
        framework: Framework.Unknown,
        patterns: [],
        relevant_files: [],
        structure: "",
      };

      assertEquals(context.patterns.length, 0);
    });

    it("should handle multiple patterns", () => {
      const context: RepositoryContext = {
        repository: "owner/repo",
        framework: Framework.FastAPI,
        patterns: [
          "Repository pattern for data access",
          "Dependency injection with FastAPI Depends",
          "Pydantic models for validation",
          "Async/await for database operations",
        ],
        relevant_files: [],
        structure: "",
      };

      assertEquals(context.patterns.length, 4);
      assertEquals(context.patterns[0], "Repository pattern for data access");
      assertEquals(context.patterns[2], "Pydantic models for validation");
    });

    it("should handle empty relevant files", () => {
      const context: RepositoryContext = {
        repository: "owner/repo",
        framework: Framework.Express,
        patterns: ["MVC architecture"],
        relevant_files: [],
        structure: "src/\n  routes/\n  controllers/",
      };

      assertEquals(context.relevant_files.length, 0);
    });

    it("should handle multiple relevant files", () => {
      const context: RepositoryContext = {
        repository: "acme/backend",
        framework: Framework.FastAPI,
        patterns: [],
        relevant_files: [
          { path: "src/main.py", description: "FastAPI application entry" },
          { path: "src/models/user.py", description: "User SQLAlchemy model" },
          { path: "src/routers/auth.py", description: "Authentication endpoints" },
          { path: "pyproject.toml", description: "Python dependencies" },
        ],
        structure: "",
      };

      assertEquals(context.relevant_files.length, 4);
      assertEquals(context.relevant_files[0].path, "src/main.py");
      assertEquals(context.relevant_files[1].path, "src/models/user.py");
    });

    it("should handle complex directory structure", () => {
      const structure = `
src/
  components/
    Button/
    Card/
    Modal/
  pages/
    Home/
    Dashboard/
  hooks/
  utils/
  types/
public/
  images/
tests/
  unit/
  integration/
`.trim();

      const context: RepositoryContext = {
        repository: "owner/frontend",
        framework: Framework.React,
        patterns: [],
        relevant_files: [],
        structure: structure,
      };

      assertEquals(context.structure.includes("components/"), true);
      assertEquals(context.structure.includes("pages/"), true);
      assertEquals(context.structure.includes("tests/"), true);
    });

    it("should handle repository in owner/repo format", () => {
      const validRepos = [
        "owner/repo",
        "my-org/my-project",
        "user123/app_name",
        "Company-Name/Project.Name",
      ];

      validRepos.forEach((repo) => {
        const context: RepositoryContext = {
          repository: repo,
          framework: Framework.Unknown,
          patterns: [],
          relevant_files: [],
          structure: "",
        };

        assertEquals(context.repository, repo);
        assertEquals(context.repository.includes("/"), true);
      });
    });
  });

  describe("Framework detection scenarios", () => {
    it("should detect React from package.json with react dependency", () => {
      const context: RepositoryContext = {
        repository: "owner/frontend",
        framework: Framework.React,
        patterns: ["Functional components with hooks"],
        relevant_files: [
          {
            path: "package.json",
            description: "Contains react and react-dom dependencies",
          },
        ],
        structure: "src/\n  components/\n  App.tsx",
      };

      assertEquals(context.framework, Framework.React);
    });

    it("should detect FastAPI from pyproject.toml", () => {
      const context: RepositoryContext = {
        repository: "owner/api",
        framework: Framework.FastAPI,
        patterns: ["Async request handling", "Pydantic validation"],
        relevant_files: [
          {
            path: "pyproject.toml",
            description: "Contains fastapi dependency",
          },
          {
            path: "src/main.py",
            description: "FastAPI app instance",
          },
        ],
        structure: "src/\n  routers/\n  models/\n  main.py",
      };

      assertEquals(context.framework, Framework.FastAPI);
    });

    it("should detect Deno from deno.json or deno.jsonc", () => {
      const context: RepositoryContext = {
        repository: "owner/deno-app",
        framework: Framework.Deno,
        patterns: ["Deno Deploy compatible", "Fresh framework"],
        relevant_files: [
          {
            path: "deno.jsonc",
            description: "Deno configuration with import maps",
          },
        ],
        structure: "src/\n  routes/\n  islands/",
      };

      assertEquals(context.framework, Framework.Deno);
    });

    it("should use Unknown for unrecognized projects", () => {
      const context: RepositoryContext = {
        repository: "owner/mystery",
        framework: Framework.Unknown,
        patterns: [],
        relevant_files: [
          {
            path: "README.md",
            description: "Only a readme file found",
          },
        ],
        structure: "",
      };

      assertEquals(context.framework, Framework.Unknown);
    });
  });

  describe("Relevant file content extraction", () => {
    it("should store extracted README content", () => {
      const context: RepositoryContext = {
        repository: "owner/repo",
        framework: Framework.Unknown,
        patterns: [],
        relevant_files: [
          {
            path: "README.md",
            description: "Project documentation",
            content: "# My Project\n\nThis project does amazing things.",
          },
        ],
        structure: "",
      };

      assertEquals(
        context.relevant_files[0].content?.includes("amazing things"),
        true
      );
    });

    it("should store package.json content for dependency analysis", () => {
      const packageJson = JSON.stringify(
        {
          name: "my-app",
          dependencies: {
            react: "^18.0.0",
            "react-dom": "^18.0.0",
          },
        },
        null,
        2
      );

      const context: RepositoryContext = {
        repository: "owner/repo",
        framework: Framework.React,
        patterns: [],
        relevant_files: [
          {
            path: "package.json",
            description: "NPM dependencies",
            content: packageJson,
          },
        ],
        structure: "",
      };

      assertEquals(context.relevant_files[0].content?.includes("react"), true);
    });
  });

  describe("Pattern identification", () => {
    it("should identify common React patterns", () => {
      const context: RepositoryContext = {
        repository: "owner/react-app",
        framework: Framework.React,
        patterns: [
          "Functional components with React hooks",
          "Context API for state management",
          "React Router for navigation",
          "Styled-components for styling",
        ],
        relevant_files: [],
        structure: "",
      };

      assertEquals(context.patterns.some((p) => p.includes("hooks")), true);
      assertEquals(context.patterns.some((p) => p.includes("Context")), true);
    });

    it("should identify common Python/FastAPI patterns", () => {
      const context: RepositoryContext = {
        repository: "owner/python-api",
        framework: Framework.FastAPI,
        patterns: [
          "SQLAlchemy ORM for database access",
          "Alembic for migrations",
          "Pydantic for request/response validation",
          "Dependency injection for services",
        ],
        relevant_files: [],
        structure: "",
      };

      assertEquals(context.patterns.some((p) => p.includes("SQLAlchemy")), true);
      assertEquals(context.patterns.some((p) => p.includes("Pydantic")), true);
    });
  });
});
