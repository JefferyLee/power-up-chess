# MVP2 — Power Up Castle

> **已交付，归档参考 (Delivered — archived for reference, 2026-07-03).** This plan
> shipped; for current build status see [`FEATURE_MAP.md`](FEATURE_MAP.md). Do not
> implement from this document.

Last updated: 2026-06-01
Status: **Locked — ready for implementation (Phase A starts next)**

This document is the implementation plan for MVP2: turning the homepage
into the Power Up Castle, with the Great Hall (大厅) replacing the
StartScreen, magic-word identity, points-gated rooms, ambient chess
stories sourced from books, and Forest Adventure folded in as a fifth
destination. Doc body in English for code-reference consistency; key
UX concepts keep their Chinese name in parentheses.

> **Two safety constraints are being lifted in this change-set**
> - `CLAUDE.md` "no open chat in MVP0" — LIFTED for the Hall (大厅).
> - `CLAUDE.md` / `DECISIONS.md` "Anonymous Auth only, no accounts" —
>   PARTIALLY LIFTED. We introduce a lightweight **name + magic word**
>   identity layer on top of Anonymous Auth (no email, no real password
>   recovery). Both files will be updated in the same change-set.

---

## 1. Vision

The arcade is no longer a homepage — it's a **castle**. Visitors arrive
at the gate, knock, slip a note in through the wicket, and step into the
Great Hall where the host is telling stories. From the Hall, doors lead
to five rooms: chess (in four flavours) and Forest Adventure.

New guests can only enter the easier rooms (Puzzle Garden, Forest
Adventure). Earning 200 castle points unlocks the rest.

The framing is for an 8-year-old. Every interaction has an in-fiction
explanation — the knock, the wicket, the magic word, the unlock.

---

## 2. Locked decisions (confirmed in conversation)

1. **Castle name**: Power Up Castle.
2. **Two hosts only — Lucy / Luca, random per session, sticky.** Each
   host owns its theme (Lucy ↔ Magic Forest, Luca ↔ Starry Universe).
3. **Theme picker is removed.** Theme is bound to the rolled host.
4. **Open lobby chat is permitted** (in the Hall only). No in-game chat.
5. **`name + magic word` identity layer.** Anonymous Auth stays as the
   technical uid; magic word is a kid-friendly "remember me" mechanism.
   Hash is client-side `sha256` only — not real password security,
   accepted trade-off.
6. **3-strike + bypass** when magic word is wrong. After three failed
   attempts the visitor can click "I have trouble with my magic word"
   and still enter — as a throwaway guest (👻 prefix in online list,
   no Firestore persistence, no castle points).
7. **Forest Adventure** (from `../ada-advanture`) is folded in as a
   fifth destination. **Always playable for everyone**, but earns NO
   castle points — only its own in-game score.
8. **Room gating by castle points.** Before unlock, the only castle-point
   source is the Puzzle Garden. Puzzle Garden + Forest Adventure are
   always open; Online Chess / Local Chess / Practice are locked until
   `castlePoints ≥ 200`.
9. **Re-locking is real.** If decay (§7.4) drops a guest below 200, the
   chess rooms lock again. Earn back to 200 in the Puzzle Garden.
10. **Public gate** (§4.1) shows guest count + top-5 leaderboard
    **with names** (not anonymised), live.
11. **Story bank is sourced from local chess books** in
    `docs/books_and_references/` via an offline LLM extraction pipeline.
    Same rights model as puzzles: engineering stores `rightsStatus`,
    user owns the rights review. See §6.5.

---

## 3. Flow (player's eye view)

