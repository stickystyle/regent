---
description: Implement the next incomplete task from tasks.md
---

# Execute Next Task

Implement the next incomplete task from the implementation plan.

## Prerequisites

1. Check that `.regent/` directory exists
2. Find the spec to work on:
   - If only one spec directory exists in `.regent/`, use it
   - If multiple exist, use the most recently modified (check file timestamps)
   - If ambiguous, ask the user which spec to work on
3. Verify `tasks.md` exists in `.regent/{spec-name}/`
   - If not, tell user to run `/regent:plan` first

## Phase 1: Find Next Task

1. Read `.regent/{spec-name}/tasks.md`
2. Find the first unchecked task: `- [ ]`
3. If all tasks are complete, congratulate the user and summarize what was built

## Phase 2: Extract Task Brief (REQUIRED - Use Subagent)

**Important**: Use a subagent to extract the task brief. This keeps your main context clean.

Use the Task tool with these parameters:

```
subagent_type: "general-purpose"
model: "sonnet"
description: "Extract task brief from specs"
prompt: |
  You are a specification parser. Read implementation specs and extract a focused "Task Brief" for the next incomplete task.

  ## Files to Read

  Read these files from .regent/{spec-name}/:
  1. tasks.md
  2. requirements.md
  3. design.md

  Also read any existing source files that will be modified or tested.

  ## Extraction Steps

  1. **Find the next task**: In tasks.md, find the FIRST task with an unchecked box `[ ]`. This is the task to extract.

  2. **Parse requirement references**: Tasks have references like `_Requirements: 5.3, 8.1_`. This notation means:
     - "5.3" = Requirement 5, Acceptance Criterion 3
     - "8.1" = Requirement 8, Acceptance Criterion 1
     Parse these correctly - they are NOT decimal numbers.

  3. **Extract requirements verbatim**: For each referenced requirement, extract the EXACT text of:
     - The requirement's user story
     - The specific acceptance criterion(s) referenced

  4. **Find relevant design context**: Based on the task description and requirements, extract:
     - Relevant component interfaces (code blocks)
     - Related "Correctness Properties" from the design doc
     - Error handling patterns if applicable
     - Any data models or schemas mentioned

  5. **Identify dependencies**: Note which prior tasks this depends on and what files need modification.

  6. **Analyze task type and sequencing**: Determine the task type:
     - If this is a TEST task (property test, unit test, integration test):
       - Find which later task(s) implement the feature being tested
       - This is TDD: the test should fail until implementation is done
     - If this is an IMPLEMENTATION task:
       - Find which earlier test task(s) this should make pass
     - Note the task sequence relationships

  7. **Extract current implementation state**: For the files this task will modify or test:
     - Read the actual source files (not just design docs)
     - Document current function signatures
     - Note current error handling (or lack thereof)
     - Identify integration points with other components

  8. **Find test templates**: If writing tests:
     - Search for similar existing tests in the project
     - Identify the most relevant test file to use as a pattern
     - Extract key structural patterns (fixtures, parameterization, assertion styles)

  9. **Design concrete test cases**: If writing tests:
     - Define specific test function names (e.g., `test_transient_failure_triggers_retry`)
     - For each test, specify: inputs, expected behavior, why it will fail (if TDD)
     - Design any mock/helper classes needed (with implementation sketches)

  ## Output Format

  Return a structured Task Brief in this exact format:

  ---
  # Task Brief

  ## Task
  - **Number**: [task number]
  - **Title**: [task title from tasks.md]
  - **Type**: [test-first | implementation | infrastructure]
  - **Implementation Steps**:
    [bullet points from the task, verbatim]

  ## Requirements (Verbatim)

  ### Requirement X.Y: [title]
  **User Story**: [exact user story text]
  **Acceptance Criterion Y**:
  > [exact criterion text, quoted]

  [Repeat for each referenced requirement]

  ## Design Context

  ### Relevant Interfaces
  [code blocks from design.md]

  ### Correctness Properties
  [list relevant properties with their numbers and text]

  ### Error Handling
  [any relevant error patterns from design.md]

  ### Data Models
  [relevant models from design.md if applicable]

  ## Task Sequencing
  - **Task Type**: [test-first | implementation | refactor]
  - **Related Tasks**: [e.g., "Task 29 implements the feature this test validates"]
  - **Current State**: [e.g., "reload_policy() has no error handling - test will fail until Task 29"]
  - **Expected Outcome**: [what should happen when this task is complete]

  ## Dependencies
  - **Prior Tasks**: [list completed tasks this builds on]
  - **Files to Create**: [new files this task will create]
  - **Files to Modify**: [existing files to update]
  - **Files to Reference**: [list files to read for context]
  - **External Dependencies**: [packages, services, etc.]

  ## Current Implementation State
  [Relevant code snippets from actual source files showing current state]
  - Function signatures that will be tested/modified
  - Current error handling patterns (or note their absence)
  - Integration points with other components

  ## Test Patterns
  [any testing guidance from design.md or similar existing tests]

  ## Template Reference (for test tasks)
  - **Similar Test File**: [path to most relevant existing test]
  - **Key Patterns**:
    - Fixture usage: [describe relevant fixtures]
    - Parameterization: [if applicable]
    - Assertion style: [patterns used]
  - **Code Example**: [short representative snippet from the template test]

  ## Concrete Test Design (for test tasks)

  ### Test Cases

  | Function Name | Description | Expected Outcome |
  |---------------|-------------|------------------|
  | `test_function_name_1` | What this test verifies | Pass/Fail (TDD) and why |
  | `test_function_name_2` | What this test verifies | Pass/Fail (TDD) and why |

  ### Mock/Helper Classes

  ```python
  @dataclass
  class MockHelperName:
      """Purpose of this helper."""
      field1: type = default
      field2: type = default

      def method_name(self) -> ReturnType:
          """What this method does."""
          # Implementation sketch
          pass
  ```

  ### Hypothesis Strategies (if property tests)

  ```python
  @given(
      param1=strategy1(),
      param2=strategy2(),
  )
  ```
  ---

  ## Important Rules
  - Extract text VERBATIM - do not summarize or paraphrase requirements
  - Include ALL referenced requirements, not just some
  - If a task references Property tests, include the property definition
  - Do NOT include requirements or design sections that aren't relevant to this specific task
  - For test tasks: You MUST read actual source files and find similar test templates
  - For test tasks: You MUST design concrete test function names and mock implementations
  - For implementation tasks: You MUST identify which tests should pass after implementation
  - Always note the TDD relationship between test and implementation tasks
```

