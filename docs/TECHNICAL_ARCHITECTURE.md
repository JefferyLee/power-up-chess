# Technical Architecture

Last reviewed: 2026-05-31

## Locked Stack For MVP0

| Layer | Choice |
| --- | --- |
| Frontend | React + TypeScript + Vite |
| UI primitives | Custom chess UI; Radix UI primitives (or equivalent unstyled lib) for menus/dialogs only |
| Animation | CSS transitions; Framer Motion if needed for sequence work |
| Chess rules | chess.js (client and server) |
| Engine | Stockfish WebAssembly, browser-side, post-game only |
| Realtime backend | Firebase Firestore + Cloud Functions |
| Hosting | Firebase Hosting |
| Local storage | Browser IndexedDB (via `idb` or `Dexie`) for match history |
| Host commentary LLM | `gemini-3.5-flash` (Google Generative AI SDK) |
| Devices | Desktop + tablet are the primary targets. **Phones are supported (safe-area, ≥44px touch targets, portrait-locked PWA) but are not a primary optimization target** — Jeff's ruling, AUDIT_AND_PLAN 2026-07-02 |

Shipped since: Firestore-backed cross-device match history (`syncDeviceGame`, Phase 3.4), the Lichess puzzle import (`data/puzzles/lichess.json`), 8 cosmetic piece sets, and the Castle/Hall social layer.

References:
- Firebase Hosting: https://firebase.google.com/docs/hosting
- Cloud Firestore: https://firebase.google.com/docs/firestore
- Cloud Functions for Firebase: https://firebase.google.com/docs/functions
- chess.js: https://github.com/jhlywa/chess.js
- Stockfish: https://stockfishchess.org/
- Google Generative AI SDK (JavaScript): https://ai.google.dev/

## Real-Time Online Play (Firebase Model)

Each private game lives in a Firestore document tree:

```
/rooms/{roomId}
  - white: {playerId, displayName}
  - black: {playerId, displayName}
  - currentFen: string
  - status: "waiting" | "live" | "completed"
  - hostMode: "lucy" | "luca"
  - theme: "magic-forest"
  - createdAt, updatedAt

  - moves: Move[]        // INLINE array on the room doc (not a subcollection)
  - timeControl, whiteTimeMs, blackTimeMs, lastTickServerTs
  - takeback, takebacksUsed

Move = { san, uci, fenBefore, fenAfter, byPlayerId, clientTs, serverTs }
```

> **Revised 2026-07-03:** moves live as an **inline `moves[]` array** on the
> room document (see `functions/src/shared/roomTypes.ts`) — one listener, one
> transaction, and a 200-move game is only ~40 KB, far under the 1 MB doc cap.
> The `/moves` subcollection described in earlier drafts was never shipped.

### Move write path

1. Client picks a legal move (validated client-side with chess.js for UX) and calls a **Cloud Function** `submitMove({roomId, moveIndex, uci})`. Clients never write to `/rooms/{roomId}/moves/*` directly.
2. The Cloud Function:
   - Loads the room, confirms `status === "live"`.
   - Confirms `auth.uid` matches the side to move.
   - Replays the move list with chess.js to derive the authoritative current FEN.
   - Validates the submitted UCI is legal in that position.
   - Appends to the inline `moves[]` and updates `currentFen` / `status` / clocks / timestamps in a single Firestore transaction (validation core: pure `applyMove()`, unit-tested).
3. Both clients subscribe to the room document via one realtime listener; they re-render on the snapshot.

### Security rules

- `/rooms/{roomId}`: read for any signed-in user (spectators welcome); **all** writes only by Cloud Functions. Rules are emulator-tested in CI (`functions/test/firestore-rules.test.ts`).

This pattern keeps chess.js as the single source of truth for legal moves and means a hostile client cannot inject illegal moves.

### Room creation and joining

