# Refactor Brief: Epic-Based Spec Storage

## Problem Statement

The current Regent Slack Bot design stores spec documents (brainstorm.md, requirements.md, design.md) by committing them to the repository via PR creation. This requires the GitHub PAT to have full `repo` write access, which:

1. **Increases security risk** - A compromised token has write access to the entire codebase
2. **Creates friction** - Organizations are hesitant to grant bots write access to repos
3. **Blurs responsibility** - Bot creates branches/PRs, mixing bot commits with developer commits

## Goals

1. **Reduce permission scope** - Bot needs only `repo:read` + `issues:write` instead of full `repo` write
2. **Cleaner ownership model** - Bot manages specs and issues; developers manage code and PRs
3. **Maintain traceability** - Specs remain linked to implementation via Epic → child issues → task briefs
4. **Support pivots** - Allow specs to evolve mid-implementation with human-in-the-loop reconciliation

## Solution Overview

Store finalized spec documents as comments on the GitHub Epic issue using collapsible `<details>` sections, instead of committing them to the repository via PR.

**Important:** The Slack Canvas remains the working document during active brainstorming. The Epic comment is where the *finalized* spec goes after approval.

**Before (finalization):**
```
User approves in Slack → Bot creates PR with .regent/{spec}/brainstorm.md → Merge to repo
```

**After (finalization):**
```
User approves in Slack → Bot adds brainstorm.md as comment on Epic issue
```

**Storage comparison:**

| Document | During Brainstorm | After Approval |
|----------|-------------------|----------------|
| brainstorm.md | Slack Canvas | Epic Comment 1 |
| requirements.md | - | Epic Comment 2 |
| design.md | - | Epic Comment 3 |
| task briefs | - | .regent/{spec}/briefs/ (committed) |

**Local caching:**
```
.regent/{spec-name}/
├── brainstorm.md    → local cache (NOT committed, downloaded from Epic)
├── requirements.md  → local cache (NOT committed, downloaded from Epic)
├── design.md        → local cache (NOT committed, downloaded from Epic)
└── briefs/task-N.md → committed (birth certificate for code)
```

## Technical Constraints

### GitHub API Limitations

- **No official attachment API** - GitHub has no REST/GraphQL API for uploading file attachments to issues
- **Comment size limit** - 65,536 characters per comment (issue body and comments share this limit)
- **Collapsible sections** - `<details><summary>` tags are officially supported and render correctly

### Spec File Sizes (from current implementation)

| File | Size | % of 65K limit |
|------|------|----------------|
| brainstorm.md | ~25K chars | 38% ✓ |
| requirements.md | ~12K chars | 18% ✓ |
| design.md | ~26K chars | 40% ✓ |

All files fit comfortably within a single comment.

### Demo

Issue #44 demonstrates the Epic structure with collapsible spec comments:
https://github.com/stickystyle/regent/issues/44

## Architecture Decisions

### 1. Source of Truth
**Decision:** GitHub Epic is authoritative for finalized specs

When resuming a Slack session, bot fetches current specs from Epic and acknowledges any direct edits made since last session.

### 2. Canvas Role
**Decision:** Canvas remains the working document during brainstorm

The existing Canvas workflow is unchanged:
- Bot creates Canvas when transitioning to review phase
- Team provides feedback via thread, bot updates Canvas
- Canvas is the collaborative editing surface
- On approval, Canvas content goes to Epic comment (instead of PR)

### 3. Spec Revisions
**Decision:** Edit existing comments

When specs are updated (e.g., during a pivot), edit the existing comment rather than creating new ones. GitHub preserves comment edit history.

### 4. Comment Order
**Decision:** Fixed order - brainstorm → requirements → design

Comments are always created/maintained in this order for consistency.

### 5. Local Caching
**Decision:** Cache in `.regent/{spec}/` but don't commit

Downloaded specs are cached locally for LLM context during execution, but only task briefs are committed.

### 6. Epic Linkage
- `/regent:specify --epic N` and `/regent:design --epic N` - Developer passes Epic number (Slack posts link after brainstorm)
- `/regent:execute-issue N` - Looks up issue's parent to find Epic automatically

### 7. Pivot Handling
**Decision:** Human-in-the-loop reconciliation

When re-planning after a pivot, present analysis and use AskUserQuestion for decisions about what to keep/close/create.

## Workflow: Normal Flow

### Slack Bot (brainstorm phase)

