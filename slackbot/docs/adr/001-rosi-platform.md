# ADR-001: ROSI Platform Selection

## Status

Accepted

## Context

We needed to choose a deployment platform for the Regent Slack Bot. The key requirements were:

1. **Native Slack Integration**: Seamless handling of slash commands, events, and OAuth
2. **Low Operational Overhead**: Minimal infrastructure management for a team tool
3. **Secure Secret Management**: Safe storage of API keys (Anthropic, GitHub)
4. **Persistent Storage**: Session state across long-running conversations (up to 30 days)
5. **TypeScript Support**: Match the existing Regent plugin's language choice

Options considered:

- **ROSI (Run On Slack Infrastructure)**: Slack's serverless Deno/TypeScript platform
- **AWS Lambda + API Gateway**: Traditional serverless with custom Slack integration
- **Self-hosted Server**: Express/Fastify on EC2/ECS/Kubernetes
- **Cloudflare Workers**: Edge serverless with custom Slack integration

## Decision

We chose **Slack's ROSI platform** for the following reasons:

1. **Native Slack Integration**: ROSI provides built-in handling for:
   - OAuth and token management
   - Slash command routing
   - Event subscriptions
   - Interactive components

2. **Built-in Datastore**: Slack Datastore provides:
   - TTL-based record expiration (perfect for 30-day sessions)
   - No additional database to manage
   - Automatic scaling

3. **Zero Infrastructure**: No servers, containers, or cloud resources to manage:
   - `slack deploy` handles everything
   - Automatic scaling
   - No cold start optimization needed

4. **Deno Runtime**: Modern TypeScript-first environment:
   - Built-in TypeScript compilation
   - No node_modules management
   - Secure by default (explicit permissions)

5. **Development Experience**: Integrated tooling:
   - `slack run` for local development
   - `slack activity` for log viewing
   - `slack env` for secret management

## Consequences

### Positive

- **Minimal Operations**: No infrastructure to manage or monitor
- **Quick Deployment**: Single command deployment with `slack deploy`
- **Native OAuth**: Slack handles all authentication flows
- **Integrated Secrets**: `slack env` manages API keys securely
- **Built-in Persistence**: Datastore requires no additional setup

### Negative

- **60-Second Timeout**: Functions cannot exceed 60 seconds execution time
  - **Mitigation**: Deep codebase exploration offloaded to GitHub Actions
  - **Mitigation**: Mid-conversation lookups use Anthropic MCP Connector

- **Deno Lock-in**: Code must use Deno-compatible dependencies
  - Most npm packages work via npm: specifiers
  - Some Slack SDK patterns differ from Node.js

- **Limited Observability**: Basic logging compared to dedicated platforms
  - `slack activity` provides function-level logs
  - No distributed tracing out of the box

- **Datastore Limitations**: Key-value store with limited query capabilities
  - Session lookup by composite key (channel:thread) works well
  - Complex queries would require external database

### Related Properties

- **Property 9 (Session Persistence)**: ROSI Datastore provides 30-day TTL support
- **Property 11 (Error Disclosure)**: ROSI's Deno environment supports structured error handling
