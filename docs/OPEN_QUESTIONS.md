# Open Questions

Swept 2026-07-03 (Path B Phase 4.2). Most historical questions are now
resolved **in code** — each carries a pointer. Genuinely open items sit in
the last section. Build-status source of truth: [`FEATURE_MAP.md`](FEATURE_MAP.md).

## Resolved — Product

1. **Clocks?** Resolved in code: presets 5+0 / 10+0 / 15+10 / No clock
   (`apps/web/src/clock/timeControl.ts`); online defaults 10+0, AI practice
   defaults untimed.
2. **Undo in local/AI?** Resolved: paid takeback in every mode (3/game,
   100/200/800 pts); online is an opponent-accepted offer
   (`functions/src/rooms/takeback.ts`).
3. **Mistake streaks?** Resolved: 3+ own mistakes/blunders → one-time gentle
   nudge toward Daily Five + softened host recap (`playerStruggled`).
4. **Ceremony rarity?** Resolved: the grand crown ceremony fires on the first
   win ever / forced milestones; ordinary wins get a lighter celebration
   (`powerups/GameEndOverlay.tsx`).

## Resolved — Hosts

- **Suggest breaks?** Yes — the rough-game nudge does exactly this.
- **Lucy/Luca style balance?** Encoded in `functions/src/shared/personas.ts`
  (single source of truth; snapshot-tested).
- **Notation?** Conversation = plain language; per-move review may name moves
  in simple SAN (Phase 2 #5, in the shared persona rules).

## Resolved — Game Design

- **Piece sets decorative?** Yes — 8 purchasable sets, incl. one animated
  (Glowing Crystal); pure cosmetics, never rules.
- **Capture animations short + replayable?** Yes — CaptureSpark is brief;
  the review screen has per-move Replay (▶) for captures/checks/mate.
- **Power-up value-aware?** Yes — Tactic Bloom keys off captured-piece value
  ≥3 with check context.

## Resolved — Puzzles

- **Book pipeline questions (OCR, solutions)?** Superseded — the shipped
  puzzle source pivoted to the Lichess CC0 database (5,362 validated
  puzzles); the book pipeline remains available for future curated sets.
- **Host-voice explanations?** Yes — authored `explanation` → `explainPuzzle`
  LLM → motif template chain, plus the `tools/puzzle-explain/` review
  pipeline.
- **Difficulty estimation?** Lichess ratings + player calibration
  (`puzzles/calibration`).

## Resolved — Safety & Privacy

- **Audience?** Path B: friends-and-family testing (AUDIT_AND_PLAN, 2026-07-02).
- **Nicknames only?** Yes, server-verified (Phase 1.4).
- **Deletable data?** Yes — `forgetMe` erases server + local (Phase 5/1).
- **No-LLM toggle?** Yes — template-only hosts (Settings).
- **Legal review timing?** Before any public release (Path C gate);
  engineering pre-read in `COPPA_CHECKLIST.md`.

## Still open

1. **Online hints if both players agree** — AI-practice hints shipped
   (💡 ×3/game); the two-player consent variant is unbuilt and undecided.
2. **Host addressing Ada by name — how often?** Currently LLM discretion via
   personas; no explicit cadence rule.
3. **"What were you thinking?" prompts** after interesting moves — unbuilt.
4. **Both-host / surprise-host mode** — types + partial code exist, no
   product entry; **deferred** (AUDIT_AND_PLAN 1.6).
5. **Power-up card gallery** (collectible view) — unbuilt; Shop owns
   cosmetics today.
6. **Per-book puzzle imports** — rights review per source still owned by
   Jeff; engineering stores `rightsStatus` and does not gate on it.
