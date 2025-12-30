# Troubleshooting Guide

This guide helps you diagnose and resolve common issues with the Regent Slack Bot.

## Table of Contents

- [Error Categories](#error-categories)
- [Transient Errors](#transient-errors)
- [Permanent Errors](#permanent-errors)
- [Common Issues](#common-issues)
- [Recovery Procedures](#recovery-procedures)
- [Checking Logs](#checking-logs)
- [Getting Help](#getting-help)

## Error Categories

Regent classifies errors into two categories:

### Transient Errors (Retryable)

These are temporary issues that may resolve automatically:

- API rate limits
- Network timeouts
- Temporary service unavailability

Regent automatically retries transient errors up to 3 times with exponential backoff.

### Permanent Errors (Non-Retryable)

These require user intervention to resolve:

- Invalid input
- Authentication failures
- Missing permissions

## Transient Errors

### GitHub Rate Limit Error

**Error Message:**

```
GitHub API rate limit exceeded

Error Type: GitHubRateLimitError
Details: Rate limit exceeded for GitHub API
Suggested Action: Wait until the rate limit resets
Rate Limit Resets: 2025-01-15T10:30:00Z
```

**What Causes It:**

- Too many GitHub API requests in a short period
- Typically happens during heavy repository exploration

**How to Resolve:**

1. Wait until the reset time shown in the error
2. Your input has been saved - Regent will retry automatically
3. If urgent, you can continue without repository context

**Prevention:**

- Avoid starting multiple sessions with the same repository simultaneously

---

### Slack Rate Limit Error

**Error Message:**

```
Slack API rate limit exceeded

Error Type: SlackRateLimitError
Details: Rate limited by Slack API
Suggested Action: Wait before continuing
Retry After: 30 seconds
```

**What Causes It:**

- Too many Slack API calls (messages, file uploads)
- Rare under normal usage

**How to Resolve:**

1. Wait the indicated number of seconds
2. Regent will retry automatically
3. Your input is preserved

---

### Slack Canvas Error

**Error Message:**

```
Failed to create Canvas for spec review

Error Type: SlackCanvasError
Details: Canvas API returned an error
Suggested Action: The spec will be uploaded as a file instead
```

**What Causes It:**

- Canvas feature not available in workspace
- Temporary Canvas service issues
- Workspace quota exceeded

**How to Resolve:**

- Regent automatically falls back to uploading `brainstorm.md` as a file
- The review process continues normally with the file attachment

---

### Anthropic Rate Limit Error

**Error Message:**

```
Claude API rate limit exceeded

Error Type: AnthropicRateLimitError
Details: Rate limited by Anthropic API
Suggested Action: Wait before continuing
Retry After: 60 seconds
```

**What Causes It:**

- High API usage across the Anthropic account
- Large conversation contexts

**How to Resolve:**

1. Wait the indicated time
2. Regent will retry automatically
3. Your input is preserved

---

### Network Timeout Error

**Error Message:**

```
Network request timed out

Error Type: NetworkTimeoutError
Details: Request to [service] timed out after 30s
Suggested Action: This is usually temporary. Retrying...
```

**What Causes It:**

- Temporary network issues
- Service latency spikes

**How to Resolve:**

1. Regent retries automatically (up to 3 times)
2. If all retries fail, try your input again
3. Check your network connection if it persists

## Permanent Errors

### Validation Error: DM Channel

**Error Message:**

```
Cannot use /brainstorm in direct messages

Error Type: ValidationError
Details: Brainstorming requires a shared channel for team collaboration
Suggested Action: Use this command in a public or private channel instead
```

**What Causes It:**

- Running `/brainstorm` in a direct message instead of a channel

**How to Resolve:**

- Use the command in a public or private channel
- Create a dedicated channel for brainstorming if needed

---

### Validation Error: Invalid Repository Format

**Error Message:**

```
Invalid repository format

Error Type: ValidationError
Details: Repository must be in 'owner/repo' format (e.g., 'acme/backend')
Suggested Action: Check the repository name and try again
```

**What Causes It:**

- Repository specified without owner: `--repo myrepo`
- Extra characters or typos in repository name

**How to Resolve:**

- Use the correct format: `--repo owner/repo`
- Example: `--repo myorg/my-api`

---

### GitHub Access Error

**Error Message:**

```
GitHub repository access denied

Error Type: GitHubAccessError
Details: Cannot access repository 'owner/repo'. Token may lack permissions or repository may not exist.
Suggested Action: Verify the repository name and ensure the GitHub token has 'repo' scope
```

**What Causes It:**

- GitHub token doesn't have access to the repository
- Repository name is incorrect
- Repository doesn't exist
- Repository is private and token lacks `repo` scope

**How to Resolve:**

1. Verify the repository exists: `https://github.com/owner/repo`
2. Check the GitHub token has `repo` scope
3. Ensure the token owner has access to the repository
4. Continue without repository context if needed

**Prevention:**

- Use a GitHub token with `repo` scope
- Test repository access before starting sessions

---

### Anthropic Model Error

**Error Message:**

```
Claude could not process this request

Error Type: AnthropicModelError
Details: The model declined to process the request
Suggested Action: Rephrase your input and try again
```

**What Causes It:**

- Content policy restrictions
- Request that Claude cannot appropriately respond to

**How to Resolve:**

1. Rephrase your input
2. Remove potentially problematic content
3. Try a more specific, focused question

---

### Anthropic Input Error

**Error Message:**

```
Input is too large for processing

Error Type: AnthropicInputError
Details: The conversation context exceeds Claude's input limit
Suggested Action: Consider starting a new session or reducing context size
```

**What Causes It:**

- Very long conversation history
- Large file attachments
- Many files attached to the conversation

**How to Resolve:**

1. Start a new session with the key points summarized
2. Reduce the number of large attachments
3. Reference documents by description rather than full upload

## Common Issues

### Bot Doesn't Respond

**Symptoms:**

- No response after `/brainstorm` command
- No response after `@regent` mention

**Possible Causes & Solutions:**

1. **Bot not invited to channel**
   - Solution: `/invite @regent`

2. **Wrong mention format**
   - Ensure you're using `@regent` (the bot's name may differ in your workspace)

3. **Message not in session thread**
   - Ensure you're replying in the correct thread

4. **ROSI function timeout**
   - Wait a moment and try again
   - Check `slack activity` for errors

---

### Session Not Found

**Symptoms:**

- Regent says it can't find the session
- "No active session" message

**Solutions:**

1. Start a new session with `/brainstorm`
2. If resuming after a break, Regent will rebuild from thread history
3. Session may have expired (30-day TTL)

---

### Exploration Never Completes

**Symptoms:**

- "Exploring codebase..." message persists
- No follow-up after several minutes

**Possible Causes & Solutions:**

1. **GitHub Actions workflow failed**
   - Check the repository's Actions tab for errors
   - Verify the exploration service is configured

2. **Webhook callback failed**
   - The callback may have timed out
   - Try the command again

3. **Repository is very large**
   - Exploration can take up to 3 minutes for large codebases
   - Consider continuing without repository context

---

### Canvas Not Appearing

**Symptoms:**

- Review phase starts but no Canvas
- "Canvas creation failed" message

**Solutions:**

1. Check if your workspace supports Canvas
2. Regent will fall back to file upload automatically
3. Use the uploaded `brainstorm.md` file for review

---

### Epic Not Created

**Symptoms:**

- "Approved" confirmation but no Epic
- Epic link not posted

**Possible Causes:**

1. **No repository configured**
   - Epic creation requires `--repo` in the original command

2. **GitHub token permissions**
   - Token needs `issues:write` permission
   - Check token has `repo` scope

**Solutions:**

1. Verify repository was specified at session start
2. Check GitHub token permissions
3. Create the Epic manually using the Canvas/file content

## Recovery Procedures

### Recovering from a Failed Session

1. **Check the thread history**
   - All questions and answers are preserved in Slack

2. **Start a new session**
   ```
   /brainstorm --repo owner/repo <same idea>
   ```

3. **Summarize previous progress**
   ```
   @regent In our previous session, we decided:
   - Point 1
   - Point 2
   Let's continue from there.
   ```

### Recovering from API Errors

1. **Wait for retry**
   - Transient errors retry automatically

2. **Resend your input**
   - If retries exhausted, copy your last message and send again

3. **Check service status**
   - [Slack Status](https://status.slack.com/)
   - [Anthropic Status](https://status.anthropic.com/)
   - [GitHub Status](https://www.githubstatus.com/)

### Recovering from Expired Sessions

Sessions expire after 30 days. To recover:

1. Start a new session in the same or different channel
2. Reference the old thread for context
3. Summarize key decisions to speed up the new session

## Checking Logs

### Slack Activity Logs

View recent function executions:

```bash
slack activity
```

This shows:

- Function invocations
- Execution times
- Error messages

### Detailed Logs

For detailed debugging:

```bash
slack activity --tail
```

This streams logs in real-time as events occur.

### Common Log Patterns

**Successful execution:**

```
[Function] slash_command completed in 1.2s
```

**Error execution:**

```
[Function] slash_command failed: GitHubAccessError
```

**Timeout:**

```
[Function] message_event timed out after 60s
```

## Getting Help

If you're stuck:

1. **Check this guide** for your specific error message
2. **Review the [User Guide](user-guide.md)** for usage questions
3. **Check Slack CLI logs** with `slack activity`
4. **File an issue** at the project repository with:
   - Error message (full text)
   - Steps to reproduce
   - Relevant log output

### Information to Include

When reporting issues, provide:

1. **Error message** (exact text from Slack)
2. **Command used** (e.g., `/brainstorm --repo org/repo idea`)
3. **Session phase** (initializing, questioning, review, finalized)
4. **Slack CLI version** (`slack version`)
5. **Activity logs** (`slack activity`)
