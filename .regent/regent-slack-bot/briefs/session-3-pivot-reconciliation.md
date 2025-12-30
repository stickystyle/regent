# Session 3: Pivot Reconciliation

## Problem Background

The current Regent Slack Bot design stores spec documents (brainstorm.md, requirements.md, design.md) by committing them to the repository via PR creation. This has been refactored (Sessions 1-2) to use GitHub Epic issues with collapsible comments instead.

### The Pivot Problem

When requirements change mid-implementation (a "pivot"), the team needs to:
1. Update the brainstorm/requirements/design
2. Re-plan the tasks
3. **Reconcile existing issues with new tasks**

Without reconciliation, re-running `/regent:plan` would create duplicate issues, orphan completed work, or lose track of what's done vs. what's new.

### Solution: Human-in-the-Loop Reconciliation

When re-planning after a pivot, the system should:
1. Fetch existing child issues from the Epic
2. Generate new task list from updated design
3. Match old issues to new tasks using title similarity
4. Present analysis to user with clear categories
5. Use `AskUserQuestion` for uncertain matches and final confirmation
6. Execute approved changes (close obsolete, create new, update descriptions)

---

## Session Goals

1. Implement task matching algorithm (fuzzy title similarity)
2. Implement reconciliation analysis (categorize: KEEP/CLOSE/CREATE/UNCERTAIN)
3. Implement reconciliation UI (present analysis with AskUserQuestion prompts)
4. Implement reconciliation execution (close/create/update issues)

---

## Prerequisites (Sessions 1-2 Completed)

**Session 1 delivered:**
- ✅ GitHubClient with comment CRUD and issue operations
- ✅ EpicManager for spec comment management
- ✅ Finalization creates Epic with brainstorm comment
- ✅ Comment format with `<!-- REGENT_SPEC:{type} -->` markers

**Session 2 delivered:**
- ✅ Plugin commands support `--epic N` parameter
- ✅ Specs downloaded from Epic comments
- ✅ Specs uploaded to Epic comments
- ✅ `/regent:plan --epic N` creates child issues linked to Epic
- ✅ Session tracks `epic_number` and `spec_comment_ids`
- ✅ Session resumption fetches current spec from Epic

**Key files from previous sessions:**
```
slackbot/src/clients/github-client.ts    # Issue/comment CRUD
slackbot/src/managers/epic-manager.ts    # Spec management
slackbot/src/types/session.ts            # epic_number, spec_comment_ids
plugin/commands/regent-plan.md           # Current plan command
```

---

## Codebase Context for Planning

### Current /regent:plan Flow

```
1. Read design.md (local or from Epic)
2. Generate task list
3. Create child issues linked to Epic
4. Link issues in Epic body or separate tracking
```

### Target /regent:plan --epic N Flow (with Reconciliation)

```
1. Fetch existing child issues from Epic
2. Download updated design.md from Epic
3. Generate new task list from design
4. Match existing issues to new tasks
5. Categorize matches: KEEP/CLOSE/CREATE/UNCERTAIN
6. Present reconciliation analysis to user
7. Use AskUserQuestion for uncertain matches
8. Use AskUserQuestion for final confirmation
9. Execute: close obsolete, create new, update if requested
```

### GitHub Issue Relationships

**Finding child issues:**
- Option A: Issues have `Parent Epic: #N` in body (from Session 2)
- Option B: Use GitHub's issue body search API: `repo:owner/repo "Parent Epic: #42"`
- Option C: List all open issues with label `epic-42`

**Recommended:** Option A + search, since Session 2 already puts parent reference in body.

### Task Matching Strategy

**Fuzzy matching on title:**
```typescript
// Example matching
existingIssue: "Task 3: Implement GitHub client"
newTask: "Implement GitHub issue API client"
similarity: 0.75  // High enough to suggest match
```

