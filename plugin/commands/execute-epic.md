---
description: Autonomously execute all tasks in a GitHub epic
---

# Execute Epic

Autonomous serial execution of all tasks in a GitHub epic. Designed for overnight unattended runs with `--dangerously-skip-permissions`.

## Usage

```
/regent-execute-epic {epic-number}
/regent-execute-epic {epic-url}
/regent-execute-epic {epic-number} --dry-run
```

## Phase 0: Initialization

### 0.1 Run Initialization Script

```bash
plugin/scripts/init-execute-epic.sh {epic-number-or-url} [--dry-run]
```

This script handles:
- Validating epic has `regent:epic` label
- Downloading specs from Epic comments
- Fetching ordered sub-issues
- Setting up feature branch
- Checking for existing progress file (resume support)

**If `--dry-run` flag was passed**: Display the dry run output and stop. Do not proceed to Phase 1.

### 0.2 Report Initialization Results

```
Executing Epic #{EPIC_NUM}: {EPIC_TITLE}

Spec: {SPEC_NAME}
Branch: {BRANCH} ({BRANCH_ACTION})
{if STASHED: "Stashed local changes"}

Issues: {OPEN_ISSUES} open / {TOTAL_ISSUES} total
{if RESUME_FROM: "Resuming from: #{RESUME_FROM}"}
```

## Phase 1: Load Progress State

Read the progress file if it exists (`{SPEC_DIR}/epic-progress.json`).

### If resuming:
- Identify the issue marked as `in_progress`
- Report: "Resuming from #{RESUME_FROM} (phase: {RESUME_PHASE})"
- Start the loop from that issue

### If fresh start:
- Create initial progress file:
```json
{
  "epic_number": {EPIC_NUM},
  "started_at": "{ISO_TIMESTAMP}",
  "last_updated": "{ISO_TIMESTAMP}",
  "issues": {},
  "current_issue": null,
  "branch": "{BRANCH}"
}
```

## Phases 2-7: Per-Issue Execution Loop (SPAWN WORKER CLAUDE)

**CRITICAL ARCHITECTURE**: Each issue is executed by a **separate Claude instance** spawned via `claude -p`. This prevents context window overflow during long-running epic execution.

The orchestrator Claude (running this command) only:
- Tracks progress in the JSON file
- Spawns worker processes
- Checks exit status
- Reports results

For each **OPEN** issue in the ordered list from `{ISSUES_FILE}`:

### Before Each Issue

1. Update progress file: mark issue as `in_progress`
2. Report:
```
╔════════════════════════════════════════════════════════════╗
║ Issue #{N}: {title}                                        ║
║ Progress: {completed}/{total} issues                       ║
╚════════════════════════════════════════════════════════════╝

Spawning worker Claude for issue #{N}...
```

### Spawn Worker Claude

Execute the issue using a **fresh Claude instance**:

```bash
claude -p "/regent-execute-issue {issue_number} --auto-confirm" \
  --plugin-dir . \
  --settings ".regent/worker-settings.json" \
  --dangerously-skip-permissions \
  --max-turns 50 \
  --output-format json \
  --no-session-persistence \
  2>&1 | tee "{SPEC_DIR}/worker-{issue_number}.log"
```