- "Create room" calls a Cloud Function that mints a `roomId` (short, URL-safe, e.g. 6-char base32), sets the caller as white, returns the room URL.
- "Join room" is anyone who hits `/r/{roomId}` while `status === "waiting"`; the Function assigns them black and flips `status` to `live`.
- Auth: Firebase Anonymous Auth so each browser has a stable `uid` without requiring sign-in.

## Stockfish Integration

- Stockfish WASM is loaded lazily, only on the **post-game analysis screen**.
- A web worker hosts the engine to avoid blocking the UI thread.
- For each move, we ask Stockfish for: `eval(fenBefore, depth=18)`, `bestmove`, `eval(fenAfter, depth=18)`.
- Centipawn loss = `eval_best(fenBefore) - eval_actual(fenAfter)` from the moving side's perspective. Mate scores convert to ±10000 cp.
- Analysis runs sequentially per move; UI shows per-move progress.

## Move Classification

Locked thresholds for MVP0 (Lichess-style; re-tune after real play data):

| Category | Rule |
| --- | --- |
| Best | move = engine best |
| Excellent | cp loss ≤ 10 AND not Best |
| Good | cp loss 11–50 |
| Inaccuracy | cp loss 51–100 |
| Mistake | cp loss 101–200 |
| Blunder | cp loss > 200 |

### Brilliant move heuristic

A move is classified Brilliant **only if all are true**:

1. cp loss ≤ 30 (i.e. best or near-best engine move).
2. The move sacrifices material: the moving piece lands on a square attacked by an opponent piece of equal or lower value, OR the move gives up material (capture by lower-value piece, deliberate hang, exchange sac).
3. The sacrifice is **not** immediately recovered by a simple forced recapture line that any beginner would see (operationally: the sacrificed material is not regained within the engine's top line in 2 plies for the player making the sacrifice).
4. `eval(fenAfter) ≥ eval(fenBefore) − 50 cp` from the moving side (the sacrifice doesn't blow up the position).
5. `eval(fenBefore)` is not already an overwhelming win (|eval| < 500 cp) — sacrificing in a totally winning position is not "brilliant".
6. The position is non-trivial: at least 10 plies of game played, and total material on the board ≥ 20 (so it isn't a contrived endgame puzzle).

When all 6 pass, label = Brilliant and the LLM commentary call gets `classification: "brilliant"` plus the engine line so it can explain *why*.

This heuristic will misfire occasionally; that's why the Queen of the World ceremony also requires the commentary LLM to confirm "the sacrifice has a clear point" — see Host Commentary below.

## Host Commentary (LLM Layer)

### Trigger rules (hybrid, locked)

| Move type | Source |
| --- | --- |
| Ordinary (Best / Excellent / Good with low significance) | Template, optionally suppressed |
| Notable (Brilliant, Mistake, Blunder) | LLM call |
| Capture Spark card body | Template ("Nice capture, your knight took a pawn.") |
| Post-game Story Review | One LLM call summarising the whole game |

This averages 5–10 LLM calls per game and keeps the per-move flow snappy.

### LLM call shape

Server-side Cloud Function (so the API key stays off the client):

```ts
{
  model: "gemini-3.5-flash",
  systemPrompt: HOST_PERSONA[host],   // Lucy or Luca persona block + truthfulness rules
  userPrompt: {
    classification: "brilliant" | "mistake" | "blunder" | "excellent" | ...,
    fenBefore, fenAfter,
    moveSan, moveUci,
    engineEvalBefore, engineEvalAfter,
    bestMoveSan, bestLineSan,
    playerName,
    isAdaSpecialMode: boolean,
    constraints: [
      "1-2 sentences",
      "no false praise",
      "explain WHY in concrete chess terms",
      "do not invent historical facts",
    ],
  },
  temperature: 0.7,
  maxOutputTokens: 120,
}
```

Persona blocks live in `src/hosts/personas.ts` and are derived from `docs/HOST_PERSONAS.md` truthfulness and tone rules.

### Terminal `/ask` callable

Post-MVP2, the Castle Terminal adds a `/ask Lucy|Luca <question>` command backed by `functions/src/castle/askHost.ts`. Same `gemini-3.5-flash` model, but with a stricter child-safe system suffix, a `BLOCKED` short-circuit token for unsafe questions, profanity/PII scrub on both ends, a 20/uid/day cap (`ask-day` bucket in `chatRateLimit.ts`), and `thinkingBudget: 0` so the model doesn't burn its 200-token budget on internal reasoning. Auth + non-bypass required. See `docs/TERMINAL_TEXT_WORLD.md` for the full surface.

### Caching

Key by `(host, classification, fenBefore, moveUci, playerName)`. Cache hits are fine because the same position+move+host should produce equivalent praise.

### Failure mode

If the LLM call fails or times out (>3s), fall back to a static template for that classification. Never block the UI on the LLM.

### Privacy note

The LLM receives FEN, move, and player display name. No other personal data. For MVP0 family/private testing this is acceptable. Before any public child-facing release: COPPA review, parental consent flow, and an "offline mode" toggle that disables all LLM calls in favour of templates.

## Data Model

### Player

- id (Firebase Auth uid)
- displayName
- createdAt
- preferredTheme
- preferredHost
- isAdaSpecialMode (derived from displayName.toLowerCase() === "ada" in MVP0)
- settings

### Game

- id
- players (white, black)
- startTime, endTime
- result
- pgn
- finalFen
- theme
- hostMode (lucy | luca | both | surprise — MVP0 only writes lucy or luca)
- activeHostId
- mode (online | local)
- analysisStatus (pending | running | done | failed)

### MoveAnnotation

- gameId
- moveNumber
- san, uci
- fenBefore, fenAfter
- classification
- engineEvalBefore, engineEvalAfter
- bestLine
- isBrilliantCandidate (boolean — passed heuristic)
- hostId
- hostComment (string, may be empty for ordinary moves)
- commentSource ("template" | "llm")
- powerUpEvents

### Puzzle

- id
- fen
- sideToMove
- solution
- motifs
- difficulty
- sourceId
- rightsStatus
- explanation
- hostVoiceVariants

### Host

- id (lucy | luca)
- name
- style
- availabilityState
- voiceSettings
- avatarState

### PuzzleAttempt

- playerId, puzzleId
- startedAt, completedAt
- attempts, hintsUsed
- result

### ReferenceSource

- id, title, filePath
- format, rightsStatus
- recommendedUse, extractionStatus

## Privacy And Safety

For MVP0:
- Anonymous Firebase Auth, no email/password.
- Display names only.
- Match history in browser IndexedDB.
- LLM calls server-side from Cloud Functions; API key never reaches the client.

Chat architecture as SHIPPED (revised 2026-07-03):
- **Standard chess games (online / local / AI) have no chat at all.**
- The Great Hall has ONE shared chat: server-side two-tier profanity filter
  (severe → reject with evasion normalisation), PII scrub, per-uid rate
  limits, report → auto-hide at 3 distinct flags, server-bound display
  names, LLM host replies scrubbed on output.
- **Wizard's Duel room chat (text + ≤15s voice) is never room-private:**
  every text message mirrors into the Hall feed atomically; voice posts a
  metadata notice there. Report-hide cascades back to the room copy.
  There are NO two-uid-only channels anywhere (audited 2026-07-03).
- Data deletion shipped (`forgetMe`); leaderboard opt-out shipped
  (`hideFromLeaderboards`); privacy note in-app at `/privacy`.
- COPPA review remains a Path C (public release) gate — see
  `COPPA_CHECKLIST.md`.

Reference:
- FTC children's privacy guidance: https://www.ftc.gov/business-guidance/privacy-security/childrens-privacy

## Future Technical Work

- Voice generation or TTS for Lucy and Luca.
- Animated host avatars.
- Server-side deeper engine analysis (Cloud Function with bundled Stockfish, or external service).
- Puzzle recommendation engine.
- Opening and endgame curriculum.
- Admin tool for reviewing imported puzzles.
- Source-backed chess fact database keyed to `ReferenceSource` records.
