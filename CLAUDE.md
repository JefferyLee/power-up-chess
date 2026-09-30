# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Status

**Implemented and deployed.** The app is live at <https://power-up-chess-dev.web.app> (custom domain **app.powerupcastle.app**, behind Cloudflare). MVP0–MVP2 shipped and MVP2+ side features are in; the `docs/` folder is planning/intent, so cross-check any doc against the running app before assuming something is unbuilt.

- **What exists / how done it is:** `docs/FEATURE_MAP.md` (living source of truth — Hall doors → routes → points → status).
- **Run it:** `pnpm install && pnpm dev` (starts the web app on Vite). See `README.md` → Quickstart.
- **Stack & data model:** `docs/TECHNICAL_ARCHITECTURE.md`. **Still-open decisions:** `docs/OPEN_QUESTIONS.md`.
- **3D board:** `apps/web/src/board3d/` (three.js). The 🎲 3D/2D toggle (`useView3d.ts`) is offered on Local / AI / Online / Review / Daily Five / Plot / Wizard's Duel; keyboard + ARIA exist on the 2D board only.
- **The Siege (Tower Defense):** chess-themed 3D game at `/arcade/tower-defense` — client `apps/web/src/games/siege/`, server `functions/src/siege/`; no castle points. Spec: `docs/SIEGE_DESIGN.md`.
- **Review checklist / refactor plan:** `docs/REVIEW_2026-09.md` — phased must-fix → hardening → front-end → upgrades list; tick items there as they land.

## Product Context (load before designing or coding)

Chess learning game for **Ada, an 8–10 year old at ~300–500 rating**. The `docs/` folder is the source of truth. Several rules constrain implementation:

- **Real chess rules are non-negotiable.** Power-ups are a reward/learning layer — they must never alter legal moves or affect the opponent. chess.js is the rules engine on both client and server.
- **Praise must be engine-backed and honest.** "Brilliant / Excellent / Mistake / Blunder" labels come from Stockfish analysis, not templates. The hosts (Lucy and Luca) must never fabricate facts or call a move brilliant without engine support. See `docs/HOST_PERSONAS.md` for tone rules.
- **Child-safety constraints shape architecture.** Display names only, local storage by default. Online play is private-room-link only (no public matchmaking). MVP0 was Anonymous Auth + no chat; **MVP2** introduces:
  - A `name + magic word` identity layer on top of Anonymous Auth so progress persists across sessions. This is NOT real authentication — `sha256` hash only, no password recovery, 3-strike + bypass flow.
  - Open shared chat in the Great Hall (大厅) lobby. Moderated server-side (profanity filter, rate limits, report-flag, auto-hide). **No** in-game chat. **No** DMs.
- **Content has a rights pipeline.** Do not copy book content into the app. Original wording / retellings only, validated by engine where applicable. Applies to:
  - **Puzzle explanations** — see `docs/PUZZLE_CONTENT_PIPELINE.md`.
  - **Host stories** in the Hall — extracted via `tools/story-import/` from `docs/books_and_references/` with an anti-verbatim guardrail. See `docs/MVP2_PLAN.md` §6.5.
  - In both cases the user owns rights review; engineering stores `rightsStatus` per item but does not gate on it.

When a request is ambiguous, prefer the most specific document:
- Already-decided things → `docs/DECISIONS.md` (authoritative; don't relitigate)
- Implementation plan + acceptance criteria → `docs/DEVELOPMENT_PLAN.md`
- Stack, data model, room model, LLM contract → `docs/TECHNICAL_ARCHITECTURE.md`
- Scope/priority → `docs/MVP_ROADMAP.md`, `docs/PRD.md`
- Visual/feedback feel → `docs/GAME_DESIGN.md`
- Host voice → `docs/HOST_PERSONAS.md`
- MVP2 (Castle + Hall + Magic Word + stories + Forest) → `docs/MVP2_PLAN.md`
- Still-open things → `docs/OPEN_QUESTIONS.md` (surface to user before deciding)

## Locked Stack (from DECISIONS.md)

- Frontend: **React + TypeScript + Vite**, custom chess UI + Radix-style unstyled primitives for menus/dialogs
- Chess rules: **chess.js** (client and server)
- Engine: **Stockfish WASM** in a web worker, **post-game analysis only**
- Backend: **Firebase** — Hosting, Firestore (room state + realtime listeners), Cloud Functions (authoritative move validator), Anonymous Auth
- Host commentary: **`gemini-3.5-flash`** called from Cloud Functions only (API key never on the client)
- Storage: **IndexedDB** for MVP0 match history; Firestore for live room state
- Devices: **desktop + tablet** primary; phones supported but not a primary target (DECISIONS #22 superseded 2026-07-02)

## Commentary Policy (load before writing host code)

Per-move LLM calls are **selective**:

| Move type | Comment source |
| --- | --- |
| Ordinary (Best / Excellent / Good) | Template, often suppressed |
| Brilliant / Mistake / Blunder | LLM (`gemini-3.5-flash`) |
| Capture Spark card body | Template |
| Post-game Story Review | Single LLM call per game |

Always cache by `(host, classification, fenBefore, moveUci, playerName)`. Always fall back to template on LLM timeout (8 s — `callGeminiWithTimeout` in `functions/src/commentary/gemini.ts`; the cache is Firestore `commentary/{hash}`).

## Move Classification Thresholds (locked for MVP0)

| Label | cp loss vs engine best |
| --- | --- |
| Best / Excellent | ≤ 10 (Best = exact engine move) |
| Good | 11–50 |
| Inaccuracy | 51–100 |
| Mistake | 101–200 |
| Blunder | > 200 |

Brilliant is a separate heuristic (best/near-best + sacrifice + sacrifice not trivially recovered + eval preserved + not already winning + non-trivial position). Full spec in `docs/TECHNICAL_ARCHITECTURE.md`.

## Working Style Notes Specific to This Project

- Clocks, takeback/undo, AI-practice hints and mistake-streak handling are **decided** (`docs/DECISIONS.md` #34–#37, #20) — don't reopen them. What is genuinely open lives in `docs/OPEN_QUESTIONS.md` (two-player hint consent, name-address cadence, "what were you thinking" prompts, both-host mode, card gallery, per-book rights); surface those before implementing.
- `docs/books_and_references/` contains ~440 MB of source PDFs/EPUBs and is **git-ignored**. Only its `README.md` is committed.
- When introducing copy/UI text, match host voice rules: warm, specific, not babyish, no false praise, no unsourced chess history. Examples in `docs/HOST_PERSONAS.md`.
- `data/puzzles/lichess.json` is the shipped puzzle bank (Lichess CC0 import, 5,362 puzzles). The other `data/puzzles/*.json` paths in `docs/PUZZLE_CONTENT_PIPELINE.md` (`sources.json`, `puzzles.json`, `puzzle_attempt_schema.json`) are target schemas for future curated sets, not existing files.
- For audits / MVP acceptance checks / multi-screen sweeps, fan out one agent per dimension and synthesize. Don't grep + read serially in the main loop — burn through context for no reason. See `docs/WORKFLOWS.md` for the project's common workflow shapes.
- When generating content (riddles, lore, puzzles, stories, host lines): use LLM agents for *candidate generation* only — child-safety rules in `docs/DECISIONS.md` mean every shipped string passes through a human gate. Adversarial-verification can pre-filter (chess legality, age-appropriateness, host voice), but the keepers are picked by Jeff, not the model.
