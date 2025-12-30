#!/bin/bash
# ABOUTME: Initializes the environment for /regent:execute-epic command.
# ABOUTME: Handles all mechanical setup for autonomous epic execution.

set -e

EPIC_ARG=$1
DRY_RUN=""
if [ "$2" = "--dry-run" ]; then
  DRY_RUN="true"
fi

if [ -z "$EPIC_ARG" ]; then
  echo "ERROR: Usage: init-execute-epic.sh <epic-number> [--dry-run]" >&2
  exit 1
fi

# Parse epic number from argument (handles both number and URL)
if [[ "$EPIC_ARG" =~ ^[0-9]+$ ]]; then
  EPIC_NUM="$EPIC_ARG"
elif [[ "$EPIC_ARG" =~ /issues/([0-9]+) ]]; then
  EPIC_NUM="${BASH_REMATCH[1]}"
else
  echo "ERROR: Invalid epic argument. Provide epic number or GitHub URL." >&2
  exit 1
fi

# Get repository info
REPO_INFO=$(gh repo view --json owner,name --jq '"\(.owner.login)/\(.name)"')
OWNER="${REPO_INFO%/*}"
REPO="${REPO_INFO#*/}"
DEFAULT_BRANCH=$(gh repo view --json defaultBranchRef --jq '.defaultBranchRef.name')

# ============================================================================
# PHASE 1: Validate Epic and Extract Spec Name
# ============================================================================

EPIC_DATA=$(gh issue view "$EPIC_NUM" --json title,labels,state 2>/dev/null) || {
  echo "ERROR: Issue #$EPIC_NUM not found" >&2
  exit 1
}

EPIC_TITLE=$(echo "$EPIC_DATA" | jq -r '.title')
EPIC_STATE=$(echo "$EPIC_DATA" | jq -r '.state')
HAS_EPIC_LABEL=$(echo "$EPIC_DATA" | jq -r '.labels[].name | select(. == "regent:epic")' | head -1)

if [ -z "$HAS_EPIC_LABEL" ]; then
  echo "ERROR: Issue #$EPIC_NUM is not a Regent Epic (missing regent:epic label)" >&2
  exit 1
fi

# Extract spec name from title (remove "Epic: " or "[Epic] " prefix, convert to kebab-case)
SPEC_NAME=$(echo "$EPIC_TITLE" | sed 's/^Epic: //;s/^\[Epic\] //' | tr '[:upper:]' '[:lower:]' | tr ' ' '-')

SPEC_DIR=".regent/$SPEC_NAME"
BRIEFS_DIR="$SPEC_DIR/briefs"

# ============================================================================
# PHASE 2: Download Specs from Epic
# ============================================================================

EPIC_OUTPUT=$(plugin/scripts/fetch-epic-specs.sh "$EPIC_NUM" 2>&1) || {
  echo "ERROR: Failed to fetch specs from Epic #$EPIC_NUM: $EPIC_OUTPUT" >&2
  exit 1
}

# Parse the output from fetch-epic-specs.sh
eval "$EPIC_OUTPUT"

# Create briefs directory
mkdir -p "$BRIEFS_DIR"

# ============================================================================
# PHASE 3: Fetch Sub-Issues (Ordered)
# ============================================================================

# Use GraphQL to get sub-issues in priority order
SUBISSUES_JSON=$(gh api graphql -f query='
  query($owner: String!, $repo: String!, $epicNumber: Int!) {
    repository(owner: $owner, name: $repo) {
      issue(number: $epicNumber) {
        subIssues(first: 100) {
          nodes {
            number
            title
            state
          }
        }
      }
    }
  }
' -f owner="$OWNER" -f repo="$REPO" -F epicNumber="$EPIC_NUM" 2>/dev/null) || {
  # Fallback to label-based query if GraphQL fails (sub-issues API may not be available)
  echo "WARNING: GraphQL sub-issues query failed, falling back to label-based search" >&2
  SUBISSUES_JSON=""
}

# Write issues to file in spec directory (sandbox-safe)
ISSUES_FILE="$SPEC_DIR/epic-issues.json"

if [ -n "$SUBISSUES_JSON" ]; then
  # Parse GraphQL response
  echo "$SUBISSUES_JSON" | jq '[.data.repository.issue.subIssues.nodes[] | {number, title, state}]' > "$ISSUES_FILE"
else
  # Fallback: use label-based search (already fetched by fetch-epic-specs.sh)
  if [ -n "$CHILD_ISSUES_FILE" ] && [ -f "$CHILD_ISSUES_FILE" ]; then
    jq '[.[] | {number, title, state}]' "$CHILD_ISSUES_FILE" > "$ISSUES_FILE"
  else
    echo "ERROR: Could not fetch sub-issues for Epic #$EPIC_NUM" >&2
    exit 1
  fi
fi

# Count issues
TOTAL_ISSUES=$(jq 'length' "$ISSUES_FILE")
OPEN_ISSUES=$(jq '[.[] | select(.state == "OPEN")] | length' "$ISSUES_FILE")
CLOSED_ISSUES=$(jq '[.[] | select(.state == "CLOSED")] | length' "$ISSUES_FILE")

if [ "$TOTAL_ISSUES" -eq 0 ]; then
  echo "ERROR: No sub-issues found for Epic #$EPIC_NUM. Run /regent:plan --epic $EPIC_NUM first." >&2
  exit 1
fi

