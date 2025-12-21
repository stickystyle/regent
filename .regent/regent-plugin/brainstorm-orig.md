# Regent: Spec-Driven Development Plugin for Claude Code

## Overview

Regent is a Claude Code plugin that brings spec-driven development workflows directly into Claude Code, eliminating the need for external tools like Kiro. It provides a structured progression from idea to implementation through well-defined phases, with specialized agents ensuring format consistency and quality at each step.

The name "Regent" implies governance and oversight of the development process - ruling over the spec-to-code pipeline.

## Problem Statement

Current workflow friction:
1. **Tool switching** - Jumping between Claude Code and Kiro breaks flow
2. **Cost** - Teams already pay for Claude; Kiro is an additional expense
3. **Context loss** - Re-explaining project context when switching tools
4. **Shareability** - Sharing workflows with team requires everyone to have Kiro

## Solution

A Claude Code plugin that replicates Kiro's spec-driven workflow with:
- Sequential slash commands for each development phase
- Specialized writer agents ensuring format consistency
- Implementation agents for code execution
- Full traceability from requirements to implementation

## Workflow Phases

```
/regent:init
    ↓
/regent:brainstorm → brainstorm.md
    ↓
/regent:specify → requirements.md (EARS format)
    ↓
/regent:design → design.md (architecture, correctness properties)
    ↓
/regent:plan → tasks.md (TDD-ordered checklist)
    ↓
/regent:execute → implements tasks one at a time
```

Each phase supports iteration - if issues are found downstream, you can re-run upstream commands to refine.

## Directory Structure

### Plugin Structure
```
regent/
├── .claude-plugin/
│   └── plugin.json           # Plugin manifest
├── commands/
│   ├── init.md
│   ├── brainstorm.md
│   ├── specify.md
│   ├── design.md
│   ├── plan.md
│   ├── execute.md
│   ├── status.md
│   ├── list.md
│   └── help.md
├── agents/
│   ├── python-engineer.md
│   ├── cdk-architect.md
│   ├── code-reviewer.md
│   ├── test-engineer.md
│   ├── brainstorm-writer.md
│   ├── requirements-writer.md
│   ├── design-writer.md
│   └── tasks-writer.md
└── README.md
```

### Project Structure (created by /regent:init)
```
.regent/
├── config.yml                # Placeholder for future configuration
└── {spec-name}/              # One directory per spec (derived from brainstorm.md title)
    ├── brainstorm.md
    ├── requirements.md
    ├── design.md
    ├── tasks.md
    └── briefs/
        └── task-{N}.md       # Task briefs for each executed task
```

## Commands

### /regent:init

**Purpose**: Initialize a project for regent usage.

**Behavior**:
1. Create `.regent/` directory
2. Create `.regent/config.yml` with placeholder content:
   ```yaml
   # .regent/config.yml
   # Regent configuration - currently uses defaults
   # Future options will be documented here
   version: 1
   ```
3. Confirm initialization complete

**Note**: Does NOT add to .gitignore - specs should be committed to version control.

### /regent:brainstorm

**Purpose**: Interactively explore and capture an idea through Q&A.

**Behavior**:
1. Uses `regent-brainstorm-writer` agent
2. Asks one question at a time to build understanding
3. Questions build on previous answers
4. Continues until 95% confidence in understanding
5. Presents final draft for review
6. On approval, derives spec name from title (kebab-case)
7. Creates `.regent/{spec-name}/brainstorm.md`

**Output Format**: Free-form specification document covering:
- Problem statement
- Goals and non-goals
- User personas and use cases
- Technical context
- Constraints and assumptions
- Success criteria

### /regent:specify

**Purpose**: Transform brainstorm.md into structured requirements using EARS format.

**Behavior**:
1. Determines which spec to work on:
   - If only one spec exists, use it
   - If multiple, use most recently modified
   - If ambiguous, prompt user to select
2. Reads `brainstorm.md` from the spec directory
3. Uses `regent-requirements-writer` agent
4. Drafts initial requirements
5. Asks clarifying questions one at a time until confident
6. Presents final draft for review
7. On approval, writes `requirements.md`

**Output Format** (matching Kiro exactly):
```markdown
# Requirements Document

## Introduction
[Brief summary derived from brainstorm.md]

## Glossary
- **Term**: Definition
- **Term**: Definition

## Requirements

### Requirement 1

**User Story:** As a [role], I want [goal], so that [benefit].

#### Acceptance Criteria

1. WHEN [condition] THEN the system SHALL [behavior]
2. WHEN [condition] THEN the system SHALL [behavior]

### Requirement 2
...
```

### /regent:design

**Purpose**: Create technical architecture and design from requirements.

