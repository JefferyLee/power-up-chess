# Development Plan — MVP0

Last updated: 2026-05-31

This plan covers MVP0 only. It is sequenced so each phase produces something demonstrable, and each task has an explicit acceptance check.

## Phase 0: Repository Foundation (½ day)

| # | Task | Acceptance |
|---|---|---|
| 0.1 | `git init`; write `.gitignore` excluding `docs/books_and_references/*` (keep its `README.md`), `node_modules/`, `dist/`, `.env*`, Firebase emulator caches, `.DS_Store` | `git status` shows ~10 doc files staged, zero book files |
| 0.2 | Decide GitHub destination (private repo? org?), create remote, push initial commit | `git push` succeeds; remote shows docs |
| 0.3 | `pnpm create vite power-up-chess --template react-ts` in repo root, move files up if needed | `pnpm dev` boots default Vite page on `localhost:5173` |
| 0.4 | Add core deps: `chess.js`, `firebase`, `idb`, `@radix-ui/react-dialog`, `@radix-ui/react-dropdown-menu`, `clsx`, `framer-motion` | `pnpm install` clean; `tsc --noEmit` clean |
| 0.5 | Configure ESLint + Prettier + `tsconfig` strict mode | `pnpm lint` clean |
| 0.6 | Initialise Firebase project: `firebase init hosting,firestore,functions,emulators` (TypeScript functions, Node 20) | `firebase emulators:start` runs Hosting + Firestore + Functions locally |

## Phase 1: Chess Board + Local 2-Player (2 days)

| # | Task | Acceptance |
|---|---|---|
| 1.1 | `src/chess/game.ts` thin wrapper over `chess.js`: legal moves, FEN, PGN, status (check/mate/draw), undo (local only) | Unit test: from start position, `e2e4` legal; `Qd1d8` illegal; mate-in-1 position detects mate |
| 1.2 | `src/board/Board.tsx`: 8×8 grid, files/ranks labels, click-to-select-then-click-to-move, drag-to-move (mouse + touch), legal-move dots, last-move highlight, check highlight | Manual: full game playable from start to checkmate, both colours |
| 1.3 | Move animation: piece slides smoothly between squares (~180ms ease-out); captured piece fades out | Manual: knight jump and rook slide both feel right; no overlap glitches |
| 1.4 | Magic Forest theme tokens v0: board palette, piece SVGs (placeholder set — can be simple but themed), background | Side-by-side with a stock chess UI, it visibly reads as "Magic Forest" rather than generic |
| 1.5 | `LocalGameScreen`: host selector (Lucy/Luca), player-name prompt, start, sidebar showing move list (SAN) and captures | Manual: full local 2P game playable end to end |

## Phase 2: Capture Spark + Host Templates (1 day)

| # | Task | Acceptance |
|---|---|---|
| 2.1 | `src/hosts/personas.ts`: Lucy + Luca system prompts derived from `HOST_PERSONAS.md` |  Snapshot test of persona strings |
| 2.2 | `src/hosts/templates.ts`: per-classification template pools (ordinary, capture, check, checkmate, draw) for both hosts. Deterministic-with-seed picker so same move ≠ same line twice in a row | Unit test: 20 consecutive ordinary moves produce ≥10 distinct strings |
| 2.3 | Capture Spark card: appears for ~1.2s near captured square, shows piece value, host one-liner from template | Manual: knight x pawn shows correct value and a Lucy/Luca-styled line |
| 2.4 | Game-end celebration: checkmate fireworks (CSS/Framer Motion), stalemate gentle dim, host recap line (template, no LLM yet) | Manual: deliver mate, see fireworks; reach stalemate, see appropriate ending |

## Phase 3: Firebase Online Rooms (3 days)

