# MVP1 Acceptance Checklist

Last updated: 2026-06-01

Live URL: **https://power-up-chess-dev.web.app**

This script is the qualitative end-state for MVP1. If sections 1–10 pass and
Ada (or a stand-in) reaches section 11, MVP1 is accepted.

Items already covered by `MVP0_ACCEPTANCE.md` are not re-listed here — run that
script first if MVP0 hasn't been verified on the current deploy.

## 1. Start screen — host + theme + clock

- [ ] First load shows the Magic Forest theme. Footer hex matches MVP0.
- [ ] Host picker shows **four** options: Lucy / Luca / Both / Surprise.
      Selecting **Surprise** picks one of Lucy/Luca and tells you which.
- [ ] Selecting **Both** persists across reload.
- [ ] Theme toggle near footer switches to **Starry Universe**. Every screen
      (start, garden, board, review) re-renders in night-sky palette with
      no leftover green panels or unreadable text.
- [ ] Theme choice persists across reloads.
- [ ] Clock picker exposes Untimed / 5 min / 10+5 / 15+10. Selection
      persists.

## 2. Local game — Power Up + Tactic Bloom

- [ ] Start a local game in **Both** mode. Header shows both host names
      ("Lucy & Luca"). The capture spark line alternates between the two
      hosts across consecutive captures.
- [ ] Capture a **pawn** → small Power Up card pops, no particles.
- [ ] Capture a **knight or bishop** → bigger card with a particle burst.
- [ ] Capture a **queen** → loudest card, board flash glow under the
      square, particles fan out farther.
- [ ] Set up a position where you can take a defender of a fork, then
      capture the resulting hanging piece. The **Tactic Bloom** flower
      petals should fan out around the destination square — only when the
      captured piece is worth ≥3 AND the capture either delivered check
      or was made out of check. Routine recaptures should NOT bloom.
- [ ] Deliver checkmate → **Brilliant Win Ceremony** triggers (crown
      scales in, flowers fall, fireworks burst, host recap reveals
      letter-by-letter). Loser screen stays calm.
- [ ] The Crown badge in the header increments by 1 after the win.

## 3. AI Practice — Kind opponent

- [ ] StartScreen → **Practice with AI**. Pick **Beginner**.
- [ ] First AI move arrives within ~1 s of your move. Opponent card shows
      "…" while thinking.
- [ ] Captures from either side trigger the same Power Up + Tactic Bloom
      treatment as local mode.
- [ ] Win the game (AI Beginner should be beatable). Brilliant ceremony
      fires only because **you** won; if you lose, the calmer overlay
      shows.
- [ ] Crown counter only ticks when **you** win, not when the AI wins.
- [ ] AI game saves to history with a "Beginner" tier label.

## 4. Online room — spectators + clocks + Tactic Bloom

- [ ] Device A creates a private room with a **5 min** clock. Banner says
      "Waiting for an opponent…". Clock shows 5:00.
- [ ] Device B joins via link → 1 s later the game starts, both clocks
      tick down on the active side.
- [ ] Device C (third browser) opens the same link → joins as
      **Spectator**. Header shows "Spectating" chip. Spectator sees
      moves, sparks, and blooms but cannot drag pieces.
- [ ] Spectator does NOT see a Crown badge in the header.
- [ ] Active player A captures a piece in response to check → Tactic
      Bloom fires on all three devices.
- [ ] One side runs the clock out (or click Resign). Both players and
      spectator see the same end-state and Brilliant ceremony (winner
      only). Spectator sees the calmer overlay regardless.
- [ ] Crown counter increments by 1 on the **winner's** device only.

## 5. Post-game Story Review

- [ ] After any game (local, AI, or online), click **Review game**.
      Analysis bar fills, Story Review renders in selected host's voice.
- [ ] Move list shows ✓ / Best / Excellent / ?! / ? / ?? badges.
- [ ] Brilliant moves carry the **Brilliant** badge (no full ceremony).
- [ ] At the end of analysis the Crown counter jumps by the number of
      Best + Excellent moves found in the game (across both sides).
- [ ] Click any past move with a captured piece worth ≥3 → **▶ Replay**
      button is visible. Click it → arrow overlay animates the move.

