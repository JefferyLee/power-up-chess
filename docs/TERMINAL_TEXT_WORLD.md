# Castle Terminal — Hidden Text World

Post-MVP2 feature. The Hall chat panel hides a MUD-style text adventure
behind a `⛶` toggle button. Goals: give kids who like typing a real
"world to explore", give Ada a calm training surface for tactical
puzzles and Stockfish play, keep public chat private and the LLM
budget bounded.

## How it opens

`ChatPanel` (`apps/web/src/castle/ChatPanel.tsx`) renders a small
`⛶` button next to the input. Tapping it mounts `TerminalOverlay`
(`apps/web/src/castle/terminal/TerminalOverlay.tsx`) as a fullscreen
React portal at `z-index: 1500`. The terminal completely isolates
from public chat — no Hall messages are shown inside, plain text typed
becomes a private "mumble", and only specific commands (`/say`,
`/me`) post outward.

ESC or `/exit` closes.

## Architecture

```
apps/web/src/castle/terminal/
├── TerminalOverlay.tsx     Fullscreen UI, input loop, focus management
├── TerminalOverlay.css     Monospace + parchment-on-deep-blue
├── commandRegistry.ts      Handler registry; tier system; dispatch
├── privateStream.ts        Per-tab pub/sub for command output
├── world.ts                6 rooms + Cellar; navigation; visited set
├── items.ts                4 items; inventory; Cellar-open flag
├── mysteries.ts            12 daily riddles (rotated by date)
├── lore.ts                 11 hand-written lore entries
├── games.ts                /guess /hangman /wordle /24 state
├── puzzleState.ts          /puzzle session state
├── playState.ts            /play game state (PGN + coach ref eval)
├── playEngine.ts           Lazy Stockfish + difficulty mapping
├── asciiBoard.ts           Unicode chess board (A2 reversed glyphs)
├── keyClick.ts             Web Audio key click; /mute toggle
└── clearedAt.ts            /clear scoping helper
```

Backend dependency: `functions/src/castle/askHost.ts` (new for this
feature) — `gemini-3.5-flash` host queries with content scrub and
20/uid/day cap.

## Command surface

Three tiers, surfaced via `/help`. Hidden commands only appear in
`/help` for kids who've passed the unlock threshold.

### Basic (always available)

| Command | What it does |
| --- | --- |
| `/look` | Describe current room |
| `/go <dir>` / `/n` `/s` `/e` `/w` `/up` `/down` | Move |
| `/who` | Hall presence count |
| `/users [filter] [page]` | Paginated presence with filters (hall, chess, wizard, playing, garden, forest, puzzle, practice, or a roomId) |
| `/find <name>` | Lookup by name; live presence first, then directory |
| `/games` | Active chess + wizard rooms |
| `/watch <id-or-name>` | Spectate or fall back to profile preview |
| `/invite <name> [time]` | Send invitation (5 CP); time format `5+3` |
| `/teams [page]` | List teams |
| `/team <name>` / `/team join <name> : <pitch>` / `/team mine` | Roster, apply, my teams |
| `/myteam` | Shortcut for `/team mine` |
| `/say <text>` | Post to public Hall (tagged "🌀 from the secret tunnel") |
| `/read [N]` | Peek the last N Hall messages |
| `/me <action>` | Emote to Hall |
| `/inv` | Identity + points + pieces + avatar + pocket items |
| `/take` / `/drop` / `/examine` / `/use <item> [on <target>]` | Item handling |
| `/daily` / `/daily <answer>` | Today's mystery riddle (+5 CP one solve/day) |
| `/stats` | Rooms visited, items pocketed, current game, today's mystery |
| `/guess [n]` / `/hangman [letter]` / `/wordle [word]` / `/24 [expr]` | Mini-games |
| `/puzzle` / `/puzzle <move>` / `/puzzle skip` | Tactical puzzle from lichess bank (+ CP via existing puzzle award path) |
| `/help` | Tiered command listing |
| `/mute` | Toggle keyboard click |
| `/clear` | Wipe private stream |
| `/exit` | Close terminal |

### Advanced (≥ 50 CP)

| Command | What it does |
| --- | --- |
| `/play [rating]` / `/play e4` / `/play board` / `/play resign` / `/play new` | Chess vs Stockfish; rating maps to (depth, skill); ASCII board + coach labels on Mistake/Blunder |

`/play` lives in the Wizard's Antechamber — kid must go there to
start a new game (status checks work anywhere).

### Hidden (≥ 100 CP)

| Command | What it does |
| --- | --- |
| `/lore [topic]` | Hand-written lore entries (pieces, openings, castle history) |
| `/ask Lucy <q>` / `/ask Luca <q>` | Gemini-flash reply in host voice; 20/day cap; PII/profanity scrub |

Lucy is in her Reading Nook (north of Hall); Luca is in his Study
(south then up the Tower). `/ask` is gated by location.

### Easter eggs (no slash)

`xyzzy` / `whoami` / `time` / `chess` / `42` / `67` / `six seven`.

## World map

Six rooms (plus locked Cellar):

```
              Lucy's Nook
                  ↕ (north/south)
                  │
Garden Walk ─── Great Hall ─── Wizard's Antechamber
                  │
                  ↕ (south/north)
                  │
              Tower Foot ─── (use lantern on south door) ─── Cellar
                  ↕ (up/down)
                  │
              Luca's Study
```