| # | Task | Acceptance |
|---|---|---|
| 3.1 | Anonymous Auth wired on app boot; `useAuthUid()` hook | Browser console shows stable `uid` across reloads |
| 3.2 | Firestore data model + security rules (rooms read by listed players; moves no-client-write) per `TECHNICAL_ARCHITECTURE.md` | `firebase emulators:exec` with rules tests: anon writes to `/rooms/*/moves/*` rejected |
| 3.3 | Cloud Function `createRoom`: mints 6-char base32 ID, writes `/rooms/{id}` with caller as white, returns `{roomId, joinUrl}` | Emulator call returns expected shape; second `createRoom` returns a different ID |
| 3.4 | Cloud Function `joinRoom({roomId})`: assigns caller as black if `status==="waiting"`, flips to `live` | Emulator: second client joins, both see `status: live` |
| 3.5 | Cloud Function `submitMove({roomId, moveIndex, uci})`: replays move list with chess.js, validates legality and turn ownership, transactional write of `moves/{n}` + room update | Emulator: legal move accepted; illegal move rejected; out-of-turn rejected; race on same moveIndex resolves to exactly one winner |
| 3.6 | Client `useRoom(roomId)` hook: Firestore listeners on `/rooms/{id}` + `/rooms/{id}/moves`, derives current FEN, exposes `submitMove` | Two browser tabs play a full game across the room |
| 3.7 | `CreateRoomScreen` + `JoinRoomScreen` + `/r/:roomId` route; copy-link button | Manual: open in two browsers (one normal, one incognito), play a game end-to-end |
| 3.8 | Reconnect behaviour: refresh mid-game returns to same room and same FEN | Manual: refresh both tabs mid-game; both resume cleanly |

## Phase 4: Stockfish Post-Game Analysis (2 days)

| # | Task | Acceptance |
|---|---|---|
| 4.1 | Bundle Stockfish WASM as a web worker; `src/engine/stockfish.ts` with `analyze(fen, depth)` returning `{eval, bestMove, pv}` | Standalone test page: paste FEN, see eval and best move within a few seconds |
| 4.2 | `analyzeGame(pgn)`: iterates moves, calls Stockfish for each `fenBefore` (depth 18), computes cp loss per move, classifies per `TECHNICAL_ARCHITECTURE.md` thresholds | Unit test: known game with known blunder → blunder classification at the right move |
| 4.3 | Brilliant heuristic (`isBrilliant` per spec — 6 conditions) | Unit tests: famous brilliant sac → true; ordinary best move → false; sac in already-winning position → false; sac that loses → false |
| 4.4 | `PostGameAnalysisScreen`: per-move list with classification badges, eval bar, click-to-replay; "Lucy says" / "Luca says" panel | Manual: finish a game with at least one mistake and one good move; both classifications appear |

## Phase 5: LLM Host Commentary (2 days)

| # | Task | Acceptance |
|---|---|---|
| 5.1 | Cloud Function `hostCommentary({host, classification, fenBefore, fenAfter, moveSan, evalBefore, evalAfter, bestLine, playerName, isAdaSpecialMode})` calling `gemini-3.5-flash` with persona + constraints from `TECHNICAL_ARCHITECTURE.md` | Emulator call returns a 1–2 sentence string matching the requested host's voice |
| 5.2 | Firestore-backed cache: `/commentary/{hash}` keyed by `(host, classification, fenBefore, moveUci, playerName)`; cache hit before LLM | Same call twice → second is a cache hit (logged) |
| 5.3 | Client: notable-move commentary loads asynchronously into the analysis screen with 3s timeout → template fallback | Manual: throttle network in DevTools; UI never blocks, fallback fires |
| 5.4 | Cloud Function `gameRecap({pgn, hostMode, classifications, playerName, isAdaSpecialMode})`: single LLM call producing 3–5 sentence Story Review | Emulator call returns child-appropriate recap; honest about a blunder if one happened |
| 5.5 | Post-game screen shows Story Review prominently above the move list | Manual: end a game, recap appears within ~5s |

## Phase 6: Match History + Deployment (1 day)

| # | Task | Acceptance |
|---|---|---|
| 6.1 | IndexedDB schema (`idb`): `games` store with full PGN + classifications + host comments + recap | After a game, IDB has one new record with expected fields |
| 6.2 | `HistoryScreen`: list of past games (date, opponent, result, host), click into one to re-open post-game analysis | Manual: play 3 games, see them all, replay analysis on any |
| 6.3 | "Forget all data" button clears IDB | Manual: button empties the history list and IDB store |
| 6.4 | Deploy: `firebase deploy --only hosting,functions` to a staging Firebase project; smoke test on the deployed URL | Two real laptops in different networks play a complete game on the deployed URL |

