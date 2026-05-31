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
| Devices | Desktop and tablet browsers only in MVP0 |

MVP1 extensions: Firestore-backed cross-device match history, deeper Stockfish analysis (possibly server-side), more themes, puzzle import pipeline producing `data/puzzles/*.json`.

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

/rooms/{roomId}/moves/{moveIndex}
  - san, uci
  - fenBefore, fenAfter
  - byPlayerId
  - clientTimestamp, serverTimestamp
```

### Move write path

1. Client picks a legal move (validated client-side with chess.js for UX) and calls a **Cloud Function** `submitMove({roomId, moveIndex, uci})`. Clients never write to `/rooms/{roomId}/moves/*` directly.
2. The Cloud Function:
   - Loads the room, confirms `status === "live"`.
   - Confirms `auth.uid` matches the side to move.
   - Replays the move list with chess.js to derive the authoritative current FEN.
   - Validates the submitted UCI is legal in that position.
   - Writes the new `moves/{n}` doc and updates `currentFen` / `status` / timestamps in a single Firestore transaction.
3. Both clients are subscribed to the room and `moves` subcollection via realtime listeners; they re-render on the snapshot.

### Security rules

- `/rooms/{roomId}`: read allowed for the two listed `playerId`s; writes only by Cloud Function (service account).
- `/rooms/{roomId}/moves/{n}`: read by the two players; **no** client writes.

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

For MVP1:
- Keep private rooms by default.
- Avoid open chat.
- Store minimal personal data in Firestore (only when needed for cross-device history).
- Add data deletion support before broader release.
- Review COPPA requirements before any public release directed to children under 13 in the US.

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
