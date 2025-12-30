# Session 4: Cleanup & Migration

## Problem Background

The current Regent Slack Bot design stores spec documents (brainstorm.md, requirements.md, design.md) by committing them to the repository via PR creation. This has been replaced (Sessions 1-3) with Epic-based storage using GitHub issue comments.

### What Remains

With Epic-based storage fully implemented:
1. The PR creation workflow is now **obsolete**
2. Local spec files (brainstorm.md, requirements.md, design.md) should be **gitignored** (they're just caches)
3. Only task briefs should be committed (birth certificates for code)
4. Documentation needs updating

---

## Session Goals

1. Remove or deprecate PR creation workflow
2. Update .gitignore for cached spec files
3. Update documentation
4. Clean up any dead code
5. Ensure backwards compatibility for local-only workflow

---

## Prerequisites (Sessions 1-3 Completed)

**Session 1 delivered:**
- ✅ GitHubClient with comment CRUD and issue operations
- ✅ EpicManager for spec comment management
- ✅ Finalization creates Epic with brainstorm comment (not PR)

**Session 2 delivered:**
- ✅ Plugin commands support `--epic N` parameter
- ✅ Specs downloaded from/uploaded to Epic comments
- ✅ Session resumption fetches current spec from Epic

**Session 3 delivered:**
- ✅ Pivot reconciliation with fuzzy task matching
- ✅ Human-in-the-loop confirmation via AskUserQuestion
- ✅ Issue close/create/update based on reconciliation

**Key files from previous sessions:**
```
slackbot/src/clients/github-client.ts    # Has comment CRUD + PR creation
slackbot/src/managers/epic-manager.ts    # New Epic management
slackbot/src/handlers/finalization-handler.ts  # Creates Epic, not PR
plugin/commands/regent-*.md              # Support --epic parameter
```

---

## Codebase Context for Planning

### PR Creation Code Location

The PR creation workflow exists in:
```
slackbot/src/clients/github-client.ts
├── createPullRequest() method (~90 lines)
├── formatBrainstormMarkdown() helper
├── Related types and error handling
```

### Backwards Compatibility Requirement

**Important:** The local-only workflow (without `--epic`) should continue to work:
- `/regent:brainstorm` → creates local brainstorm.md
- `/regent:specify` → creates local requirements.md
- `/regent:design` → creates local design.md
- `/regent:plan` → creates local tasks.md

This allows teams to adopt Epic storage incrementally.

### Current .gitignore State

The `.regent/` directory is currently **NOT gitignored** because specs were meant to be committed. With Epic storage:
- Specs (brainstorm.md, requirements.md, design.md) are cached, not committed
- Task briefs (`.regent/{spec}/briefs/*.md`) are still committed

---

## Task List

### Task 1: Deprecate PR Creation Method

**Goal:** Mark PR creation as deprecated, keep for backwards compatibility.

**Files:**
- `slackbot/src/clients/github-client.ts`

**Approach:**
- Add `@deprecated` JSDoc comment to `createPullRequest()` method
- Keep the implementation for any legacy use cases
- Add console warning when method is called
- Update interface documentation

**Do NOT:**
- Remove the method entirely (breaks backwards compatibility)
- Remove tests (they document expected behavior)

**Acceptance Criteria:**
- [ ] `createPullRequest()` marked with `@deprecated`
- [ ] Warning logged when method is called
- [ ] Method still works for legacy use cases
- [ ] Tests still pass

---

### Task 2: Remove PR Creation from Finalization Handler

**Goal:** Ensure finalization only uses Epic workflow, not PR.

**Files:**
- `slackbot/src/handlers/finalization-handler.ts`
- Any other files that might call `createPullRequest()`

**Verification:**
- Search codebase for `createPullRequest` calls
- Ensure finalization handler uses `EpicManager` exclusively
- Remove any conditional logic that might fall back to PR creation

**Acceptance Criteria:**
- [ ] Finalization handler only uses EpicManager
- [ ] No production code path calls createPullRequest
- [ ] Tests updated if they expected PR creation

---

### Task 3: Update .gitignore for Cached Specs

**Goal:** Exclude cached spec files while keeping task briefs tracked.

**Files:**
- `.gitignore` (root level)
- Or create `.regent/.gitignore` (directory-specific)

**Gitignore Rules:**
```gitignore
# Regent cached specs (downloaded from Epic, not committed)
.regent/*/brainstorm.md
.regent/*/requirements.md
.regent/*/design.md

# Keep task briefs tracked (birth certificates for code)
!.regent/*/briefs/
```

**Alternative (directory-specific):**
```gitignore
# .regent/.gitignore
*/brainstorm.md
*/requirements.md
*/design.md
!*/briefs/
```

**Acceptance Criteria:**
- [ ] Cached spec files are gitignored
- [ ] Task briefs are NOT gitignored
- [ ] Existing committed specs (if any) are not affected
- [ ] New cached specs don't show in git status

---

### Task 4: Update README Documentation

**Goal:** Document the Epic-based workflow.

**Files:**
- `README.md` (if exists at root)
- `slackbot/README.md` (if exists)
- `plugin/README.md` (if exists)
- `CLAUDE.md` (project instructions)

**Documentation Updates:**
1. Explain Epic-based storage model
2. Document `--epic N` parameter for commands
3. Explain what gets committed vs cached
4. Update workflow diagrams
5. Add reference to demo Epic (#44)

**Acceptance Criteria:**
- [ ] Epic workflow documented
- [ ] `--epic` parameter documented for each command
- [ ] Storage model explained (Epic comments vs local cache)
- [ ] Migration path documented for existing users

---

### Task 5: Update CLAUDE.md

**Goal:** Update project instructions for Claude Code.

**Files:**
- `/Volumes/workingfolder/regent/CLAUDE.md`

**Updates:**
1. Update "Spec Output Directory" section to reflect caching vs committing
2. Add note about Epic-based storage
3. Update command flow diagram to show `--epic` option
4. Document that specs are cached, not committed (except briefs)

**Acceptance Criteria:**
- [ ] CLAUDE.md reflects current Epic-based architecture
- [ ] Spec storage model documented accurately
- [ ] Command flow shows both local and Epic modes

---

### Task 6: Clean Up Dead Code

**Goal:** Remove any code that's no longer used.

**Files:**
- Search for unused imports
- Search for unreachable code paths
- Search for commented-out code related to PR workflow

**Candidates:**
- Branch creation helpers (if only used by PR creation)
- File commit helpers (if only used by PR creation)
- PR-specific error handling
- PR-specific types

**Do NOT remove:**
- Code that's still used by other features
- Code that's needed for backwards compatibility
- Tests (even for deprecated features)

**Acceptance Criteria:**
- [ ] No unused imports related to PR workflow
- [ ] No unreachable code paths
- [ ] No commented-out PR code
- [ ] All remaining code is reachable

---

### Task 7: Update Test Descriptions

**Goal:** Update test names/descriptions to reflect Epic-based workflow.

**Files:**
- `slackbot/tests/**/*.test.ts`

**Updates:**
- Tests that were "should create PR on approval" → "should create Epic on approval"
- Tests that mention "PR" in description should be updated or marked as legacy
- Add tests for Epic workflow if missing

**Acceptance Criteria:**
- [ ] Test descriptions reflect current behavior
- [ ] Legacy PR tests marked as such
- [ ] No misleading test names

---

### Task 8: Add Migration Guide

**Goal:** Document how to migrate from PR workflow to Epic workflow.

**Files:**
- Create `docs/migration-to-epic-storage.md` or add section to README

**Content:**
1. Why we made this change (security, ownership)
2. What changes for users
3. How to update existing workflows
4. How to handle in-flight specs (started with PR, finish with PR)
5. Backwards compatibility notes

**Acceptance Criteria:**
- [ ] Migration guide exists
- [ ] Explains the "why"
- [ ] Provides clear steps
- [ ] Addresses edge cases

---

### Task 9: Final Verification

**Goal:** Ensure everything works end-to-end.

**Verification Steps:**
1. Run all tests
2. Manual test: Start new brainstorm, approve, verify Epic created
3. Manual test: Run `/regent:specify --epic N`, verify comment added
4. Manual test: Run local workflow without `--epic`, verify still works
5. Verify cached specs are gitignored
6. Verify task briefs are committed

**Acceptance Criteria:**
- [ ] All tests pass
- [ ] Epic workflow works end-to-end
- [ ] Local workflow works end-to-end
- [ ] Gitignore works correctly
- [ ] No regression in existing functionality

---

## Success Criteria

- [ ] PR creation method deprecated with warning
- [ ] Finalization uses Epic workflow only
- [ ] Cached spec files are gitignored
- [ ] Task briefs are still committed
- [ ] Documentation updated
- [ ] CLAUDE.md reflects Epic architecture
- [ ] Dead code removed
- [ ] Tests updated
- [ ] Migration guide available
- [ ] All tests pass
- [ ] Both Epic and local workflows work

---

## Notes on Backwards Compatibility

**Preserved:**
- `/regent:brainstorm` without `--epic` creates local brainstorm.md
- `/regent:specify` without `--epic` reads/writes local files
- `/regent:design` without `--epic` reads/writes local files
- `/regent:plan` without `--epic` creates local tasks.md
- `/regent:execute` works with local files

**Changed:**
- Slack bot approval always creates Epic (not PR)
- With `--epic`, specs stored on GitHub issue comments
- Cached specs are gitignored

**Teams can:**
- Use local-only workflow for solo development
- Use Epic workflow for team collaboration
- Mix approaches (start local, move to Epic later)