if [ "$OPEN_ISSUES" -eq 0 ]; then
  echo "INFO: All $TOTAL_ISSUES issues are already closed for Epic #$EPIC_NUM." >&2
  # Still continue - Phase 8 can create PR if needed
fi

# ============================================================================
# PHASE 4: Check Progress File (Resume Support)
# ============================================================================

PROGRESS_FILE="$SPEC_DIR/epic-progress.json"
RESUME_FROM=""
RESUME_PHASE=""

if [ -f "$PROGRESS_FILE" ]; then
  # Find first incomplete issue
  RESUME_FROM=$(jq -r '
    .issues | to_entries |
    map(select(.value.status == "in_progress")) |
    first | .key // empty
  ' "$PROGRESS_FILE")

  if [ -n "$RESUME_FROM" ]; then
    RESUME_PHASE=$(jq -r ".issues[\"$RESUME_FROM\"].phase // \"exploring\"" "$PROGRESS_FILE")
  fi
fi

# ============================================================================
# PHASE 5: Feature Branch Setup (if not dry-run)
# ============================================================================

FEATURE_BRANCH="feature/$SPEC_NAME"
BRANCH_ACTION=""
STASHED="false"

if [ "$DRY_RUN" != "true" ]; then
  CURRENT_BRANCH=$(git branch --show-current)
  GIT_STATUS=$(git status --porcelain)

  # Check if we need to stash
  if [ -n "$GIT_STATUS" ]; then
    git stash push -m "WIP: Local changes before epic $EPIC_NUM" >/dev/null 2>&1
    STASHED="true"
  fi

  # Fetch latest
  git fetch origin >/dev/null 2>&1

  # Handle branch setup
  if [ "$CURRENT_BRANCH" = "$FEATURE_BRANCH" ]; then
    git pull origin "$FEATURE_BRANCH" >/dev/null 2>&1 || true
    BRANCH_ACTION="already_on"
  elif git show-ref --verify --quiet "refs/remotes/origin/$FEATURE_BRANCH"; then
    git checkout "$FEATURE_BRANCH" >/dev/null 2>&1
    git pull origin "$FEATURE_BRANCH" >/dev/null 2>&1
    BRANCH_ACTION="switched"
  else
    git checkout -b "$FEATURE_BRANCH" "origin/$DEFAULT_BRANCH" >/dev/null 2>&1
    git push -u origin "$FEATURE_BRANCH" >/dev/null 2>&1
    BRANCH_ACTION="created"
  fi
else
  BRANCH_ACTION="dry_run"
fi

# ============================================================================
# OUTPUT: Structured data for Claude to consume
# ============================================================================

if [ "$DRY_RUN" = "true" ]; then
  # Dry run output - show what would execute
  cat <<EOF
# Regent Execute-Epic: Dry Run

## Epic Context
EPIC_NUM="$EPIC_NUM"
EPIC_TITLE="$EPIC_TITLE"
EPIC_STATE="$EPIC_STATE"
SPEC_NAME="$SPEC_NAME"
DRY_RUN="true"

## Issues Summary
TOTAL_ISSUES="$TOTAL_ISSUES"
OPEN_ISSUES="$OPEN_ISSUES"
CLOSED_ISSUES="$CLOSED_ISSUES"

## Would Execute (in order):
$(jq -r '.[] | select(.state == "OPEN") | "- #\(.number): \(.title)"' "$ISSUES_FILE")

## Specs Available
- brainstorm.md: $([ -f "$SPEC_DIR/brainstorm.md" ] && echo "yes" || echo "no")
- requirements.md: $([ -f "$SPEC_DIR/requirements.md" ] && echo "yes" || echo "no")
- design.md: $([ -f "$SPEC_DIR/design.md" ] && echo "yes" || echo "no")

## Branch
Would use: $FEATURE_BRANCH

---
Run without --dry-run to execute.
EOF
else
  # Full execution output
  cat <<EOF
# Regent Execute-Epic Initialization Complete

## Epic Context
EPIC_NUM="$EPIC_NUM"
EPIC_TITLE="$EPIC_TITLE"
EPIC_STATE="$EPIC_STATE"
SPEC_NAME="$SPEC_NAME"
SPEC_DIR="$SPEC_DIR"
BRIEFS_DIR="$BRIEFS_DIR"
DRY_RUN="false"

## Spec Hash
SPEC_HASH="$SPEC_HASH"

## Issues
TOTAL_ISSUES="$TOTAL_ISSUES"
OPEN_ISSUES="$OPEN_ISSUES"
CLOSED_ISSUES="$CLOSED_ISSUES"
ISSUES_FILE="$ISSUES_FILE"

## Progress
PROGRESS_FILE="$PROGRESS_FILE"
RESUME_FROM="$RESUME_FROM"
RESUME_PHASE="$RESUME_PHASE"

## Git Context
BRANCH="$FEATURE_BRANCH"
BRANCH_ACTION="$BRANCH_ACTION"
STASHED="$STASHED"
DEFAULT_BRANCH="$DEFAULT_BRANCH"

## Repository
OWNER="$OWNER"
REPO="$REPO"

## Files to Read
- Issues list: $ISSUES_FILE
- Specs: $SPEC_DIR/requirements.md, $SPEC_DIR/design.md, $SPEC_DIR/brainstorm.md
$([ -n "$RESUME_FROM" ] && echo "- Progress: $PROGRESS_FILE (resuming from #$RESUME_FROM)")
EOF
fi