```
                ┌──────────────────────────────┐
                │   Castle Gate (public)        │
                │   "Power Up Castle"           │
                │   • Guests inside: {n}        │
                │   • Global leaderboard (top 5) │
                │   • Big closed gate w/ wicket │
                └─────────────┬─────────────────┘
                              │ click gate → knock sound  OR
                              │ wait 5 s
                              ▼
                ┌──────────────────────────────┐
                │   Wicket opens                │
                │   A note flies out:           │
                │   "What's your name and       │
                │    magic word?"               │
                │   [ name ]  [ magic word ]    │
                └─────────────┬─────────────────┘
                              │
            ┌─────────────────┼─────────────────┐
            ▼                 ▼                 ▼
   name found             name found      name found
   magic matches      magic NOT matches    name new
            │                 │                 │
            ▼                 ▼                 ▼
   "Welcome back     "Hmm that doesn't  "Welcome new
    {name}!"          look right.        guest! Please
                      Try again."        remember your
                      (×3 then           magic word —
                       bypass link)      it's how I'll
                                         know you next
                                         time."
            │                 │                 │
            └─────────────────┼─────────────────┘
                              ▼
                ┌──────────────────────────────┐
                │   Great Hall                  │
                │   • Host portrait + ambient    │
                │     chess stories             │
                │   • Open chat across guests   │
                │   • Online list               │
                │   • 5 doors:                  │
                │     - Online Chess  🔒        │
                │     - Local Chess   🔒        │
                │     - Practice w/Lucy  🔒    │
                │     - Puzzle Garden  ✓        │
                │     - Forest Adventure ✓      │
                │   🔒 = locked until 200 pts   │
                └─────────────┬─────────────────┘
                              │ pick a door
                              ▼
                ┌──────────────────────────────┐
                │   Inside a room (no chat)     │
                │   "← Back to the Hall"        │
                └──────────────────────────────┘
```

---

## 4. The Castle Gate (公共页面，未登录可见)

### 4.1 What it shows
- Backdrop: stylised castle gate art (themed, but theme is decided AFTER
  the user enters — gate art is neutral until then).
- Title: **Power Up Castle**.
- Live "guests inside" count.
- Global leaderboard — top 5 by castle points (name + points).
- Knock-hint: small text near the gate, "Tap the door to knock."
- **No** other navigation. No links to chess, history, settings.

### 4.2 Knock interaction
- Clicking anywhere on the gate plays a "knock" sound (3 raps) and
  starts a 1 s spring animation on the door.
