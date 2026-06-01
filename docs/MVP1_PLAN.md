# MVP1 Plan

Last updated: 2026-05-31

MVP0 shipped: https://power-up-chess-dev.web.app · tag `mvp0` ·
65 tests green · live functions: createRoom, joinRoom, submitMove,
resignGame, claimTimeWin, hostCommentary, gameRecap, healthcheck.

MVP0 actually overshot the original spec — we already have **resign**,
**spectator mode**, and **chess clocks** (untimed / 5min / 10+5 / 15+10)
which the PRD listed as future. The remaining MVP1 must-haves and a few
priority items make up this plan.

## Status against the PRD's MVP1 list

| MVP1 must-have | Status |
| --- | --- |
| Online room-based play | ✅ + spectators + clocks |
| Local two-player play | ✅ |
| Engine-backed move quality labels | ✅ (Lichess thresholds + Brilliant heuristic) |
| Lucy/Luca host feedback system | ✅ (gemini-3.5-flash + Firestore cache) |
| Host: Lucy / Luca / both / surprise | Partial — single host only |
| Power-up cards | Partial — only Capture Spark |
| Brilliant move ceremony | Partial — review badge only |
| Move Replay Theater | ❌ |
| Puzzle Garden | ❌ |
| Match history | ✅ (local IDB) |
| Host-led Post-game Story Review | ✅ |
| Multiple visual themes | Partial — Magic Forest only |
| Sound effects + mute | ✅ |

Net remaining: **Puzzle Garden**, **two-tier celebration system**,
**Move Replay Theater**, **Both/Surprise host**, **second theme**, and a
few power-up cards. Plus one priority add-on outside the original list:
**Kind AI Practice** (so Ada has someone to play when no human is around).

## MVP1 goals

Three things should improve qualitatively from MVP0:

1. **Ada has something to do alone.** Today the only solo activity is
   playing herself locally, which is silly. Puzzle Garden + AI Practice
   close this gap.
2. **Winning a game feels like winning.** The current end-of-game overlay
   is functional but flat. The two-tier celebration system makes captures
   and wins more emotionally satisfying without lying about move quality.
3. **The product feels lived-in.** A second theme, both-hosts mode, and
   a richer power-up vocabulary make repeat play feel less repetitive.

## Locked decisions (resolved 2026-05-31)

1. **Puzzle source strategy**: Phase 8 ships with **10–20 hand-authored
   puzzles**. Phase 9 (Polgár 5334 pipeline) runs in parallel and feeds
   the same UI once content lands. **User owns rights review** for
   anything imported from the book.
2. **Kind AI strength**: Start with **Stockfish skill 0 + depth 4**
   (≈ Elo 600–800). Tune from Ada's reactions. No "fake blunder" mode —
   Ada wins or loses real games.
3. **Celebration tiers**:
   - **Tier 1 — "Power Up"**: every capture. Upgrades the current
     Capture Spark with a larger card, board-flash, and intensity
     scaled by captured piece value (P=1 → mild, Q=9 → big).
   - **Tier 2 — "Brilliant" win ceremony**: triggers on **game win
     only** (mate, time win, opponent resign). Full-screen overlay
     with crown, flowers, fireworks, and prominent animated reveal of
     the host's recap. Losses keep the current gentler overlay.
   - Engine-detected Brilliant moves continue to get the **badge** in
     Post-game Review but no separate in-game ceremony.
4. **Second theme**: **Starry Universe** (night-sky palette + constellation
   line accents). Validates that the theme abstraction holds.
5. **Polgár 5334 usage**: Approved for MVP1 — user is doing the rights
   review in parallel.

## Phases

### Phase 8 — Puzzle Garden v0 (hand-curated)
**Target: ~1 week**

Hand-authored puzzles ship first so the UI is validated before the
import pipeline begins. Puzzles cover the motifs that move a 300–500
player most: mate-in-1, hanging pieces, simple forks, simple pins.

| # | Task | Acceptance |
|---|---|---|
| 8.1 | `data/puzzles/seed.json` — 10–20 hand-authored puzzles with FEN, side-to-move, solution UCI(s), motif, difficulty, child-friendly explanation, sourceId=`seed` | Each puzzle validates: chess.js confirms solution is legal and lands on a winning position |
| 8.2 | `src/puzzles/types.ts` + `src/puzzles/loader.ts` — load + index puzzles by motif/difficulty | Unit test loads seed.json without throwing |
| 8.3 | `src/puzzles/PuzzleScreen.tsx` at `/puzzles/:id` — board, "Your move", piece-drag, accepts only the solution, shows correct/incorrect feedback | Manual: drag the solution → cheerful confirmation; drag wrong → soft "not quite, try again" |
| 8.4 | Hint ladder (3 levels): gentle nudge → tactical clue → near-solution. Each hint consumed marks the attempt | Manual: solve with 1 hint → progress records `hintsUsed: 1` |
| 8.5 | "Show solution" reveals the line one move at a time with arrows | Manual: stuck → solution animates from start position |
| 8.6 | IndexedDB `puzzle_attempts` store. Saves `{puzzleId, completedAt, hintsUsed, attempts, result}` | Solve, refresh, re-enter → puzzle marked solved |
| 8.7 | `src/screens/PuzzleGardenScreen.tsx` at `/puzzles` — list of puzzles grouped by motif, "solved" badge per puzzle, "next unsolved" CTA | Manual: enter Garden → unsolved puzzles visible, solved show ✓ |
| 8.8 | StartScreen entry "Puzzle Garden" alongside Match history | Manual: clear path Start → Garden → Puzzle → solve → back |

