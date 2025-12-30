# Task Brief

## From Issue #53

Parent Epic: #42

## Task Description

Implement Anthropic MCP Connector integration for mid-conversation code lookups via the GitHub MCP server.

**Type**: test-first

### Implementation Steps

1. Write tests for MCP server configuration in API requests
2. Write tests for tool use responses (search_code, get_file_contents)
3. Write tests for MCP tool loop handling
4. Write tests for timeout handling (must complete within 60s for ROSI)
5. Implement MCP-enabled AnthropicClient methods
6. Write property test: **MCP Tool Use Within Timeout**

### API Request Format

```typescript
interface AnthropicMCPRequest {
  model: "claude-sonnet-4-20250514";
  max_tokens: 4096;  // Higher than standard requests for tool use content
  messages: Message[];
  mcp_servers: {
    github: {
      url: "https://api.githubcopilot.com/mcp/";
      authorization_token: string;  // GitHub PAT with repo scope
    };
  };
}

// Required beta header
const headers = {
  "anthropic-beta": "mcp-client-2025-04-15",
  "x-api-key": ANTHROPIC_API_KEY,
  "content-type": "application/json"
};
```

### Available GitHub MCP Tools

| Tool | Description | Use Case |
|------|-------------|----------|
| `search_code` | Search for code patterns | Finding implementations, patterns |
| `get_file_contents` | Read specific file contents | Examining details, configs |
| `get_repository_tree` | Get directory structure | Understanding project layout |

### When to Use MCP

| Scenario | Use MCP? | Reason |
|----------|----------|--------|
| Initial session exploration | No | Use GHA (deep analysis needs time) |
| User asks about specific file | Yes | Focused lookup completes quickly |
| User references existing feature | Yes | Code search finds relevant files |
| Exploring unfamiliar area | Yes | Claude can iteratively search |

### Response Handling

```typescript
interface MCPToolUse {
  type: "tool_use";
  id: string;
  name: string;  // e.g., "mcp_github_search_code"
  input: Record<string, unknown>;
}

interface MCPToolResult {
  type: "tool_result";
  tool_use_id: string;
  content: string;
}
```

## Acceptance Criteria

- MCP server configuration works with GitHub hosted server
- Claude can use search_code and get_file_contents tools
- Tool loop completes within ROSI's 60s timeout (p95 < 30s)
- Proper error handling for MCP failures
- Beta header included in all MCP-enabled requests

_Requirements: 2.5, 2.7, 11.3_

---

## Codebase Context

### Current Implementation State

#### AnthropicClient Interface & Implementation
**Location:** `slackbot/src/clients/anthropic-client.ts`

The current AnthropicClient implementation handles Messages API communication with Anthropic but does **not yet support MCP server configuration**. Key signatures and patterns:

```typescript
// Current interface (lines 130-172)
export interface AnthropicClient {
  continueConversation(
    messages: Message[],
    repoContext: RepositoryContext | null,
  ): Promise<QuestionResponse>;

  synthesizeSpec(messages: Message[]): Promise<SpecDocument>;
  reviseSpec(spec: SpecDocument, feedback: string): Promise<SpecDocument>;
  extractConfidenceScore(response: AnthropicMessage): number;
}

// Current request format - uses 1024 tokens for standard Q&A
async continueConversation(
  messages: Message[],
  repoContext: RepositoryContext | null,
): Promise<QuestionResponse> {
  return await this.executeWithRateLimitAwareRetry(async () => {
    const requestBody = {
      model: this.model,
      max_tokens: 1024,  // Standard Q&A - MCP requests need 4096
      system: this.buildQuestioningSystemPrompt(repoContext),
      messages: this.formatMessages(messages),
      // MCP SERVER CONFIG GOES HERE (currently missing)
    };
    // ...
  });
}

// Current headers (lines 370-376)
private getHeaders(): Record<string, string> {
  return {
    "x-api-key": this.apiKey,
    "anthropic-version": "2023-06-01",
    "content-type": "application/json",
    // MISSING: "anthropic-beta": "mcp-client-2025-04-15"
  };
}
```

**Key Implementation Details:**
- Uses `executeWithRateLimitAwareRetry` wrapper for transient error handling
- Response wrapped in AnthropicMessage interface with stop_reason tracking
- Extracts text via `extractTextContent()` helper that filters content blocks by type
- `parseConfidenceFromText()` uses regex patterns to extract confidence scores

#### Token Limits by Request Type

| Request Type | max_tokens | Reason |
|-------------|------------|--------|
| Standard Q&A | 1024 | Single question/answer exchange |
| Synthesis | 8192 | Full spec document generation |
| **MCP-enabled** | **4096** | Tool use content + reasoning + answer |

