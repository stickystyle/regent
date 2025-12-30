# Regent Slack Bot User Guide

This guide covers how to use the Regent Slack Bot effectively for collaborative specification
development.

## Table of Contents

- [Getting Started](#getting-started)
- [Starting a Session](#starting-a-session)
- [Conversational Interaction](#conversational-interaction)
- [Session Phases](#session-phases)
- [Working with Attachments](#working-with-attachments)
- [Review and Approval](#review-and-approval)
- [Best Practices](#best-practices)
- [Example Workflow](#example-workflow)

## Getting Started

Before using Regent, ensure:

1. The bot is installed in your Slack workspace
2. The bot is invited to your channel (`/invite @regent`)
3. Environment variables are configured (ANTHROPIC_API_KEY, GITHUB_TOKEN)

## Starting a Session

### Basic Command

Start a brainstorming session with the `/brainstorm` slash command:

```
/brainstorm <idea description>
```

**Example:**

```
/brainstorm Add user authentication with OAuth2 support
```

### With Repository Context

Connect to a GitHub repository for codebase-aware brainstorming:

```
/brainstorm --repo owner/repo <idea description>
```

**Example:**

```
/brainstorm --repo myorg/backend-api Add rate limiting to the API endpoints
```

When you specify a repository, Regent will:

1. Acknowledge your request immediately
2. Explore the codebase (this may take 1-3 minutes)
3. Notify you when exploration is complete
4. Start asking contextually relevant questions

### Command Syntax

```
/brainstorm [--repo owner/repo] <idea>
```

| Parameter           | Required | Description                            |
| ------------------- | -------- | -------------------------------------- |
| `<idea>`            | Yes      | Description of the feature or concept  |
| `--repo owner/repo` | No       | GitHub repository for codebase context |

### Where Can You Use It?

- **Public channels**: Supported
- **Private channels**: Supported
- **Direct messages**: Not supported (brainstorming requires a shared channel)

## Conversational Interaction

Regent understands natural language. You don't need to memorize commands - just talk to it like a
team member.

### Answering Questions

When Regent asks a question, mention the bot with your answer:

```
@regent <your answer>
```

**Examples:**

```
@regent The API should support REST and GraphQL
```

```
@regent We want to target enterprise customers with 1000+ employees
```

```
@regent Users should be able to export data as CSV and JSON
```

### Skipping Questions

If you want to skip a question and move on:

| What you want   | Example phrases                        |
| --------------- | -------------------------------------- |
| Skip a question | `@regent Let's skip this one`          |
|                 | `@regent Next question`                |
|                 | `@regent Move on`                      |
|                 | `@regent I'm not sure, let's continue` |

### Signaling Readiness

When you think you've covered enough ground:

| What you want    | Example phrases                            |
| ---------------- | ------------------------------------------ |
| Ready for review | `@regent I think we've covered everything` |
|                  | `@regent We're done`                       |
|                  | `@regent That's enough for now`            |
|                  | `@regent Ready for the spec`               |

### Providing Feedback

During the review phase, give feedback on the spec:

| What you want   | Example phrases                                            |
| --------------- | ---------------------------------------------------------- |
| Request changes | `@regent This section needs more detail on error handling` |
|                 | `@regent Can you expand the security considerations?`      |
|                 | `@regent The use cases are missing the admin workflow`     |

### Approving the Spec

When the spec looks good:

| What you want | Example phrases       |
| ------------- | --------------------- |
| Approve       | `@regent Looks good!` |
|               | `@regent Ship it`     |
|               | `@regent Approved`    |
|               | `@regent LGTM`        |

### Implicit Messages

Messages in the thread without `@regent` mention are stored for context but don't trigger a
response. This allows team discussion:

```
Alice: What do you think about supporting SAML?
Bob: I think OAuth2 is enough for now
Alice: @regent We decided to focus on OAuth2 for the initial release
```

Only Alice's last message is treated as an official answer.

## Session Phases

Sessions progress through four phases:

### 1. Initializing

**What happens:**

- Session record is created
- If repository specified, codebase exploration begins
- Status message posted to the thread

**Duration:** Seconds (without repo) to 1-3 minutes (with repo exploration)

**What you'll see:**

```
Starting brainstorming session for: Add user authentication...
Exploring codebase... (this may take a few minutes)
```

### 2. Questioning

**What happens:**

- Regent asks one question at a time
- Team provides answers via `@regent` mentions
- Claude builds understanding with each answer
- Confidence score increases toward 95%

**Duration:** Varies based on complexity (typically 5-15 questions)

**What you'll see:**

```
What authentication methods should be supported? (OAuth2, SAML, username/password, etc.)
```

**Transition triggers:**

- Confidence score reaches 95%
- User says "ready" or equivalent

### 3. Review

**What happens:**

- Spec is synthesized from conversation
- Canvas (or file) created with the draft spec
- Team reviews and provides feedback
- Spec is iteratively refined

**What you'll see:**

```
Here's the draft specification. Please review and let me know if you have any feedback.
[Canvas link or file attachment]

When you're satisfied, say "@regent approved" to finalize.
```

### 4. Finalized

**What happens:**

- Session marked complete
- If repository configured: GitHub Epic issue created with spec stored as comment
- Epic URL posted to Slack

**What you'll see:**

```
Spec finalized! Created Epic #42: https://github.com/org/repo/issues/42

To continue the workflow, use: /regent:specify --epic 42
```

## Working with Attachments

Regent can process attachments shared in the thread:

### Supported File Types

| Type      | Extensions          | How It's Used                                 |
| --------- | ------------------- | --------------------------------------------- |
| Images    | PNG, JPG, GIF, WebP | Processed via Claude's vision capabilities    |
| Documents | MD, TXT             | Text extracted and included as context        |
| Code      | JS, TS, PY, etc.    | Text extracted and included as context        |
| PDFs      | PDF                 | Text extracted (images in PDFs not processed) |

### Sharing Attachments

1. Upload the file to the thread
2. Optionally include a `@regent` mention with context:

```
@regent Here's the mockup for the login screen
[attached: login-mockup.png]
```

### Size Limits

If a file exceeds Claude's input limits, Regent will:

- Acknowledge the file
- Note that it couldn't be fully processed
- Continue the session without that context

## Review and Approval

### The Review Process

1. **Canvas Creation**: Regent creates a Slack Canvas with the draft spec
2. **Review**: Team reads the spec and discusses in the thread
3. **Feedback**: Mention Regent with specific feedback
4. **Iteration**: Regent updates the Canvas based on feedback
5. **Approval**: Mention Regent with approval to finalize

### Providing Good Feedback

Be specific about what needs changing:

**Good feedback:**

```
@regent The security section should mention rate limiting and input validation
```

**Vague feedback:**

```
@regent Make it better
```

### Canvas Fallback

If Canvas creation fails (due to permissions or quotas), Regent will:

- Upload `brainstorm.md` as a file attachment instead
- Continue the review process normally

## Best Practices

### Before Starting

- **Have a clear idea**: Write a concise but descriptive idea statement
- **Choose the right channel**: Use a channel where relevant team members can participate
- **Connect a repository**: If you have existing code, connect it for better context

### During Questioning

- **One voice per answer**: Discuss in the thread, but have one person post official answers
- **Be specific**: Detailed answers lead to better specs
- **Share context**: Upload relevant mockups, documents, or code snippets
- **Don't rush**: Take time to think through questions carefully

### During Review

- **Read thoroughly**: Check all sections of the spec
- **Involve stakeholders**: Tag relevant people for review
- **Iterate**: Don't hesitate to request multiple rounds of changes
- **Be specific**: Point to exact sections that need changes

### General Tips

1. **Natural language works**: Talk to Regent like a colleague
2. **Skip when needed**: It's okay to skip questions you're unsure about
3. **Use the thread**: Keep all discussion in the brainstorming thread
4. **Resume later**: Sessions persist for 30 days - take breaks as needed
5. **Review before approving**: The spec becomes the source of truth

## Example Workflow

Here's a complete example of a brainstorming session:

### Starting the Session

```
You: /brainstorm --repo acme/backend Add rate limiting to protect API endpoints

Regent: Starting brainstorming session for: Add rate limiting to protect API endpoints
        Exploring codebase... (this may take a few minutes)

[2 minutes later]

Regent: I've explored the codebase. Here's what I found:
        - Express.js REST API with 15 endpoints
        - Redis already configured for caching
        - No existing rate limiting implementation

        Let's start with some questions.

        What types of rate limits do you need? For example:
        - Per-user limits (authenticated users)
        - Per-IP limits (anonymous requests)
        - Per-endpoint limits (different limits for different endpoints)
        - Global limits (overall API capacity)
```

### Answering Questions

```
You: @regent We need per-user limits for authenticated requests and per-IP limits
     for anonymous requests. Different endpoints should have different limits.

Regent: Got it. What should the default rate limits be?
        For example: "100 requests per minute per user, 20 requests per minute per IP"

You: @regent 100 requests per minute for authenticated users,
     20 requests per minute per IP for anonymous

Regent: How should the system respond when rate limits are exceeded?
        Options include:
        - Return 429 Too Many Requests with Retry-After header
        - Queue requests for later processing
        - Soft limits with warnings before hard cutoff

You: @regent Return 429 with Retry-After header. Also include rate limit info
     in response headers for all requests.

[Several more questions...]

You: @regent I think we've covered everything
```

### Review Phase

```
Regent: Here's the draft specification. Please review and let me know if you have
        any feedback.

        [Canvas: Rate Limiting Specification]

        When you're satisfied, say "@regent approved" to finalize.

You: @regent The spec looks good, but can you add a section about monitoring
     and alerting when rate limits are frequently hit?

Regent: I've updated the spec with a monitoring section including:
        - Metrics to track (limit hits, near-limit warnings)
        - Suggested alert thresholds
        - Dashboard requirements

You: @regent Perfect, approved!
```

### Finalization

```
Regent: Spec finalized! Created Epic #47: https://github.com/acme/backend/issues/47

        The brainstorm.md has been attached to the Epic.

        To continue the workflow, use:
        /regent:specify --epic 47
```

---

For troubleshooting common issues, see the [Troubleshooting Guide](troubleshooting.md).
