// ABOUTME: Tests for SpecDocument data model validating all brainstorm.md sections.
// ABOUTME: Ensures SpecDocument type matches Regent brainstorm.md format for compatibility.

import { assertEquals, assertExists } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import {
  Persona,
  SpecDocument,
  toMarkdown,
  UseCase,
} from "../../src/types/spec-document.ts";

describe("SpecDocument Type", () => {
  describe("Persona interface", () => {
    it("should create a persona with name and description", () => {
      const persona: Persona = {
        name: "Team Lead / Product Manager",
        description:
          "Initiates brainstorming sessions for new features. Wants to ensure all requirements are captured before development.",
      };

      assertEquals(persona.name, "Team Lead / Product Manager");
      assertExists(persona.description);
    });

    it("should handle personas with multi-line descriptions", () => {
      const persona: Persona = {
        name: "Senior Developer",
        description:
          "Provides technical constraints and architectural context.\nWants bot to understand existing codebase patterns.\nWill use generated spec in local Regent workflow.",
      };

      assertEquals(persona.description.includes("\n"), true);
    });
  });

  describe("UseCase interface", () => {
    it("should create a use case with id, title, and description", () => {
      const useCase: UseCase = {
        id: "UC1",
        title: "New Feature Brainstorm",
        description:
          "User initiates brainstorm with /brainstorm command and provides initial idea.",
      };

      assertEquals(useCase.id, "UC1");
      assertEquals(useCase.title, "New Feature Brainstorm");
      assertExists(useCase.description);
    });

    it("should handle use cases with code blocks in description", () => {
      const useCase: UseCase = {
        id: "UC2",
        title: "Command with Repository",
        description:
          "```\nUser: /brainstorm --repo acme/backend Add user preferences\nBot: Let me explore your codebase...\n```",
      };

      assertEquals(useCase.description.includes("```"), true);
    });
  });

  describe("SpecDocument interface", () => {
    it("should create a document with all required fields", () => {
      const doc: SpecDocument = {
        title: "User Preference Management",
        overview: "A system to manage user preferences.",
        problem_statement: "Users cannot customize their experience.",
        goals: ["Enable user customization", "Persist preferences"],
        non_goals: ["Not a settings migration tool"],
        personas: [{ name: "End User", description: "Uses the application" }],
        use_cases: [
          { id: "UC1", title: "Set Theme", description: "User sets theme" },
        ],
        technical_details: "Uses local storage for persistence.",
        open_questions: ["How to handle sync across devices?"],
      };

      assertEquals(doc.title, "User Preference Management");
      assertEquals(doc.overview, "A system to manage user preferences.");
      assertEquals(doc.problem_statement, "Users cannot customize their experience.");
      assertEquals(doc.goals.length, 2);
      assertEquals(doc.non_goals.length, 1);
      assertEquals(doc.personas.length, 1);
      assertEquals(doc.use_cases.length, 1);
      assertExists(doc.technical_details);
      assertEquals(doc.open_questions.length, 1);
    });

    it("should allow empty arrays for optional list fields", () => {
      const doc: SpecDocument = {
        title: "Minimal Spec",
        overview: "A minimal specification.",
        problem_statement: "Something needs fixing.",
        goals: [],
        non_goals: [],
        personas: [],
        use_cases: [],
        technical_details: "",
        open_questions: [],
      };

      assertEquals(doc.goals.length, 0);
      assertEquals(doc.non_goals.length, 0);
      assertEquals(doc.personas.length, 0);
      assertEquals(doc.use_cases.length, 0);
      assertEquals(doc.open_questions.length, 0);
    });

    it("should handle multiple goals and non-goals", () => {
      const doc: SpecDocument = {
        title: "Feature Spec",
        overview: "Overview text",
        problem_statement: "Problem text",
        goals: [
          "Enable feature A",
          "Support feature B",
          "Integrate with system C",
        ],
        non_goals: [
          "Not replacing system D",
          "Not handling edge case E",
        ],
        personas: [],
        use_cases: [],
        technical_details: "",
        open_questions: [],
      };

      assertEquals(doc.goals.length, 3);
      assertEquals(doc.non_goals.length, 2);
    });

    it("should handle multiple personas", () => {
      const doc: SpecDocument = {
        title: "Multi-User Feature",
        overview: "A feature used by multiple user types",
        problem_statement: "Different users have different needs",
        goals: ["Support all user types"],
        non_goals: [],
        personas: [
          { name: "Admin", description: "Manages the system" },
          { name: "Developer", description: "Builds with the API" },
          { name: "End User", description: "Uses the product" },
        ],
        use_cases: [],
        technical_details: "",
        open_questions: [],
      };

      assertEquals(doc.personas.length, 3);
      assertEquals(doc.personas[0].name, "Admin");
      assertEquals(doc.personas[1].name, "Developer");
      assertEquals(doc.personas[2].name, "End User");
    });

    it("should handle multiple use cases", () => {
      const doc: SpecDocument = {
        title: "Workflow System",
        overview: "A system with multiple workflows",
        problem_statement: "Current process is manual",
        goals: ["Automate workflows"],
        non_goals: [],
        personas: [],
        use_cases: [
          { id: "UC1", title: "Create Workflow", description: "User creates workflow" },
          { id: "UC2", title: "Execute Workflow", description: "System runs workflow" },
          { id: "UC3", title: "Monitor Progress", description: "User views status" },
        ],
        technical_details: "",
        open_questions: [],
      };

      assertEquals(doc.use_cases.length, 3);
      assertEquals(doc.use_cases[0].id, "UC1");
      assertEquals(doc.use_cases[1].id, "UC2");
      assertEquals(doc.use_cases[2].id, "UC3");
    });

    it("should handle multi-line overview", () => {
      const doc: SpecDocument = {
        title: "Complex Feature",
        overview:
          "This is a complex feature that spans multiple lines.\n\nIt has paragraphs and detailed explanations.",
        problem_statement: "Problem text",
        goals: [],
        non_goals: [],
        personas: [],
        use_cases: [],
        technical_details: "",
        open_questions: [],
      };

      assertEquals(doc.overview.includes("\n\n"), true);
    });

    it("should handle technical details with code blocks and diagrams", () => {
      const doc: SpecDocument = {
        title: "Technical Feature",
        overview: "A feature with technical details",
        problem_statement: "Need architecture",
        goals: [],
        non_goals: [],
        personas: [],
        use_cases: [],
        technical_details:
          "## Architecture\n\n```mermaid\ngraph TB\n    A --> B\n```\n\n### Data Flow\n\n1. Step one\n2. Step two",
        open_questions: [],
      };

      assertEquals(doc.technical_details.includes("```mermaid"), true);
      assertEquals(doc.technical_details.includes("graph TB"), true);
    });
  });

  describe("toMarkdown", () => {
    it("should render title as level 1 heading", () => {
      const doc: SpecDocument = {
        title: "My Specification",
        overview: "Overview text",
        problem_statement: "Problem text",
        goals: [],
        non_goals: [],
        personas: [],
        use_cases: [],
        technical_details: "",
        open_questions: [],
      };

      const markdown = toMarkdown(doc);
      assertEquals(markdown.startsWith("# My Specification"), true);
    });

    it("should render overview section", () => {
      const doc: SpecDocument = {
        title: "Spec",
        overview: "This is the overview paragraph.",
        problem_statement: "Problem",
        goals: [],
        non_goals: [],
        personas: [],
        use_cases: [],
        technical_details: "",
        open_questions: [],
      };

      const markdown = toMarkdown(doc);
      assertEquals(markdown.includes("## Overview"), true);
      assertEquals(markdown.includes("This is the overview paragraph."), true);
    });

    it("should render problem statement section", () => {
      const doc: SpecDocument = {
        title: "Spec",
        overview: "Overview",
        problem_statement: "The current system has these issues.",
        goals: [],
        non_goals: [],
        personas: [],
        use_cases: [],
        technical_details: "",
        open_questions: [],
      };

      const markdown = toMarkdown(doc);
      assertEquals(markdown.includes("## Problem Statement"), true);
      assertEquals(markdown.includes("The current system has these issues."), true);
    });

    it("should render goals and non-goals section", () => {
      const doc: SpecDocument = {
        title: "Spec",
        overview: "Overview",
        problem_statement: "Problem",
        goals: ["Goal one", "Goal two"],
        non_goals: ["Non-goal one"],
        personas: [],
        use_cases: [],
        technical_details: "",
        open_questions: [],
      };

      const markdown = toMarkdown(doc);
      assertEquals(markdown.includes("## Goals and Non-Goals"), true);
      assertEquals(markdown.includes("### Goals"), true);
      assertEquals(markdown.includes("- Goal one"), true);
      assertEquals(markdown.includes("- Goal two"), true);
      assertEquals(markdown.includes("### Non-Goals"), true);
      assertEquals(markdown.includes("- Non-goal one"), true);
    });

    it("should render personas section with subsections", () => {
      const doc: SpecDocument = {
        title: "Spec",
        overview: "Overview",
        problem_statement: "Problem",
        goals: [],
        non_goals: [],
        personas: [
          { name: "Admin User", description: "Manages the system settings." },
          { name: "Regular User", description: "Uses the product daily." },
        ],
        use_cases: [],
        technical_details: "",
        open_questions: [],
      };

      const markdown = toMarkdown(doc);
      assertEquals(markdown.includes("## User Personas"), true);
      assertEquals(markdown.includes("### Admin User"), true);
      assertEquals(markdown.includes("Manages the system settings."), true);
      assertEquals(markdown.includes("### Regular User"), true);
      assertEquals(markdown.includes("Uses the product daily."), true);
    });

    it("should render use cases section with subsections", () => {
      const doc: SpecDocument = {
        title: "Spec",
        overview: "Overview",
        problem_statement: "Problem",
        goals: [],
        non_goals: [],
        personas: [],
        use_cases: [
          { id: "UC1", title: "Login", description: "User logs into the system." },
          { id: "UC2", title: "Logout", description: "User logs out of the system." },
        ],
        technical_details: "",
        open_questions: [],
      };

      const markdown = toMarkdown(doc);
      assertEquals(markdown.includes("## Use Cases"), true);
      assertEquals(markdown.includes("### UC1: Login"), true);
      assertEquals(markdown.includes("User logs into the system."), true);
      assertEquals(markdown.includes("### UC2: Logout"), true);
      assertEquals(markdown.includes("User logs out of the system."), true);
    });

    it("should render technical details section", () => {
      const doc: SpecDocument = {
        title: "Spec",
        overview: "Overview",
        problem_statement: "Problem",
        goals: [],
        non_goals: [],
        personas: [],
        use_cases: [],
        technical_details: "Uses PostgreSQL for data storage.",
        open_questions: [],
      };

      const markdown = toMarkdown(doc);
      assertEquals(markdown.includes("## Technical Details"), true);
      assertEquals(markdown.includes("Uses PostgreSQL for data storage."), true);
    });

    it("should render open questions section", () => {
      const doc: SpecDocument = {
        title: "Spec",
        overview: "Overview",
        problem_statement: "Problem",
        goals: [],
        non_goals: [],
        personas: [],
        use_cases: [],
        technical_details: "",
        open_questions: [
          "What about edge case X?",
          "How should we handle error Y?",
        ],
      };

      const markdown = toMarkdown(doc);
      assertEquals(markdown.includes("## Open Questions"), true);
      assertEquals(markdown.includes("- What about edge case X?"), true);
      assertEquals(markdown.includes("- How should we handle error Y?"), true);
    });

    it("should omit sections with empty content", () => {
      const doc: SpecDocument = {
        title: "Minimal Spec",
        overview: "Minimal overview",
        problem_statement: "Minimal problem",
        goals: [],
        non_goals: [],
        personas: [],
        use_cases: [],
        technical_details: "",
        open_questions: [],
      };

      const markdown = toMarkdown(doc);
      // Core sections should still be present
      assertEquals(markdown.includes("## Overview"), true);
      assertEquals(markdown.includes("## Problem Statement"), true);
      // Empty list sections should be omitted
      assertEquals(markdown.includes("## Goals and Non-Goals"), false);
      assertEquals(markdown.includes("## User Personas"), false);
      assertEquals(markdown.includes("## Use Cases"), false);
      assertEquals(markdown.includes("## Technical Details"), false);
      assertEquals(markdown.includes("## Open Questions"), false);
    });

    it("should produce valid markdown compatible with brainstorm.md format", () => {
      const doc: SpecDocument = {
        title: "Regent Slack Bot Specification",
        overview:
          "Regent Slack Bot is a collaborative brainstorming tool that enables teams to develop structured specifications with Claude's guidance.",
        problem_statement:
          "Software teams want AI involvement from the earliest stages of ideation, not just during implementation.",
        goals: [
          "Enable collaborative, AI-guided spec development in Slack",
          "Ask methodical questions that surface requirements",
          "Produce structured specs compatible with Regent's local workflow",
        ],
        non_goals: [
          "Not a local development tool",
          "Not a code generator",
          "Not a project management tool",
        ],
        personas: [
          {
            name: "Team Lead / Product Manager",
            description: "Initiates brainstorming sessions for new features.",
          },
          {
            name: "Senior Developer",
            description: "Provides technical constraints and architectural context.",
          },
        ],
        use_cases: [
          {
            id: "UC1",
            title: "New Feature Brainstorm",
            description: "User invokes /brainstorm and team answers questions.",
          },
        ],
        technical_details: "Uses Slack ROSI platform with DynamoDB-backed datastore.",
        open_questions: [
          "How to handle concurrent sessions in the same channel?",
        ],
      };

      const markdown = toMarkdown(doc);

      // Verify structure follows brainstorm.md format
      assertEquals(markdown.includes("# Regent Slack Bot Specification"), true);
      assertEquals(markdown.includes("## Overview"), true);
      assertEquals(markdown.includes("## Problem Statement"), true);
      assertEquals(markdown.includes("## Goals and Non-Goals"), true);
      assertEquals(markdown.includes("### Goals"), true);
      assertEquals(markdown.includes("### Non-Goals"), true);
      assertEquals(markdown.includes("## User Personas"), true);
      assertEquals(markdown.includes("### Team Lead / Product Manager"), true);
      assertEquals(markdown.includes("## Use Cases"), true);
      assertEquals(markdown.includes("### UC1: New Feature Brainstorm"), true);
      assertEquals(markdown.includes("## Technical Details"), true);
      assertEquals(markdown.includes("## Open Questions"), true);
    });

    it("should handle special characters in content", () => {
      const doc: SpecDocument = {
        title: "Spec with <Special> & Characters",
        overview: 'Overview with "quotes" and <brackets>.',
        problem_statement: "Problem with & ampersand.",
        goals: ['Goal with "quotes"'],
        non_goals: [],
        personas: [],
        use_cases: [],
        technical_details: "",
        open_questions: [],
      };

      const markdown = toMarkdown(doc);
      assertEquals(markdown.includes('Spec with <Special> & Characters'), true);
      assertEquals(markdown.includes('"quotes"'), true);
      assertEquals(markdown.includes("<brackets>"), true);
    });

    it("should preserve newlines in descriptions", () => {
      const doc: SpecDocument = {
        title: "Multi-paragraph Spec",
        overview: "First paragraph.\n\nSecond paragraph.",
        problem_statement: "Line one.\nLine two.",
        goals: [],
        non_goals: [],
        personas: [
          {
            name: "User",
            description: "Description line one.\nDescription line two.",
          },
        ],
        use_cases: [],
        technical_details: "",
        open_questions: [],
      };

      const markdown = toMarkdown(doc);
      assertEquals(markdown.includes("First paragraph.\n\nSecond paragraph."), true);
      assertEquals(markdown.includes("Line one.\nLine two."), true);
    });
  });

  describe("Section ordering", () => {
    it("should maintain correct section order in output", () => {
      const doc: SpecDocument = {
        title: "Ordered Spec",
        overview: "Overview",
        problem_statement: "Problem",
        goals: ["Goal"],
        non_goals: ["Non-goal"],
        personas: [{ name: "User", description: "Description" }],
        use_cases: [{ id: "UC1", title: "Use Case", description: "Description" }],
        technical_details: "Technical",
        open_questions: ["Question"],
      };

      const markdown = toMarkdown(doc);

      // Find positions of each section
      const overviewPos = markdown.indexOf("## Overview");
      const problemPos = markdown.indexOf("## Problem Statement");
      const goalsPos = markdown.indexOf("## Goals and Non-Goals");
      const personasPos = markdown.indexOf("## User Personas");
      const useCasesPos = markdown.indexOf("## Use Cases");
      const technicalPos = markdown.indexOf("## Technical Details");
      const questionsPos = markdown.indexOf("## Open Questions");

      // Verify ordering
      assertEquals(overviewPos < problemPos, true);
      assertEquals(problemPos < goalsPos, true);
      assertEquals(goalsPos < personasPos, true);
      assertEquals(personasPos < useCasesPos, true);
      assertEquals(useCasesPos < technicalPos, true);
      assertEquals(technicalPos < questionsPos, true);
    });
  });
});