Rooms are declared statically in `world.ts`. Each has a
2-3-sentence atmospheric description and a one-time "first visit"
flavour line. Position is persisted in
`localStorage[puc:terminal-room]`.

## Items

Four items live in starting rooms (`items.ts`):

- **lantern** (Tower Foot) — `/use lantern on door` unlocks the Cellar
- **bookmark** (Lucy's Nook) — return it for a smile
- **feather** (Garden Walk) — lay on Luca's charts for a tale
- **compass** (Luca's Study) — fixture; `/examine` only

State: `puc:terminal-inventory` (carried), `puc:terminal-taken`
(removed from rooms), `puc:terminal-cellar-open` (door unlocked).
The Cellar exit appears via `liveExits()` once the door's open.

## Daily content

- **`/daily`** (basic) — 12 hand-written riddles rotated by UTC
  day-of-year. Server-side daily cap (`mysteryDailyMax = 5 = exactly
  one award/day`) handles dedup if localStorage is wiped.
- **`/wordle`** (basic) — 24 5-letter words rotated daily; 6 guesses
  with 🟩🟨⬛ feedback (handles repeated letters correctly).

## Chess play (`/play`)

- Lazy Stockfish singleton (`playEngine.ts`); first `/play` boots
  the engine, persists afterwards.
- Rating 300–2800 maps to (depth, skillLevel) via `difficultyFor()`
  — 10 tiers, gentle for kids.
- ASCII board uses Unicode glyphs **reversed from print convention**
  (white = filled ♚♛♜♝♞♟, black = outlined ♔♕♖♗♘♙) so on the
  terminal's dark background the visually heavy side reads as "me".
- 3-column cells; last-move from/to squares are bracketed `[♛]`.
- "+ X is in check." line replaces "X to move" when in check.
- **Coach mode** is always on: after each kid move, a separate
  full-strength Stockfish eval (depth 10, skill 20) computes cp loss
  against the eval saved at the start of the turn. Labels print only
  on Mistake (≥200 cp) or Blunder (≥400 cp). Two extra engine calls
  per turn, best-effort (silent on failure).
- Every `/play` paint wipes the private stream first — guarantees
  the board renders at the top of a fresh viewport without scroll
  acrobatics on phones.

## `/ask` (hidden) — Cloud Function

`/ask Lucy|Luca <question>` calls `functions/src/castle/askHost.ts`.

- Auth required, non-bypass only.
- Question 4–200 chars; profanity/PII scrub (rejects, doesn't censor).
- 20 questions/uid/day via `ask-day` bucket in
  `chatRateLimit.ts`.
- 4 s LLM timeout, then HttpsError.
- System prompt: host persona + strict child-safe suffix; model
  returns `BLOCKED` for anything unsafe, client renders polite
  redirect.
- `thinkingBudget: 0` — gemini-3.5-flash is a reasoning model and
  would burn the 200-token budget on internal thinking otherwise.

## Award integration

The `AwardSource` discriminated union (`functions/src/castle/types.ts`)
gained a `mystery` variant for `/daily`. `/puzzle` reuses the existing
`puzzle` variant. `/guess` `/hangman` `/wordle` `/24` are
flavour-only — no CP award.

| Source | Amount | Daily cap |
| --- | --- | --- |
| `mystery` | 5 CP | 5 (one solve/day) |
| `puzzle` (terminal) | scorePoints (10) | shares with existing puzzle bucket |

## Public-chat bridge

Two commands cross the boundary outward:

- **`/say <text>`** — posts to lobby via `callPostChat({text, viaTerminal: true})`. Recipients see a small "🌀 from the secret tunnel" tag in the bubble. `viaTerminal: true` is added to both `PostChatRequest` and `ChatMessageDoc`.
- **`/me <action>`** — same path; emote format `*<displayName> <action>*`.

`/read [N]` reads in the opposite direction (peek without rendering).
The terminal itself never displays public chat passively.

## Persistence summary

| localStorage key | Purpose |
| --- | --- |
| `puc:terminal-room` | Current room |
| `puc:terminal-visited` | Set of visited rooms |
| `puc:terminal-inventory` | Carried items |
| `puc:terminal-taken` | Items removed from rooms |
| `puc:terminal-cellar-open` | Cellar door unlocked |
| `puc:terminal-mystery-solved` | Today's mystery solved |
| `puc:terminal-play-state` | /play PGN + rating + status + coach ref eval |
| `puc:terminal-puzzle-state` | /puzzle session |
| `puc:terminal-guess-state` | /guess game |
| `puc:terminal-hangman-state` | /hangman game |
| `puc:terminal-wordle-state` | /wordle daily progress |
| `puc:terminal-24-state` | /24 round |
| `puc:terminal-muted` | Key click muted |
| `puc:chat-cleared-at` | /clear scope timestamp |

All session-only feel. Nothing about the terminal lives in
Firestore except the awards it triggers via existing callables.

## Safety boundaries preserved

- No DMs. `/say` is public, `/me` is public, plain text is private
  (mumble only).
- LLM (`/ask`) — auth required, daily cap, scrubbed in + out,
  `BLOCKED` short-circuit.
- No PII collection; everything is per-browser localStorage or
  through existing server callables.
- Bypass guests can use the world but can't post or earn — same
  rules as the rest of the castle.
