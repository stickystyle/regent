# Session 2: Plugin Epic Integration & Session Resumption

## Problem Background

The current Regent Slack Bot design stores spec documents (brainstorm.md, requirements.md, design.md) by committing them to the repository via PR creation. This requires the GitHub PAT to have full `repo` write access, which:

1. **Increases security risk** - A compromised token has write access to the entire codebase
2. **Creates friction** - Organizations are hesitant to grant bots write access to repos
3. **Blurs responsibility** - Bot creates branches/PRs, mixing bot commits with developer commits

### Solution Overview

Store finalized spec documents as comments on a GitHub Epic issue using collapsible `<details>` sections. The Slack Canvas remains the working document during brainstorming; the Epic comment is where the *finalized* spec goes after approval.

**Storage Model:**

| Document | During Brainstorm | After Approval |
|----------|-------------------|----------------|
| brainstorm.md | Slack Canvas | Epic Comment 1 |
| requirements.md | - | Epic Comment 2 |
| design.md | - | Epic Comment 3 |
| task briefs | - | `.regent/{spec}/briefs/` (committed) |

**Local Caching:**
```
.regent/{spec-name}/
├── brainstorm.md    → local cache (NOT committed, downloaded from Epic)
├── requirements.md  → local cache (NOT committed, downloaded from Epic)
├── design.md        → local cache (NOT committed, downloaded from Epic)
└── briefs/task-N.md → committed (birth certificate for code)
```

---

## Session Goals

1. Add `--epic N` parameter to plugin commands (`/regent:specify`, `/regent:design`, `/regent:plan`)
2. Implement spec download from Epic comments
3. Implement spec upload to Epic comments
4. Update session resumption to fetch current specs from Epic for pivots
5. Local caching of downloaded specs (not committed)

---

## Prerequisites (Session 1 Completed)

**Session 1 delivered:**
- ✅ GitHubClient extended with comment CRUD methods:
  - `createIssue()`, `getIssue()`
  - `getIssueComments()`, `createIssueComment()`, `updateIssueComment()`
- ✅ EpicManager service for spec comment management:
  - `createEpic()`, `addSpecComment()`, `updateSpecComment()`
  - `getSpecContent()`, `getSpecComments()`
- ✅ Finalization handler creates Epic + comment on `@regent approved`
- ✅ Epic URL posted to Slack after approval
- ✅ Comment format with `<!-- REGENT_SPEC:{type} -->` markers

**Key files from Session 1:**
```
slackbot/src/clients/github-client.ts    # Comment CRUD methods
slackbot/src/managers/epic-manager.ts    # Spec comment management
slackbot/src/handlers/finalization-handler.ts
```

---

## Codebase Context for Planning

### Plugin Architecture

The plugin is defined in `.claude-plugin/plugin.json` which references:
- `plugin/commands/` - Markdown files with command definitions
- `plugin/agents/` - Markdown files with agent definitions

**Commands are markdown files** with frontmatter:
```yaml
---
description: Short description
---

# Command prompt content...
```

### Plugin Command Files to Modify

```
plugin/
├── commands/
│   ├── regent-specify.md    # MODIFY: Add --epic parameter
│   ├── regent-design.md     # MODIFY: Add --epic parameter
│   ├── regent-plan.md       # MODIFY: Add --epic parameter
│   └── regent-execute-issue.md  # MODIFY: Download specs from Epic
```

### Slackbot Files for Session Resumption

```
slackbot/
├── src/
│   ├── managers/
│   │   ├── session-manager.ts   # MODIFY: Pivot resumption
│   │   └── epic-manager.ts      # READ: Use getSpecContent()
│   └── handlers/
│       └── message-event.ts     # MODIFY: Pivot detection
```

### Current Plugin Command Flow

```
/regent:specify → reads brainstorm.md from local → generates requirements.md → writes local
/regent:design  → reads brainstorm.md + requirements.md → generates design.md → writes local
/regent:plan    → reads design.md → generates tasks.md → writes local
```

### Target Plugin Command Flow (with --epic)

```
/regent:specify --epic N → downloads brainstorm.md from Epic → generates requirements.md → uploads to Epic → caches local
/regent:design --epic N  → downloads brainstorm.md + requirements.md from Epic → generates design.md → uploads to Epic → caches local
/regent:plan --epic N    → downloads specs from Epic → generates tasks → creates child issues → links to Epic
```

### Epic Linkage Strategy

- `/regent:specify --epic N` and `/regent:design --epic N` - Developer passes Epic number (Slack posts link after brainstorm)
- `/regent:execute-issue N` - Looks up issue's parent to find Epic automatically