- The wicket starts to creak open ~600 ms after the first click.
- If the user does nothing for 5 seconds after the gate loads, the
  wicket opens automatically (host is curious who's outside).
- Sound effect: a single knock sample, reused.

### 4.3 Wicket animation
- Wicket = the small door embedded in the big gate (the "门洞").
- Opens with a swing + creak.
- A paper note flies out and rests in the centre with a soft sway.

### 4.4 The note
- Two short fields, written in the host's voice:
  - "What's your name?" (1–20 chars)
  - "What's your magic word?" (4–30 chars, child-friendly)
- "Enter" button (large).
- Small explainer text: "Your magic word is how I'll remember you. Don't
  share it with anyone else."
- After 3 wrong attempts: "I have trouble with my magic word →" link
  appears. Clicking it enters the Hall as a fresh new guest (no name
  reuse, no point recovery).

---

## 5. Magic Word identity (新增系统)

This is **not real security**. It's a "remember me" layer so Ada can
type her name on a friend's device and pick up her castle progress.

### 5.1 Data model
- Firestore `guests/{normalizedName}` doc:
  - `displayName`: original cased name shown in UI.
  - `magicWordHash`: `sha256(normalizedName + ':' + magicWord)` — cheap
    on-client hash, sent to server. (No bcrypt; this isn't a bank.)
  - `uids`: array of Anonymous Auth uids that have logged into this
    guest. Future sessions may add new uids (different device or wiped
    cookies).
  - `castlePoints`: integer. Mirror of the user's earned points.
  - `createdAt`, `lastVisitAt`.
- Normalised name: lowercase + trim. So `Ada`, `ada`, `Ada ` all map to
  the same guest. Display name preserves the first-claim casing.

### 5.2 Login flow
1. Client computes `hash = sha256(normalizedName + ':' + magicWord)`.
2. Client calls Cloud Function `castleEnter({ name, hash })`.
3. Function:
   - Looks up `guests/{normalizedName}`.
   - If absent: create with `magicWordHash = hash`, add caller's uid,
     return `{ status: 'new', castlePoints: 0, displayName }`.
   - If present and `magicWordHash` matches: add caller's uid to the
     `uids` array if missing, update `lastVisitAt`, return
     `{ status: 'returning', castlePoints, displayName }`.
   - If present and hash differs: return `{ status: 'wrong-magic' }`.
4. After 3 server-side `wrong-magic` responses for this uid in the same
   session, the bypass option is offered. Bypass = client picks a
   throwaway display name like `Guest-{4-digit}`, no `guests` doc is
   written, all progression is in-memory only and dies on refresh.

### 5.3 Rate limiting
- Per Anonymous uid: 10 enter attempts / minute, 50 / day.
- Server returns `429` past that, with a friendly message.

### 5.4 What we deliberately don't do
- No password reset. Forgot magic word → make a new guest under a new
  name, or use bypass and start over.
- No email, no recovery channel, no parental dashboard.
- No collision protection beyond first-come-first-serve on the
  `normalizedName` key (typing "Ada" if "Ada" already exists means you
  must know her magic word; otherwise pick a different name).

---

## 6. The Great Hall (大厅)

### 6.1 Layout

```
┌─────────────────────────────────────────────────────────────┐
│  Power Up Castle — The Great Hall      [history] [⛶ logout] │
├──────────────┬──────────────────────────────────────────────┤
│              │  🌟 Lucy: "Once upon a 1924 tournament in    │
│  [Lucy       │   New York, a quiet Cuban named Capablanca…" │
│   portrait]  │                                              │
│              │  Picas: morning everyone                     │
│   Lucy       │  Ada: @Lucy is that the one where he lost?   │
│              │  Lucy: "It is! He'd been undefeated for 8…"  │
│              │                                              │
│              │  ┌────────────────────────┐ [send]           │
│              │  │ Type a message…        │                  │
│              │  └────────────────────────┘                  │
├──────────────┴──────────────────────────────────────────────┤
│  Online (3)       Doors:                                    │
│  • Ada (you, 120) [▶ Puzzle Garden]   ✓                    │
│  • Picas (340)    [▶ Forest Adventure] ✓                   │
│  • Mira (510)     [🔒 Online Chess]   need 200 pts         │
│                   [🔒 Local Chess]    need 200 pts         │
│                   [🔒 Practice w/Lucy] need 200 pts        │
└─────────────────────────────────────────────────────────────┘
```

### 6.2 Host behaviour in the Hall
Three distinct behaviours:

| Trigger | Behaviour | Cost |
| --- | --- | --- |
| New guest arrives in the Hall | Templated greeting using their `displayName` ("Welcome, Ada!") | None |
| Idle timer — every 3 min when ≥ 1 guest present, max 6 stories / hour | One story from the **books-sourced story bank** (§6.5), 2-5 sentences, in host voice. Picks one matching the rolled host's persona (Lucy or Luca tone). | Zero LLM cost at runtime (stories pre-extracted) |
| `@Lucy` / `@Luca` / `@host` in a user message | LLM response with persona prompt + last 6 messages | Per-call |

### 6.3 Chat
- Same shared-Firestore-stream pattern as before:
  - `lobby/messages/{messageId}` — `{name, uid, text, ts, kind: 'user' | 'host' | 'system'}`.
  - Cap visible scrollback to last 80 messages.
  - Realtime via `onSnapshot`.
- Presence: `lobby/presence/{sessionId}` with 20 s heartbeat, 60 s TTL.
- Moderation:
  - Profanity filter on input (server-side word list).
  - Gemini safety settings at strictest for host output.
  - Report-flag flow → auto-hide at 3 flags.
  - Per-uid rate limit: 30 messages / day, 5 / minute.

### 6.4 Door states
- ✓ unlocked → click → enter the room.
- 🔒 locked → click → tooltip + small host line: "You need 200 castle
  points to play in there. Earn them in the Puzzle Garden!"
  (Forest Adventure deliberately NOT mentioned — it doesn't help.)

### 6.5 Story bank — offline extraction pipeline

Story content comes from the chess books already sitting in
`docs/books_and_references/` (git-ignored, ~440 MB). A one-off developer
pipeline turns book pages into Hall stories. Pattern mirrors the
existing puzzle pipeline in `tools/puzzle-import/`.

**Pipeline stages** (`tools/story-import/`):

1. `extract.ts` — read PDFs/EPUBs with a text-extraction lib (pdfjs /
   epub.js). Emit `data/stories/raw/{book-id}.txt` per book. Pages with
   diagrams or tables get a `[diagram]` marker. Skipped for committing
   to git.
2. `harvest.ts` — feed extracted text to Gemini in ~3000-char chunks
   with a strict prompt:
   > "Find chess stories worth retelling to a child: famous games,
   > historical moments, anecdotes about players, tournament drama.
   > Return JSON: `{title, body, era, players, motif, sourceBook,
   > sourcePage}`. Body must be 2-5 sentences, original wording —
   > never copy book text verbatim. Skip anything you cannot retell
   > without quoting."
3. `voice.ts` — for each harvested fact pair, generate two host-voice
   variants (Lucy: warm, Luca: dreamy) with Gemini. Cache by source
   fact so re-runs are free.
4. `validate.ts` — basic facts pass: year must be plausible, player
   names spell-checked, no overlap > 30 chars with the source text
   (anti-verbatim).
5. Emit `data/stories/{storyId}.json`:
   ```json
   {
     "id": "capablanca-1924-nyc",
     "title": "The Cuban who never lost",
     "variants": {
       "lucy": "Long ago, in 1924…",
       "luca": "Imagine a quiet boy from Cuba…"
     },
     "era": "1920s", "players": ["Capablanca"],
     "motif": "history",
     "source": { "book": "World Champions Series Vol II", "page": 142 },
     "rightsStatus": "engineering-stored-not-reviewed"
   }
   ```
6. Story files committed to `data/stories/`. Loaded into Firestore
   `story_bank/{storyId}` on deploy (similar to puzzle seed).

**Rights model.** Same as puzzles: engineering stores `rightsStatus`,
user owns rights review. CLAUDE.md "do not copy book explanations into
the app" is honoured by the §6.5.2 anti-verbatim check + the
"original wording only" prompt. Books are credited in a single
in-Hall "Sources" link.

**Targets**: ~30 stories per host voice for MVP launch, ~200 long-term.
Pipeline can be re-run when new books arrive.

**Runtime**: zero LLM cost. Host picks a story from `story_bank`
weighted by `lastPlayedAt` (haven't seen it for a while = higher
weight). Single Firestore read per story, cached client-side.

---

## 7. Castle Points (积分系统)

### 7.1 What earns points

**Forest Adventure earns no castle points — ever.** It has its own
in-game score that lives in its own leaderboard. The castle economy
runs on chess and puzzles only.

**Pre-unlock state** (`castlePoints < 200`, chess rooms locked):

| Source | Points | Cap per day |
| --- | --- | --- |
| Puzzle Garden — solve a puzzle | `stars × difficulty` (3–9 per solve) | none |
| Puzzle Garden — first-time solve bonus | +5 | none |

Puzzles are the only path to 200. A new guest hits the threshold in
~15-30 minutes if they solve steadily.

**Post-unlock state** (`castlePoints ≥ 200`, chess rooms open):

| Source | Points | Cap per day |
| --- | --- | --- |
| Puzzle Garden — solve a puzzle | same as above | none |
| Chess (any flavour) — game win | 10 | none |
| Chess — Brilliant Move in post-game review | 5 | none |
| Chess — Best / Excellent move in review | 1 each | none |

Numbers are starting points; tune after a week of Ada actually playing.

### 7.2 Where it lives
- `guests/{normalizedName}.castlePoints` is the source of truth.
- Mirrored to `castle_leaderboard/{normalizedName}` for cheap reads on
  the public gate.
- Local profile keeps a cached copy for offline display; reconciles on
  enter.

### 7.3 The 200-point gate
- Hardcoded threshold for MVP. Single threshold for all three chess
  rooms. Per-door thresholds (Online Chess = 500 etc.) deferred to
  later.
- Re-locks if `castlePoints` drops below 200 due to decay (§7.4).

### 7.4 Decay (use it or lose it)

Castle points decay when a guest is away. Computed **lazily** on every
`castleEnter` call — no scheduled job needed.

Two anchor points fixed by user:
- 1 day absent → lose 5 points
- 7 days absent → lose 50 points (cumulative)

Linear in between, continues to ramp past day 7 (i.e. it never caps —
but never goes negative; floor at 0).

```
decay(daysAbsent) = max(0, round(5 + (daysAbsent - 1) × 7.5))
   daysAbsent = 0   → 0     (came back same day)
   daysAbsent = 1   → 5
   daysAbsent = 2   → 13    (rounded)
   daysAbsent = 3   → 20
   daysAbsent = 7   → 50
   daysAbsent = 14  → 103
   daysAbsent = 30  → 223
applied = min(decay, castlePoints)   // never go negative
```

Decay applies to **all** guests, locked or unlocked. A guest at 250
who's been gone 8 days returns to find themselves at 192 — and the
chess rooms re-lock. They go solve puzzles to get back over the line.

**UX**: on re-entry after decay, a small system message in the Hall:
> "Lucy: Welcome back, Ada! Things got a little dusty while you were
> away — your castle points went from 250 to 192. Let's earn them
> back!"

### 7.5 Why not just unlock everything?
- Onboarding: new kids try the easier game first, learn what the
  castle is about, then graduate to "real chess" with a sense of
  achievement.
- Decay + re-lock creates a "habit" loop without punishing dips
  permanently — keep playing weekly and you stay unlocked.
- Removes "what do I click?" decision paralysis on first visit.

### 7.6 What bypass-mode guests earn
Nothing. Bypass guests (§5.2) get no Firestore record, no castle
points, no leaderboard appearance. They can still play Puzzle Garden
and Forest Adventure for fun. Progress dies on refresh.

---

## 8. Rooms (the 5 doors)

| # | Door | Origin | Gating | Modal on entry |
| --- | --- | --- | --- | --- |
| 1 | **Puzzle Garden** | Existing | None | No |
| 2 | **Forest Adventure** | NEW — port `../ada-advanture` | None | No |
| 3 | **Online Chess** | Existing rooms | 200 pts | Clock picker |
| 4 | **Local Chess** | Existing local | 200 pts | Clock + opponent name |
| 5 | **Practice with {host}** | Existing AI | 200 pts | Difficulty picker |

Each room hides the Hall chat. Each room shows a "← Back to the Hall"
header. Each room writes castle points to the guest's record on
relevant events (puzzle solve, run end, game end).

---

## 9. Forest Adventure — port plan

(Mostly unchanged from previous draft.)

### 9.1 What it is
Single-player canvas runner: Ada dodges red mushrooms, collects gold
ones, jumps trees, finishes after 30 trees passed. Source:
`../ada-advanture/src/components/ForestGame.jsx` (~390 lines).

### 9.2 Port steps
- Copy `ForestGame.jsx` → `apps/web/src/games/forest/ForestGame.tsx`,
  convert to TS, fix lint.
- Assets → `apps/web/src/games/forest/assets/`.
- Replace ada-advanture's CloudFlare Workers `/api/scores` /
  `/api/presence` with our Firestore patterns:
  - Scores → `forest_runs/{uid}/runs/{runId}`.
  - Presence → already handled by the lobby (§6.3).
- Drop the admin password / clear leaderboard UI.
- Drop Tower Defense link.
- Use Hall's `displayName` as player name; no per-game name input.

### 9.3 Visual integration
- Canvas keeps its 8-bit aesthetic; it's intentionally its own world.
- Wrapping header strip uses the host's theme tokens (purple if Luca,
  green if Lucy), with the "← Back" link.

---

## 10. Architecture summary

### 10.1 Firestore collections (new)
| Collection | Purpose | Public read? |
| --- | --- | --- |
| `castle_public/stats` | Live guest count + top-5 leaderboard, updated by Cloud Function every 30 s | **Yes** (gate must show this without auth) |
| `guests/{normalizedName}` | Per-guest identity + castlePoints + uids array | No — accessed only via Cloud Functions |
| `lobby/messages/{id}` | Open chat stream | Authed only |
| `lobby/presence/{sessionId}` | Active sessions, 60 s TTL | Authed only |
| `castle_leaderboard/{normalizedName}` | Indexed score-only mirror for leaderboard queries | Read = authed; the public gate reads from `castle_public/stats` aggregate, not this |
| `forest_runs/{uid}/runs/{runId}` | Completed Forest runs | Owner only |
| `chat_rate_limits/{uid}` | Per-uid daily / per-min counters | Function-only |
| `story_bank/{storyId}` | Curated chess stories the host can draw from | Authed read |

### 10.2 Cloud Functions (new)
- `castleEnter({ name, hash })` — login / register, applies decay
  (§7.4), returns guest profile.
- `castleBypass()` — issue a throwaway guest name for the bypass flow.
- `postChat({ text })` — write to chat after profanity + rate-limit.
- `hostChatReply({ messageId })` — fires when a message contains
  `@host`, writes the reply.
- `hostAmbientStory()` — scheduled (every 3 min if Hall is active),
  picks a story from `story_bank` (weighted by `lastPlayedAt`) and
  posts it as the host.
- `awardCastlePoints({ source, amount })` — single mutation that
  updates `guests.castlePoints` + `castle_leaderboard`. Called from
  puzzle / chess game-end flows. NOT called from Forest.
- `refreshCastlePublicStats()` — scheduled every 30 s, rebuilds
  `castle_public/stats` from leaderboard + presence.

### 10.3 Offline tools (new)
- `tools/story-import/` — book → story pipeline (§6.5).
  - `pnpm story:extract` — PDFs → raw text.
  - `pnpm story:harvest` — text → JSON story candidates via Gemini.
  - `pnpm story:voice` — story → Lucy + Luca variants via Gemini.
  - `pnpm story:validate` — anti-verbatim + fact checks.
  - Outputs committed to `data/stories/*.json`.

### 10.4 Client (new)
- `apps/web/src/castle/GateScreen.tsx` (the public gate).
- `apps/web/src/castle/WicketDialog.tsx` (animated wicket + note + name/magic form).
- `apps/web/src/castle/HallScreen.tsx` (replaces `StartScreen`).
- `apps/web/src/castle/ChatPanel.tsx`.
- `apps/web/src/castle/OnlineList.tsx`.
- `apps/web/src/castle/DoorRow.tsx` (the 5 room buttons with lock state).
- `apps/web/src/games/forest/*`.
- `apps/web/src/hosts/avatars/{lucy,luca}-*.png` (asset, from user).
- `apps/web/src/sounds/knock.mp3`, `wicket-creak.mp3` (asset).

### 10.5 What gets removed
- `StartScreen.tsx` is replaced.
- Standalone Theme / Clock / Difficulty pickers on the homepage.
- The current `hostChoice` profile field (already gone).

---

## 11. Phasing proposal

Five slices, ship + review between each.

| Phase | Scope | Estimate |
| --- | --- | --- |
| **A. Gate + Wicket + Magic Word + Hall skeleton** | Gate scene with knock + wicket animation, name/magic-word note, `castleEnter` Cloud Function, `guests` collection, basic Hall layout, 5 doors routed to existing screens (no gating yet, no chat yet). Updates `CLAUDE.md` / `DECISIONS.md`. | 4-5 days |
| **B. Castle Points + room gating + decay** | Implement points sources (puzzle + chess hooks), the 200-pt threshold, lock UI on doors, decay on `castleEnter`, leaderboard mirror, public stats doc + gate-side display, re-lock UX message. | 3 days |
| **C. Story extraction pipeline** | `tools/story-import/` end-to-end. Run against current books, commit ~30 stories per host. Pure offline work — no client UI yet. | 3-4 days (depends on book extraction quality; first pass may need prompt iteration) |
| **D. Hall chat + host stories at runtime** | `postChat`, `hostChatReply` (LLM on `@host`), `hostAmbientStory` (reads story bank, no LLM), ChatPanel, OnlineList, presence heartbeat, profanity filter, rate limits, greeting templates. | 5-6 days |
| **E. Forest Adventure port** | Port `ForestGame`, wire as 5th door, its own IDB + Firestore score collection, separate Forest leaderboard shown in-game (not in castle stats). | 2-3 days |

Total ~17-21 days end-to-end. Possible parallel work:
- E (Forest) can run after A is stable, in parallel with B / C / D.
- C (story pipeline) is offline and doesn't block A or B.

---

## 12. Secondary parameters (all locked)

| # | Parameter | Value |
| --- | --- | --- |
| 12.1 | Magic word length | **4–30 chars, any printable (incl. emoji)** |
| 12.2 | Two devices same name+magic at once | **Both succeed; one row in online list (deduped by `normalizedName`)** |
| 12.3 | Point-delta system lines in chat ("Ada +5 pts!") | **On** |
| 12.4 | Game result auto-broadcast ("Ada beat Stockfish Beginner!") | **Feature exists; opt-in checkbox on room-exit screen, default off** |
| 12.5 | Decay past day 7 | **Linear ramp continues (no cap), floor at 0** |
| 12.6 | Re-lock event broadcast in Hall | **No — shown only in the guest's own welcome line** |
| 12.7 | Knock sound | **Three rapid raps (✊✊✊)** |
| 12.8 | Public gate art | **Neutral / abstract — theme reveals only after entry** |

---

## 13. Risks

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Magic word brute force | Account takeover | Per-uid 10 enter attempts/min, 50/day; after-3 prompt is server-enforced |
| Open chat attracts trolls | Bad first impression | Profanity filter, report flow, retro-block by uid |
| LLM cost balloons | Wallet burn | Per-uid rate limit + cache + daily token alarm |
| Hosts fabricate chess facts | Erodes "honest praise" promise | Strict prompt + curated story bank + "I don't know" fallback |
| New guest stuck at gate trying to remember magic word | Frustration | 3-strike + bypass; encourage simple, memorable words in UI |
| Two real people share a name+magic (siblings, etc.) | Mixed progression | Encourage unique names; sibling collision is a known limitation |
| Gate page abused as a public-facing target | DoS / scraping | Cloudflare/Firebase Hosting CDN, public stats doc cached server-side |
| 200-pt gate too high or too low | Bad onboarding rhythm | Re-tune after week 1 with telemetry |
| Bypass-guests feel second-class | UX paper-cut | The 👻 icon is meant as friendly, not exclusion; can be revisited |
| Ambient stories repeat & feel hollow | Hall feels canned | Story bank ≥ 30 starters, vary by host; LLM extends |

---

## 14. CLAUDE.md / DECISIONS.md changes required in this change-set

Four doc edits land as part of Phase A's PR.

### 14.1 CLAUDE.md — Product Context section
Remove the "no open chat" and "Anonymous Auth only" lines. Replace with:

> The Hall (大厅) supports open shared chat across guests, moderated
> server-side. A lightweight `name + magic word` identity layer sits on
> top of Anonymous Auth so progress persists across sessions; this is
> NOT real authentication (no password recovery, sha256 hash only).
>
> Story content for the Host's ambient lines is extracted from books in
> `docs/books_and_references/` via an offline LLM pipeline (`tools/
> story-import/`). Same rights model as puzzles: engineering stores
> `rightsStatus` per story but does not gate on it; user owns rights
> review. Anti-verbatim guardrails enforce that stored stories are
> retellings, not quotations.

### 14.2 DECISIONS.md — add entries
> 2026-06-XX — Lobby chat is open across guests in the Hall; in-game
> chat is not introduced.
>
> 2026-06-XX — `name + magic word` identity replaces "Anonymous only"
> for the Castle. Hash is client-side `sha256`. Bypass after 3 failed
> attempts: throwaway guest, no Firestore record.
>
> 2026-06-XX — Castle Points are earned in Puzzle Garden + chess
> rooms only. Forest Adventure earns no castle points. 200 points
> unlocks the three chess rooms; decay (§7.4) can re-lock.
>
> 2026-06-XX — Host ambient stories sourced from
> `docs/books_and_references/` via offline `tools/story-import/`
> pipeline. Rights model mirrors puzzles.

### 14.3 PUZZLE_CONTENT_PIPELINE.md — cross-reference
Add a short pointer at the bottom: "Story content uses the same rights
model — see `tools/story-import/` and `LOBBY_DRAFT.md` §6.5."

### 14.4 MVP_ROADMAP.md
Open chat and accounts move from "deferred to MVP2" → headline of
MVP2: "The Castle, the Hall, Magic Word, Hall stories, Forest
Adventure."

---

## 15. Things explicitly out of scope (for this round)

- Multiple castles / room types beyond the 5 listed.
- DMs between guests.
- Voice chat or live video.
- Parental dashboard.
- Mobile-only layout (still desktop + tablet, per PRD).
- Real-money or in-app purchases.
- Cross-device sync of local game IDB history beyond the leaderboard.
- Tower Defense from the ada-advanture project.
- Magic word recovery / change-password flow (out by design — see §5.4).