**Behavior**:
1. Selects spec (same logic as /regent:specify)
2. Reads `requirements.md` from the spec directory
3. Uses `regent-design-writer` agent
4. Drafts initial design
5. Asks clarifying questions (may present options for technical decisions)
6. Presents final draft for review
7. On approval, writes `design.md`

**Output Format** (matching Kiro exactly):
```markdown
# Design Document

## Overview
[High-level summary of the technical approach]

## Architecture

### System Components
[Mermaid diagram showing component relationships]

### [Component] Flow
[Sequence or flow descriptions]

## Components and Interfaces

### [ComponentName]
[Description and code block with interface]

```python
class ComponentName:
    def method(self, param: Type) -> ReturnType:
        ...
```

## Data Models

### Database Schema
[Table definitions, relationships]

### [ModelName]
[Code blocks for data models]

## Correctness Properties

**Property 1: [Name]**
*For any* [condition], the system should [behavior]
**Validates: Requirements X.Y, Z.W**

**Property 2: [Name]**
...

## Error Handling
[Error scenarios and responses]

## Testing Strategy

### Unit Testing Approach
[Strategy for unit tests]

### Property-Based Testing Approach
[Strategy for property tests]

### Integration Testing
[Strategy for integration tests]
```

### /regent:plan

**Purpose**: Generate TDD-ordered implementation tasks from design.

**Behavior**:
1. Selects spec (same logic as /regent:specify)
2. Reads `requirements.md` and `design.md` from the spec directory
3. Uses `regent-tasks-writer` agent
4. Generates task list with TDD ordering (tests before implementation)
5. Fewer clarifying questions needed at this stage
6. Presents final draft for review
7. On approval, writes `tasks.md`

**Output Format** (matching Kiro exactly):
```markdown
# Implementation Plan

- [ ] 1. [Task title]
  - [Implementation step]
  - [Implementation step]
  - _Requirements: X.Y, Z.W_

- [ ] 2. Write property test for [feature]
  - **Property N: [Property name]**
  - **Validates: Requirements X.Y**

- [ ] 3. Implement [feature]
  - [Implementation step]
  - _Requirements: X.Y_

- [x] 4. [Completed task]
  ...
```

**TDD Ordering Rules**:
- Test tasks come before their corresponding implementation tasks
- Property tests reference the correctness properties from design.md
- Each task references the requirements it satisfies
- Dependencies are sequenced appropriately

### /regent:execute

**Purpose**: Implement the next incomplete task from tasks.md.

**Behavior**:
1. Selects spec (same logic as other commands)
2. Launches a subagent to extract "Task Brief":
   - Finds first unchecked `[ ]` task in tasks.md
   - Extracts verbatim requirements and acceptance criteria
   - Extracts relevant design context (interfaces, properties)
   - Identifies task sequencing and TDD relationships
   - Searches project memory for related past work
   - Finds similar test templates if writing tests
3. Saves Task Brief to `.regent/{spec-name}/briefs/task-{N}.md`
4. Presents Task Brief to user
5. Asks: "Ready to proceed with Task [N]: [Title]?"
6. On confirmation:
   - Uses appropriate implementation agent (`regent-python-engineer`, etc.)
   - Follows TDD: write tests first, then implementation
   - Uses `regent-code-reviewer` after significant changes
7. Runs tests to verify
8. Marks task complete in tasks.md: `[x]`

**Task Brief Format**:
```markdown
# Task Brief

## Task
- **Number**: [N]
- **Title**: [title]
- **Implementation Steps**:
  [bullet points verbatim from tasks.md]

## Requirements (Verbatim)

### Requirement X.Y: [title]
**User Story**: [exact text]
**Acceptance Criterion Y**:
> [exact criterion text]

## Design Context

### Relevant Interfaces
[code blocks from design.md]

### Correctness Properties
[relevant properties with numbers]

## Task Sequencing
- **Task Type**: [test-first | implementation]
- **Related Tasks**: [which tasks this relates to]
- **Expected Outcome**: [what should happen when complete]

## Dependencies
- **Prior Tasks**: [completed tasks this builds on]
- **Files to Modify**: [list]

## Current Implementation
[relevant code from actual source files]

## Test Patterns
[patterns from design.md or similar tests]
```

### /regent:status

**Purpose**: Show current progress on specs.

**Output**:
```
Current spec: authorization-system (most recently modified)

Phases:
  ✓ brainstorm.md
  ✓ requirements.md (8 requirements)
  ✓ design.md (20 properties)
  ○ tasks.md

Use /regent:list to see all specs.
```

Or if tasks.md exists:
```
Current spec: authorization-system

Phases: ✓ brainstorm → ✓ requirements → ✓ design → ✓ tasks

Task Progress: 28/34 complete (82%)

Next task: 29. Implement resilience and error handling

Use /regent:execute to continue.
```

### /regent:list

**Purpose**: List all specs in the project.