---

## Task List

### Task 1: Update /regent:specify Command

**Goal:** Add `--epic N` parameter to download brainstorm from Epic and upload requirements to Epic.

**Files:**
- `plugin/commands/regent-specify.md`

**Flow:**
1. Parse `--epic N` from command arguments
2. If `--epic` provided:
   - Use GitHub API to download brainstorm.md from Epic comment
   - Cache locally in `.regent/{spec-name}/brainstorm.md`
3. Generate requirements.md using existing flow
4. If `--epic` provided:
   - Upload requirements.md to Epic as Comment 2
   - Cache locally in `.regent/{spec-name}/requirements.md`
5. If no `--epic`:
   - Use existing local file flow (backwards compatible)

**Command Syntax:**
```bash
/regent:specify                    # Local mode (existing)
/regent:specify --epic 42          # Epic mode (new)
/regent:specify --epic 42 --spec user-auth  # With explicit spec name
```

**Acceptance Criteria:**
- [ ] `--epic N` parameter parsed correctly
- [ ] Downloads brainstorm.md from Epic Comment 1
- [ ] Generates requirements.md
- [ ] Uploads requirements.md to Epic as Comment 2 (or edits if exists)
- [ ] Caches specs locally in `.regent/{spec-name}/`
- [ ] Without `--epic`, uses existing local flow
- [ ] Spec name derived from Epic title if not provided

---

### Task 2: Update /regent:design Command

**Goal:** Add `--epic N` parameter to download specs from Epic and upload design to Epic.

**Files:**
- `plugin/commands/regent-design.md`

**Flow:**
1. Parse `--epic N` from command arguments
2. If `--epic` provided:
   - Download brainstorm.md from Epic Comment 1
   - Download requirements.md from Epic Comment 2
   - Cache both locally
3. Generate design.md using existing flow
4. If `--epic` provided:
   - Upload design.md to Epic as Comment 3
   - Cache locally
5. If no `--epic`:
   - Use existing local file flow

**Acceptance Criteria:**
- [ ] `--epic N` parameter parsed correctly
- [ ] Downloads brainstorm.md and requirements.md from Epic
- [ ] Generates design.md
- [ ] Uploads design.md to Epic as Comment 3 (or edits if exists)
- [ ] Caches specs locally
- [ ] Without `--epic`, uses existing local flow

---

### Task 3: Update /regent:plan Command

**Goal:** Add `--epic N` parameter to download specs and create child issues linked to Epic.

**Files:**
- `plugin/commands/regent-plan.md`

**Flow:**
1. Parse `--epic N` from command arguments
2. If `--epic` provided:
   - Download all specs from Epic comments
   - Cache locally
3. Generate task list from design.md
4. If `--epic` provided:
   - Create child issues for each task, linked to Epic
   - Do NOT create tasks.md file
5. If no `--epic`:
   - Create tasks.md file locally (existing behavior)

**Child Issue Format:**
```markdown
Title: Task N: {task title}
Body:
Parent Epic: #{epic_number}

## Task Description
{task description from design}

## Acceptance Criteria
{criteria from design}
```

**Acceptance Criteria:**
- [ ] `--epic N` parameter parsed correctly
- [ ] Downloads specs from Epic
- [ ] Generates task list
- [ ] Creates child issues linked to Epic
- [ ] Child issues reference parent Epic in body
- [ ] Does NOT create tasks.md when using `--epic`
- [ ] Without `--epic`, creates tasks.md (existing behavior)

---

### Task 4: Update /regent:execute-issue Command

**Goal:** Automatically find parent Epic and download specs before executing.

**Files:**
- `plugin/commands/regent-execute-issue.md`

**Flow:**
1. Fetch issue #N from GitHub
2. Parse issue body to find parent Epic reference
3. Download spec files from Epic comments to local cache
4. Generate task brief in `.regent/{spec-name}/briefs/task-N.md` (committed)
5. Execute task using existing flow

**Parent Detection:**
- Look for `Parent Epic: #N` in issue body
- Or use GitHub's "tracked by" relationship if available

**Acceptance Criteria:**
- [ ] Fetches issue from GitHub
- [ ] Finds parent Epic from issue body
- [ ] Downloads spec files from Epic to local cache
- [ ] Generates task brief (still committed - "birth certificate")
- [ ] Executes task with full spec context
- [ ] Works without local spec files pre-existing

---

### Task 5: Implement Local Spec Caching

**Goal:** Utility functions for caching downloaded specs locally.

