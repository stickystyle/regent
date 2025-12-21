# Task Brief

## From Issue #14

**Task 1**: Initialize Deno project with ROSI structure and testing infrastructure
**Type**: infrastructure

- Create directory layout (src/, tests/, manifest/)
- Initialize deno.json with import maps and task definitions
- Configure Deno test runner with coverage
- Set up deno fmt and deno lint configuration
- Create .gitignore for ROSI deployment artifacts

### Requirements

This is an infrastructure task with no direct requirement mappings. It establishes the project foundation for implementing all subsequent requirements.

### Design Context

The system is built on **Slack's ROSI (Run On Slack Infrastructure)** platform, which provides a serverless Deno/TypeScript runtime with integrated authentication and datastore capabilities.

Architecture Requirements:
- Deno/TypeScript runtime
- Slack Datastore integration for session persistence
- Support for slash commands and event handlers
- Testing infrastructure with coverage tracking
- Code quality tools (fmt, lint)

### Task Relationships

- **Depends on**: None (first task)
- **Blocks**: Tasks 2-26 (all subsequent tasks require this foundation)
- **TDD pair**: N/A (infrastructure task)

## Codebase Context

### Current Implementation State

The slackbot directory has been **partially initialized** with the basic ROSI structure:

**Existing files:**
- `slackbot/manifest.ts` - App manifest with Slack scopes
- `slackbot/deno.jsonc` - Deno configuration with task definitions
- `slackbot/slack.json` - Slack CLI hooks
- `slackbot/README.md` - Development documentation
- `slackbot/.gitignore` - Basic ignores for .slack/, .deno/, deno.lock

**Empty directories (ready for code):**
- `functions/` - Will contain custom Slack functions
- `workflows/` - Will contain workflow definitions
- `triggers/` - Will contain trigger configurations

**Not present yet:**
- `src/` directory structure for implementation code
- `tests/` directory for test files
- TypeScript source files
- Test configuration with coverage

### ROSI Platform Patterns

From manifest.ts and deno.jsonc:

```typescript
// Import pattern for Slack SDK
import { Manifest } from "deno-slack-sdk/mod.ts";

// deno.jsonc structure with import maps
"imports": {
  "deno-slack-sdk/": "https://deno.land/x/deno_slack_sdk@2.14.3/",
  "deno-slack-api/": "https://deno.land/x/deno_slack_api@2.8.0/"
}

// Task structure for development
"tasks": {
  "test": "deno test --allow-read --allow-net",
  "check": "deno check **/*.ts",
  "fmt": "deno fmt",
  "lint": "deno lint"
}
```

### Project Conventions

**1. ABOUTME Header Convention**
All code files must start with a 2-line comment with "ABOUTME: " prefix:
```typescript
// ABOUTME: Brief description of what this file does
// ABOUTME: Second line with more detail if needed
```

**2. TypeScript/Deno Conventions**
- Use TypeScript with strict mode enabled
- Line width: 100 characters
- Semi-colons: required
- Double quotes for strings
- Recommended linting rules
- Structured with import maps in deno.jsonc

**3. Directory Organization Pattern**
```
slackbot/
├── src/           # Implementation code organized by domain
├── tests/         # Test files mirroring src structure
├── functions/     # Slack ROSI function entry points
├── workflows/     # Workflow definitions
├── triggers/      # Event trigger configurations
└── manifest.ts    # Slack app manifest
```

### Files to Create

1. **`slackbot/src/`** - Main implementation directory
   - Create with a placeholder or README to establish structure

2. **`slackbot/tests/`** - Test directory
   - Mirror structure of src/
   - Add example test to verify configuration

### Files to Update

1. **`slackbot/deno.jsonc`**
   - Add coverage configuration task
   - Add import maps for testing libraries (std/testing)

2. **`slackbot/.gitignore`** (verify completeness)
   - Ensure all ROSI artifacts are excluded

---
*Branch: regent-slack-bot/task-14*
*Generated at execution time by Regent*
