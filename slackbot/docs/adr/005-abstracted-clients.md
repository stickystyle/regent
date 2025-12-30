# ADR-005: Abstracted Service Clients

## Status

Accepted

## Context

The Regent Slack Bot integrates with multiple external services:

1. **Slack API**: Posting messages, uploading files, managing Canvas
2. **GitHub API**: Repository access, issue management, workflow triggers
3. **Anthropic API**: Claude conversations, MCP tool use

We needed to decide how to structure these integrations.

Options considered:

- **Direct API Calls**: Call APIs directly from handlers
- **Thin Wrappers**: Simple wrapper functions around fetch
- **Abstracted Clients**: Interface-based clients with implementations
- **SDK-Only**: Use official SDKs directly throughout codebase

## Decision

We chose **abstracted interface-based clients** for all external services:

```typescript
// Interface definition
interface GitHubClient {
  createIssue(owner: string, repo: string, title: string, body: string): Promise<GitHubIssue>;
  getIssue(owner: string, repo: string, issueNumber: number): Promise<GitHubIssue>;
  // ... other methods
}

// Real implementation
class GitHubClientImpl implements GitHubClient {
  constructor(private readonly token: string) {}
  // Implementation using fetch/octokit
}

// Mock implementation
class MockGitHubClient implements GitHubClient {
  // In-memory implementation for testing
}
```

Rationale:

1. **Testability**: Mock implementations enable isolated unit testing
2. **Dependency Injection**: Components receive clients, don't create them
3. **Single Responsibility**: Each client focuses on one service
4. **Future Flexibility**: Implementations can change without affecting consumers
5. **Retry Logic**: Centralized retry handling in real implementations

## Consequences

### Positive

- **Comprehensive Testing**: Every component can be tested with mocks
- **Clear Contracts**: Interfaces document expected behavior
- **Centralized Error Handling**: Each client handles its service's errors consistently
- **Easy Debugging**: Mock clients record all calls for assertion

### Negative

- **More Code**: Interface + implementation + mock for each service
  - Acceptable: testing benefits outweigh boilerplate

- **Indirection**: Must look at interface and implementation
  - Mitigated by clear naming conventions

- **Interface Maintenance**: Changes require updating interface, impl, and mock
  - Acceptable: forces consideration of API changes

### Client Inventory

| Client                 | Purpose                         | Key Methods                                              |
| ---------------------- | ------------------------------- | -------------------------------------------------------- |
| `GitHubClient`         | Repository and issue operations | `exploreRepository`, `createIssue`, `triggerExploration` |
| `AnthropicClient`      | Claude conversations            | `sendMessage`, `synthesizeSpec`                          |
| `SlackMessagingClient` | Message posting                 | `postMessage`, `uploadFile`                              |
| `CanvasManager`        | Canvas operations               | `createCanvas`, `updateCanvas`                           |
| `EpicManager`          | Epic issue management           | `createEpic`, `addSpecComment`                           |

### Dependency Injection Pattern

Clients are injected through constructors:

```typescript
class SessionOrchestrator {
  constructor(
    private readonly sessionManager: SessionManager,
    private readonly githubClient: GitHubClient,
    private readonly anthropicClient: AnthropicClient,
    private readonly canvasManager: CanvasManager,
  ) {}
}

// Production: real clients
const orchestrator = new SessionOrchestrator(
  new SessionManagerImpl(datastore),
  new GitHubClientImpl(process.env.GITHUB_TOKEN),
  new AnthropicClientImpl(process.env.ANTHROPIC_API_KEY),
  new CanvasManagerImpl(slackClient),
);

// Testing: mock clients
const orchestrator = new SessionOrchestrator(
  new MockSessionManager(),
  new MockGitHubClient(),
  new MockAnthropicClient(),
  new MockCanvasManager(),
);
```

### Future Considerations

The abstraction layer enables potential future changes:

1. **GitHub App Migration**: Replace PAT-based `GitHubClientImpl` with App-based implementation
   without changing consumer code

2. **Alternative AI Providers**: `AnthropicClient` interface could have alternative implementations

3. **Caching Layer**: Implement caching decorator around any client

### Related Properties

- **Property 11 (Error Disclosure)**: Clients translate API errors to typed errors
- **Property 8 (Session Isolation)**: Clients are stateless, isolation is at session level
