# Workflows

When to spawn what, in this project. References the six Dynamic-Workflow
patterns from Anthropic engineering practice (classify-and-act,
fan-out-and-synthesize, adversarial verification, generate-and-filter,
tournament, loop-until-done).

Naming convention: prefix project workflows with `puc-` when saving
them to `~/.claude/workflows/` so they don't collide with general ones.

---

## `puc-audit-and-tag`

**Pattern:** fan-out-and-synthesize + adversarial verification

**When:** Before bumping any MVP tag, or any time the code has drifted
from the docs (a session of feature work that doesn't update plans).

**Shape:**
- Fan out three Explore agents:
  - Source audit — orphans, stale comments referencing paused work,
    unused exports
  - Docs vs code — claims in `MVP_ROADMAP.md` / `MVP*_PLAN.md` /
    `TECHNICAL_ARCHITECTURE.md` / `DECISIONS.md` that no longer match
    the code; new code with no doc cross-reference
  - Tag spec — what's a fair name for the new tag, what does it
    cover, what doesn't it
- Synthesize one report in under 600 words with: actions to take,
  exact file paths + line numbers, recommended tag name

**Output goes to:** the conversation. Then I read it, you confirm,
I execute the cleanup + write the new tag.

---

## `puc-mvp-acceptance`

**Pattern:** fan-out (one agent per plan item)

**When:** Closing out an MVP — does every item in the plan actually
work end-to-end, or did we drift?

**Shape:** Each agent reads the plan section for one item, finds the
code that should implement it, opens the relevant screen (via the
`run-power-up-chess` skill if it's a route), reports one of:
`done | partial | missing | unverifiable`. Report under 100 words
per item.

**Note:** A single sweep is not enough — agents have *self-preferential
bias*. If the same agent both implemented and verified an item, run
the verification with a fresh sub-agent.

---

## `puc-screenshot-tour`

**Pattern:** fan-out (viewport × route)

**When:** Mobile responsive regression check, especially before a
release or after a CSS pass.

**Shape:** For each (viewport ∈ {320, 375, 414, 768}, route ∈ all
top-level routes), drive the headless screenshot script and flag
overflow / clipped text / touch-targets <44px. Synthesize a gallery
+ a punch list.

---

## `puc-content-pass`

**Pattern:** generate-and-filter → adversarial verification → human gate

**When:** Adding new riddles to `mysteries.ts`, lore entries to
`lore.ts`, hangman words, etc.

**Shape:**
1. **Generate**: one agent produces ~50 candidates with explicit
   constraints (age 8-12, host voice, no PII, no scary themes)
2. **Adversarial filter**: a separate agent checks each candidate
   against the rubric and drops violators — chess legality if it's a
   puzzle, ambiguous answers if it's a riddle, factual claims that
   need sourcing if it's lore
3. **Human gate**: Jeff picks the keepers. The model never auto-merges
   content. See `docs/DECISIONS.md` on child-safety constraints.

---

## `puc-ship-feature`

**Pattern:** loop-until-done with explicit goal

**When:** Standard "I just wrote code" pipeline.

**Shape:** code → `pnpm build` → `pnpm test --run` → `firebase deploy
--only hosting` (or named functions) → `git commit` → optional screenshot
verify. Pair with `/goal` to pin success: "all tests pass + the change
visible on deployed URL + commit message follows
docs/MVP_ROADMAP.md style".

**Anti-pattern to watch:** *agentic laziness* — stopping after the
build passes but before the deploy succeeds. *goal drift* — silently
adding "and also refactor X" mid-loop.

---

## When NOT to spawn agents

- One-file bug fix
- One-line copy change
- Asking a clarifying question (just ask)
- Anything where you already know the answer

The shape rule: if the task is "do X" and X is concrete, just do it.
If the task is "figure out what's true about a sprawling thing", agents.