### Phase 9 — Puzzle import pipeline (Polgár 5334)
**Target: ~1 week, can run in parallel with Phase 8 once 8.2 lands**

Per `docs/PUZZLE_CONTENT_PIPELINE.md` stages. The pipeline runs offline,
emits normalized JSON into `data/puzzles/polgar/`, and Phase 8's loader
picks them up alongside the seed set.

| # | Task | Acceptance |
|---|---|---|
| 9.1 | `tools/puzzle-import/` — local Node script. Reads the Polgár EPUB at `docs/books_and_references/Chess _ 5334 ...epub`, extracts diagrams + solution text | Script reports puzzle counts per chapter; no crashes |
| 9.2 | OCR/parse → FEN + side-to-move + claimed solution. Track problem number + page for traceability | 50 sample puzzles parse with ≥90% diagram-to-FEN accuracy |
| 9.3 | Stockfish validation (reuse `apps/web` lite-single via node-wasm) — engine agrees solution is best move and reaches the claimed outcome (mate / decisive material) | Validation rejects garbage with no false negatives on the sample 50 |
| 9.4 | LLM-rewritten child-friendly explanation per puzzle, using the same Lucy/Luca persona blocks. Cached by puzzle hash | First 50 puzzles each have 1–2 sentence original explanation |
| 9.5 | Output `data/puzzles/polgar/00001.json … .json` with full metadata + `rightsStatus` field; manifest at `data/puzzles/manifest.json` | Phase 8 UI loads them with zero code changes |
| 9.6 | Human-review queue: a CLI / static page that walks unreviewed puzzles for the user to approve/reject. Approved puzzles get `rightsStatus: 'approved'` | User approves 50 puzzles end-to-end |

### Phase 10 — Kind AI Practice
**Target: 3–4 days**

A friendly Stockfish opponent. New mode in StartScreen.

| # | Task | Acceptance |
|---|---|---|
| 10.1 | `src/ai/AiOpponent.ts` — wraps a second Stockfish worker instance, exposes `pickMove(fen, settings)` returning `bestmove` after `setoption name Skill Level value N` + `go depth D movetime M` | Standalone smoke: from start position, returns a legal move within 1 s at skill 0 |
| 10.2 | StartScreen entry "Practice with AI" + difficulty picker (Beginner / Easy / Medium) | Selection persists in profile |
| 10.3 | `AiPracticeScreen` — reuses Board + sound + Capture Spark + clocks-optional. AI thinking indicator (subtle "…" on opponent card) | Manual: full game from start to checkmate against Beginner |
| 10.4 | AI moves also trigger host commentary (notable moves only, same path as PvP) | Manual: AI plays a blunder → "Mistake" badge + host line |
| 10.5 | Save AI games to history with `mode: 'ai'` and difficulty tier; HistoryScreen shows AI tier | Replay an AI game from history → board renders correctly |

### Phase 11 — Two-tier celebration system + Move Replay Theater
**Target: 3–4 days**

| # | Task | Acceptance |
|---|---|---|
| 11.1 | **Power Up (Tier 1)**: upgrade Capture Spark — bigger card, brief board flash overlay, intensity scales with `PIECE_VALUE` (pawn = current; queen = ~1.7× scale + sparkle particles); replaces the existing minimal capsule | Manual: capture a pawn → small pop; capture a queen → big pop with particles |
| 11.2 | **Brilliant (Tier 2)** win ceremony: new `BrilliantWinCeremony` component fired by GameEndOverlay when `status` is mate/timeout/resign **and viewer is the winner**. Crown SVG scales in from bottom-center, flowers fall on either side, fireworks burst around the headline. Host recap appears with letter-by-letter reveal and a small pulsing "host avatar" placeholder | Manual: win a local game as the active side → full ceremony; lose → unchanged gentler overlay |
| 11.3 | **Move Replay Theater** (separate, educational): after game ends, on the PostGameReviewScreen, key moments (captures of ≥3 points, mating sequences) get a "▶ Replay" button. Click → arrow overlay on board animates the relevant 1–3 ply | Manual: in a finished game with a tactic, click the Replay button → arrows draw, pieces animate, then return |
| 11.4 | Engine-detected Brilliant moves keep their badge in Post-game Review — confirm no in-game ceremony fires there | Manual: play a brilliant-move test position → review shows Brilliant badge, no full ceremony |

