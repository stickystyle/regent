# Deployment Guide

This guide covers deploying the Regent Slack Bot and configuring the GitHub Actions workflow for
codebase exploration.

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Prerequisites](#prerequisites)
- [Step 1: Deploy the Slack App](#step-1-deploy-the-slack-app)
- [Step 2: Configure GitHub Actions](#step-2-configure-github-actions)
- [Step 3: Set Up Callback Webhook](#step-3-set-up-callback-webhook)
- [Step 4: Configure Slack Environment](#step-4-configure-slack-environment)
- [Verification](#verification)
- [Troubleshooting](#troubleshooting)

## Architecture Overview

The Regent Slack Bot uses a distributed architecture for codebase exploration:

```
┌─────────────────┐     /brainstorm --repo     ┌──────────────────┐
│   Slack User    │ ─────────────────────────► │  Regent Slackbot │
└─────────────────┘                            │   (ROSI App)     │
                                               └────────┬─────────┘
                                                        │
                                           workflow_dispatch API
                                                        │
                                                        ▼
                                               ┌──────────────────┐
                                               │  GitHub Actions  │
                                               │ explore-codebase │
                                               │    workflow      │
                                               └────────┬─────────┘
                                                        │
                                              POST /callback
                                                        │
                                                        ▼
                                               ┌──────────────────┐
                                               │ Callback Webhook │
                                               │    Endpoint      │
                                               └────────┬─────────┘
                                                        │
                                          Update session & notify
                                                        │
                                                        ▼
                                               ┌──────────────────┐
                                               │   Slack Thread   │
                                               └──────────────────┘
```

**Why this architecture?**

ROSI (Run On Slack Infrastructure) has a 60-second function timeout. Deep codebase exploration using
Claude Code CLI can take 1-3 minutes. By offloading exploration to GitHub Actions, we can:

1. Process larger codebases without timeout constraints
2. Access private repositories using GitHub's native authentication
3. Use the full Claude Code CLI capabilities

## Prerequisites

Before deploying, ensure you have:

- [Deno](https://deno.com/) >= 1.37.0
- [Slack CLI](https://docs.slack.dev/tools/slack-cli/) installed and authenticated
- A Slack workspace where you can install apps
- An [Anthropic API key](https://console.anthropic.com/)
- A GitHub account with permission to create repository secrets

## Step 1: Deploy the Slack App

### 1.1 Install Dependencies

```bash
# Install Deno (macOS/Linux)
curl -fsSL https://deno.land/install.sh | sh

# Install Deno (Windows PowerShell)
irm https://deno.land/install.ps1 | iex

# Install Slack CLI (macOS)
brew install slack-cli

# Install Slack CLI (other platforms)
# See https://docs.slack.dev/tools/slack-cli/
```

### 1.2 Authenticate with Slack

```bash
slack login
```

Follow the prompts to authenticate with your Slack workspace.

### 1.3 Deploy the App

```bash
cd slackbot
slack deploy
```

You'll be prompted to:

1. Select your workspace
2. Choose an app name (default: regent-slackbot)
3. Confirm deployment

### 1.4 Create Triggers

After deployment, you'll be prompted to create triggers. **All three triggers are required** for the
app to function fully:

```
? Choose a trigger definition file:
❱ triggers/brainstorm-command.ts
  triggers/message-events.ts
  triggers/exploration-callback.ts
  Do not create a trigger
```

**Create all triggers:**

1. Select `triggers/brainstorm-command.ts` and press Enter
   - This creates the `/brainstorm` slash command

2. Run `slack trigger create --trigger-def triggers/message-events.ts`
   - This enables the bot to respond to messages in threads

3. Run `slack trigger create --trigger-def triggers/exploration-callback.ts`
   - This creates the webhook endpoint for receiving exploration callbacks

Alternatively, you can create triggers individually:

```bash
# Create the /brainstorm slash command
slack trigger create --trigger-def triggers/brainstorm-command.ts

# Create the message event handler
slack trigger create --trigger-def triggers/message-events.ts

# Create the exploration callback webhook
slack trigger create --trigger-def triggers/exploration-callback.ts
```

To verify triggers were created:

```bash
slack trigger list
```

You should see all three triggers listed for your workspace.

### 1.5 Retrieve Webhook URL

After creating the exploration-callback trigger, you need to retrieve its webhook URL for
configuring GitHub Actions:

```bash
slack trigger list
```

Look for the `exploration_callback` trigger in the output. The webhook URL will be in the format:

```
https://hooks.slack.com/triggers/<team_id>/<trigger_id>/<secret>
```

**Add the URL to GitHub repository secrets:**

1. Navigate to your repository's Settings -> Secrets and variables -> Actions
2. Add a new secret named `SLACK_WEBHOOK_TRIGGER_URL`
3. Paste the webhook URL as the value

**Important:** The webhook URL remains stable across `slack deploy` redeployments. You only need to
update the secret if you delete and recreate the trigger.

### 1.6 Note Your App ID

After deployment, note your app ID (displayed in the output). You'll need this later.

## Step 2: Configure GitHub Actions

The exploration workflow lives in `.github/workflows/explore-codebase.yml`. By default, the Slack
bot triggers this workflow in the `stickystyle/regent` repository.

If deploying your own instance, you have two options:

- **Option A**: Fork the repository and update `src/clients/github-client.ts` (lines 1411-1412) to
  point to your fork
- **Option B**: Use the official `stickystyle/regent` workflow (requires repository access)

### 2.1 Add Required Secrets

Navigate to your repository's Settings → Secrets and variables → Actions, and add:

| Secret Name         | Description                                                  |
| ------------------- | ------------------------------------------------------------ |
| `ANTHROPIC_API_KEY` | Your Anthropic API key for Claude Code CLI                   |
| `REPO_ACCESS_TOKEN` | GitHub PAT with `repo` scope for cloning target repositories |
| `CALLBACK_SECRET`   | Shared secret for authenticating callbacks (generate below)  |

### 2.2 Generate a Callback Secret

Generate a secure random secret:

```bash
openssl rand -hex 32
```

Save this value - you'll use the same secret in both GitHub Actions and Slack environment.

### 2.3 Create the GitHub PAT

The `REPO_ACCESS_TOKEN` needs permission to clone repositories that users want to explore.

Create a Personal Access Token at https://github.com/settings/tokens with:

- **Classic token**: Select `repo` scope
- **Fine-grained token**: Select repositories to access and grant:
  - Contents: Read-only

### 2.4 Verify Workflow Is Enabled

1. Navigate to your repository's Actions tab
2. Ensure the "Explore Codebase" workflow is enabled
3. If prompted, enable workflows for the repository

## Step 3: Set Up Callback Webhook

The exploration workflow needs an endpoint to POST results back to. You have several options:

### Option A: Deploy a Standalone Webhook Handler

Deploy the exploration handler as a standalone service (e.g., AWS Lambda, Vercel Function, or
Cloudflare Worker) that can:

1. Receive POST requests from GitHub Actions
2. Validate the `Authorization: Bearer <secret>` header
3. Update the Slack session and post messages

The handler implementation is in `src/handlers/exploration-handler.ts`.

### Option B: Use a Webhook Relay Service (Development)

For local development, services like [ngrok](https://ngrok.com/) can relay webhooks to your local
environment.

### 3.1 Webhook Request Format

The GitHub Actions workflow POSTs to the callback URL with:

**Headers:**

```
Content-Type: application/json
Authorization: Bearer <CALLBACK_SECRET>
```

**Success Payload:**

```json
{
  "session_id": "C12345_1234567890.123456",
  "status": "success",
  "exploration_context": {
    "file_tree": "...",
    "project_overview": "...",
    "architecture_summary": "...",
    "relevant_patterns": [],
    "integration_points": [],
    "testing_approach": "...",
    "key_files": [],
    "idea_related_code": {
      "summary": "...",
      "existing_similar_features": [],
      "relevant_files": [],
      "suggested_integration_points": []
    }
  }
}
```

**Error Payload:**

```json
{
  "session_id": "C12345_1234567890.123456",
  "status": "error",
  "error": {
    "message": "Failed to clone repository",
    "code": "CLONE_FAILED"
  }
}
```

## Step 4: Configure Slack Environment

Set the required environment variables in your Slack app:

```bash
# Anthropic API key for Claude conversations
slack env add ANTHROPIC_API_KEY

# GitHub token for API access (triggering workflows, creating epics)
slack env add GITHUB_TOKEN

# Shared secret for callback authentication (same as GitHub Actions)
slack env add CALLBACK_SECRET
```

### Environment Variable Reference

| Variable            | Required | Description                                 |
| ------------------- | -------- | ------------------------------------------- |
| `ANTHROPIC_API_KEY` | Yes      | API key for Claude Messages API             |
| `GITHUB_TOKEN`      | Yes      | GitHub PAT with `repo` scope                |
| `CALLBACK_SECRET`   | Yes      | Must match GitHub Actions `CALLBACK_SECRET` |

### 4.1 Verify Environment Variables

```bash
slack env list
```

Confirm all required variables are set.

## Verification

### Test the Deployment

1. **Invite the bot to a channel:**
   ```
   /invite @regent
   ```

2. **Start a session without repository (basic test):**
   ```
   /brainstorm Add a new feature to test deployment
   ```

3. **Start a session with repository (full test):**
   ```
   /brainstorm --repo your-org/your-repo Add user authentication
   ```

### Expected Behavior

For sessions with a repository:

1. Bot acknowledges the command immediately
2. "Exploring codebase..." message appears
3. After 1-3 minutes, exploration results are posted
4. Bot begins asking questions

## Troubleshooting

### Exploration Not Triggering

**Symptom:** No "Exploring codebase..." message after `/brainstorm --repo`

**Possible causes:**

- `GITHUB_TOKEN` doesn't have permission to trigger workflows
- GitHub Actions workflow is disabled in the repository
- Workflow file is missing from the repository

**Resolution:**

1. Verify GitHub token permissions
2. Check Actions tab in the repository for workflow runs
3. Ensure `.github/workflows/explore-codebase.yml` exists

### Exploration Callback Not Received

**Symptom:** Session stuck in "Initializing" phase

**Possible causes:**

- `SLACK_WEBHOOK_TRIGGER_URL` GitHub secret is not set or incorrect
- Webhook trigger was deleted or recreated (URL changed)
- Network issues preventing GitHub Actions from reaching Slack

**Resolution:**

1. Verify the `SLACK_WEBHOOK_TRIGGER_URL` secret is set correctly in GitHub
2. Recreate the webhook trigger if needed: `slack trigger create --trigger-def triggers/exploration-callback.ts`
3. Update the GitHub secret with the new webhook URL
4. Check GitHub Actions workflow logs for callback errors

### Missing Environment Variables

**Symptom:** Error message about missing configuration

**Resolution:**

```bash
# List current variables
slack env list

# Add missing variables
slack env add VARIABLE_NAME
```

### Permission Errors

**Symptom:** "Failed to clone repository" in exploration callback

**Possible causes:**

- `REPO_ACCESS_TOKEN` doesn't have access to the target repository
- Repository is private and token lacks `repo` scope

**Resolution:**

1. Verify token has `repo` scope
2. Ensure token owner has access to the target repository
3. For organization repos, check organization token policies

---

For additional help, see:

- [User Guide](user-guide.md) - How to use Regent effectively
- [Troubleshooting Guide](troubleshooting.md) - Common issues and solutions
- [Architecture Decision Records](adr/) - Design decisions and rationale
