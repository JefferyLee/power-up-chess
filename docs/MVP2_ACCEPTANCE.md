# MVP2 Acceptance Checklist

Last updated: 2026-06-01

Live URL: **https://power-up-chess-dev.web.app**

This script is the qualitative end-state for **MVP2: Power Up Castle**.
If sections 1–12 pass and Ada (or a stand-in) reaches section 13, MVP2
is accepted.

Items already covered by `MVP0_ACCEPTANCE.md` and `MVP1_ACCEPTANCE.md`
are not re-listed here — run those scripts first if MVP0/MVP1 have not
been verified on the current deploy.

## 1. Castle Gate (public, pre-login)

- [ ] Open `https://power-up-chess-dev.web.app/` in a fresh incognito.
- [ ] Page paints within ~2 s; a stylised castle illustration is centred
      on the screen with the title **Power Up Castle**.
- [ ] Two side panels are visible:
  - **Today's visitors** with a live count (may show "—" for the first
    minute while the scheduler builds the public stats doc).
  - **Top guests** with up to 5 names + castle-point scores. If no one
    has played yet it falls back to a placeholder.
- [ ] No navigation other than the gate itself. No links to chess,
      history, settings, or themes.
- [ ] Footer auth chip shows `Signing you in…` then `Signed in · <8 hex>`.

## 2. Knock + Wicket animation

- [ ] Click anywhere on the gate → three rapid raps play (✊✊✊) and the
      whole gate gently shakes for ~600 ms.
- [ ] Within ~600 ms of the click, the small wicket door on the right
      swings open with a creaking sound.
- [ ] A paper note flutters out and settles centred over the gate.
- [ ] If you do NOT click for 5 seconds after the page loads, the wicket
      opens on its own.
- [ ] The hint text under the gate switches from "Tap the door to knock…"
      to "The wicket is opening…" when the wicket starts moving.

## 3. The Note — name + magic word entry

- [ ] The note has two fields: **Your name** and **Magic word**, plus a
      red **Enter the castle** button.
- [ ] Sub-text on the note says "Your magic word is how I'll remember
      you next time. Pick something you can recall but don't share."
- [ ] Submit with name "Ada" and magic word "apple-pie" → "Welcome,
      Ada!" lands in the Hall as a NEW guest.
- [ ] Refresh → Ada is still in the Hall (sessionStorage sticky).
- [ ] Open a new INCOGNITO window → gate again, no Ada.
- [ ] In the new incognito, type "Ada" + "wrong-word" → "Hmm, that
      doesn't look right. You have 2 tries left."
- [ ] Try twice more wrong → after the 3rd wrong attempt, an "I have
      trouble with my magic word →" link appears under the button.
- [ ] Click the bypass link → Hall opens as `Guest-NNNN` (👻 prefix).
      Castle points show 0 + a bypass note: "Your points won't be saved
      this time."
- [ ] In the original incognito, sign out, re-enter "Ada" + "apple-pie"
      → "Welcome back, Ada!" — castle points and history persist.

## 4. Session host + theme binding

- [ ] On first lobby visit per browser tab, the rolled host is **Lucy**
      OR **Luca** uniformly at random.
- [ ] If Lucy, the theme is **Magic Forest** (warm, green/gold).
- [ ] If Luca, the theme is **Starry Universe** (deep indigo + violet).
- [ ] Theme applies across the whole app (Hall, game screens, puzzles,
      review). No theme picker is visible anywhere — it's bound to host.
- [ ] Open a new tab → may re-roll to the other host.

## 5. Great Hall layout

- [ ] Header shows "The Great Hall" + two links: **Match history** and
      **Leave castle**.