**Categories:**
| Category | Criteria | Action |
|----------|----------|--------|
| KEEP (completed) | Existing issue is closed + matches new task | No action |
| KEEP (in progress) | Existing issue is open + matches new task | No action |
| CLOSE | Existing issue has no match in new tasks | Close with explanation |
| CREATE | New task has no match in existing issues | Create new issue |
| UNCERTAIN | Match similarity is borderline (0.5-0.75) | Ask user |

---

## Task List

### Task 1: Add GitHub Issue Query Methods

**Goal:** Methods to fetch child issues of an Epic.

**Files:**
- `slackbot/src/clients/github-client.ts` (if not already)
- Or create utility in plugin

**Methods Needed:**
```typescript
// Search for issues containing "Parent Epic: #N"
searchIssues(owner: string, repo: string, query: string): Promise<GitHubIssue[]>

// Or list issues with specific label
listIssuesByLabel(owner: string, repo: string, label: string): Promise<GitHubIssue[]>
```

**Acceptance Criteria:**
- [ ] Can fetch all issues referencing a parent Epic
- [ ] Returns issue number, title, state (open/closed), body
- [ ] Handles pagination for repos with many issues

---

### Task 2: Implement Fuzzy Title Matching

**Goal:** Algorithm to match existing issue titles to new task titles.

**Files:**
- Create `plugin/lib/task-matcher.ts` or inline in plan command

**Algorithm:**
```typescript
interface MatchResult {
  existingIssue: GitHubIssue;
  newTask: Task;
  similarity: number;  // 0.0 to 1.0
  confidence: "high" | "medium" | "low";
}

function matchTasks(
  existingIssues: GitHubIssue[],
  newTasks: Task[]
): {
  matches: MatchResult[];
  unmatched_existing: GitHubIssue[];
  unmatched_new: Task[];
}
```

**Similarity Calculation:**
- Normalize strings (lowercase, remove "Task N:", strip punctuation)
- Use Levenshtein distance or token overlap
- Consider: exact substring match = high confidence

**Confidence Thresholds:**
- `>= 0.8` = high confidence (auto-match)
- `0.5 - 0.8` = medium (ask user)
- `< 0.5` = low (no match)

**Acceptance Criteria:**
- [ ] Normalizes titles for comparison
- [ ] Calculates similarity score
- [ ] Categorizes by confidence level
- [ ] Handles edge cases (empty titles, very short titles)

---

### Task 3: Implement Reconciliation Analysis

**Goal:** Categorize all issues/tasks into action buckets.

**Files:**
- Create in plan command or separate module

**Output Structure:**
```typescript
interface ReconciliationPlan {
  keep_completed: Array<{
    issue: GitHubIssue;
    matchedTask: Task;
    reason: string;
  }>;
  keep_in_progress: Array<{
    issue: GitHubIssue;
    matchedTask: Task;
    reason: string;
  }>;
  close_obsolete: Array<{
    issue: GitHubIssue;
    reason: string;
  }>;
  create_new: Array<{
    task: Task;
    reason: string;
  }>;
  uncertain: Array<{
    issue: GitHubIssue;
    possibleMatch: Task;
    similarity: number;
    options: ["keep", "update", "close_and_recreate"];
  }>;
}
```

**Acceptance Criteria:**
- [ ] Categorizes all existing issues
- [ ] Categorizes all new tasks
- [ ] Identifies uncertain matches
- [ ] Provides reason for each categorization

---

### Task 4: Implement Reconciliation UI

**Goal:** Present analysis to user in clear format with prompts for decisions.

**Files:**
- Update `plugin/commands/regent-plan.md`

**Output Format:**
```markdown
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
```

**AskUserQuestion Prompts:**
1. For each uncertain match: "How to handle #106?"
   - Options: Keep as-is, Update description, Close and recreate
2. Final confirmation: "Proceed with this plan?"
   - Options: Yes, No (abort)

**Acceptance Criteria:**
- [ ] Presents clear categorized summary
- [ ] Uses emoji/symbols for visual clarity
- [ ] Prompts for uncertain matches via AskUserQuestion
- [ ] Prompts for final confirmation
- [ ] Handles user selecting "abort"

