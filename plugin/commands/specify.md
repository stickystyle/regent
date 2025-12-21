---
description: Transform brainstorm.md into structured EARS requirements
---

# Specify Requirements

Transform the brainstorm document into structured requirements using the EARS (Easy Approach to Requirements Syntax) format.

## Prerequisites

1. Check that `.regent/` directory exists
2. Find the spec to work on:
   - If only one spec directory exists in `.regent/`, use it
   - If multiple exist, use the most recently modified (check file timestamps)
   - If ambiguous, ask the user which spec to work on

## Process

### Phase 1: Read and Analyze

1. Read `.regent/{spec-name}/brainstorm.md`
2. Identify:
   - Core user personas
   - Key use cases and scenarios
   - System behaviors that need to be specified
   - Domain-specific terms that need definitions

### Phase 2: Draft Requirements

Create an initial draft of the requirements document. For each requirement:
- Write a clear user story
- Define acceptance criteria using EARS format

### Phase 3: Clarifying Questions

Ask clarifying questions ONE at a time to fill gaps:
- "What should happen when [edge case]?"
- "Is [assumption] correct?"
- "Should the system handle [scenario]?"

Continue until confident the requirements are complete and unambiguous.

### Phase 4: Present for Review

Present the full requirements document for review:

```markdown
# Requirements Document

## Introduction
[Brief summary derived from brainstorm.md - 2-3 sentences explaining what this system does and why]

## Glossary
- **Term**: Definition
- **Term**: Definition
[Define all domain-specific terms used in requirements]

## Requirements

### Requirement 1: [Descriptive Title]

**User Story:** As a [role], I want [goal], so that [benefit].

#### Acceptance Criteria

1. WHEN [condition] THEN the system SHALL [behavior]
2. WHEN [condition] THEN the system SHALL [behavior]
3. GIVEN [precondition] WHEN [trigger] THEN the system SHALL [behavior]

### Requirement 2: [Descriptive Title]

**User Story:** As a [role], I want [goal], so that [benefit].

#### Acceptance Criteria

1. WHEN [condition] THEN the system SHALL [behavior]
2. IF [condition] THEN the system SHALL [behavior]

[Continue for all requirements...]
```

Ask: "Do these requirements accurately capture what you need? Any changes?"

### Phase 5: Finalization

On approval:
1. Write to `.regent/{spec-name}/requirements.md`
2. Confirm:
   ```
   Requirements saved to .regent/{spec-name}/requirements.md

   Summary:
   - X requirements defined
   - Y acceptance criteria total
   - Z glossary terms

   Next step: Run /regent:design to create the technical architecture.
   ```

## EARS Format Reference

Use these patterns for acceptance criteria:

| Pattern | Template | Use When |
|---------|----------|----------|
| Ubiquitous | The system SHALL [behavior] | Always true |
| Event-Driven | WHEN [event] THEN the system SHALL [behavior] | Triggered by event |
| State-Driven | WHILE [state] the system SHALL [behavior] | During a state |
| Conditional | IF [condition] THEN the system SHALL [behavior] | Optional behavior |
| Complex | GIVEN [precondition] WHEN [trigger] THEN the system SHALL [behavior] | Multiple conditions |

**Key Rules:**
- Use SHALL (not should, will, or must) for required behavior
- Each criterion must be testable
- Avoid ambiguous words (quickly, easily, user-friendly)
- One behavior per criterion

## Important Notes

- Requirements must be testable - if you can't write a test for it, rewrite it
- Each acceptance criterion should map to exactly one test case
- Keep requirements atomic - one concept per requirement
- Number requirements for easy reference (Requirement 1.1, 1.2, etc.)