- [ ] Hero section: host portrait (placeholder SVG silhouette in the
      host's palette) + greeting line + castle points row.
- [ ] **Chat panel** (left) and **Online list** (right) under the hero.
- [ ] Five doors below: Puzzle Garden / Forest Adventure / Online Chess
      / Local Chess / Practice with {host name}.

## 6. Castle Points + room gating (Phase B)

- [ ] As a brand-new guest (0 castle points), only **Puzzle Garden** and
      **Forest Adventure** are clickable. The other three doors show 🔒
      and say "Locked — needs 200 points."
- [ ] The hero greeting includes a progress hint: "Castle points: 0 ·
      200 more to unlock the chess rooms."
- [ ] Solve a puzzle → puzzles screen reward popup AND back in Hall the
      castle-points number ticks up immediately on return.
- [ ] Reach **200** castle points → chess rooms unlock (🏰 / 👥 / ♞
      replaces 🔒), the "X more to unlock" hint disappears.
- [ ] Win a Practice game → castle points jump by 10.
- [ ] Click **Review game** after a win → at end of analysis the castle
      points jump by (best+excellent moves) + 5×brilliant.
- [ ] Forest Adventure runs do NOT change castle points (Forest scores
      live in their own leaderboard).
- [ ] Bypass guests see all three chess doors locked at 🔒 with the
      200-point message; they can still Puzzle + Forest.

## 7. Decay + re-lock

- [ ] Sign in as a guest with ≥ 250 points.
- [ ] Manually advance the device clock by ~3 days (or wait), then
      re-enter the castle.
- [ ] Hall greets you with an amber **decay note**: "Things got dusty
      while you were away — your castle points went from 250 to 230."
      (Numbers are approximate per §7.4 of MVP2_PLAN.)
- [ ] If decay drops you below 200, the message adds: "Solve a few
      puzzles to earn them back!" and the three chess doors lock again.
- [ ] After the first visit post-decay, the amber message is cleared
      (only shown once per Hall mount).

## 8. Hall chat (Phase D)

- [ ] Type any message → it appears in the chat scroll within ~500 ms.
- [ ] Open a second browser (incognito), sign in as a different guest,
      send a message → it lands in the first browser within ~500 ms.
- [ ] The **Online list** shows both names + their host chips
      (🌿 Lucy / ✨ Luca). Bypass guests render with 👻.
- [ ] Send a message containing profanity (e.g. "this move is sh*t" with
      no asterisk) → the censored version lands ("this move is ****").
- [ ] Send an email or phone in chat → it's replaced with `*`s.
- [ ] Send 6 messages within 60 s → the 6th gets "Slow down — try
      again in Ns." (5/min limit).
- [ ] Refresh and re-enter the Hall → chat scrollback shows the last
      ~80 messages, ordered oldest → newest, auto-scrolled to bottom.

## 9. Host @-mention reply

- [ ] Send `@Lucy what is a fork?` (or `@Luca`, or `@host`) → within
      ~1–3 s a host reply lands as a separate bubble in the host bubble
      style (gold border-left).
- [ ] Reply is on-topic chess, in the host's voice, 1–2 sentences.
- [ ] Send `@host what's the weather` → host politely refuses + suggests
      a puzzle or game (off-topic guardrail).
- [ ] On a Gemini failure / timeout, the bubble still lands with the
      template fallback "I just listened in."
- [ ] After ~15 `@host` mentions in a day, further mentions return the
      template instead of an LLM reply (per-uid budget).

## 10. Ambient host stories (Phase D)

- [ ] Sit idle in the Hall (no typing) for ~3 minutes with at least one
      guest present.
- [ ] A host bubble appears with a 2–5-sentence chess story from the
      library (Capablanca, Alfonso X, Nimzowitsch, Ruy López, etc).
- [ ] After several stories, no story repeats within the same hour (last
      ~40 are remembered).
- [ ] If the Hall is empty (no presence), no ambient story is posted —
      check Cloud Functions logs to confirm "no live presence, skipping".
- [ ] The host who narrates matches the host the majority of guests
      currently see.

## 11. Forest Adventure (Phase E)

- [ ] Click the Forest door → routes to `/forest` with themed header
      strip ("← Back to the Hall" / "Forest Adventure" / "Playing as
      {name}").
- [ ] "Start Game" button works; Ada appears running through the forest
      with mushrooms and trees scrolling left.
- [ ] Keyboard: ← / → to move, ↑ or Space to jump, B for bomb.
- [ ] Touch controls visible during play; pointer-down/up registers
      cleanly on tablet.
- [ ] Pass 30 trees → game-over screen with "Play again" and "Back to
      Hall" buttons.
- [ ] Score drops below 0 → game ends.
- [ ] On run end, the **Top Forest Scores** panel on the right refreshes
      automatically. Your own row is highlighted if you appear.
- [ ] Bypass guests can play — their runs save to local IDB only, not to
      Firestore or the public leaderboard.

## 12. Public gate stats — live update

- [ ] Have at least one guest in the Hall (running the scheduled job
      every 1 min refreshes `castle_public/stats`).
- [ ] Open the gate in a fresh incognito → within a minute the **Today's
      visitors** count shows ≥ 1 and the **Top guests** list shows real
      names + castle-point totals.
- [ ] Earn castle points (via puzzle) → within a minute, the gate's
      leaderboard updates if your score made the top 5.

## 13. The Ada test (qualitative)

- [ ] Ada arrives at the gate and figures out to knock without help.
- [ ] Ada picks a name + magic word and gets in.
- [ ] Ada notices her castle is themed differently than her sibling's
      (because of the random host).
- [ ] Ada solves at least one puzzle, plays at least one Forest run,
      and chats at least one message into the Hall.
- [ ] When points cross 200, Ada notices a chess door unlock and tries
      the new room.
- [ ] If Ada @-mentions Lucy or Luca, the reply makes her smile.
- [ ] At the end of the session, Ada says she wants to come back tomorrow.

If 1–12 pass and 13 happens, MVP2 is accepted.

## Known limits (documented, not bugs)

- **Magic word is not real security.** Client-side SHA-256 only, no
  password recovery, no email channel. A determined attacker could brute
  force a known name; per-uid rate limits (10/min, 50/day) raise the
  cost but don't eliminate it.
- **Open chat is moderated but not perfect.** The profanity list is
  conservative and English-only; clever spellings will slip through.
  Auto-hide at 3 flags is implemented in the schema but the report UI
  is deferred to a later phase.
- **Host portraits are placeholders.** Stylised SVG silhouettes ship
  with Phase A; real anime art is a future asset drop.
- **Story bank is 108 stories from 3 PDF books** (Alfonso X, Nimzowitsch,
  Ruy López). EPUB extraction is wired but the reader isn't implemented
  yet; the remaining ~3 books are skipped until then.
- **Forest scores cap at 200 server-side** to prevent score inflation
  from a tampered client.
- **Ambient stories repeat after ~40 unique posts.** Plenty of variety
  for casual play; tune by adding more stories or shrinking the recency
  window if Ada notices.
- **Public gate stats refresh every 1 minute** (Cloud Scheduler
  minimum). First-visit users may see "—" for up to 60 seconds.
- **Castle re-lock UX is one-shot.** The amber decay message clears on
  first Hall mount after the decay; you won't see it a second time.
- **Bypass guests are tracked per-session only.** Two bypass guests on
  different devices won't share progress; their generated `Guest-NNNN`
  names may also collide (1/10000 odds).
- **EPUB story sources** (`How to Study Chess on Your Own`, `My System &
  Chess Praxis`) listed in `tools/story-import/src/books.ts` are
  registered but skipped by extract — adding an EPUB reader is a future
  pipeline improvement.
- **No DMs, no in-game chat.** By explicit design.