**Flags explained:**
- `-p` - Print mode (non-interactive)
- `--plugin-dir .` - Load the regent plugin from current directory
- `--settings` - Load worker-specific sandbox/permission settings (avoids modifying user's settings)
- `--dangerously-skip-permissions` - No permission prompts
- `--max-turns 50` - Limit per-issue work (prevents runaway)
- `--output-format json` - Structured output for parsing
- `--no-session-persistence` - Workers are single-use, skip session file I/O
- `--auto-confirm` - Flag to execute-issue to skip Phase 6.5 human confirmation

**Run in background and poll for completion**:
1. Execute the Bash command with `run_in_background: true` - this returns a task_id immediately
2. Poll with `TaskOutput(task_id, block=true, timeout=600000)` in a loop until status is "completed"
3. If TaskOutput times out (10 min max per call), call it again - the worker keeps running
4. Workers may take 30+ minutes for complex tasks - keep polling until done

### Check Worker Result

Parse the worker's exit status and output from TaskOutput:

```bash
WORKER_EXIT=$?
if [ $WORKER_EXIT -ne 0 ]; then
  # Worker failed
  Update progress: status: "failed", exit_code: $WORKER_EXIT
  Report error from worker log
  STOP - Do not continue to next issue
fi
```

### Verify Issue Was Closed

Double-check the issue state (worker should have closed it):

```bash
ISSUE_STATE=$(gh issue view {issue_number} --json state --jq '.state')
if [ "$ISSUE_STATE" != "CLOSED" ]; then
  # Worker completed but didn't close issue - something went wrong
  Update progress: status: "incomplete"
  Report warning
  STOP - Manual investigation needed
fi
```

### Update Progress

Update progress file:
```json
{
  "issues": {
    "{issue_number}": {
      "status": "completed",
      "completed_at": "{ISO_TIMESTAMP}"
    }
  },
  "current_issue": {next_issue_number_or_null}
}
```

Report:
```
✓ Issue #{N} completed by worker
  Progress: {completed}/{total} issues
```

**Continue to next issue in loop**

---

## Note: execute-issue --auto-confirm Flag

The `/regent-execute-issue` command needs a `--auto-confirm` flag that:
- Skips Phase 6.5 (Human Review)
- Proceeds directly from verification to commit
- Used only when spawned by execute-epic

This flag should be documented in execute-issue.md but implementation is:
- Check if `--auto-confirm` is in arguments
- If yes, skip the "Ready to commit?" prompt in Phase 6.5

## Phase 8: Epic Completion

After all issues are processed (or if all were already closed):

### 8.1 Summary Report

```
╔════════════════════════════════════════════════════════════╗
║ Epic #{EPIC_NUM} Complete!                                 ║
╚════════════════════════════════════════════════════════════╝

Summary:
- {completed}/{total} issues completed this run
- {total_commits} commits on {BRANCH}
- Started: {started_at}
- Finished: {now}
```

### 8.2 Create Pull Request

Check if PR already exists:
```bash
EXISTING_PR=$(gh pr list --head "{BRANCH}" --json number --jq '.[0].number // empty')
```

If no existing PR, create one:
```bash
gh pr create --base {DEFAULT_BRANCH} --head {BRANCH} \
  --title "Epic #{EPIC_NUM}: {EPIC_TITLE}" \
  --body "$(cat <<'EOF'
## Summary

Autonomous implementation of all tasks from Epic #{EPIC_NUM}.

### Completed Issues
{list of closed issues with commit links}

### Commits
{list of commits on this branch}

---
🤖 Generated with [Claude Code](https://claude.com/claude-code) via `/regent:execute-epic`
EOF
)"
```

### 8.3 Final Report

```
Pull Request: #{PR_NUMBER}
URL: {PR_URL}

Epic #{EPIC_NUM} autonomous execution complete.
```

### 8.4 Cleanup (Optional)

The progress file can be left for reference or deleted:
- Keep: Useful for debugging and audit trail
- Delete: Clean state for re-running if needed

## Error Handling

### On Any Failure

1. Update progress file with current state and error
2. Report the error clearly
3. **STOP** - Do not continue to next issue
4. Provide resume instructions:

```
Execution stopped at Issue #{N} (phase: {phase})

Error: {error_message}

To resume after fixing:
  /regent-execute-epic {EPIC_NUM}

The command will automatically resume from Issue #{N}.
```

### Specific Failure Modes

| Failure | Phase State | Resume Behavior |
|---------|-------------|-----------------|
| Init script error | No file | Fresh start |
| Exploration timeout | `exploring` | Re-explore |
| Implementation stuck | `implementing` | Re-explore + implement |
| Code review fail (3x) | `review_failed` | Manual fix, then resume |
| Tests fail | `verification_failed` | Manual fix, then resume |
| Git conflict | `committing` | Resolve conflict, then resume |
| PR creation fail | All `completed` | Manual `gh pr create` |

## Principles

- **Serial execution**: One issue at a time, in order
- **No human checkpoints**: Designed for unattended overnight runs
- **Fail fast**: Stop on first error, preserve state
- **Resumable**: Progress file enables restart from failure point
- **Single PR**: All work collected in one pull request
- **TDD**: Tests first, then implementation
- **Delegated work**: All code changes via specialized subagents

## Prerequisites

For fully autonomous execution:

1. **GitHub CLI**: Authenticated with `gh auth login`
2. **Claude CLI flags**:
   ```bash
   claude -p "/regent-execute-epic 42" \
     --dangerously-skip-permissions \
     --max-turns 100
   ```

## If Unclear

Unlike `/regent-execute-issue`, this command does NOT stop to ask questions. If something is ambiguous:
- Make reasonable assumptions based on existing patterns
- Document assumptions in commit messages
- If truly blocked, fail and preserve state for manual intervention
