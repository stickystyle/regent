# Regent

Spec-driven development workflow for Claude Code.

Regent brings structured software development directly into Claude Code, guiding you from idea to implementation through well-defined phases with specialized agents ensuring quality at each step.

## Installation

```bash
# Clone or copy to your plugins directory
claude plugin install regent
```

Or for local development:

```bash
claude --plugin-dir /path/to/regent
```

## Quick Start

```bash
# 1. Initialize your project
/regent:init

# 2. Explore and capture your idea
/regent:brainstorm

# 3. Transform into structured requirements
/regent:specify

# 4. Create technical architecture
/regent:design

# 5. Generate implementation tasks
/regent:plan

# 6. Implement tasks one by one
/regent:execute
```

## Workflow

```
/regent:init
    ↓
/regent:brainstorm → brainstorm.md (validated)
    ↓
/regent:specify → requirements.md (EARS format)
    ↓
/regent:design → design.md (architecture + properties)
    ↓
/regent:plan → tasks.md (TDD-ordered checklist)
    ↓
/regent:execute → implements tasks one at a time
```

## Commands

### Core Workflow

| Command | Description |
|---------|-------------|
| `/regent:init` | Initialize project for Regent |
| `/regent:brainstorm` | Explore and capture an idea through Q&A |
| `/regent:specify` | Transform brainstorm into EARS requirements |
| `/regent:design` | Create technical architecture and design |
| `/regent:plan` | Generate TDD-ordered implementation tasks |
| `/regent:execute` | Implement the next incomplete task |

### Utilities

| Command | Description |
|---------|-------------|
| `/regent:status` | Show current progress on specs |
| `/regent:list` | List all specs in the project |
| `/regent:help` | Display workflow guide |

## Agents

Regent uses specialized agents for different phases:

### Spec Writers

| Agent | Purpose |
|-------|---------|
| `regent-brainstorm-writer` | Conversational spec exploration |
| `regent-spec-validator` | Validate specs for issues |
| `regent-requirements-writer` | EARS requirements formatting |
| `regent-design-writer` | Architecture documentation |
| `regent-tasks-writer` | TDD task breakdown |

### Implementation

| Agent | Purpose |
|-------|---------|
| `regent-python-engineer` | Python backend development |
| `regent-cdk-architect` | AWS CDK infrastructure |
| `regent-test-engineer` | Test writing and TDD |
| `regent-code-reviewer` | Code quality review |

## Project Structure

After initialization, Regent creates:

```
.regent/
├── config.yml              # Configuration (placeholder for v2)
└── {spec-name}/            # One directory per spec
    ├── brainstorm.md       # Captured idea
    ├── requirements.md     # EARS format requirements
    ├── design.md           # Technical architecture
    ├── tasks.md            # Implementation checklist
    └── briefs/             # Task briefs
        └── task-{N}.md
```

## Output Formats

### Requirements (EARS Format)

```markdown
### Requirement 1: User Authentication

**User Story:** As a user, I want to log in securely, so that my data is protected.

#### Acceptance Criteria

1. WHEN a user submits valid credentials THEN the system SHALL create a session
2. IF credentials are invalid THEN the system SHALL return an error message
```

### Design (Correctness Properties)

```markdown
**Property 1: Session Uniqueness**
*For any* user, *there should be* at most one active session at a time
**Validates:** Requirements 1.1, 1.2
```

### Tasks (TDD-Ordered)

```markdown
- [ ] 1. Write tests for session creation
  - Test valid credentials create session
  - Test invalid credentials return error
  - _Requirements: 1.1, 1.2_

- [ ] 2. Implement session creation
  - Create session service
  - Add authentication logic
  - _Requirements: 1.1, 1.2_
```

## Iteration

Re-run any phase command to refine that document. Changes flow downstream on next phase execution.

Example: If `/regent:plan` reveals gaps, re-run `/regent:design` to update the architecture, then `/regent:plan` again.

## Version Control

Specs are committed to version control:
- `.regent/` directory is NOT gitignored
- Enables team collaboration on specs
- Provides audit trail of design decisions
- Allows spec review in PRs

## License

MIT
