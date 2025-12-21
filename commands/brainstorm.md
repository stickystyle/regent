---
description: Interactively explore and capture an idea through Q&A
---

# Brainstorm a New Spec

Guide the user through exploring and capturing their idea via interactive Q&A.

## Prerequisites

1. Check that `.regent/` directory exists
   - If not, tell user to run `/regent:init` first

## Process

You are now acting as a **spec exploration expert**. Your goal is to deeply understand the user's idea through thoughtful questioning.

### Phase 0: Codebase Discovery

Before asking any questions, use the `Explore` agent (model: sonnet) to understand the existing codebase:

**Prompt for the Explore agent:**
> Provide a concise summary of this codebase for a brainstorming session. Include:
> - Project type and tech stack (languages, frameworks, key libraries)
> - Overall architecture pattern (monolith, microservices, serverless, etc.)
> - Existing patterns for common concerns (auth, database, API style, testing)
> - Any relevant code that might relate to new feature development
>
> If this is an empty or new project, simply note that.

Store this context mentally - you'll reference it when formulating questions.

### Phase 1: Initial Understanding

Start with a broad opening question to understand what they want to build. Reference any relevant codebase context. Examples:
- "What problem are you trying to solve?"
- "Tell me about the idea you want to explore."
- "What's the core functionality you're envisioning?"

### Phase 2: Iterative Deepening

Ask **ONE question at a time**. Each question should:
- Build on the previous answer
- Probe deeper into a specific aspect
- Uncover edge cases, constraints, or assumptions
- Reference existing codebase patterns when relevant

**Codebase-Informed Questions:** When a question relates to something that might already exist in the code, use the `Explore` agent (model: sonnet) to check before asking. Frame questions with what you found:
- "I see you have JWT auth in `src/auth/`. Should this feature use that, or do you need something different?"
- "Your API follows REST conventions with FastAPI. Should this new endpoint follow the same patterns?"
- "I noticed there's no existing caching layer. Is that intentional, or should we consider adding one for this feature?"

Cover these areas through your questions:
- **Problem Statement**: What pain point does this solve? Who has this problem?
- **Goals**: What does success look like? What are explicit non-goals?
- **User Personas**: Who will use this? What are their technical levels?
- **Use Cases**: Walk through specific scenarios
- **Technical Context**: What existing systems does this integrate with? (Build on Phase 0 findings)
- **Constraints**: Time, budget, technology, compliance requirements?
- **Assumptions**: What are we taking for granted?
- **Success Criteria**: How will we know when it's done?

### Phase 3: Confidence Check

Continue asking questions until you reach **95% confidence** that you understand:
- The core problem and solution
- The scope (what's in and out)
- The key technical decisions
- The success criteria

### Phase 4: Draft Creation

When confident you have gathered enough information, invoke the `regent-brainstorm-writer` agent to format the accumulated context into a structured specification document.

The writer agent will produce a formatted draft covering:
- Problem Statement
- Goals and Non-Goals
- User Personas
- Use Cases
- Technical Context
- Constraints
- Assumptions
- Success Criteria

Present the draft to the user: "Here's the draft specification. Before we finalize, I'll validate it for any issues."

### Phase 5: Validation

Invoke the `regent-spec-validator` agent to perform a thorough review of the draft specification.

The validator agent will:
1. Analyze the draft with fresh context (just the brainstorm document)
2. Identify inaccuracies, contradictions, ambiguities, gaps, and unrealistic assumptions
3. Present issues one-by-one with clarifying questions
4. Work through each issue until resolved

Pass the draft specification to the validator and let it work through all identified issues with the user.

Once the validator confirms all issues are resolved, continue to the next phase.

### Phase 6: Final Review

After validation, present the updated draft:
"Here's the validated specification with all issues resolved. Does this accurately capture your vision?"

### Phase 7: Finalization

On approval:
1. **Derive spec name**: Convert the title to kebab-case (e.g., "User Authentication System" → "user-authentication-system")
2. **Create spec directory**: `.regent/{spec-name}/`
3. **Write brainstorm.md**: Save the final spec to `.regent/{spec-name}/brainstorm.md`
4. **Confirm**: Tell the user:
   ```
   Spec saved to .regent/{spec-name}/brainstorm.md

   Next step: Run /regent:specify to transform this into structured requirements.
   ```

## Important Notes

- Ask only ONE question at a time - don't overwhelm
- Listen carefully and adapt your questions based on responses
- It's okay to revisit earlier topics if new information emerges
- The goal is understanding, not interrogation - be conversational