### Phase 12 — Both / Surprise host + Starry Universe theme
**Target: 3 days**

| # | Task | Acceptance |
|---|---|---|
| 12.1 | StartScreen host picker extended to 4 options: Lucy / Luca / Both / Surprise | Selection persists |
| 12.2 | "Both" mode: one host leads (deterministic by game id so it's not jarring), the other adds a short reaction after notable moves (brilliant / mistake / blunder / mate). LLM prompt context flags `mode: 'both'` + which is leading | Manual: notable move in Both mode → primary host comment + brief secondary reaction |
| 12.3 | "Surprise" mode: random Lucy or Luca per session, decided once at game start; UI tells you which | Manual: 5 surprise starts produce a mix of Lucy and Luca |
| 12.4 | `src/theme/starry-universe/tokens.css` — night-sky palette, gold/silver accents, board uses deep indigo + soft purple squares with subtle star-field background. Pieces stay readable | Manual: switch theme, every screen looks coherent, contrast passes |
| 12.5 | Theme picker in StartScreen + persisted choice; theme applied globally via `data-theme` attribute | Switch theme mid-flow → re-renders without reload |

### Phase 13 — Remaining power-ups + acceptance
**Target: 2–3 days**

| # | Task | Acceptance |
|---|---|---|
| 13.1 | **Tactic Bloom**: fires when a move wins ≥3 points of material in a forcing sequence (cheap heuristic: classification is `excellent` or `best` AND the move captures or follows a check). Flower-burst animation around the destination | Manual: win a knight via fork → bloom fires; routine recapture doesn't |
| 13.2 | **Crown Spark**: accumulates progress across excellent/best moves and mates; persisted in profile; small crown icon counter near the host name | Manual: 5 excellent moves over multiple games → counter ticks each time |
| 13.3 | **Hint Sparkle**: in Puzzle Garden only, "use a sparkle" button shows the next-move arrow once. Counts against `hintsUsed` | Manual: stuck in puzzle → sparkle → solution arrow visible briefly |
| 13.4 | **Replay Ribbon**: a "▶" badge next to past notable moves in the move list. Click → triggers the Phase 11 Move Replay Theater for that move | Manual: post-game review, click ▶ on any move → replay overlay |
| 13.5 | `docs/MVP1_ACCEPTANCE.md` — run the new flow with Ada (or stand-in). Re-deploy + tag `mvp1` | All checks pass; tag pushed |

**Phase total: ~3–4 weeks calendar time.**

## What we are NOT doing in MVP1 (deferred to MVP2)

- **Account system / email login** — Anonymous Auth covers everything we
  need. Adds complexity without unlocking new behaviour for Ada.
- **Cross-device history** — IDB stays local. Cross-device sync is for
  multi-child or device-switch scenarios that aren't on the table.
- **Mobile phone layout** — PRD scope is desktop + tablet only.
- **Voice host / animated avatar** — Listed for MVP2.
- **Real TTS for the Tier 2 ceremony "narration"** — Visual letter-by-letter
  reveal only in MVP1. Audio voice arrives with the broader Voice work later.
- **Opening / endgame mini-lessons** — Out of scope until Puzzle Garden
  pulls its weight.
- **Famous Women in Chess cards** — Per PRD, these need verified sourcing.
  Defer until reference-book pipeline is mature.
- **Parent dashboard** — Per PRD, only if the product expands beyond Ada.

## Risk register

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Polgár pipeline blocks Phase 9 (EPUB diagrams as images, OCR quality) | Garden runs on the 50 hand puzzles only | Phase 8 ships independently; pipeline failure doesn't block MVP1 |
| AI Practice feels too hard at skill 0 | Ada gets frustrated | Reactive: add a "Tutor" tier with skill 0 + depth 1 + 50 ms |
| Tier 2 ceremony too long on losses (we already fire fireworks for losses today) | Loser dwells on the loss | Loss path uses the existing gentler overlay; only winners see Tier 2 |
| Both-hosts mode produces over-talkative commentary | Distracts from board | Secondary host reaction capped to one comment per notable move, prompt-enforced |
| Starry Universe theme exposes hard-coded Magic Forest colours | Theme switch looks broken in one screen | Audit CSS during 12.4; fix any literals → tokens |

## Open questions to confirm during Phase 8

1. Should puzzle solving award something visible (e.g. a Crown Spark
   tick)? Currently planned: yes, via 13.2.
2. Where in the StartScreen does "Practice with AI" sit — same panel as
   Online and Local, or its own?
3. Tier 1 Power Up animation: should it block board input briefly (so
   the next move waits for the spark to clear), or never block?
   Recommendation: never block — chess flow comes first.
