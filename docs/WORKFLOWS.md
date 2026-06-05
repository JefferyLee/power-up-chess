# Workflows (PUC overrides)

See `~/Workplace/WORKFLOWS.md` for the cross-project patterns. This
file only documents Power-Up-Chess-specific overrides on top of them.

---

## `content-pass` — child-safety override

PUC ships LLM-touched content in `data/mysteries.ts`, lore entries,
hangman words, and host story snippets imported from
`docs/books_and_references/`. Every shipped string passes through a
human gate (Jeff picks keepers; the model never auto-merges).
See `docs/DECISIONS.md` on child-safety constraints and
`docs/MVP2_PLAN.md` §6.5 on the story-import pipeline.

Constraints baked into the generate step's prompt: audience age
8–12, host voice (Lucy / Luca per `docs/HOST_PERSONAS.md`), no PII,
no scary themes, no fabricated chess history.

Adversarial-filter step adds an **anti-verbatim check** when source
material lives in `docs/books_and_references/` (~440 MB of
copyrighted PDFs/EPUBs, git-ignored). Original retellings only.

---

## `audit-and-tag` — PUC docs + tag sequence

The "docs vs code" agent specifically cross-checks:
- `docs/MVP_ROADMAP.md`
- `docs/MVP*_PLAN.md` (currently MVP0 / MVP1 / MVP2)
- `docs/TECHNICAL_ARCHITECTURE.md`
- `docs/DECISIONS.md` (authoritative — don't relitigate)

Current tag sequence: `mvp0 → mvp1 → mvp2 → mvp2-terminal → mvp3 →
brand-v1`. The "tag spec" agent should propose a name that fits
this progression.

Saved invocation: `~/.claude/workflows/audit-and-tag.md` (the
cross-project version takes `$PROJECT_ROOT` as a placeholder).

---

## `mvp-acceptance` — launch via run-power-up-chess

When an acceptance item requires actually exercising a route, the
verification agent uses the `run-power-up-chess` skill (boots the
local app, opens the route headless). Pure-logic items — engine
classification thresholds, room-state transitions — skip the
launch.

---

## `ship-feature` — PUC pipeline

| Stage | Command |
|---|---|
| Build | `pnpm build` (from repo root, builds both apps via pnpm-workspace) |
| Test | `pnpm test --run` |
| Deploy | `firebase deploy --only hosting` (or named functions) |
| Commit | follow `docs/MVP_ROADMAP.md` conventional-commit style (e.g. `feat(mvp2): ...`, `docs(workflows): ...`) |

---

`screenshot-tour` uses the standard breakpoints from the workspace
file; no PUC-specific override.