```
/brainstorm --repo owner/repo <idea>
    │
    ├── Session created, codebase explored
    │
    ├── Q&A loop in Slack thread
    │   └── Bot asks questions, team discusses, @regent answers
    │
    ├── At 95% confidence (or @regent ready):
    │   └── Canvas created with draft brainstorm.md  ← UNCHANGED
    │
    ├── Review loop:
    │   └── Team gives feedback via @regent, bot updates Canvas  ← UNCHANGED
    │
    └── On approval (@regent approved):
        ├── Create Epic issue with summary body  ← CHANGED (was: create PR)
        ├── Add brainstorm.md as Comment 1 (collapsible)  ← NEW
        └── Post Epic link to channel  ← CHANGED (was: PR link)
```

### Local Plugin (specify, design, plan)

```
/regent:specify --epic N
    → Downloads brainstorm.md from Epic Comment 1
    → Generates requirements.md
    → Adds/edits Comment 2 on Epic
    → Caches locally in .regent/{spec}/requirements.md (not committed)

/regent:design --epic N
    → Downloads brainstorm.md, requirements.md from Epic
    → Reads local codebase
    → Generates design.md
    → Adds/edits Comment 3 on Epic
    → Caches locally in .regent/{spec}/design.md (not committed)

/regent:plan --epic N
    → Downloads spec files from Epic
    → Generates tasks
    → Creates child issues linked to Epic
    → (no tasks.md file committed)
```

### Local Plugin (execute)

```
/regent:execute-issue N
    → Fetches issue #N from GitHub
    → Looks up parent → finds Epic
    → Downloads spec files from Epic comments to .regent/{spec}/ cache
    → Generates .regent/{spec}/briefs/task-N.md (committed - birth certificate)
    → Developer implements with their own branch/PR
```

## Workflow: Pivot Flow

### Step 1: Update brainstorm (Slack)

Developer returns to the original brainstorm thread:

```
Developer: @regent We need to pivot - [explanation]

Bot: [Fetches current brainstorm.md from Epic - source of truth]

     "I noticed the brainstorm was updated on GitHub since our last session.
      I'll use the current GitHub version as our starting point."

     "Let me ask about the new direction..."

[Q&A continues, Canvas updated]

Developer: @regent approved

Bot: [Edits Comment 1 on Epic with updated brainstorm.md]
```

### Step 2: Re-run specify and design (local)

```
/regent:specify --epic 42   → Downloads updated brainstorm, regenerates requirements, edits Comment 2
/regent:design --epic 42    → Downloads specs, regenerates design, edits Comment 3
```

### Step 3: Re-plan with reconciliation (local)

```
/regent:plan --epic 42

Bot: [Fetches existing child issues from Epic]
     [Generates new task list from updated design]
     [Matches old issues to new tasks using title similarity]

     ═══════════════════════════════════════════════════════════════
                         PLAN RECONCILIATION
     ═══════════════════════════════════════════════════════════════

     ✓ KEEP (completed, still relevant):
       • #101 Initialize Deno project
       • #102 Implement Session model

     → KEEP (open, still relevant):
       • #104 Implement Anthropic client

     ✗ CLOSE AS OBSOLETE:
       • #103 Implement PR creation workflow
         └─ Reason: Replaced by Epic-based storage approach

     + CREATE NEW:
       • Implement Epic comment CRUD
       • Implement local spec caching

     ? NEED YOUR INPUT:
       • #106 "Implement GitHub client"
         └─ Similar to: "Implement GitHub issue API client"
         └─ [k]eep  [u]pdate  [c]lose & recreate

     ═══════════════════════════════════════════════════════════════

     [AskUserQuestion: How to handle #106?]
     [AskUserQuestion: Proceed with plan?]

User: [Selects options]

Bot: Closing #103 with explanation...
     Creating #107: Implement Epic comment CRUD
     Creating #108: Implement local spec caching

     Done. Epic #42 updated.
```

## Implementation Plan

### Phase 1: Update GitHub Integration

**Task: Implement Epic comment CRUD**
- Add `GitHubClient.addIssueComment(owner, repo, issueNumber, body)`
- Add `GitHubClient.updateIssueComment(owner, repo, commentId, body)`
- Add `GitHubClient.getIssueComments(owner, repo, issueNumber)`
- Add `GitHubClient.getIssue(owner, repo, issueNumber)` (for parent lookup)
- Add helper to format spec content with `<details><summary>` wrapper

**Task: Implement spec comment management**
- Add `EpicManager.addSpecComment(epicNumber, specType, content)`
- Add `EpicManager.updateSpecComment(epicNumber, specType, content)`
- Add `EpicManager.getSpecContent(epicNumber, specType)`
- Handle comment ordering (find correct comment by position or marker)

### Phase 2: Update Slack Bot Finalization

