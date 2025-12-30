<!-- ABOUTME: Installation guide for the Regent codebase exploration GitHub Action. -->
<!-- ABOUTME: Documents required secrets and setup steps for the explore-codebase workflow. -->

# Installation Guide

This guide covers the setup required to run the Regent codebase exploration GitHub Action.

## Overview

The `explore-codebase` workflow (`.github/workflows/explore-codebase.yml`) enables deep codebase analysis using Claude Code CLI. It's triggered via `workflow_dispatch` and posts results back to a callback URL.

## Required Secrets

Configure these secrets in your repository settings:
**Settings > Secrets and variables > Actions > New repository secret**

### 1. ANTHROPIC_API_KEY

The API key for Claude Code CLI to communicate with Anthropic's API.

**How to obtain:**
1. Go to [console.anthropic.com](https://console.anthropic.com)
2. Navigate to **API Keys**
3. Click **Create Key**
4. Copy the key (it won't be shown again)

**Required permissions:** Standard API access (no special permissions needed)

### 2. REPO_ACCESS_TOKEN

A GitHub Personal Access Token (PAT) that allows the workflow to clone target repositories.

**How to create:**
1. Go to [github.com/settings/tokens](https://github.com/settings/tokens)
2. Click **Generate new token** > **Fine-grained token** (recommended)
3. Configure:
   - **Token name:** `regent-exploration` (or similar)
   - **Expiration:** Choose based on your security policy
   - **Repository access:** Select repositories you want to explore, or "All repositories" for broader access
   - **Permissions:**
     - **Contents:** Read-only (required to clone)
     - **Metadata:** Read-only (required)
4. Click **Generate token**
5. Copy the token

**Security note:** This token determines which repositories can be explored. For development, you may want to limit it to specific repositories. For broader use, ensure you trust the callback URL validation.

### 3. CALLBACK_SECRET

A shared secret used to authenticate webhook callbacks to your application.

**How to generate:**
```bash
# Generate a secure random string (32 bytes, base64 encoded)
openssl rand -base64 32
```

**Usage:**
- Store this value as the `CALLBACK_SECRET` repository secret
- Configure the same value in your callback application (e.g., the Slack bot) to verify incoming webhook requests
- The workflow sends this as `Authorization: Bearer <CALLBACK_SECRET>` header

## Triggering the Workflow

The workflow accepts four required inputs via `workflow_dispatch`:

| Input | Description | Example |
|-------|-------------|---------|
| `target_repo` | Repository to explore (owner/repo) | `stickystyle/regent` |
| `idea` | The feature/idea being brainstormed | `Add customer preferences system` |
| `callback_url` | HTTPS URL to POST results to | `https://your-app.slack.com/webhook/...` |
| `session_id` | Unique ID to correlate the callback | `sess_abc123` |

### Manual Trigger (Testing)

1. Go to **Actions** tab in your repository
2. Select **Explore Codebase** workflow
3. Click **Run workflow**
4. Fill in the inputs
5. Click **Run workflow**

### Programmatic Trigger

```bash
gh workflow run explore-codebase.yml \
  -f target_repo="owner/repo" \
  -f idea="Add user authentication" \
  -f callback_url="https://your-callback-url.com/webhook" \
  -f session_id="unique-session-id"
```

Or via GitHub API:
```bash
curl -X POST \
  -H "Authorization: token YOUR_GITHUB_TOKEN" \
  -H "Accept: application/vnd.github.v3+json" \
  https://api.github.com/repos/OWNER/REPO/actions/workflows/explore-codebase.yml/dispatches \
  -d '{
    "ref": "main",
    "inputs": {
      "target_repo": "owner/repo",
      "idea": "Add user authentication",
      "callback_url": "https://your-callback-url.com/webhook",
      "session_id": "unique-session-id"
    }
  }'
```

## Callback Response Format

### Success Response

```json
{
  "session_id": "unique-session-id",
  "status": "success",
  "exploration_context": {
    "project_overview": "Description of the project...",
    "architecture_summary": "Key directories and components...",
    "relevant_patterns": ["Pattern 1", "Pattern 2"],
    "integration_points": ["API 1", "Database X"],
    "testing_approach": "Test framework and conventions...",
    "key_files": ["src/main.ts", "src/config.ts"],
    "idea_related_code": {
      "summary": "What was found related to the idea...",
      "existing_similar_features": ["Feature 1"],
      "relevant_files": ["path/to/file.ts - Why relevant"],
      "suggested_integration_points": ["Where to integrate"]
    }
  }
}
```

### Error Response

```json
{
  "session_id": "unique-session-id",
  "status": "error",
  "error": {
    "message": "Failed to clone repository",
    "code": "CLONE_FAILED"
  }
}
```

**Error codes:**
- `CLONE_FAILED` - Could not clone the target repository (check REPO_ACCESS_TOKEN permissions)
- `INSTALL_FAILED` - Could not install Claude Code CLI
- `EXPLORATION_FAILED` - Claude Code CLI execution failed (check ANTHROPIC_API_KEY)

## Verifying Callbacks

Your callback handler should verify the `Authorization` header:

```typescript
function handleCallback(request: Request): Response {
  const authHeader = request.headers.get("Authorization");
  const expectedToken = `Bearer ${process.env.CALLBACK_SECRET}`;

  if (authHeader !== expectedToken) {
    return new Response("Unauthorized", { status: 401 });
  }

  // Process the callback...
}
```

## Timeout and Limits

- **Workflow timeout:** 10 minutes
- **Callback retry:** 3 attempts with 5-second delays
- **Clone depth:** Shallow clone (`--depth 1`) for faster execution

## Troubleshooting

### "Failed to clone repository"
- Verify `REPO_ACCESS_TOKEN` has read access to the target repository
- Check the repository name format is correct (`owner/repo`)
- Ensure the repository exists and is not archived

### "Claude Code CLI failed"
- Verify `ANTHROPIC_API_KEY` is valid and has credits
- Check the Anthropic API status at [status.anthropic.com](https://status.anthropic.com)

### Callback not received
- Verify `callback_url` is accessible from GitHub Actions runners
- Check your application logs for incoming requests
- Ensure `CALLBACK_SECRET` matches between the workflow and your application

### Workflow not triggering
- Verify you have write access to the repository
- Check that the workflow file exists on the branch you're targeting
- Ensure the workflow is not disabled in repository settings
