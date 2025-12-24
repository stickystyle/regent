---
description: Transform brainstorm.md into structured EARS requirements
---

# Specify Requirements

Transform the brainstorm document into structured requirements using the EARS (Easy Approach to Requirements Syntax) format.

## Usage

```
/regent:specify [--epic N]
```

- `--epic N`: GitHub Epic issue number to fetch brainstorm from and upload requirements to

## Arguments

- `--epic N` (optional): The GitHub issue number of the Epic containing the brainstorm spec. When provided, brainstorm is downloaded from the Epic and requirements are uploaded back to the Epic.

## Phase 0: Epic Validation (when --epic N provided)

If the `--epic N` argument is provided:

1. Parse the `--epic N` argument to extract the issue number
2. Get repository owner/repo from current git remote:
   ```bash
   gh repo view --json owner,name --jq '"\(.owner.login)/\(.name)"'
   ```
3. Validate the Epic issue exists and has the `regent:epic` label:
   ```bash
   gh issue view {N} --json labels --jq '.labels[].name' | grep -q "regent:epic"
   ```
   If not, report error: "Issue #{N} is not a Regent Epic (missing regent:epic label)"

4. Extract spec name from Epic title:
   - Get title: `gh issue view {N} --json title --jq '.title'`
   - Remove "[Epic] " prefix
   - Convert to kebab-case for directory name

## Phase 0.5: Download Brainstorm from Epic (when --epic N provided)

1. Fetch comments from the Epic and find the brainstorm spec:
   ```bash
   gh api repos/{owner}/{repo}/issues/{N}/comments \
     --jq '.[] | select(.body | contains("<!-- REGENT_SPEC:brainstorm -->")) | .body'
   ```

2. Extract content from inside the `<details>` section:
   - Find content between `</summary>` and `</details>`
   - This is the brainstorm.md content

3. Create local spec directory:
   ```bash
   mkdir -p .regent/{spec-name}
   ```

4. Cache brainstorm locally:
   - Write extracted content to `.regent/{spec-name}/brainstorm.md`
   - This allows the existing flow to read from local file

## Prerequisites (when --epic N not provided)

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

1. Write requirements locally: `.regent/{spec-name}/requirements.md`

2. **If `--epic N` was provided**, upload to Epic:

   a. Check if requirements comment already exists on Epic:
      ```bash
      EXISTING_ID=$(gh api repos/{owner}/{repo}/issues/{N}/comments \
        --jq '.[] | select(.body | contains("<!-- REGENT_SPEC:requirements -->")) | .id')
      ```

   b. Format the comment body with marker and collapsible section:
      ```
      <!-- REGENT_SPEC:requirements -->
      <details>
      <summary>Requirements Specification</summary>

      {requirements.md content}

      </details>
      ```

   c. If existing comment, update it:
      ```bash
      gh api repos/{owner}/{repo}/issues/comments/{EXISTING_ID} \
        --method PATCH \
        -f body='{formatted body}'
      ```

   d. If no existing comment, create new:
      ```bash
      gh api repos/{owner}/{repo}/issues/{N}/comments \
        --method POST \
        -f body='{formatted body}'
      ```

   e. Confirm:
      ```
      Requirements saved to Epic #{N} and .regent/{spec-name}/requirements.md

      Summary:
      - X requirements defined
      - Y acceptance criteria total
      - Z glossary terms

      Next step: Run /regent:design --epic {N}
      ```

3. **If `--epic N` was NOT provided**, confirm:
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
