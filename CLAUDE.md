# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Status

This repository starts **docs-only**. Implementation work begins by scaffolding the project from `docs/DEVELOPMENT_PLAN.md`.

## Product Context (load before designing or coding)

Chess learning game for **Ada, an 8–10 year old at ~300–500 rating**. The `docs/` folder is the source of truth. Several rules constrain implementation:

- **Real chess rules are non-negotiable.** Power-ups are a reward/learning layer — they must never alter legal moves or affect the opponent. chess.js is the rules engine on both client and server.
- **Praise must be engine-backed and honest.** "Brilliant / Excellent / Mistake / Blunder" labels come from Stockfish analysis, not templates. The hosts (Lucy and Luca) must never fabricate facts or call a move brilliant without engine support. See `docs/HOST_PERSONAS.md` for tone rules.
- **Child-safety constraints shape architecture.** No accounts in MVP0 (Anonymous Auth only), no open chat, private-room-link online play only, display names only, local storage by default.
- **Puzzle content has a rights pipeline.** Do not copy book explanations into the app. Original explanations only, validated by engine. See `docs/PUZZLE_CONTENT_PIPELINE.md`. The user owns rights review; engineering must store `rightsStatus` per puzzle but does not gate on it.

When a request is ambiguous, prefer the most specific document:
- Already-decided things → `docs/DECISIONS.md` (authoritative; don't relitigate)
- Implementation plan + acceptance criteria → `docs/DEVELOPMENT_PLAN.md`
- Stack, data model, room model, LLM contract → `docs/TECHNICAL_ARCHITECTURE.md`
- Scope/priority → `docs/MVP_ROADMAP.md`, `docs/PRD.md`
- Visual/feedback feel → `docs/GAME_DESIGN.md`
- Host voice → `docs/HOST_PERSONAS.md`
- Still-open things → `docs/OPEN_QUESTIONS.md` (surface to user before deciding)

## Locked Stack (from DECISIONS.md)

- Frontend: **React + TypeScript + Vite**, custom chess UI + Radix-style unstyled primitives for menus/dialogs
- Chess rules: **chess.js** (client and server)
- Engine: **Stockfish WASM** in a web worker, **post-game analysis only**
- Backend: **Firebase** — Hosting, Firestore (room state + realtime listeners), Cloud Functions (authoritative move validator), Anonymous Auth
- Host commentary: **`gemini-3.5-flash`** called from Cloud Functions only (API key never on the client)
- Storage: **IndexedDB** for MVP0 match history; Firestore for live room state
- Devices: **desktop + tablet** in MVP0, no phone

## Commentary Policy (load before writing host code)

Per-move LLM calls are **selective**:

| Move type | Comment source |
| --- | --- |
| Ordinary (Best / Excellent / Good) | Template, often suppressed |
| Brilliant / Mistake / Blunder | LLM (`gemini-3.5-flash`) |
| Capture Spark card body | Template |
| Post-game Story Review | Single LLM call per game |

Always cache by `(host, classification, fenBefore, moveUci, playerName)`. Always fall back to template on LLM timeout (>3s).

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

- Several technical items are still officially "open" in `docs/OPEN_QUESTIONS.md` (clocks, undo, training-mode hints, mistake-streak handling). Surface these before implementing.
- `docs/books_and_references/` contains ~440 MB of source PDFs/EPUBs and is **git-ignored**. Only its `README.md` is committed.
- When introducing copy/UI text, match host voice rules: warm, specific, not babyish, no false praise, no unsourced chess history. Examples in `docs/HOST_PERSONAS.md`.
- The `data/puzzles/*.json` paths referenced in `docs/PUZZLE_CONTENT_PIPELINE.md` are target schemas, not existing files yet.
