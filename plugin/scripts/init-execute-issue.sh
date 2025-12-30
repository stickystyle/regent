#!/bin/bash
# ABOUTME: Initializes the environment for /regent:execute-issue command.
# ABOUTME: Handles all mechanical setup (fetch issue, specs, git branch) before Claude starts.

set -e

ISSUE_ARG=$1
if [ -z "$ISSUE_ARG" ]; then
  echo "ERROR: Usage: init-execute-issue.sh <issue-number|issue-url>" >&2
  exit 1
fi

# Parse issue number from argument (handles both number and URL)
if [[ "$ISSUE_ARG" =~ ^[0-9]+$ ]]; then
  ISSUE_NUM="$ISSUE_ARG"
elif [[ "$ISSUE_ARG" =~ /issues/([0-9]+) ]]; then
  ISSUE_NUM="${BASH_REMATCH[1]}"
else
  echo "ERROR: Invalid issue argument. Provide issue number or GitHub URL." >&2
  exit 1
fi

# Get repository info
REPO_INFO=$(gh repo view --json owner,name --jq '"\(.owner.login)/\(.name)"')
OWNER="${REPO_INFO%/*}"
REPO="${REPO_INFO#*/}"
DEFAULT_BRANCH=$(gh repo view --json defaultBranchRef --jq '.defaultBranchRef.name')

# ============================================================================
# PHASE 1: Fetch Issue Context
# ============================================================================

ISSUE_JSON=$(gh issue view "$ISSUE_NUM" --json number,title,body,labels,comments 2>/dev/null) || {
  echo "ERROR: Issue #$ISSUE_NUM not found" >&2
  exit 1
}

ISSUE_TITLE=$(echo "$ISSUE_JSON" | jq -r '.title')
ISSUE_BODY=$(echo "$ISSUE_JSON" | jq -r '.body')
ISSUE_COMMENTS=$(echo "$ISSUE_JSON" | jq -r '.comments')
HAS_REGENT_LABEL=$(echo "$ISSUE_JSON" | jq -r '.labels[].name | select(. == "regent")' | head -1)

# Extract spec name from labels (find label matching spec:*)
SPEC_NAME=$(echo "$ISSUE_JSON" | jq -r '.labels[] | select(.name | startswith("spec:")) | .name | sub("spec:"; "")' | head -1)

WARNINGS=""
if [ -z "$HAS_REGENT_LABEL" ]; then
  WARNINGS="${WARNINGS}WARNING: Issue #$ISSUE_NUM does not have 'regent' label - may not be a Regent-managed issue.\n"
fi

if [ -z "$SPEC_NAME" ]; then
  echo "ERROR: No spec label found on issue #$ISSUE_NUM. Expected label like 'spec:my-spec-name'" >&2
  exit 1
fi

# ============================================================================
# PHASE 1.5: Epic Detection and Spec Download
# ============================================================================

EPIC_NUM=$(gh issue list --label "regent:epic" --label "spec:${SPEC_NAME}" \
  --json number --jq '.[0].number' 2>/dev/null || echo "")

SPEC_DIR=".regent/$SPEC_NAME"
BRIEFS_DIR="$SPEC_DIR/briefs"

if [ -n "$EPIC_NUM" ]; then
  # Download specs from Epic
  EPIC_OUTPUT=$(plugin/scripts/fetch-epic-specs.sh "$EPIC_NUM" 2>&1) || {
    echo "ERROR: Failed to fetch specs from Epic #$EPIC_NUM: $EPIC_OUTPUT" >&2
    exit 1
  }

  # Parse the output from fetch-epic-specs.sh
  eval "$EPIC_OUTPUT"

  EPIC_STATUS="downloaded"
else
  EPIC_STATUS="not_found"
  WARNINGS="${WARNINGS}WARNING: Could not find parent Epic for spec '${SPEC_NAME}'. Specs may not be available locally.\n"

  # Create spec directory anyway
  mkdir -p "$SPEC_DIR"
fi

# Create briefs directory
mkdir -p "$BRIEFS_DIR"

# ============================================================================
# PHASE 1.6: Validate Spec Hash
# ============================================================================

STORED_HASH=$(echo "$ISSUE_BODY" | grep -o '<!-- REGENT_SPEC_HASH:[a-f0-9]\{12\} -->' | \
  sed 's/<!-- REGENT_SPEC_HASH://;s/ -->//' || echo "")
STORED_TIMESTAMPS=$(echo "$ISSUE_BODY" | grep -o '<!-- REGENT_SPEC_TIMESTAMPS:[^>]*-->' | \
  sed 's/<!-- REGENT_SPEC_TIMESTAMPS://;s/ -->//' || echo "")

if [ -z "$STORED_HASH" ]; then
  HASH_STATUS="missing"
  HASH_MESSAGE="No spec hash found in issue #$ISSUE_NUM. Validation skipped. (older issue)"
elif [ "$STORED_HASH" = "$SPEC_HASH" ]; then
  HASH_STATUS="valid"
  HASH_MESSAGE="Spec hash verified. Specs unchanged since issue creation."