#### Request Body Structure
Current request format:
```typescript
const requestBody = {
  model: "claude-sonnet-4-20250514",
  max_tokens: 1024,  // Increase to 4096 for MCP
  system: string,
  messages: Array<{ role: "user" | "assistant"; content: string }>
};
```

**Need to add for MCP:**
```typescript
mcp_servers?: {
  github: {
    url: "https://api.githubcopilot.com/mcp/";
    authorization_token: string;
  };
};
// Also increase max_tokens to 4096
```

#### Response Structure
```typescript
// AnthropicMessage
export interface AnthropicMessage {
  content: AnthropicContentBlock[];
  stop_reason: string;  // "end_turn", "max_tokens", or "tool_use"
  usage: { input_tokens: number; output_tokens: number };
}

// AnthropicContentBlock
export interface AnthropicContentBlock {
  type: string;  // "text" or "tool_use"
  text?: string;
  id?: string;  // for tool_use
  name?: string;  // for tool_use (e.g., "search_code", "get_file_contents")
  input?: unknown;  // tool input
}
```

### Test Template Reference

**Main test file:** `slackbot/tests/clients/anthropic-client.test.ts`

#### Helper Functions for Tests
```typescript
// Mock Response creation
function createMockResponse(
  content: string,
  stopReason: string = "end_turn",
  inputTokens: number = 100,
  outputTokens: number = 50,
): Response {
  const body = JSON.stringify({
    id: "msg_test123",
    type: "message",
    role: "assistant",
    content: [{ type: "text", text: content }],
    model: "claude-sonnet-4-20250514",
    stop_reason: stopReason,
    usage: { input_tokens: inputTokens, output_tokens: outputTokens },
  });
  return new Response(body, {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

// Error Response creation
function createErrorResponse(
  status: number,
  errorType: string,
  message: string,
  retryAfter?: number,
): Response {
  const body = JSON.stringify({
    type: "error",
    error: { type: errorType, message },
  });
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (retryAfter !== undefined) {
    headers["retry-after"] = String(retryAfter);
  }
  return new Response(body, { status, headers });
}

// Mock API type
interface MockAnthropicApi {
  post: (
    url: string,
    body: unknown,
    headers?: Record<string, string>,
  ) => Promise<Response>;
}
```

### Project Conventions

#### Import Style (Deno/TypeScript)
```typescript
// Type imports
import type { Message } from "../types/message.ts";
import type { RepositoryContext } from "../types/repository-context.ts";

// Value imports
import { BaseError, GitHubAccessError } from "../errors/types.ts";

// Standard library via JSR
import { assertEquals, assertRejects } from "@std/assert";
import { afterEach, beforeEach, describe, it } from "@std/testing/bdd";
```

#### Error Handling Pattern
```typescript
// Define specific error class extending TransientError or PermanentError
export class CustomError extends TransientError {
  readonly type = "CustomError";
  readonly isRetryable = true;
}

// Throw with context
throw new CustomError(
  "User-facing message",
  "Technical details for logs",
  "What user should do to resolve"
);
```

### Files to Modify

1. **`slackbot/src/clients/anthropic-client.ts`**
   - Add MCP server configuration support to request body
   - Use max_tokens: 4096 for MCP-enabled requests
   - Extend headers with "anthropic-beta": "mcp-client-2025-04-15"
   - Implement tool loop for processing tool_use stop_reason
   - Add timeout tracking (must complete within 60s for ROSI)

2. **`slackbot/tests/clients/anthropic-client.test.ts`**
   - Add test suite for MCP server configuration in request body
   - Add tests for tool use responses (stop_reason: "tool_use")
   - Add tests for tool loop handling
   - Add timeout tests

### Files to Reference

- `slackbot/src/errors/types.ts` - Error class hierarchy
- `slackbot/src/orchestrators/session-orchestrator.ts` - Calls continueConversation
- `.regent/regent-slack-bot/design.md` - MCP integration requirements
- `slackbot/tests/orchestrators/session-orchestrator-tool-loop.test.ts` - Test patterns

### Key Design Constraints

1. **ROSI Timeout**: AnthropicClient methods must complete **within 60 seconds**. MCP tool calls should complete within 30s (p95).

2. **Tool Loop**: When Claude's response has `stop_reason: "tool_use"`, the system must:
   - Extract tool name and input from content block
   - Format result as user message
   - Send back to Claude with full history
   - Repeat until stop_reason is "end_turn" or max iterations

3. **Authentication**: GitHub PAT with `repo` scope needed in MCP config.

4. **Error Classification**: Tool execution errors are transient (network, rate limit) or permanent (invalid query, access denied).

---
*Branch: feature/regent-slack-bot*
*Generated at execution time by Regent*