---

### Task 5: Implement Reconciliation Execution

**Goal:** Execute the approved reconciliation plan.

**Files:**
- Update `plugin/commands/regent-plan.md`
- Use GitHubClient methods

**Actions:**
1. **Close obsolete issues:**
   - Add comment explaining why (link to pivot)
   - Close issue
2. **Create new issues:**
   - Use format from Session 2 (Parent Epic reference)
   - Link to Epic
3. **Update issues (if requested):**
   - Update issue body with new description
   - Preserve Parent Epic reference

**Close Comment Format:**
```markdown
This task has been marked obsolete during a re-planning session.

**Reason:** {reason from analysis}

See parent Epic #{epic_number} for the updated plan.
```

**Acceptance Criteria:**
- [ ] Closes issues with explanation comment
- [ ] Creates new issues linked to Epic
- [ ] Updates issue descriptions if user chose "update"
- [ ] Reports summary of actions taken
- [ ] Handles partial failures gracefully

---

### Task 6: Add Close Issue Method to GitHubClient

**Goal:** Method to close an issue with a comment.

**Files:**
- `slackbot/src/clients/github-client.ts` (if using slackbot client)
- Or implement in plugin directly

**Methods Needed:**
```typescript
closeIssue(owner: string, repo: string, issueNumber: number): Promise<void>
addIssueComment(owner: string, repo: string, issueNumber: number, body: string): Promise<void>
updateIssue(owner: string, repo: string, issueNumber: number, updates: { title?: string; body?: string; state?: "open" | "closed" }): Promise<void>
```

**Acceptance Criteria:**
- [ ] Can close issue
- [ ] Can add comment before closing
- [ ] Can update issue body
- [ ] Proper error handling

---

### Task 7: Write Tests for Task Matching

**Goal:** Test fuzzy matching algorithm.

**Files:**
- Create test file for matcher

**Test Cases:**
- [ ] Exact match: similarity = 1.0
- [ ] Substring match: "Implement GitHub client" vs "GitHub client implementation"
- [ ] Word overlap: "Create user authentication" vs "Implement user auth system"
- [ ] No match: completely different titles
- [ ] Edge cases: empty strings, single words, very long titles
- [ ] Normalization: "Task 1: Foo" matches "Foo" after normalization

---

### Task 8: Write Tests for Reconciliation Analysis

**Goal:** Test categorization logic.

**Test Cases:**
- [ ] Completed issue with matching task → KEEP (completed)
- [ ] Open issue with matching task → KEEP (in progress)
- [ ] Open issue with no match → CLOSE
- [ ] New task with no match → CREATE
- [ ] Borderline match → UNCERTAIN
- [ ] All issues closed, all tasks new → All CREATE
- [ ] All tasks match existing → All KEEP

---

### Task 9: Integration Test for Full Reconciliation Flow

**Goal:** End-to-end test of pivot reconciliation.

**Test Scenario:**
1. Epic #42 has issues #101, #102, #103 (some open, some closed)
2. Design is updated with new task list
3. Run `/regent:plan --epic 42`
4. Verify correct categorization
5. Simulate user approving plan
6. Verify correct issues closed, created, updated

---

## Success Criteria

- [ ] `/regent:plan --epic N` fetches existing child issues
- [ ] Task matching identifies similar tasks with confidence levels
- [ ] Analysis categorizes all issues/tasks correctly
- [ ] User prompted for uncertain matches via AskUserQuestion
- [ ] User prompted for final confirmation
- [ ] Obsolete issues closed with explanation comment
- [ ] New issues created and linked to Epic
- [ ] Issue updates applied when requested
- [ ] Clear summary of actions taken
- [ ] All new code has tests

---

## Out of Scope (Future Sessions)

- Removing PR creation workflow → Session 4
- Updating .gitignore → Session 4
