# Task Brief

## From Issue #21

**Task 20**: Implement security controls and secret management
**Type**: test-first

- Write tests for environment variable loading (required secrets)
- Write tests for secret validation (format, presence)
- Write tests for credential isolation (no secrets in datastore/logs)
- Write tests for repository access scoping
- Implement SecretManager and access control
- Write property test: **Property 12 - Secure Credential Storage**
- _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5_

### Requirements

**Requirement 10: Security and Access Control**
> 1. The system SHALL store secrets (API keys, tokens) only in Slack's secure environment variables.
> 2. The system SHALL only access repositories explicitly specified in `/brainstorm` commands.
> 3. The system SHALL only read threads in which it has been invoked via slash command or mention.
> 4. The system SHALL NOT store message content in the datastore; only session metadata (IDs, timestamps, phase).
> 5. WHEN a user specifies a repository the GitHub token cannot access THEN the system SHALL report the access error and offer to continue without repository context.

### Property 12: Secure Credential Storage
*For any* secret (API key, token), *the system should* store it only in Slack environment variables, never in datastore or logs
**Validates:** Requirements 10.1, 10.4

## Issue Discussion

No comments on this issue.

## Codebase Context

### Current Implementation State

**Environment Variable Access**
Currently, environment variables are accessed directly using `Deno.env.get()` in a single location:

**File**: `slackbot/src/orchestrators/session-orchestrator.ts` (line 144)
```typescript
const callbackUrl = Deno.env.get("EXPLORATION_CALLBACK_URL") ?? "";
```

API keys (ANTHROPIC_API_KEY, GITHUB_TOKEN) are passed as constructor parameters to client implementations, not accessed directly.

**Client Initialization Pattern**
API keys are passed to client constructors:

`AnthropicClientImpl`:
```typescript
constructor(
  private readonly anthropicApi: {...},
  private readonly apiKey: string,  // <- Passed in, not loaded internally
  _retryConfig?: Record<string, unknown>,
  model?: string,
)
```

`GitHubClientImpl`:
```typescript
constructor(
  private readonly githubApi: {...},
  private readonly token: string,  // <- Passed in, not loaded internally
  retryConfig?: Partial<RetryConfig>,
)
```

**Security-Sensitive Code Points**

1. API Key in headers (`slackbot/src/clients/anthropic-client.ts`):
```typescript
private getHeaders(): Record<string, string> {
  return {
    "x-api-key": this.apiKey,
    ...
  };
}
```

2. GitHub token in headers (`slackbot/src/clients/github-client.ts`):
```typescript
private getHeaders(): Record<string, string> {
  return {
    "Authorization": `Bearer ${this.token}`,
    ...
  };
}
```

3. MCP Configuration includes token (`slackbot/src/clients/anthropic-client.ts`):
```typescript
/**
 * SECURITY NOTE: The authorization_token field contains a GitHub PAT.
 * This value is sensitive and MUST NOT be logged or exposed in error messages.
 */
export interface MCPGitHubConfig {
  url: string;
  authorization_token: string;
}
```

**Datastore Schema (correctly stores only metadata)**
`slackbot/src/datastores/sessions.ts`:
- `session_id`, `repository`, `phase`, `initiator_user_id`, `canvas_id`
- `confidence_score`, `created_at`, `ttl`, `epic_number`, `epic_url`
- `spec_comment_ids`

**No message content or API keys are stored.**

### Test Template Reference

**Similar Test File**: `slackbot/tests/clients/github-client.test.ts`

**Key Patterns**:
```typescript
import { assertEquals, assertInstanceOf, assertRejects } from "@std/assert";
import { describe, it, beforeEach, afterEach } from "@std/testing/bdd";

describe("ComponentName", () => {
  describe("methodName", () => {
    it("should describe expected behavior", async () => {
      // Arrange
      const instance = new SomeClass(...);

      // Act
      const result = instance.someMethod();

      // Assert
      assertEquals(result, expected);
    });
  });
});
```

### Project Conventions

**Import Style**: Relative paths with explicit `.ts` extensions
```typescript
import { ValidationError } from "../../src/errors/types.ts";
import type { Session } from "../../src/types/session.ts";
```

**Error Handling**: All errors extend `BaseError` hierarchy
- `TransientError` (retryable): `isRetryable = true`
- `PermanentError` (not retryable): `isRetryable = false`
- Each error has `constructor(message, details, suggestedAction)` and `toSlackMessage()`

**Type Annotation Style**:
- Interface for abstractions (dependency injection)
- `private readonly` for injected dependencies
- `import type` for type imports

**File Header**: Every file has 2-line ABOUTME comment

### Files to Create

1. **Test File**: `slackbot/tests/managers/secret-manager.test.ts`
   - Tests for environment variable loading (required secrets)
   - Tests for secret validation (format, presence)
   - Tests for credential isolation (no secrets in logs)
   - Property test: Secure Credential Storage

2. **Implementation File**: `slackbot/src/managers/secret-manager.ts`
   - SecretManager interface and implementation
   - Load secrets from Slack environment at initialization
   - Validate presence and format of required secrets
   - Provide safe accessors that never expose secrets in logs
   - Fail fast if required secrets are missing

### Files to Modify

- `slackbot/src/managers/index.ts` - Add export for SecretManager

### Files to Reference

- `slackbot/src/errors/types.ts` - Error hierarchy
- `slackbot/tests/errors/types.test.ts` - Error testing patterns
- `slackbot/src/clients/anthropic-client.ts` - API key usage
- `slackbot/src/clients/github-client.ts` - Token usage
- `slackbot/tests/clients/github-client.test.ts` - Testing patterns
- `slackbot/src/managers/session-manager.ts` - Manager structure

### Implementation Notes

**Current Gap**: No centralized secret validation. If ANTHROPIC_API_KEY or GITHUB_TOKEN is missing, the system fails at runtime, not at startup.

**SecretManager Should**:
1. Load secrets from Slack environment at initialization
2. Validate presence of required secrets (ANTHROPIC_API_KEY, GITHUB_TOKEN, EXPLORATION_CALLBACK_URL)
3. Validate format (non-empty strings)
4. Provide safe accessors that never expose secrets in error messages
5. Fail fast if required secrets are missing (throw on initialization)

**Test Strategy (TDD)**:
- Missing ANTHROPIC_API_KEY → throws validation error
- Missing GITHUB_TOKEN → throws validation error
- Invalid format (empty string) → throws validation error
- Valid secrets → returns non-empty strings
- Accessors never log secret values (verify error messages don't contain actual keys)

---
*Branch: feature/regent-slack-bot*
*Generated at execution time by Regent*
