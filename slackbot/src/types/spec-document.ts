// ABOUTME: SpecDocument data model for structured specification documents.
// ABOUTME: Matches Regent brainstorm.md format for compatibility with local workflow.

/**
 * Persona represents a user type or role in the specification.
 *
 * Personas help identify the different types of users who will
 * interact with the system being specified.
 */
export interface Persona {
  /**
   * Name of the persona (e.g., "Team Lead / Product Manager").
   */
  name: string;

  /**
   * Description of the persona's role, needs, and context.
   */
  description: string;
}

/**
 * UseCase represents a specific usage scenario in the specification.
 *
 * Use cases describe how users interact with the system to accomplish
 * their goals.
 */
export interface UseCase {
  /**
   * Unique identifier for the use case (e.g., "UC1", "UC2").
   */
  id: string;

  /**
   * Title of the use case (e.g., "New Feature Brainstorm").
   */
  title: string;

  /**
   * Description of the use case, including flow and details.
   * May contain code blocks or examples.
   */
  description: string;
}

/**
 * SpecDocument represents a structured specification document in Regent
 * brainstorm.md format.
 *
 * This format is compatible with the Regent Claude Code plugin's
 * `/regent:specify` command, ensuring seamless workflow integration.
 *
 * The structure follows:
 * - Title (# heading)
 * - Overview (## Overview)
 * - Problem Statement (## Problem Statement)
 * - Goals and Non-Goals (## Goals and Non-Goals)
 * - User Personas (## User Personas)
 * - Use Cases (## Use Cases)
 * - Technical Details (## Technical Details)
 * - Open Questions (## Open Questions)
 */
export interface SpecDocument {
  /**
   * Specification title.
   *
   * Rendered as the level 1 heading in markdown.
   */
  title: string;

  /**
   * High-level overview of the specification.
   *
   * A summary paragraph describing what the spec covers.
   */
  overview: string;

  /**
   * Problem statement explaining what needs to be solved.
   *
   * Describes current pain points and gaps that motivated this spec.
   */
  problem_statement: string;

  /**
   * List of goals the project will accomplish.
   *
   * Each goal is a string describing an objective.
   */
  goals: string[];

  /**
   * List of non-goals (explicitly out of scope items).
   *
   * Each non-goal is a string describing what is NOT in scope.
   */
  non_goals: string[];

  /**
   * List of user personas who will interact with the system.
   */
  personas: Persona[];

  /**
   * List of use cases describing how users interact with the system.
   */
  use_cases: UseCase[];

  /**
   * Technical details including architecture, constraints, and decisions.
   *
   * May contain code blocks, diagrams (mermaid), and nested sections.
   */
  technical_details: string;

  /**
   * List of open questions or remaining uncertainties.
   *
   * Each question is a string describing what needs to be resolved.
   */
  open_questions: string[];
}

/**
 * Converts a SpecDocument to markdown in Regent brainstorm.md format.
 *
 * The output follows the exact structure expected by the Regent Claude Code
 * plugin, with sections omitted if their content is empty.
 *
 * @param doc - The SpecDocument to convert
 * @returns Markdown string in brainstorm.md format
 *
 * @example
 * ```ts
 * const doc: SpecDocument = {
 *   title: "My Feature",
 *   overview: "Overview text",
 *   problem_statement: "Problem text",
 *   goals: ["Goal 1"],
 *   non_goals: [],
 *   personas: [],
 *   use_cases: [],
 *   technical_details: "",
 *   open_questions: [],
 * };
 *
 * const markdown = toMarkdown(doc);
 * // Returns:
 * // # My Feature
 * //
 * // ## Overview
 * //
 * // Overview text
 * //
 * // ## Problem Statement
 * //
 * // Problem text
 * //
 * // ## Goals and Non-Goals
 * //
 * // ### Goals
 * //
 * // - Goal 1
 * ```
 */
export function toMarkdown(doc: SpecDocument): string {
  const sections: string[] = [];

  // Title (always included)
  sections.push(`# ${doc.title}`);

  // Overview (always included)
  sections.push("## Overview");
  sections.push(doc.overview);

  // Problem Statement (always included)
  sections.push("## Problem Statement");
  sections.push(doc.problem_statement);

  // Goals and Non-Goals (only if at least one goal or non-goal)
  if (doc.goals.length > 0 || doc.non_goals.length > 0) {
    sections.push("## Goals and Non-Goals");

    if (doc.goals.length > 0) {
      sections.push("### Goals");
      sections.push(doc.goals.map((g) => `- ${g}`).join("\n"));
    }

    if (doc.non_goals.length > 0) {
      sections.push("### Non-Goals");
      sections.push(doc.non_goals.map((ng) => `- ${ng}`).join("\n"));
    }
  }

  // User Personas (only if personas exist)
  if (doc.personas.length > 0) {
    sections.push("## User Personas");
    for (const persona of doc.personas) {
      sections.push(`### ${persona.name}`);
      sections.push(persona.description);
    }
  }

  // Use Cases (only if use cases exist)
  if (doc.use_cases.length > 0) {
    sections.push("## Use Cases");
    for (const useCase of doc.use_cases) {
      sections.push(`### ${useCase.id}: ${useCase.title}`);
      sections.push(useCase.description);
    }
  }

  // Technical Details (only if not empty)
  if (doc.technical_details.trim() !== "") {
    sections.push("## Technical Details");
    sections.push(doc.technical_details);
  }

  // Open Questions (only if questions exist)
  if (doc.open_questions.length > 0) {
    sections.push("## Open Questions");
    sections.push(doc.open_questions.map((q) => `- ${q}`).join("\n"));
  }

  return sections.join("\n\n");
}
