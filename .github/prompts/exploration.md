<!-- ABOUTME: Prompt template for Claude Code CLI codebase exploration. -->
<!-- ABOUTME: Instructs Claude to analyze a repository and output structured JSON. -->

# Codebase Exploration Prompt

You are analyzing a codebase to help someone brainstorm a new feature or idea. Your goal is to understand the project structure, patterns, and integration points that would be relevant when planning new development.

## Your Task

Explore this codebase thoroughly and provide a structured analysis. You have two goals:

### Goal 1: Understand the Project

1. **What is this project?** - Languages, frameworks, and purpose
2. **How is it organized?** - Directory structure, entry points, main components
3. **What patterns does it use?** - Design patterns, conventions, abstractions
4. **What does it integrate with?** - APIs, services, databases, external dependencies
5. **How is it tested?** - Test structure, frameworks, conventions
6. **What files are most important?** - Key files for understanding the codebase

### Goal 2: Find Code Related to the Idea

Search the codebase for anything related to the user's idea/feature. Look for:

- **Existing similar features** - Code that does something similar to what they want to build
- **Related domain concepts** - Models, types, or modules that touch on the same domain
- **Potential integration points** - Where new code would likely hook into existing code
- **Naming conventions** - How similar concepts are named in this codebase
- **Prior art** - Any existing implementations they could extend or learn from

For example, if the idea is "customer preferences", search for:
- Files/code mentioning "preference", "setting", "config", "customer", "user"
- Existing preference or settings systems
- User profile or customer data models
- UI components for settings/preferences
- APIs that handle user customization

## Output Format

You MUST respond with ONLY valid JSON matching this exact structure. Do not include any other text, markdown, or explanation outside the JSON object:

```json
{
  "project_overview": "A clear description of what this project is, including the primary programming language(s), frameworks used, and the project's main purpose. Example: 'A TypeScript/Deno Slack bot application using the Slack ROSI platform for collaborative spec-driven development workflows.'",
  "architecture_summary": "A summary of the key directories, entry points, and main components. Example: 'Main entry: src/main.ts. Key directories: /functions (Slack function handlers), /workflows (workflow definitions), /lib (shared utilities). Uses event-driven architecture with Slack's function framework.'",
  "relevant_patterns": [
    "Pattern 1: Description of a design pattern, convention, or abstraction used",
    "Pattern 2: Another pattern found in the codebase"
  ],
  "integration_points": [
    "Integration 1: Description of an API, service, or external dependency",
    "Integration 2: Another integration point"
  ],
  "testing_approach": "Description of the testing setup, frameworks used, test file locations, and any testing conventions. Example: 'Uses Deno's built-in test runner. Tests co-located with source files using .test.ts suffix. Mocking via Deno's testing utilities.'",
  "key_files": [
    "path/to/important/file1.ts",
    "path/to/important/file2.ts"
  ],
  "idea_related_code": {
    "summary": "Brief summary of what was found related to the user's idea. Example: 'Found existing user settings system in /src/settings/ with UserPreferences model. No customer-specific preferences yet, but the pattern is extensible.'",
    "existing_similar_features": [
      "Description of existing feature that's similar or related",
      "Another related feature"
    ],
    "relevant_files": [
      "path/to/related/file1.ts - Why this file is relevant",
      "path/to/related/file2.ts - What it contains that matters"
    ],
    "suggested_integration_points": [
      "Where/how new code could integrate with existing code"
    ]
  }
}
```

## Guidelines

- Be concise but informative in your descriptions
- Focus on aspects relevant to extending or modifying the codebase
- Include 3-8 items for arrays (patterns, integrations, key_files)
- Use actual file paths from the codebase for key_files and relevant_files
- If the codebase is small or simple, it's okay to have fewer items
- For `idea_related_code`: actively search the codebase using keywords from the idea
- If nothing related to the idea is found, say so honestly in the summary and leave arrays empty

## Important

Your response must be ONLY the JSON object. Do not wrap it in markdown code blocks in your final output. Do not include any explanatory text before or after the JSON.