## Phase 7: Polish + MVP0 Acceptance (1 day)

| # | Task | Acceptance |
|---|---|---|
| 7.1 | Sound: capture pop, check chime, mate fanfare, mute toggle in header | Mute persists across reload |
| 7.2 | Loading and error states for: room not found, opponent disconnected, LLM down, Stockfish failed to load | No screen ever shows a raw error string |
| 7.3 | Tablet layout check (iPad Safari sim and a real tablet if possible): no overlaps at 1024×768 and 1366×1024 | Board fills sensible portion, controls reachable |
| 7.4 | Run the **MVP0 acceptance flow** with Ada or a stand-in: name prompt → host pick → online room → full game → fireworks → recap → history | Player wants to play another game |

## Cross-cutting

### Project layout (target)

```
power-up-chess/
├── apps/web/                      # Vite React app
│   └── src/
│       ├── chess/                 # chess.js wrapper, classification
│       ├── board/                 # Board, square, piece, animations
│       ├── hosts/                 # personas, templates, LLM client
│       ├── engine/                # Stockfish worker
│       ├── rooms/                 # Firestore hooks, online flow
│       ├── history/               # IndexedDB
│       ├── theme/magic-forest/    # tokens, piece SVGs, sounds
│       └── screens/               # top-level routes
├── functions/                     # Cloud Functions (TypeScript)
│   └── src/
│       ├── rooms.ts               # createRoom, joinRoom, submitMove
│       ├── commentary.ts          # hostCommentary, gameRecap
│       └── chess/                 # shared chess.js validator
├── data/puzzles/                  # generated, gitignored except .gitkeep
├── docs/                          # product docs (this folder)
├── firebase.json, firestore.rules, firestore.indexes.json
└── package.json (pnpm workspace)
```

Initial scaffold can skip the monorepo wrapper and put `src/` and `functions/` at the root — flatten if monorepo overhead isn't worth it. Decide at Phase 0.3.

### Testing strategy

- **Unit tests (Vitest)**: chess wrapper, classification, brilliant heuristic, template picker.
- **Cloud Function tests**: `firebase emulators:exec` with rules + function tests for `submitMove` (legal/illegal/out-of-turn/race).
- **No e2e automation in MVP0.** Manual flow tests at phase boundaries.

### Secrets

- `GEMINI_API_KEY` lives in Cloud Functions config (`firebase functions:secrets:set GEMINI_API_KEY`), never in client code, never in git.
- `.env.local` for any client-side Firebase web config (project ID, etc. — Firebase web config is OK to ship in client but keep `.env.local` ignored anyway).

### Out of scope for MVP0 (deferred to MVP1+)

- AI opponent.
- Puzzle Garden UI (puzzle extraction from books can begin in parallel as a separate workstream feeding `data/puzzles/`).
- Multiple themes.
- Both-hosts and Surprise host UX.
- Tactic Bloom, Crown Spark, Replay Ribbon, Hint Sparkle.
- Cross-device match history (Firestore-backed).
- Voice or avatars.
- Mobile-phone layout.
- Public matchmaking.

## Timeline Estimate

| Phase | Days |
|---|---|
| 0 Foundation | 0.5 |
| 1 Board + Local 2P | 2 |
| 2 Capture Spark + Templates | 1 |
| 3 Firebase Online Rooms | 3 |
| 4 Stockfish Post-Game | 2 |
| 5 LLM Commentary | 2 |
| 6 History + Deploy | 1 |
| 7 Polish + Acceptance | 1 |
| **Total** | **~12.5 days** |

Realistic calendar with reviews and rights/copy back-and-forth: **3–4 weeks** to MVP0 live URL.

## What we are NOT planning here

This document covers MVP0 only. MVP1 (puzzle import, brilliant ceremony as full multi-step animation, AI opponent, Both/Surprise hosts, multi-theme, cross-device history) gets its own plan after MVP0 ships and we have Ada's reactions.
