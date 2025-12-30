# Session 3: Pivot Reconciliation - Test Scenarios

Manual test scenarios for validating the `/regent:plan --epic N` pivot reconciliation feature.

## Prerequisites for All Tests

1. A GitHub repository with `gh` CLI authenticated
2. An existing Epic issue with `regent:epic` label
3. Specs (brainstorm, requirements, design) stored as comments on the Epic

---

## Scenario 1: First-Time Planning (No Existing Issues)

**Setup:**
- Epic #{N} exists with all specs
- No child issues have been created yet

**Steps:**
1. Run `/regent:plan --epic {N}`
2. Approve the generated task list

**Expected Behavior:**
- Phase 0.7 detects no existing child issues
- Reconciliation phases (4.5-5.5) are SKIPPED
- Phase 6.5 creates all task issues normally
- All tasks appear as new issues

**Verification:**
```bash
gh issue list --label "spec:{spec-name}" --label "regent" --state open
```
Should show all newly created task issues.

---

## Scenario 2: All Tasks Match Existing Issues

**Setup:**
- Epic #{N} exists with specs
- Child issues exist that perfectly match the new task list
- No requirements have changed

**Steps:**
1. Run `/regent:plan --epic {N}`
2. Observe the reconciliation summary
3. Confirm the plan

**Expected Behavior:**
- Phase 0.7 detects existing child issues, sets reconciliation flag
- Phase 4.5 categorizes all existing issues as KEEP_OPEN or KEEP_COMPLETED
- Phase 4.6 shows all issues under "KEEP" categories
- Phase 4.8 shows "NO CHANGE: X issues"
- Phase 5.5 performs no close/update operations
- Phase 6.5 creates no new issues

**Verification:**
```bash
# Issue count should remain unchanged
gh issue list --label "spec:{spec-name}" --state all --json number | jq 'length'
```

---

## Scenario 3: All New Tasks (No Matches)

**Setup:**
- Epic #{N} exists with specs
- Child issues exist from a previous plan
- Requirements have completely changed (new feature set)

**Steps:**
1. Run `/regent:plan --epic {N}`
2. Observe the reconciliation summary
3. Confirm the plan

**Expected Behavior:**
- Phase 0.7 detects existing child issues
- Phase 4.5 categorizes:
  - All existing issues as CLOSE_OBSOLETE
  - All new tasks as CREATE_NEW
- Phase 4.6 shows issues under "CLOSE AS OBSOLETE" and tasks under "CREATE NEW"
- Phase 5.5 closes all existing issues with obsolete comment
- Phase 6.5 creates all new task issues

**Verification:**
```bash
# Old issues should be closed
gh issue list --label "spec:{spec-name}" --state closed --json number,title

# New issues should be open
gh issue list --label "spec:{spec-name}" --state open --json number,title
```

---

## Scenario 4: Mixed Scenario (Some Match, Some Obsolete, Some New)

**Setup:**
- Epic #{N} with 5 existing task issues:
  - #101: "Task 1: Setup project structure" (open)
  - #102: "Task 2: Implement user authentication" (closed)
  - #103: "Task 3: Add legacy payment gateway" (open)
  - #104: "Task 4: Write unit tests" (open)
  - #105: "Task 5: Add deprecated feature X" (open)