**Output**:
```
Specs in .regent/:

1. authorization-system
   └── ✓ brainstorm → ✓ requirements → ✓ design → ✓ tasks (28/34)

2. webhook-integration
   └── ✓ brainstorm → ✓ requirements → ○ design → ○ tasks

3. audit-logging
   └── ✓ brainstorm → ○ requirements → ○ design → ○ tasks
```

### /regent:help

**Purpose**: Display workflow guide and available commands.

**Output**:
```
Regent: Spec-Driven Development for Claude Code

WORKFLOW:
  /regent:init        Initialize project for regent
  /regent:brainstorm  Explore and capture an idea → brainstorm.md
  /regent:specify     Structure requirements (EARS) → requirements.md
  /regent:design      Technical architecture → design.md
  /regent:plan        TDD task breakdown → tasks.md
  /regent:execute     Implement next task

UTILITIES:
  /regent:status      Show current progress
  /regent:list        List all specs
  /regent:help        This help message

ITERATION:
  Re-run any phase command to refine that document.
  Changes flow downstream on next phase execution.

AGENTS (for direct invocation):
  regent-python-engineer     Python backend development
  regent-cdk-architect       AWS CDK infrastructure
  regent-code-reviewer       Code quality review
  regent-test-engineer       Test writing and TDD
  regent-brainstorm-writer   Brainstorm document formatting
  regent-requirements-writer EARS requirements formatting
  regent-design-writer       Architecture document formatting
  regent-tasks-writer        Task list formatting
```

## Agents

### Implementation Agents

#### regent-python-engineer
Generalized from NextAPI's python-engineer. Senior Python backend engineer with expertise in:
- FastAPI, Django, Flask, SQLAlchemy, Pydantic
- Clean architecture and SOLID principles
- uv for dependency management
- Comprehensive testing with pytest
- Type hints and documentation

#### regent-cdk-architect
Generalized from NextAPI's aws-cdk-architect. Senior AWS infrastructure architect with:
- CDK mastery with Python
- AWS best practices validation
- Security-first design
- Cost optimization awareness

#### regent-code-reviewer
Generalized from NextAPI's code-reviewer. Expert reviewer focusing on:
- Code quality and readability
- Security vulnerabilities
- Test coverage
- Performance considerations
- Does NOT fix code - only provides feedback

#### regent-test-engineer
Generalized from NextAPI's test-engineer. Pytest specialist with:
- TDD workflow expertise
- Fixtures and parameterization
- Property-based testing with Hypothesis
- Clean, maintainable test code

### Spec Writer Agents

#### regent-brainstorm-writer
Expert at conversational spec exploration:
- Asks probing questions to understand the problem
- Builds understanding iteratively
- Captures nuance and edge cases
- Produces comprehensive but readable specs

#### regent-requirements-writer
EARS format specialist:
- Transforms informal specs into structured requirements
- Uses "WHEN...THEN...SHALL" acceptance criteria
- Creates clear user stories
- Maintains glossary of domain terms
- Ensures testable, unambiguous requirements

#### regent-design-writer
Technical architecture expert:
- Creates Mermaid diagrams for system visualization
- Defines clear component interfaces with code blocks
- Formulates correctness properties with requirement traceability
- Documents error handling strategies
- Outlines testing approaches

#### regent-tasks-writer
TDD task breakdown specialist:
- Orders tasks for test-first development
- Links tasks to requirements and properties
- Sequences based on dependencies
- Creates actionable, specific steps
- Uses checkbox format for tracking

## Multi-Spec Handling

When multiple specs exist in `.regent/`:
1. Commands default to the **most recently modified** spec
2. If ambiguous (same modification time), prompt user to select
3. User can always override by specifying spec name as argument

## Configuration

### .regent/config.yml (v1 - placeholder)
```yaml
# .regent/config.yml
# Regent configuration - currently uses defaults
# Future options will be documented here
version: 1
```

### Future Configuration Options (v2+)
```yaml
version: 1

agents:
  backend: regent-python-engineer  # or regent-node-engineer
  infrastructure: regent-cdk-architect
  reviewer: regent-code-reviewer

output:
  diagrams: true      # Include Mermaid diagrams in design.md
  glossary: true      # Include glossary in requirements.md
```

## Distribution

### Plugin Manifest (.claude-plugin/plugin.json)
```json
{
  "name": "regent",
  "version": "1.0.0",
  "description": "Spec-driven development workflow for Claude Code",
  "author": {
    "name": "Ryan Parrish"
  },
  "repository": "https://github.com/your-org/regent",
  "license": "MIT",
  "keywords": ["spec-driven", "tdd", "workflow", "development"]
}
```

### Team Distribution via Marketplace

Create a marketplace repository:
```
your-plugins-repo/
├── marketplace.json
└── plugins/
    └── regent/
        ├── .claude-plugin/plugin.json
        ├── commands/
        └── agents/
```

