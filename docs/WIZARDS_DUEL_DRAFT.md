# Wizard's Duel — Design Draft

Last updated: 2026-06-01
Status: **DRAFT — for discussion**

A chess-variant game living as the 6th Hall door, separate from "real"
chess. Uses the same board, pieces, and Board UI; runs its own
`WizardChess` engine (chess.js wrapped with a magic-state overlay).
Doesn't touch castle points, doesn't go on the chess leaderboard,
doesn't feed into Stockfish review. Pure fun + experimentation.

---

## 1. Locked-by-default

These follow naturally from option (b) — speak up if any are wrong.

1. **New game, not a chess mode.** Plays in `/wizard` like Forest plays
   in `/forest`. Real chess pages (Online / Local / Practice / Puzzles)
   never see magic.
2. **Same Board UI.** Reuses `<Board>` and the piece glyphs; magic
   effects render as overlay icons on affected squares (ice cube, swirl,
   shield ring, etc.).
3. **King-capture victory.** Standard chess checkmate detection gets
   weird with magic ("the king is in check but the attacker is frozen
   — checkmate?"). Simpler rule: **game ends when a king is captured.**
   No "check", no stalemate.
4. **Earns no castle points.** Wins / losses persist to a local
   wizard-runs IDB store (mirror of forest_runs).
5. **MVP scope: local two-player only.** No AI, no online. If it
   catches on we add a Stockfish-blind random AI later.

---

## 2. The magic system — proposed mechanics

### 2.1 Mana
- Each player starts a duel with **0 mana**.
- Every move (any piece, even just sliding a pawn) earns **+1 mana**.
- Captures earn bonus mana = captured piece's value:
  - pawn +1, knight/bishop +3, rook +5, queen +9.
- Mana is a pool, no per-turn cap.

### 2.2 Casting a spell
- On your turn, instead of moving a piece, you can **cast a spell**.
- Open a "spellbook" panel: list of spells you can afford right now.
- Pick a spell → board enters target-selection mode → click the
  target square → spell applies.
- Spell-casting **counts as your turn** (so casting is a real cost,
  not a freebie).

### 2.3 Proposed spellbook (MVP)

| Spell | Cost | Effect | Duration |
| --- | --- | --- | --- |
| ❄ Freeze | 4 | Target piece cannot move | 2 of YOUR opponent's turns |
| 😵‍💫 Confuse | 3 | Target piece can move but cannot capture | 2 opponent turns |
| 🛡 Shield | 5 | Target piece is immune to capture | 2 opponent turns |
| ✨ Teleport | 6 | Swap any TWO of YOUR OWN pieces (so 2 clicks) | instant |
| 👻 Phantom | 7 | Target friendly piece can pass through other pieces this turn | 1 of YOUR turns |
| 🪄 Summon Pawn | 8 | Drop a new pawn of your colour on any empty square in your half | instant |

Numbers are starting points; tune after one game. Note: spells only
ever target legal squares — you can't Freeze the opposing king (that
would be game-over-by-spell); you can't Summon onto an occupied square.

### 2.4 Status effects render as
- ❄ Freeze: blue ice tint + small snowflake badge on the square
- 😵‍💫 Confuse: pulsing purple swirl
- 🛡 Shield: golden ring around the piece
- 👻 Phantom: ghostly translucent piece for that one turn

Effect badges show a tiny countdown (`2` → `1` → expires).

### 2.5 Casting "feel"
- Hovering a spell in the spellbook tints valid target squares green
  on the board (so the player knows what's selectable).
- Casting plays one of the existing Power Up sounds + a colored
  particle burst on the target.
- Host (Lucy/Luca) gets a one-liner: "Brave! That changes the air."

---

## 3. Critical open questions

| # | Question | My recommendation |
| --- | --- | --- |
| 3.1 | King-capture or modified checkmate? | **King-capture.** Simpler, harder to ambiguity-trap with effects. |
| 3.2 | Can you cast a spell that immediately captures the opposing king (e.g. teleport your queen next to it then it's still your turn)? | **No.** Teleport is your turn; capture happens next turn unless they react. |
| 3.3 | Can spells target the KING? (Freeze the king?) | **Yes, except spells that would end the game immediately.** Freezing the enemy king is a strong move but doesn't auto-win. Spells like "Shield" can also protect your own king. |
| 3.4 | Should mana be visible to the opponent? | **Yes.** Bluffing's not the point — the strategy is open. |
| 3.5 | What about en passant, castling, promotion? | **Keep them.** Only the "what can move where" rules are warped; promotion / castling / en passant survive. |
| 3.6 | Should the AI Practice door spawn a Wizard AI eventually? | **Defer.** A serious wizard AI is a research project. Stockfish doesn't know spells. |
| 3.7 | Spellbook size — start with the 6 above, or bigger? | **6 is the right starter.** Easy to remember, real strategic variety. |
| 3.8 | Time control? | **Untimed for v1.** Magic needs thinking. |
| 3.9 | Does Wizard's Duel show up to bypass guests? | **Yes — like Forest, it's free fun. No score-keeping for bypass anyway.** |

---

## 4. Implementation sketch

If we proceed, rough phases:

| Phase | Scope | Estimate |
| --- | --- | --- |
| **W.1** | `WizardChess` engine wrapping chess.js. Overlay state: `effects: Map<square, Effect[]>`, `mana: {w, b}`. Move generation filtered by effects. King-capture detection. Unit tests. | 2 days |
| **W.2** | `WizardDuelScreen` (route `/wizard`). Board + spellbook side panel + mana bars + status-effect overlay icons. Local 2-player. | 2 days |
| **W.3** | Spell-casting flow: pick spell → highlight valid targets → click → resolve. Spell sound + particle. | 1.5 days |
| **W.4** | Host commentary hooks (template-only for MVP, no LLM). Hall door + routing + IDB persistence + acceptance text. | 1 day |

~6-7 days end-to-end.

---

## 5. What we are NOT doing in v1

- AI opponent (no Stockfish — it can't reason about magic).
- Online play (would need server-authoritative magic state, big effort).
- Spell custom-builder.
- Mana decay / time limits on cast.
- Public leaderboard.
- Spell unlocks / progression (every spell is available from move 1).
- Saved replays.

---

## Decisions needed before coding

Just need a thumbs-up or redirect on:

1. §1 (the 5 default locks) — anything to change?
2. §2.3 spellbook — these 6 spells, these costs? Drop / add any?
3. §3 open questions — accept the recommendations, or override?