**Task: Update approval handler**
- Instead of calling `createPullRequest()`, call Epic creation
- Create Epic issue with summary body
- Add Canvas content as Comment 1 with collapsible wrapper
- Post Epic link to Slack channel (instead of PR link)

**Task: Update session resumption for pivots**
- When resuming Slack thread, fetch current specs from Epic
- Compare to Canvas/Slack-derived content
- Acknowledge any direct GitHub edits before continuing
- After pivot approval, edit existing Comment 1 (not add new)

### Phase 3: Update Local Plugin Commands

**Task: Update /regent:specify**
- Add `--epic N` parameter
- Download brainstorm.md from Epic Comment 1
- Generate requirements.md
- Add/edit Comment 2 on Epic
- Cache locally in `.regent/{spec}/requirements.md`

**Task: Update /regent:design**
- Add `--epic N` parameter
- Download brainstorm.md and requirements.md from Epic
- Generate design.md
- Add/edit Comment 3 on Epic
- Cache locally in `.regent/{spec}/design.md`

**Task: Update /regent:plan**
- Add `--epic N` parameter
- Download specs from Epic
- Generate tasks
- Create child issues linked to Epic
- Remove tasks.md file creation

**Task: Update /regent:execute-issue**
- Look up issue's parent Epic
- Download spec files from Epic to local cache
- Generate task brief (still committed)
- Remove dependency on local spec files already existing

### Phase 4: Implement Pivot Reconciliation

**Task: Implement task matching**
- Fetch existing child issues from Epic
- Parse new task list from design
- Match using title similarity (fuzzy matching)
- Categorize: KEEP/CLOSE/CREATE/UNCERTAIN

**Task: Implement reconciliation UI**
- Present analysis as markdown table
- Use AskUserQuestion for uncertain matches
- Use AskUserQuestion for final confirmation

**Task: Implement reconciliation execution**
- Close obsolete issues with explanation comment linking to pivot
- Create new issues linked to Epic
- Update issue descriptions if requested

### Phase 5: Cleanup

**Task: Remove PR creation workflow**
- Remove or deprecate `GitHubClient.createPullRequest`
- Update/remove PR-related tests
- Update documentation

**Task: Update .gitignore**
- Add `.regent/*/brainstorm.md`
- Add `.regent/*/requirements.md`
- Add `.regent/*/design.md`
- Keep `.regent/*/briefs/*.md` tracked

## Files to Modify

### Slack Bot (slackbot/)
- `src/integrations/github.ts` - Add comment CRUD methods
- `src/services/finalization.ts` (or equivalent) - Change from PR to Epic comment
- `src/handlers/session.ts` - Update resumption to fetch from Epic for pivots
- New: `src/services/epic-manager.ts` - Epic comment management

### Plugin (plugin/)
- `commands/regent-specify.md` - Add --epic parameter, Epic integration
- `commands/regent-design.md` - Add --epic parameter, Epic integration
- `commands/regent-plan.md` - Add --epic parameter, reconciliation flow
- `commands/regent-execute-issue.md` - Update to fetch from Epic

### Configuration
- `.gitignore` - Exclude cached spec files, keep briefs

### Tests
- Add tests for Epic comment CRUD
- Add tests for spec comment management
- Add tests for reconciliation matching
- Add tests for pivot workflow
- Update existing tests that expect PR creation

## Migration Notes

### For Existing Epic #42 (Slack Bot implementation)

1. Current state: Tasks 1-13 completed, PR creation workflow implemented
2. This refactor replaces the PR creation (task 13) with Epic comment storage
3. Need to close/repurpose issue #28 (PR creation workflow)
4. Create new issues for Epic comment management tasks

### Backwards Compatibility

- Existing `.regent/` directories with committed specs continue to work for local-only workflow
- New Epic workflow only applies when `--epic` parameter is used
- Teams can adopt Epic storage incrementally

## Success Criteria

- [ ] Canvas still used during brainstorm review phase (unchanged)
- [ ] On approval, bot creates Epic with spec as collapsible comment (not PR)
- [ ] Slack posts Epic link (not PR link) after approval
- [ ] Local commands can read/write specs to Epic comments via --epic flag
- [ ] Task briefs still committed to repo (birth certificates)
- [ ] Pivot workflow fetches current spec from Epic before continuing
- [ ] Re-plan presents reconciliation with human confirmation via AskUserQuestion
- [ ] Bot PAT only requires `repo:read` + `issues:write`
- [ ] Demo Issue #44 structure matches production output

## References

- Session notes: `session_epic-spec-storage_20251223.md`
- Demo Epic: https://github.com/stickystyle/regent/issues/44
- Current Epic: https://github.com/stickystyle/regent/issues/42