**Files:**
- Create utility in plugin command or shared location

**Functions Needed:**
```
cacheSpec(specName, specType, content) → writes to .regent/{specName}/{specType}.md
loadCachedSpec(specName, specType) → reads from .regent/{specName}/{specType}.md
ensureRegentDir(specName) → creates .regent/{specName}/ if not exists
```

**Acceptance Criteria:**
- [ ] Caches specs in correct location
- [ ] Creates directories as needed
- [ ] Does NOT add cached specs to git (gitignore handled in Session 4)

---

### Task 6: Update Session Resumption for Pivots (Slackbot)

**Goal:** When resuming a Slack session for a pivot, fetch current specs from Epic.

**Files:**
- `slackbot/src/managers/session-manager.ts`
- `slackbot/src/handlers/message-event.ts`

**Pivot Flow:**
1. Developer returns to original brainstorm thread
2. Mentions `@regent` with pivot request
3. Bot detects this is a resumed session with existing Epic
4. Bot fetches current brainstorm.md from Epic (source of truth)
5. Bot acknowledges any direct GitHub edits since last session
6. Q&A continues, Canvas updated
7. On approval, bot **edits** existing Comment 1 (not creates new)

**Detection Logic:**
- Session has `epic_number` set (from finalization)
- Thread is resumed (session already exists)
- User provides pivot context in message

**Acceptance Criteria:**
- [ ] Session stores `epic_number` and `epic_url` after finalization
- [ ] Resumption detects existing Epic
- [ ] Downloads current spec from Epic before continuing
- [ ] Acknowledges if spec was edited directly on GitHub
- [ ] On re-approval, edits existing comment (not creates new)

---

### Task 7: Add Epic Fields to Session Type

**Goal:** Extend Session type to track Epic information.

**Files:**
- `slackbot/src/types/session.ts`
- `slackbot/src/datastores/sessions.ts`

**New Fields:**
```typescript
interface Session {
  // Existing fields...

  // NEW: Epic tracking
  epic_number?: number;      // GitHub issue number of Epic
  epic_url?: string;         // Full URL to Epic
  spec_comment_ids?: {       // Track comment IDs for editing
    brainstorm?: number;
    requirements?: number;
    design?: number;
  };
}
```

**Acceptance Criteria:**
- [ ] Session type extended with Epic fields
- [ ] Datastore schema updated
- [ ] Finalization handler sets these fields after Epic creation
- [ ] Session resumption reads these fields

---

### Task 8: Write Tests for Plugin Commands

**Goal:** Test plugin command parsing and Epic integration.

**Note:** Plugin commands are markdown, so "tests" here means:
1. Manual testing instructions
2. Example command invocations
3. Expected behavior documentation

**Test Cases:**
- [ ] `/regent:specify --epic 42` - Downloads brainstorm, uploads requirements
- [ ] `/regent:design --epic 42` - Downloads brainstorm + requirements, uploads design
- [ ] `/regent:plan --epic 42` - Creates child issues linked to Epic
- [ ] `/regent:execute-issue 45` - Finds parent Epic, downloads specs
- [ ] All commands work without `--epic` (backwards compatible)

---

### Task 9: Write Tests for Session Resumption

**Goal:** Test pivot workflow with Epic integration.

**Files:**
- `slackbot/tests/managers/session-manager.test.ts` (MODIFY)
- `slackbot/tests/handlers/finalization-handler.test.ts` (MODIFY)

**Test Cases:**
- [ ] Session stores epic_number after finalization
- [ ] Session stores spec_comment_ids after adding comments
- [ ] Resumption fetches spec from Epic when epic_number exists
- [ ] Re-approval edits existing comment (not creates new)
- [ ] Acknowledges GitHub edits if spec changed externally

---

## Success Criteria

- [ ] `/regent:specify --epic N` downloads brainstorm, uploads requirements to Epic
- [ ] `/regent:design --epic N` downloads specs, uploads design to Epic
- [ ] `/regent:plan --epic N` creates child issues linked to Epic
- [ ] `/regent:execute-issue N` finds parent Epic and downloads specs
- [ ] All commands work without `--epic` (backwards compatible)
- [ ] Session resumption fetches current spec from Epic
- [ ] Re-approval edits existing Epic comment
- [ ] Specs cached locally in `.regent/{spec}/` (not committed)
- [ ] All new slackbot code has >90% test coverage

---

## Out of Scope (Future Sessions)

- Pivot reconciliation (re-planning after pivot) → Session 3
- Removing PR creation workflow → Session 4
- Updating .gitignore → Session 4
