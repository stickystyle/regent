#!/bin/bash
# ABOUTME: Fetches Epic specs and child issues from GitHub in minimal API calls.
# ABOUTME: Used by /regent:plan --epic N to efficiently download all spec data.

set -e

EPIC_NUM=$1
if [ -z "$EPIC_NUM" ]; then
  echo "ERROR: Usage: fetch-epic-specs.sh <epic-number>" >&2
  exit 1
fi

# Get repository info
REPO_INFO=$(gh repo view --json owner,name --jq '"\(.owner.login)/\(.name)"')
OWNER="${REPO_INFO%/*}"
REPO="${REPO_INFO#*/}"

# Validate Epic exists and has regent:epic label
EPIC_DATA=$(gh issue view "$EPIC_NUM" --json title,labels 2>/dev/null) || {
  echo "ERROR: Issue #$EPIC_NUM not found" >&2
  exit 1
}

TITLE=$(echo "$EPIC_DATA" | jq -r '.title')
HAS_LABEL=$(echo "$EPIC_DATA" | jq -r '.labels[].name | select(. == "regent:epic")' | head -1)

if [ -z "$HAS_LABEL" ]; then
  echo "ERROR: Issue #$EPIC_NUM is not a Regent Epic (missing regent:epic label)" >&2
  exit 1
fi

# Extract spec name from title (remove "Epic: " or "[Epic] " prefix, convert to kebab-case)
SPEC_NAME=$(echo "$TITLE" | sed 's/^Epic: //;s/^\[Epic\] //' | tr '[:upper:]' '[:lower:]' | tr ' ' '-')

# Create spec directory
SPECS_DIR=".regent/$SPEC_NAME"
mkdir -p "$SPECS_DIR"

# Fetch ALL comments in ONE API call (with pagination for large epics)
COMMENTS=$(gh api "repos/$OWNER/$REPO/issues/$EPIC_NUM/comments" --paginate)

# Extract and write each spec type
FOUND_BRAINSTORM=""
FOUND_REQUIREMENTS=""
FOUND_DESIGN=""

for SPEC_TYPE in brainstorm requirements design; do
  # Extract content from comment, removing the wrapper
  CONTENT=$(echo "$COMMENTS" | jq -r --arg type "$SPEC_TYPE" \
    '[.[] | select(.body | test("REGENT_SPEC:" + $type))] | first | .body // empty' | \
    awk '/<\/summary>/{found=1; next} /<\/details>/{found=0} found')

  if [ -n "$CONTENT" ]; then
    echo "$CONTENT" > "$SPECS_DIR/$SPEC_TYPE.md"
    case "$SPEC_TYPE" in
      brainstorm) FOUND_BRAINSTORM="true" ;;
      requirements) FOUND_REQUIREMENTS="true" ;;
      design) FOUND_DESIGN="true" ;;
    esac
  fi
done

# Validate required specs exist
if [ -z "$FOUND_REQUIREMENTS" ]; then
  echo "ERROR: Requirements spec not found on Epic #$EPIC_NUM. Run /regent:specify --epic $EPIC_NUM first." >&2
  exit 1
fi

if [ -z "$FOUND_DESIGN" ]; then
  echo "ERROR: Design spec not found on Epic #$EPIC_NUM. Run /regent:design --epic $EPIC_NUM first." >&2
  exit 1
fi

# Fetch child issues in ONE API call
CHILD_ISSUES_FILE=$(mktemp)
gh issue list --label "spec:$SPEC_NAME" --label "regent" --state all \
  --json number,title,state,body,labels --limit 200 | \
  jq '[.[] | select(.labels | map(.name) | index("regent:epic") | not)]' > "$CHILD_ISSUES_FILE"

CHILD_COUNT=$(jq 'length' "$CHILD_ISSUES_FILE")

# Output structured data for sourcing
cat <<EOF
SPEC_NAME="$SPEC_NAME"
EPIC_NUM="$EPIC_NUM"
OWNER="$OWNER"
REPO="$REPO"
SPECS_DIR="$SPECS_DIR"
CHILD_ISSUES_FILE="$CHILD_ISSUES_FILE"
CHILD_COUNT="$CHILD_COUNT"
FOUND_BRAINSTORM="$FOUND_BRAINSTORM"
FOUND_REQUIREMENTS="$FOUND_REQUIREMENTS"
FOUND_DESIGN="$FOUND_DESIGN"
EOF