else
  HASH_STATUS="mismatch"
  HASH_MESSAGE="Spec documents have changed since issue #$ISSUE_NUM was created."

  # Parse stored timestamps to identify which specs changed
  CHANGED_SPECS=""
  if [ -n "$STORED_TIMESTAMPS" ]; then
    # Parse format: brainstorm={ts},design={ts},requirements={ts}
    STORED_BRAINSTORM=$(echo "$STORED_TIMESTAMPS" | grep -o 'brainstorm=[^,]*' | cut -d= -f2 || echo "")
    STORED_DESIGN=$(echo "$STORED_TIMESTAMPS" | grep -o 'design=[^,]*' | cut -d= -f2 || echo "")
    STORED_REQUIREMENTS=$(echo "$STORED_TIMESTAMPS" | grep -o 'requirements=[^,]*' | cut -d= -f2 || echo "")

    if [ "$STORED_BRAINSTORM" != "$BRAINSTORM_UPDATED_AT" ] && [ -n "$BRAINSTORM_UPDATED_AT" ]; then
      CHANGED_SPECS="${CHANGED_SPECS}brainstorm: $STORED_BRAINSTORM → $BRAINSTORM_UPDATED_AT\n"
    fi
    if [ "$STORED_DESIGN" != "$DESIGN_UPDATED_AT" ] && [ -n "$DESIGN_UPDATED_AT" ]; then
      CHANGED_SPECS="${CHANGED_SPECS}design: $STORED_DESIGN → $DESIGN_UPDATED_AT\n"
    fi
    if [ "$STORED_REQUIREMENTS" != "$REQUIREMENTS_UPDATED_AT" ] && [ -n "$REQUIREMENTS_UPDATED_AT" ]; then
      CHANGED_SPECS="${CHANGED_SPECS}requirements: $STORED_REQUIREMENTS → $REQUIREMENTS_UPDATED_AT\n"
    fi
  fi
fi

# ============================================================================
# PHASE 2: Feature Branch Setup
# ============================================================================

FEATURE_BRANCH="feature/$SPEC_NAME"
CURRENT_BRANCH=$(git branch --show-current)
GIT_STATUS=$(git status --porcelain)
STASHED="false"
BRANCH_ACTION=""

# Check if we need to stash
if [ -n "$GIT_STATUS" ]; then
  git stash push -m "WIP: Local changes before task $ISSUE_NUM" >/dev/null 2>&1
  STASHED="true"
fi

# Fetch latest
git fetch origin >/dev/null 2>&1

# Handle branch setup
if [ "$CURRENT_BRANCH" = "$FEATURE_BRANCH" ]; then
  # Already on the right branch, just pull
  git pull origin "$FEATURE_BRANCH" >/dev/null 2>&1 || true
  BRANCH_ACTION="already_on"
elif git show-ref --verify --quiet "refs/remotes/origin/$FEATURE_BRANCH"; then
  # Feature branch exists remotely, check it out
  git checkout "$FEATURE_BRANCH" >/dev/null 2>&1
  git pull origin "$FEATURE_BRANCH" >/dev/null 2>&1
  BRANCH_ACTION="switched"
else
  # First task for this spec - create feature branch from default branch
  git checkout -b "$FEATURE_BRANCH" "origin/$DEFAULT_BRANCH" >/dev/null 2>&1
  git push -u origin "$FEATURE_BRANCH" >/dev/null 2>&1
  BRANCH_ACTION="created"
fi

# ============================================================================
# OUTPUT: Structured data for Claude to consume
# ============================================================================

# Create a temp file with the issue body for easy reading
ISSUE_BODY_FILE=$(mktemp)
echo "$ISSUE_BODY" > "$ISSUE_BODY_FILE"

# Create a temp file with comments JSON
COMMENTS_FILE=$(mktemp)
echo "$ISSUE_COMMENTS" > "$COMMENTS_FILE"

cat <<EOF
# Regent Execute-Issue Initialization Complete

## Issue Context
ISSUE_NUM="$ISSUE_NUM"
ISSUE_TITLE="$ISSUE_TITLE"
ISSUE_BODY_FILE="$ISSUE_BODY_FILE"
COMMENTS_FILE="$COMMENTS_FILE"
HAS_REGENT_LABEL="$HAS_REGENT_LABEL"

## Spec Context
SPEC_NAME="$SPEC_NAME"
SPEC_DIR="$SPEC_DIR"
BRIEFS_DIR="$BRIEFS_DIR"
EPIC_NUM="$EPIC_NUM"
EPIC_STATUS="$EPIC_STATUS"

## Spec Hash Validation
HASH_STATUS="$HASH_STATUS"
HASH_MESSAGE="$HASH_MESSAGE"
STORED_HASH="$STORED_HASH"
CURRENT_HASH="${SPEC_HASH:-}"
$([ -n "$CHANGED_SPECS" ] && echo -e "CHANGED_SPECS:\n$CHANGED_SPECS")

## Git Context
BRANCH="$FEATURE_BRANCH"
BRANCH_ACTION="$BRANCH_ACTION"
STASHED="$STASHED"
DEFAULT_BRANCH="$DEFAULT_BRANCH"

## Repository
OWNER="$OWNER"
REPO="$REPO"

$([ -n "$WARNINGS" ] && echo -e "## Warnings\n$WARNINGS")

## Files to Read
- Issue body: $ISSUE_BODY_FILE
- Comments: $COMMENTS_FILE
- Specs: $SPEC_DIR/requirements.md, $SPEC_DIR/design.md, $SPEC_DIR/brainstorm.md
EOF
