---
description: Create technical architecture and design from requirements
---

# Design Architecture

Create the technical architecture and design document from requirements.

## Usage

```
/regent:design [--epic N]
```

- `--epic N`: GitHub Epic issue number to fetch specs from and upload design to

## Arguments

- `--epic N` (optional): The GitHub issue number of the Epic containing the brainstorm and requirements specs. When provided, specs are downloaded from the Epic and design is uploaded back to the Epic.

## Phase 0: Fetch Epic Data (when --epic N provided)

If the `--epic N` argument is provided, run the optimized fetch script:

```bash
eval "$(plugin/scripts/fetch-epic-specs.sh {N})"
```

This script validates the Epic, downloads all spec comments in minimal API calls, and writes them to `.regent/{spec-name}/`. Variables set: `SPEC_NAME`, `EPIC_NUM`, `OWNER`, `REPO`, `SPECS_DIR`.

The script will error if requirements are not found (user needs to run `/regent:specify --epic {N}` first).

## Prerequisites (when --epic N not provided)

1. Check that `.regent/` directory exists
2. Find the spec to work on:
   - If only one spec directory exists in `.regent/`, use it
   - If multiple exist, use the most recently modified (check file timestamps)
   - If ambiguous, ask the user which spec to work on
3. Verify `requirements.md` exists in `.regent/{spec-name}/`
   - If not, tell user to run `/regent:specify` first

## Process

### Phase 1: Analyze Requirements

1. Read `.regent/{spec-name}/requirements.md`
2. Also read `.regent/{spec-name}/brainstorm.md` for additional context
3. Identify:
   - Major system components needed
   - Data flows between components
   - External integrations and existing infrastructure
   - Key domain concepts
   - Integration points with existing systems

### Phase 2: Draft Design

Create a high-level architecture design covering:
- System components and their responsibilities
- Component interactions and data flows
- Key interfaces (signatures, not implementations)
- Domain models and their relationships
- Correctness properties (simple invariants)
- Error handling strategies
- Testing approach

**Important**: The design should describe WHAT the system does, not HOW to implement it. Implementation details emerge during the planning and execution phases.

### Phase 3: Clarifying Questions

Ask clarifying questions for technical decisions:
- "Should we use [option A] or [option B] for [component]?"
- "What existing infrastructure should we integrate with?"
- "How should the system handle [failure scenario]?"

Present options with trade-offs when multiple valid approaches exist.

### Phase 4: Present for Review

**CRITICAL**: Invoke the `regent-design-writer` agent to format the design document.

Pass to the agent:
- The full content of `requirements.md`
- The full content of `brainstorm.md`
- Any clarifications gathered in Phase 3
- Notes about existing infrastructure to integrate with

The agent will return a properly formatted design document. Do NOT generate the design yourself — the agent ensures consistent formatting and appropriate abstraction level.

Present the design returned by `regent-design-writer` to the user.

Ask: "Does this architecture meet your needs? Any concerns about the design decisions?"

### Phase 5: Finalization

On approval:

1. Write design locally: `.regent/{spec-name}/design.md`

2. **If `--epic N` was provided**, upload to Epic:

   a. Check if design comment already exists on Epic:
      ```bash
      EXISTING_ID=$(gh api repos/{owner}/{repo}/issues/{N}/comments \
        --jq '.[] | select(.body | contains("<!-- REGENT_SPEC:design -->")) | .id')
      ```

   b. Format the comment body with marker and collapsible section:
      ```
      <!-- REGENT_SPEC:design -->
      <details>
      <summary>Technical Design</summary>

      {design.md content}

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
      Design saved to Epic #{N} and .regent/{spec-name}/design.md

      Summary:
      - X components defined
      - Y interfaces specified
      - Z correctness properties

      Next step: Run /regent:plan --epic {N}
      ```

3. **If `--epic N` was NOT provided**, confirm:
   ```
   Design saved to .regent/{spec-name}/design.md

   Summary:
   - X components defined
   - Y interfaces specified
   - Z correctness properties

   Next step: Run /regent:plan to generate implementation tasks.
   ```

## Important Notes

- Design should be high-level - implementation details come later
- Every correctness property must reference the requirements it validates
- Mermaid diagrams should show component relationships, not implementation details
- Properties should be simple invariant statements (one sentence each)
- Describe integration with EXISTING infrastructure, don't prescribe new infrastructure
- Trust the implementer to figure out details during planning/execution
