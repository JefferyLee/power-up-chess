# Technical Architecture

Last reviewed: 2026-09-29 (data model regenerated from code; LLM timeout/cache corrected)

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
- For each move, we ask Stockfish for: `eval(fenBefore)`, `bestmove`, `eval(fenAfter)` at **depth 14** (the review screen's setting in `screens/PostGameAnalysisScreen.tsx`; `engine/analyzeGame.ts` defaults to 16 when no depth is passed).
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

Persona blocks live in `functions/src/shared/personas.ts` (single source of truth, snapshot-tested; the web imports it via the `@shared` alias) and are derived from `docs/HOST_PERSONAS.md` truthfulness and tone rules.

### Terminal `/ask` callable

Post-MVP2, the Castle Terminal adds a `/ask Lucy|Luca <question>` command backed by `functions/src/castle/askHost.ts`. Same `gemini-3.5-flash` model, but with a stricter child-safe system suffix, a `BLOCKED` short-circuit token for unsafe questions, profanity/PII scrub on both ends, a 20/uid/day cap (`ask-day` bucket in `chatRateLimit.ts`), and `thinkingBudget: 0` so the model doesn't burn its 200-token budget on internal reasoning. Auth + non-bypass required. See `docs/TERMINAL_TEXT_WORLD.md` for the full surface.

### Caching

Firestore collection `commentary/{hash}` (`functions/src/commentary/cache.ts`): the hash is a SHA-256 of the deterministic input — host, classification, FENs, move, player name — truncated to 24 base64url chars; the doc stores `{ text, model, createdAt }`. Same input → same hash → the identical comment. Read/written only by functions (`hostCommentary`, `gameRecap`); rules allow signed-in reads, deny writes.

### Failure mode

Every Gemini call is raced against a hard **8 s** timeout (`callGeminiWithTimeout` in `functions/src/commentary/gemini.ts`, Phase 3.3). On timeout or error the callable returns an honest template for that classification with `source: 'fallback'` — never a naked 500. Never block the UI on the LLM. (Earlier drafts said 3 s; the code is 8 s.)

### Privacy note

The LLM receives FEN, move, and player display name. No other personal data. For MVP0 family/private testing this is acceptable. Before any public child-facing release: COPPA review, parental consent flow, and an "offline mode" toggle that disables all LLM calls in favour of templates.

## Data Model (Firestore inventory, generated from code 2026-09-29)

Every write goes through Cloud Functions (admin SDK); `firestore.rules` is default-deny and only grants **reads**. "Written by" names files under `functions/src/` (callables, triggers, scheduled jobs). "Read by" names the client hooks/screens that subscribe directly; otherwise reads are function-side only. Collections with no explicit rule fall under the default deny. Client-side match history stays in IndexedDB (`apps/web/src/history/db.ts`) and is mirrored into the account archive by `syncDeviceGame`. Rows marked *in progress* reflect uncommitted REVIEW_2026-09 Phase 1 work in the tree on 2026-09-29.

### Chess & games

| Collection | Purpose | Written by | Read by | Rule |
| --- | --- | --- | --- | --- |
| `rooms/{roomId}` | Live online chess room: seats, inline `moves[]`, clocks, takeback state | `rooms/createRoom`, `joinRoom`, `submitMove`, `resignGame`, `claimTimeWin`, `takeback`, `tournament/createTournamentRoom`, `invitations/respondInvite`; trigger `rooms/onRoomFinished`; job `cleanup/cleanupRooms` | client `rooms/useRoom`; `lobby/heraldWaitingRooms` (the Hall's waiting list reads the `castle_public/waitingRooms` feed, not this collection) | `get` any signed-in user; `list` closed (*in progress*); write deny |
| `games/{roomId}` + `guests/{name}/games/{roomId}` | Finished-game records: global doc + per-guest archive (device games arrive via `syncDeviceGame`) | `rooms/playerGames` (from `onRoomFinished`), `rooms/syncDeviceGame` | callables in `rooms/playerGames` (`/history`, terminal) | no rule → deny |
| `commentary/{hash}` | LLM commentary cache (see Caching) | `commentary/cache` via `hostCommentary` / `gameRecap` | functions only (no client reference) | read signed-in; write deny |
| `puzzles/{id}` | Puzzle bank (Lichess CC0 import) | offline `tools/puzzle-import/src/upload.ts` | `puzzles/getNextPuzzle`, `calibration`, `dailyFive`, `legends`, `masterAtrium`, `submitPuzzleAttempt` | no rule → deny |
| `puzzle_leaderboards/{plot}` | Six per-plot boards (display names + ratings, weekly climbers) | job `puzzles/refreshPuzzleLeaderboards` (5 min; honours `hideFromLeaderboards`) | client `puzzles/LeaderboardScreen` | read signed-in; write deny |
| `tournaments/{weekKey}` | Weekly tournament: registrations, pairings, rounds, results, champion | `tournament/registerForTournament`, `unregisterFromTournament`, `reportTournamentResult`, `disputeTournamentResult`, `overrideTournamentResult`, `startNextRound`, `closeTournament`, `createTournamentRoom`; `castle/forgetMe` | client `tournament/TournamentRoute`; `tournament/getCurrentTournament` | read signed-in; write deny |

### Castle identity, economy, moderation

| Collection | Purpose | Written by | Read by | Rule |
| --- | --- | --- | --- | --- |
| `guests/{normalizedName}` | The account doc — field groups below | `castle/castleEnter`, `awardCastlePoints`, `awardTutorialComplete`, `setPrivacyPrefs`, `setUserBan`, `setPresence`, `castSkill`, `recentlyPlayed`, `forgetMe`; `cosmetics/purchaseCosmetic` + `equipCosmetic`; `puzzles/*`; `endgame/submitEndgameClear`; `openings/submitOpeningClear`; `tournament/*`; `teams/*`; `forest/submitForestScore`; `siege/submitSiegeScore`; `rooms/takeback`, `onRoomFinished`, `syncDeviceGame`; `invitations/*`; `games/wizard/*`; `library/markStoryRead`; job `cleanup/cleanupDormantGuests` | client own-doc subscriptions (`castle/CastleIdentityContext`, `HallScreen`, `puzzles/PuzzleGardenScreen`, `cosmetics/ShopScreen`, `me/AdventurerPlaqueScreen`, `teams/MyTeamsList`, endgame/openings routes); every callable, via `castle/requireOwner` | read only your own doc (`uids` contains caller uid); write deny |
| `chat_identity/{uid}` | uid → server-bound display name shadow | `castle/setPresence` (set), `forgetMe` (delete) | `castle/postChat`, `askHost`, `getRecentlyPlayed`, `rooms/joinRoom`, `syncDeviceGame`, `teams/*`, `library/*`, `games/wizard/wizardChat` | deny |
| `castle_enter_attempts/{uid}`, `castle_enter_attempts_byname/{name}`, `castle_enter_attempts_daily/{key}` | Sign-in throttles + 3-strike counters | `castle/castleEnter` | same | deny (`_byname` has no rule → default deny) |
| `castle_point_audit/{entryId}` | Castle-point ledger, one row per balance change; salted IP hash, never the raw IP | `castle/audit` (in-transaction from every CP change), `forgetMe` (purge) | functions only | deny |
| `banned_uids/{uid}` | Ban mirror for fast checks | `castle/setUserBan` | `castle/postChat` | no rule → deny |
| `castle_public/{stats,waitingRooms}` | Gate stats (guest count, top-5, wizard gate) + the sanitised waiting-rooms feed (display name, clock, age only) | jobs `castle/refreshCastlePublicStats` (30 s), `lobby/heraldWaitingRooms` (1 min, feed *in progress*); `games/wizard/wizardGate` | client `castle/usePublicStats` (pre-sign-in), `castle/useWaitingRooms` | public read; write deny |
| `castle_live/{doc}` | Gate "live pulse": duel count, recent results, last story, champion | job `castle/refreshCastleLivePulse` (2 min); `castle/pickAndPostStory`, `tournament/closeTournament` | client `castle/useCastleLivePulse`, `tournament/useCurrentChampion`, `castle/CurrentStoryPanel`, terminal | public read; write deny |
| `feedback/{id}`, `feedback_attempts/{uid}` | In-app feedback + send throttle | `feedback/feedback` (submitFeedback); `forgetMe` | client `castle/FeedbackInbox` (admin) | `feedback` read only if caller uid ∈ `guests/jeff.uids` (moving to the `admin` custom claim — `castle/requireAdmin`, *in progress*); attempts deny |

### Hall chat & stories

| Collection | Purpose | Written by | Read by | Rule |
| --- | --- | --- | --- | --- |
| `lobby/messages/items/{id}` | The one shared Hall chat stream: guest lines, system lines, host stories, quizzes, Wizard-chat mirrors | `castle/postChat`, `hostAmbientStory` / `pickAndPostStory`, `hostStoryAnswer`, `postGameStarted`, `postTournamentRegistration`, `reportChatMessage` (hide), `castSkill`, `games/wizard/wizardChat` (mirror), `teams/createTeam` + `captainActions` (system lines), `lobby/heraldWaitingRooms`; job `cleanup/cleanupOldLobbyMessages`; `forgetMe` | client `castle/useLobbyChat` | read signed-in; write deny |
| `lobby/presence/items/{sessionId}` | Who is in the Hall (20 s heartbeat) | `castle/setPresence`; job `castle/cleanupPresence`; `forgetMe` | client `castle/useLobbyChat` | read signed-in; write deny |
| `chat_hidden/{messageId}` | Original text/voice of auto-hidden messages (the readable doc is blanked) — *in progress* | `castle/reportChatMessage`; `forgetMe` (purge) | functions only | deny |
| `chat_flags/{messageId}__{uid}` | Report de-dup | `castle/reportChatMessage` | same | no rule → deny |
| `chat_rate_limits/{doc}` | Per-uid chat / ask quotas | `castle/chatRateLimit` | same | deny |
| `castle_ambient_state/{doc}` | Ambient story scheduler state | `castle/hostAmbientStory`, `pickAndPostStory` | same | deny |
| `story_quiz_keys/{messageId}`, `story_quiz_cache/{storyId}`, `story_quiz_attempts/{messageId}[/uids/{uid}]` | Story-quiz answer keys, generated quizzes, attempt counters | `castle/pickAndPostStory`, `storyQuiz`, `hostStoryAnswer`; job `cleanup/cleanupOldLobbyMessages` | functions only | deny |
| `invitations/{inviteId}`, `invite_attempts/{uid}` | Play / duel invites (60 s TTL) + send throttle | `invitations/sendInvite`, `respondInvite`, `cancelInvite`; `forgetMe` | client `invitations/useIncomingInvites`, `useOutgoingInvite` (list queries) | invitations read signed-in (list-query trade-off, see the rules comment); attempts deny |

### Teams

| Collection | Purpose | Written by | Read by | Rule |
| --- | --- | --- | --- | --- |
| `teams/{teamId}` | Team doc: members, captain, badge, motto | `teams/createTeam`, `applyToTeam`, `approveApplication`, `leaveTeam`, `captainActions`, `disbandTeam` / `disbandHelpers`; job `teams/sweepTeams`; `forgetMe` | client `teams/useTeam`, `me/PlaqueCard`, terminal; `castle/getPublicProfile` | read signed-in; write deny |
| `team_names/{name}` | Name uniqueness lock | `createTeam`, `captainActions`, `disbandHelpers` | same | deny |
| `team_applications/{id}` | Join requests (7-day TTL) | `applyToTeam`, `approveApplication`; `forgetMe` | client `teams/TeamPage` | read signed-in; write deny |

### Side games

| Collection | Purpose | Written by | Read by | Rule |
| --- | --- | --- | --- | --- |
| `wizard_rooms/{roomId}` (+ `/messages/{id}`, `/rate_limits/{uid}`) | Wizard's Duel rooms, duel chat, chat throttle | `games/wizard/wizardRoom` (create / join / move / spell), `wizardChat`, `castle/reportChatMessage` (cascade hide), `invitations/respondInvite`; job `cleanup/cleanupRooms` | client `games/wizard/useWizardRoom`, `useWizardChat`; `heraldWaitingRooms`, `refreshCastleLivePulse` | room `get` signed-in, `list` closed (*in progress*); messages read signed-in; rate_limits deny; all writes deny |
| `castle_spell_supply/{spellId}`, `wizard_spell_quota/{key}` | Spell pricing: shared daily pool + per-uid surge | `games/wizard/wizardSpellPricing` | same | deny |
| `forest_leaderboard/{normalizedName}` | Forest Adventure best per guest | `forest/submitForestScore`; `castle/setPrivacyPrefs` (opt-out), `forgetMe` | client `games/forest/ForestLeaderboard` | read signed-in; write deny |
| `forest_runs/{uid}/runs/{runId}` | Forest run history | `forest/submitForestScore` | functions only | deny |
| `siege_scores/{normalizedName}` | Per-guest Siege bests | `siege/submitSiegeScore`; `forgetMe` | `siege/refreshSiegeLeaderboards` | deny |
| `siege_leaderboards/global` | Published Siege board (display names only; no castle points involved) | job `siege/refreshSiegeLeaderboards` (5 min; honours `hideFromLeaderboards`) | client `games/siege/ui/Leaderboard` | read signed-in; write deny |

### Library

| Collection | Purpose | Written by | Read by | Rule |
| --- | --- | --- | --- | --- |
| `library_stats/{bookKey}` | Book read-heat counters | `library/markStoryRead` | `library/getLibraryShelves` | public read; write deny |
| `library_seek/{topicId}` | Book Owl (book-seek) response cache | `library/seekBooks` | same | no rule → deny |

### `guests/{normalizedName}` field groups

`GuestDoc` in `functions/src/castle/types.ts` has ~60 optional fields; grouped by owner:

- **Identity / session** — `displayName`, `normalizedName`, `magicWordHash`, `uids[]`, `createdAt`, `lastVisitAt`, `activeSessionId` (single active session), `banned`, `hideFromLeaderboards`.
- **Economy** — `castlePoints`, `lifetimeEarned` (title ladder), `dailyEarn` (per-source daily caps), `lastCheckInDayKey`, `streakDays`, `cosmetics` (`GuestCosmetics`: `pieceSet`, `ownedPieceSets`, duel-winner halo and win-streak crown expiries).
- **Puzzles** — `puzzleRatings` (per plot), `puzzleCalibrated`, `puzzleSeen`, `puzzleStats`, `puzzleWeekStarts`, `puzzleDaily` (Today's Five), `puzzleLegendsBadges`, `puzzleSolvesThisWeek`, `puzzleSolvesToday`.
- **Trainers** — `endgameProgress`, `openingProgress`, `learnedBasicsAt`.
- **Adventurer's Plaque (MVP3-P1)** — `chessRating`, `chessRatingDelta`, `chessGames`, `booksRead`, `booksReadIds`, `recentlyPlayedWith` (cap 12), `teamIds`. Declared but with **no write side yet** (types.ts TODOs): `matchesAi`, `matchesLocal`, `tournamentsEntered`, `tournamentsBestPlacement`, `quizCorrect`, `quizAttempted`.
- **Origin** — `firstCountry`, `firstCity`, `recentCountry`, `recentCity`, `firstIpHash`, `recentIpHash`. `firstIp` / `recentIp` are legacy: not written since 2026-09-29 and scrubbed on the next visit (DECISIONS #53). The public plaque shows country only; the owner sees city.
- **Subcollection** `games/{roomId}` — the per-guest game archive.

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