## Phase 3: Save and Present Brief

After receiving the Task Brief from the subagent:

1. Create briefs directory if needed: `.regent/{spec-name}/briefs/`
2. Save to `.regent/{spec-name}/briefs/task-{N}.md`
3. Present the Task Brief to the user

Ask: "Ready to proceed with Task [N]: [Title]?"

Wait for confirmation before continuing. This file serves as persistent context that survives conversation summarization.

## Phase 4: Implementation

On confirmation, implement the task using specialized agents.

**Important**: When invoking agents, tell them to read `.regent/{spec-name}/briefs/task-{N}.md` for full context.

### Selecting the Right Agent

| Task Type | Agent |
|-----------|-------|
| Python backend code | regent-python-engineer |
| TypeScript/JavaScript code | regent-typescript-engineer |
| AWS CDK infrastructure | regent-cdk-architect |
| Test writing | regent-test-engineer |
| Other languages | regent-engineer |
| Code review (after significant changes) | regent-code-reviewer |

### For Test Tasks

1. Write the test file following project conventions
2. Use patterns from the Template Reference section of the brief
3. Run the test to confirm it fails (TDD red phase)
4. If the test passes unexpectedly, investigate - either implementation exists or test is wrong

### For Implementation Tasks

1. Implement the code following the interfaces from design.md exactly
2. Run related tests to verify (TDD green phase)
3. Refactor if needed while keeping tests green

### For Property Test Tasks

1. Write the property test using Hypothesis
2. Reference the correctness property from design.md
3. Use the strategies from the Concrete Test Design section
4. Run to verify the property holds (or fails as expected if implementation pending)

### Implementation Guidelines

- Follow existing code patterns in the project
- Use the interfaces exactly as defined in design.md
- Add appropriate error handling
- Include docstrings and type hints
- Keep changes focused on the single task

## Phase 5: Code Review (REQUIRED)

After implementation, you MUST run the code-reviewer agent before proceeding.

### Code Review Loop

1. **Invoke the code-reviewer agent**:
   - Use the Task tool with `subagent_type: "regent-code-reviewer"`
   - Tell it to review the changes made for Task [N]
   - Point it to `.regent/{spec-name}/briefs/task-{N}.md` for context

2. **Evaluate the review results**:
   - If the review passes with no significant issues → proceed to Phase 6
   - If the review identifies issues → continue to step 3

3. **Address issues with the SAME implementation agent**:
   - Use the same agent type that did the original implementation
   - For example: if `regent-python-engineer` wrote the code, use `regent-python-engineer` to fix it
   - Provide the code review feedback to the agent
   - Tell it to address the specific issues identified

4. **Re-run code review**:
   - After fixes are applied, invoke `regent-code-reviewer` again
   - Repeat steps 2-4 until the review passes

**Important**: Do NOT skip this phase. Do NOT proceed to verification until the code review passes. The implementation agent that wrote the code is responsible for fixing any issues identified.

### What the Code Reviewer Checks

- Code quality and maintainability
- Security vulnerabilities
- Adherence to the design from design.md
- Proper error handling
- Test coverage adequacy
- Consistency with project patterns

## Phase 6: Verification

After code review passes:

1. Run all related tests
2. Check for linting/type errors
3. Review the changes against the requirements from the brief

If tests fail:
- Analyze the failure
- Fix the issue (using the same implementation agent)
- Re-run code review if changes were significant
- Re-run tests
- Continue until green

## Phase 7: Mark Complete

Once verified:

1. Update `tasks.md`: Change `- [ ]` to `- [x]` for this task
2. Report completion:
   ```
   Task [N] complete: [Title]

   Changes:
   - [file1]: [what changed]
   - [file2]: [what changed]

   Tests: [X passing]

   Progress: [completed]/[total] tasks ([percentage]%)

   Run /regent:execute to continue with the next task.
   ```

## Principles

- **Fail-fast**: Invalid states should prevent startup
- **Fail-secure**: Authentication/authorization failures default to rejection
- **Explicit over implicit**: Clear, readable code
- **Security first**: Never trust data before validation
- **Test coverage**: Every acceptance criterion needs a test

## If Unclear

Ask the user before implementing. Do not make assumptions about:
- Security-critical behavior
- Data validation requirements
- Error handling strategies
- Integration with external systems
