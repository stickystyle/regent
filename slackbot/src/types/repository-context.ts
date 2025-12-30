// ABOUTME: RepositoryContext data model for codebase exploration results.
// ABOUTME: Stores framework detection, patterns, and relevant file metadata.

/**
 * Framework enum representing detected project frameworks.
 *
 * The framework is detected by analyzing package manifests (package.json,
 * pyproject.toml, deno.json) and project structure.
 */
export enum Framework {
  /** React-based frontend application */
  React = "react",

  /** Next.js full-stack framework */
  NextJS = "nextjs",

  /** FastAPI Python backend framework */
  FastAPI = "fastapi",

  /** Django Python web framework */
  Django = "django",

  /** Express.js Node.js backend framework */
  Express = "express",

  /** Deno runtime project (Fresh, Oak, etc.) */
  Deno = "deno",

  /** Unknown or unrecognized framework */
  Unknown = "unknown",
}

/**
 * RelevantFile represents a file discovered during repository exploration
 * that is relevant to the brainstorming context.
 *
 * These files are referenced when Claude asks contextual questions about
 * the existing codebase.
 */
export interface RelevantFile {
  /**
   * Relative path to the file from repository root.
   *
   * Example: "src/models/user.py"
   */
  path: string;

  /**
   * Brief description of what this file contains or why it's relevant.
   *
   * Example: "User model with authentication fields"
   */
  description: string;

  /**
   * Optional extracted content from the file.
   *
   * Used when the full or partial file content is needed for context.
   * May be truncated for large files.
   */
  content?: string;
}

/**
 * RepositoryContext contains information extracted from GitHub repository
 * exploration to inform Claude's questions.
 *
 * This context is gathered when a session is created with the `--repo` flag
 * and is used to ask contextually relevant questions based on the existing
 * codebase.
 *
 * @example
 * ```ts
 * const context: RepositoryContext = {
 *   repository: "acme/backend",
 *   framework: Framework.FastAPI,
 *   patterns: [
 *     "Repository pattern for data access",
 *     "Pydantic models for validation",
 *   ],
 *   relevant_files: [
 *     { path: "src/models/user.py", description: "User SQLAlchemy model" },
 *     { path: "pyproject.toml", description: "Python dependencies" },
 *   ],
 *   structure: "src/\n  models/\n  routers/\n  main.py",
 * };
 * ```
 */
export interface RepositoryContext {
  /**
   * GitHub repository in owner/repo format.
   *
   * Example: "stickystyle/regent"
   */
  repository: string;

  /**
   * Detected framework for the project.
   *
   * Determined by analyzing package manifests and project structure.
   */
  framework: Framework;

  /**
   * Identified architectural patterns in the codebase.
   *
   * Examples: "Repository pattern", "Dependency injection", "MVC architecture"
   */
  patterns: string[];

  /**
   * Key files discovered during exploration that are relevant to the session.
   *
   * These files provide context for Claude's questions and help understand
   * the existing codebase architecture.
   */
  relevant_files: RelevantFile[];

  /**
   * Directory layout summary showing the project structure.
   *
   * A condensed tree-like representation of key directories.
   *
   * Example:
   * ```
   * src/
   *   components/
   *   pages/
   *   utils/
   * ```
   */
  structure: string;
}