**marketplace.json**:
```json
{
  "marketplace": {
    "name": "Team Plugins",
    "description": "Internal development plugins",
    "version": "1.0.0"
  },
  "plugins": [
    {
      "name": "regent",
      "source": "./plugins/regent",
      "description": "Spec-driven development workflow",
      "version": "1.0.0"
    }
  ]
}
```

**Team installation**:
1. Add marketplace to project `.claude/settings.json`:
   ```json
   {
     "extraKnownMarketplaces": ["https://github.com/your-org/plugins"]
   }
   ```
2. Team members run: `claude plugin install regent@your-org`

## Version Control

Specs are **committed to version control**:
- `.regent/` directory is NOT gitignored
- Enables team collaboration on specs
- Provides audit trail of design decisions
- Allows spec review in PRs

## Future Enhancements (v2+)

1. **Slack-Native Brainstorming** (Differentiator):
   Move the brainstorm phase to Slack for true team collaboration:
   - Slack bot (Claude-powered) runs Q&A brainstorm in a thread
   - `/regent brainstorm "user authentication system"` starts a thread
   - Bot asks questions, multiple team members chime in (PM, designer, eng)
   - Natural async flow - thread builds over hours/days
   - `/regent finalize` synthesizes discussion → generates all spec docs
   - Automatically creates GitHub issues with full context
   - Devs pick up locally with `/regent:execute-issue 15`

   **Why this differentiates**:
   - Brainstorming is inherently collaborative; Slack is where teams already talk
   - Lowers barrier: non-engineers can participate in ideation
   - Captures real team discussion, not just one person's vision
   - No other spec-driven tool (Kiro, Spec Kit) has this

   **Flow**:
   ```
   Slack Thread              GitHub Issues           Local Dev
        ↓                         ↓                      ↓
   Team + Claude bot   →   Issues with spec    →   /regent:execute-issue 15
   Q&A brainstorm           context attached
   ```

2. **Guided Backtracking**: When `/regent:plan` reveals upstream gaps, offer to update requirements.md or design.md and cascade changes

3. **GitHub Issues Integration**: Split execute into team-friendly workflow:
   - `/regent:create-issues` - Parse tasks.md and create GitHub issues with full spec context (requirements, design context, correctness properties, acceptance criteria)
   - `/regent:execute-issue 27` - Fetch GH issue #27, extract context, and implement
   - Benefits:
     - Team members run `/regent:execute-issue 27` on their own machines
     - Issue assignment shows who's working on what
     - Issue status (open/in-progress/closed) tracks progress
     - Comments enable discussion without leaving GitHub
     - PRs link to issues for full traceability
     - Works with GitHub Projects for kanban-style tracking

3. **Additional Language Agents**:
   - `regent-node-engineer`
   - `regent-go-engineer`
   - `regent-rust-engineer`

4. **Configurable Agents**: Per-project agent customization via config.yml

5. **CI/CD Integration**: Auto-update task status from test results (and sync with GH issues)

6. **Spec Templates**: Pre-built templates for common patterns (API, CLI tool, library)

7. **Diff View**: Show what changed between spec versions

8. **Export**: Generate markdown summary for stakeholder review

## Design Decisions

### Why EARS Format?
EARS (Easy Approach to Requirements Syntax) provides:
- Consistent structure for acceptance criteria
- Clear testability (each criterion maps to a test)
- Unambiguous language ("SHALL" not "should")
- Industry-standard format familiar to engineers

### Why Correctness Properties?
Properties bridge requirements to tests by:
- Formalizing expected system behaviors
- Providing property-based test targets
- Creating explicit traceability (Property → Requirements)
- Enabling formal verification approaches

### Why TDD Task Ordering?
Test-first ordering ensures:
- Tests define behavior before implementation
- Implementation stays focused on requirements
- Refactoring happens with confidence
- Coverage is built-in, not afterthought

### Why Q&A Approach for Phases?
Interactive clarification:
- Prevents assumptions that lead to rework
- Builds shared understanding
- Captures nuance that prompt-only misses
- Matches proven Kiro workflow

### Why Separate Writer Agents?
Specialized agents ensure:
- Consistent format across all specs
- Deep expertise in each document type
- Direct invocation for targeted iteration
- Separation of concerns

## Success Metrics

Regent succeeds if:
1. Team can complete full spec-to-implementation cycle without leaving Claude Code
2. Output quality matches or exceeds Kiro-generated specs
3. New team members can follow the workflow without training
4. Specs serve as living documentation throughout project lifecycle
5. Task completion rate improves due to clear requirements and design

---

*This specification was developed through iterative Q&A between Ryan and Claude, capturing requirements for a Claude Code plugin that replicates Kiro's spec-driven development workflow.*
