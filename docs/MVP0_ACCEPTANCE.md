# MVP0 Acceptance Checklist

Last updated: 2026-05-31

Live URL: **https://power-up-chess-dev.web.app**

Use this script when running the MVP0 acceptance flow with Ada (or a stand-in).
The goal is qualitative — at the end, does the player want to play another game?
Anything that breaks before that question should be filed as a bug.

## 1. First-time visit

- [ ] Open `https://power-up-chess-dev.web.app/` in a fresh browser (or incognito).
- [ ] Page paints within ~2 seconds; you see the Magic Forest start screen and
      no console errors that are red.
- [ ] Footer shows `Signed in · <8 hex chars>`.
- [ ] Type "Ada" as the name, pick Lucy or Luca.

## 2. Local two-player game

- [ ] Click **Start local game**. Board renders, Lucy/Luca named in header.
- [ ] Click an own pawn → legal-move dots show on its destinations.
- [ ] Tap a destination → piece slides, sound plays (unmuted).
- [ ] Drag a knight onto a legal square — works smoothly on mouse and touch.
- [ ] Capture a piece → Capture Spark card pops above the square with the
      captured piece + value + host line. Card fades after ~1.4 s.
- [ ] Run into check → king square pulses red, check chime plays.
- [ ] Deliver checkmate (try Fool's Mate: `1.f3 e5 2.g4 Qh4#`).
- [ ] Fireworks overlay shows winner; host one-liner is honest; **Review game**
      button appears.
- [ ] Click **New game** → board resets; **Resign** flow works (Resign →
      "Who resigns?" → pick player → loser is correct, board freezes).

## 3. Post-game review

- [ ] After a game ends, click **Review game**. Progress bar shows; engine
      finishes in under 1 minute for a 30-move game.
- [ ] Story Review appears at top (~5–10 s after analysis completes) and reads
      like real prose from your selected host.
- [ ] Click any move with a `?` or `??` badge — host comment loads (LLM in 1–2 s,
      template "· quick" fallback if it times out).
- [ ] Eval bar moves as you click through moves; best-move suggestion shows
      when classification isn't Best.

## 4. Online private room (two devices)

- [ ] Device A: enter name "Ada", pick host, click **Create private room**.
- [ ] URL changes to `/r/XXXXXX`. Banner says "Waiting for an opponent…".
- [ ] Click **Copy link**. Banner flashes "Copied!".
- [ ] Device B (different browser / device): paste the link, set name "Friend",
      click **Join room**. Within 1 second, you're on the board with the
      orientation flipped (black at bottom for Friend).
- [ ] A and B play 8–10 moves. Each move propagates in <500 ms. Captures
      animate on both sides.
- [ ] Mid-game, **refresh both tabs**. After ~1 s both reconnect to the same
      position with no data loss.
- [ ] One side clicks **Resign** → confirm "Yes, resign". Both sides
      immediately see "{loser} resigned — {winner} wins".

## 5. History + privacy

- [ ] StartScreen → **Match history** link. Both games (local + online) appear,
      most-recent first, with correct names, result, and reason.
- [ ] Click a row → re-runs analysis on that PGN. Host says the same recap as
      first time (cached server-side).
- [ ] Click **Forget all data** → confirm → list empties. Refresh confirms
      IndexedDB is cleared.

## 6. Sound + accessibility

- [ ] Click the speaker button in the header → icon switches to muted (line
      through). All sounds stop.
- [ ] Refresh — mute state persists.
- [ ] Unmute again, captures and check sounds play.
- [ ] Keyboard-tab through the StartScreen — focus rings visible, all controls
      reachable.

## 7. Failure modes (sanity)

- [ ] Visit `/r/AAAAAA` (a room that doesn't exist) → see a clear "Room not
      found" page, with a **Back to menu** button.
- [ ] Go offline (DevTools → Network → Offline) at the start screen → "Auth
      error" appears in the footer. (We don't have full offline mode.)
- [ ] During review, throw a `throw new Error('boom')` in DevTools console
      inside the engine worker → review screen surfaces a friendly error
      instead of hanging.

## 8. The Ada test

- [ ] Ada plays through one local game start-to-finish without prompting.
- [ ] Ada understands at least one comment the host made about why a move
      was good or bad.
- [ ] Ada wants to play another game.

If 1–7 pass and 8 happens, MVP0 is accepted.

## Known limits (documented, not bugs)

- Sound on iOS Safari requires a user gesture before the first chime — the
  first move on a fresh page might be silent; from the second move on it's
  fine.
- Stockfish analysis on a slow phone can take a couple of minutes for a
  long game. The progress bar reflects this honestly.
- LLM commentary uses Gemini 3.5 Flash. If the API rate-limits or errors,
  the "· quick" template fallback shows instead — content is still honest,
  just less personal.
- No clocks in MVP0 — games are turn-by-turn without time pressure.
- No public matchmaking. Private link only.