- New task list after requirements change:
  1. "Setup project structure" (matches #101)
  2. "Implement user authentication" (matches #102, already done)
  3. "Add Stripe payment integration" (new, replaces legacy payment)
  4. "Write unit tests for auth" (partially matches #104)
  5. "Add feature Y" (new)

**Steps:**
1. Run `/regent:plan --epic {N}`
2. Resolve uncertain match for #104 ("Write unit tests" vs "Write unit tests for auth")
3. Confirm the plan
4. Execute reconciliation

**Expected Behavior:**
- KEEP_OPEN: #101 (matches "Setup project structure")
- KEEP_COMPLETED: #102 (matches "Implement user authentication", already closed)
- CLOSE_OBSOLETE: #103 (no match - legacy payment), #105 (no match - deprecated feature)
- UNCERTAIN: #104 (partial match with "Write unit tests for auth")
- CREATE_NEW: "Add Stripe payment integration", "Add feature Y"

After user resolves #104:
- If "Keep as-is": #104 moves to KEEP_OPEN
- If "Close and recreate": #104 moves to CLOSE_OBSOLETE, new task added to CREATE_NEW

**Verification:**
```bash
# Check closed issues have obsolete comment
gh issue view 103 --json body,state
gh issue view 105 --json body,state

# Check new issues were created
gh issue list --label "spec:{spec-name}" --state open --json number,title
```

---

## Scenario 5: Uncertain Matches Requiring User Input

**Setup:**
- Epic with existing issues that have similar but not identical titles:
  - #201: "Implement GitHub client"
  - #202: "Add error handling"
  - #203: "Create API endpoints"
- New task list:
  1. "Implement GitHub issue API client"
  2. "Add comprehensive error handling with retries"
  3. "Create REST API endpoints for users"

**Steps:**
1. Run `/regent:plan --epic {N}`
2. Observe that all three are marked as UNCERTAIN
3. For each, choose one of:
   - "Keep as-is" - existing issue covers the task
   - "Update description" - same issue, update the body
   - "Close and recreate" - start fresh

**Expected Behavior:**
- Phase 4.7 asks about each uncertain match in sequence
- User decisions are collected before Phase 4.8
- Phase 4.8 summary reflects user choices

**Test All Three Options:**
1. For #201: Choose "Keep as-is"
   - Issue stays open, no changes
2. For #202: Choose "Update description"
   - Issue body updated in Phase 5.5
3. For #203: Choose "Close and recreate"
   - Issue closed in Phase 5.5
   - New issue created in Phase 6.5

**Verification:**
```bash
# #201 unchanged
gh issue view 201 --json body | jq '.body' | grep -v "Updated by"

# #202 body updated
gh issue view 202 --json body | jq '.body' | grep "Updated by"

# #203 closed
gh issue view 203 --json state | jq '.state'  # should be "CLOSED"

# New issue exists for "Create REST API endpoints for users"
gh issue list --label "spec:{spec-name}" --state open --json title | grep -i "REST API endpoints"
```

---

## Scenario 6: User Aborts at Confirmation

**Setup:**
- Epic with existing issues
- New task list that would require changes

**Steps:**
1. Run `/regent:plan --epic {N}`
2. Complete any uncertain match resolutions
3. At Phase 4.8 confirmation, choose "No, abort"

**Expected Behavior:**
- No issues are closed
- No issues are updated
- No new issues are created
- User sees: "Reconciliation aborted. No changes were made."

**Verification:**
```bash
# Issue states should be unchanged
gh issue list --label "spec:{spec-name}" --state all --json number,state,title
```

---

## Scenario 7: Completed Issues Preserved

**Setup:**
- Epic with mix of open and closed issues:
  - #301: "Task 1: Setup" (CLOSED)
  - #302: "Task 2: Implement feature A" (CLOSED)
  - #303: "Task 3: Implement feature B" (OPEN)
- New task list:
  1. "Setup" (matches #301)
  2. "Implement feature A" (matches #302)
  3. "Implement feature B" (matches #303)
  4. "Implement feature C" (new)

**Steps:**
1. Run `/regent:plan --epic {N}`
2. Confirm the plan

**Expected Behavior:**
- #301 and #302: KEEP_COMPLETED (remain closed, represent done work)
- #303: KEEP_OPEN (remains open)
- Phase 6.5 only creates issue for "Implement feature C"

**Critical Verification:**
```bash
# Closed issues MUST remain closed
gh issue view 301 --json state | jq '.state'  # "CLOSED"
gh issue view 302 --json state | jq '.state'  # "CLOSED"

# Open issue remains open
gh issue view 303 --json state | jq '.state'  # "OPEN"

# Only one new issue created
gh issue list --label "spec:{spec-name}" --state open --json title | grep -c "feature C"  # 1
```

---

## Edge Cases to Consider

### Empty Task List
- What happens if the new plan has zero tasks?
- All existing issues should be marked CLOSE_OBSOLETE

### Duplicate Task Titles
- Multiple tasks with similar names
- Ensure matching algorithm handles duplicates correctly

### Very Long Issue Lists
- Test with 50+ existing issues
- Verify performance and UI readability

### Network Failures
- What if `gh` commands fail mid-reconciliation?
- Partial state should be recoverable

### Special Characters in Titles
- Task titles with quotes, backticks, or special chars
- Ensure bash heredocs handle them correctly

---

## Test Execution Checklist

- [ ] Scenario 1: First-time planning works without reconciliation
- [ ] Scenario 2: No changes when tasks match
- [ ] Scenario 3: All issues closed and recreated on full pivot
- [ ] Scenario 4: Mixed scenario with correct categorization
- [ ] Scenario 5: All three user choices work correctly
- [ ] Scenario 6: Abort prevents all changes
- [ ] Scenario 7: Completed issues never reopened or modified