## 6. Puzzle Garden — discovery + solving

- [ ] StartScreen → **Puzzle Garden**. Puzzles listed grouped by motif:
      Mate in 1, Mate in 2, Fork, Pin, Skewer, Hanging Piece, Back-rank
      Mate. Each card shows a star count or "unsolved".
- [ ] "Next unsolved" CTA jumps to the first unsolved puzzle for the
      strongest motif.
- [ ] In a puzzle: legal moves dot up on click. Wrong solution shakes
      the board, doesn't apply. Correct solution applies with capture
      sound + spark if relevant.
- [ ] Hint ladder: click **Show hint** up to 3 times → progressively
      more revealing nudges. Each click increments `hintsUsed`.
- [ ] Click **Show arrow** (Hint Sparkle) → the next-move arrow draws
      briefly (~2 s) then fades. Counts as a hint. Button greys out
      after one use per puzzle.
- [ ] Click **Show solution** → marks the puzzle as not-solved, plays
      back the full line move-by-move.
- [ ] Solve a puzzle in <30 s with 0 hints → 3 stars + a big points
      number. Solve slowly with hints → fewer points/stars.
- [ ] Refresh page → solved puzzle still shows ✓ and best score.
- [ ] Garden total points counter at top reflects sum of best attempts.

## 7. Match history

- [ ] StartScreen → **Match history**. Local, AI, and online games all
      appear, with mode label, opponent name, and result.
- [ ] Click a row → re-runs review on that PGN (cached server-side after
      first run). Crown counter does NOT double-count on re-review of a
      game whose review was already done — `addCrowns` is fine to fire
      again on each analysis completion; deliberate per-mount behavior.
- [ ] **Forget all data** clears history AND the crown counter resets
      to 0.

## 8. Crown Spark counter (cross-cutting)

- [ ] On a fresh profile, StartScreen does NOT show the Crown hero badge
      (count is 0).
- [ ] After your first win, StartScreen hero shows the gold Crown badge
      with the count and "earned across your games" caption.
- [ ] Crown badge appears in the in-game header for local + AI + online
      (only when you have a color in online — spectators see no badge).
- [ ] Badge value re-reads after each game end without a page refresh.

## 9. Sound, mute, accessibility

- [ ] Mute toggle in header silences capture, move, check, mate, draw
      sounds. State persists across reload.
- [ ] Tactic Bloom plays no extra sound (visual only).
- [ ] Keyboard-tab through StartScreen → focus rings visible, all four
      hosts reachable, theme toggle reachable, garden + history links
      reachable.

## 10. Failure modes

- [ ] Visit `/r/AAAAAA` → "Room not found" + Back to menu.
- [ ] DevTools offline at StartScreen → footer auth error.
- [ ] Puzzle Garden loaded with corrupt local storage (manually clear
      `puc-history` while a puzzle is open) → still solvable, save
      degrades gracefully.

## 11. The Ada test (qualitative)

- [ ] Ada starts on her own. Picks a host without help.
- [ ] Ada plays at least one AI Practice game and one Puzzle Garden
      puzzle in a single session.
- [ ] When Ada wins a game, she points at the crown counter and notices
      it ticked up.
- [ ] Ada asks to switch themes at least once (Starry Universe → back to
      Magic Forest or vice versa).
- [ ] At the end of the session, Ada says she wants to come back.

If 1–10 pass and 11 happens, MVP1 is accepted.

## Known limits (documented, not bugs)

- Puzzle Garden ships with ~210 sampled Lichess CC0 puzzles. Repetition
  will happen if Ada solves through the whole set.
- Tactic Bloom uses a cheap heuristic (capture ≥3 + check involvement).
  It will miss some forcing tactics that don't pass through a check
  (e.g. pure skewers without check). Acceptable for MVP1.
- Crown counter is local-only (lives in profile, IDB-backed). No
  cross-device sync.
- AI opponent at Beginner is real Stockfish skill 0 + depth 4 — not a
  scripted easy bot. Some moves can still surprise.
- Both-hosts mode shares a single LLM call for primary commentary; the
  secondary host's reaction is template-based, not LLM-generated, to
  keep latency low.
- Brilliant Win Ceremony is visual only — no real TTS narration yet.
