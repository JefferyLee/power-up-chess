# MVP Roadmap

> **Status note (2026-07-01):** This roadmap captures *intent/sequence*. For the current build status of any module (shipped / partial / planned), see **[`FEATURE_MAP.md`](FEATURE_MAP.md)** — that file is authoritative. MVP0–MVP2 have shipped and the app is deployed.

## MVP0: Playable Web Prototype

Goal: prove that standard chess plus immediate joyful feedback feels fun enough for Ada to want another game.

Recommended target:
- Deployed online URL.
- Usable on desktop and tablet browser.
- Private room link online play across two different computers.
- Local two-player mode.
- Legal standard chess.
- Magic Forest themed board.
- Animated piece movement.
- Capture celebration.
- Stockfish-backed analysis.
- Basic Lucy/Luca text feedback.
- Simple host selection: Lucy or Luca.
- Win/checkmate fireworks.
- Local match history.

Nice-to-have:
- A small puzzle sample set.
- Post-game move list.
- Lightweight in-game move labels if performance allows.

Out of scope:
- Full account system.
- Large puzzle import.
- Many themes.
- Voice hosts.
- Animated host avatars.
- Public multiplayer matchmaking.
- Current chess news.

## MVP0 Experience Flow

1. Player opens the website.
2. The selected host asks for the player's name.
3. Player chooses Lucy or Luca as the active host.
4. Player selects "Online Room" or "Local Game".
5. If online, the player creates a private room link or joins one.
6. Magic Forest loads as the default visual theme.
7. The game starts.
8. Each legal move animates.
9. Captures trigger a visible reward and a power-up card.
10. Stockfish analysis supports move feedback or post-game review.
11. Checkmate triggers fireworks.
12. Game is saved locally.
13. The selected host gives a short, positive recap.

## MVP1: Core Product

Goal: deliver the full learning loop for Ada.

Must include:
- Online room-based play.
- Local two-player play.
- Basic account or persistent player profile.
- Match history across devices.
- Engine-backed move quality labels.
- Brilliant move detection.
- Host selection with Lucy, Luca, both, and surprise options.
- Power-up cards.
- Move Replay Theater.
- Puzzle Garden.
- Host-led post-game Story Review.
- Multiple themes and piece sets.
- Sound effects and volume controls.

## MVP1 Experience Flow

1. Lucy or Luca greets the player by name.
2. Player chooses Online, Local, AI Practice, or Puzzle Garden.
3. If Online, player creates or joins a room.
4. During play, the selected host comments lightly on ordinary moves and more strongly on good moves.
5. Captures produce reward cards and animations.
6. Engine analysis quietly classifies moves.
7. Brilliant moves trigger a rare ceremony.
8. After the game, the selected host presents a story-like review.
9. Player can save favorite moments and replay captures.
10. Progress updates appear in the player's learning history.

## MVP2: Power Up Castle

The homepage becomes the **Power Up Castle**. Visitors land at a public gate,
knock or wait for the wicket to open, present a name + magic word, and step
into the Great Hall — a shared lobby with the host (Lucy or Luca), open
chat across guests, ambient chess stories from the library, and five
doors out to the games.

Full spec: `docs/MVP2_PLAN.md`.

Target scope:
- Castle gate (public, no auth) with live guest count + global leaderboard.
- `name + magic word` identity layer (sha256, no recovery, 3-strike bypass).
- Great Hall lobby with shared chat, host portrait, online-guest list.
- Host ambient stories sourced from `docs/books_and_references/` via
  the offline `tools/story-import/` pipeline.
- Castle Points unifying puzzle + chess; 200-point gate on the chess rooms;
  decay re-locks (5 pts/day-1 → 50 pts/day-7).
- Forest Adventure ported from `../ada-advanture` as the fifth door
  (always playable, no castle points).
- Theme bound to host (Lucy ↔ Magic Forest, Luca ↔ Starry Universe).

Phases A–E (~17–21 days end-to-end). See `docs/MVP2_PLAN.md` §11.

## Post-MVP2: Castle Terminal (Hidden Text World)

A `⛶` toggle in the Hall chat opens a fullscreen MUD-style terminal
with a 6-room castle map, item collection, daily mystery riddles,
hand-written lore, real Stockfish play (`/play <rating>` with built-in
coach labels), tactical puzzles drawn from the lichess bank, four text
mini-games (`/guess`, `/hangman`, `/wordle`, `/24`), and `/ask
Lucy|Luca` queries against `gemini-3.5-flash`. Built on top of MVP2
infrastructure (castle points, invites, presence, public chat) without
changing any existing surface. Full spec: `docs/TERMINAL_TEXT_WORLD.md`.

## Post-MVP3: Brand-v1 + Workflows methodology

After MVP3 wrapped, two non-feature things shipped under the
`brand-v1` tag:

- **Visual identity refresh** — candidate-4 logo (heraldic gold rook
  with inset shield + lightning) becomes the canonical mark: new
  `favicon.svg` for both the app and landing site, plus
  apple-touch-icon / icon-192 / icon-512 PNGs sliced from a single
  source via `tools/brand/slice-icons.sh`.
- **Workflow methodology** — `docs/WORKFLOWS.md` names the project's
  common fan-out / adversarial-verification / generate-and-filter /
  loop-until-done patterns (puc-audit-and-tag, puc-mvp-acceptance,
  puc-screenshot-tour, puc-content-pass, puc-ship-feature). Adopted
  after reviewing Anthropic's June 2026 Dynamic Workflows article.

Possible later scope (MVP3+):
- Animated Lucy and Luca avatars + voices.
- AI opponent with adaptive strength.
- More puzzle books and curated study paths.
- Opening mini-lessons + endgame practice.
- Famous Women in Chess collection.
- Seasonal visual events.
- Mobile app wrapper.
- Parent controls if product expands publicly.

## Deployment Milestones

### Milestone 1: Frontend Foundation

- Frontend web app.
- Cloudflare Pages recommended.
- Local two-player play.
- Magic Forest visual direction.
- Local storage only.

### Milestone 2: MVP0 Private Room Release

- Add real-time private room service.
- Cloudflare Workers plus Durable Objects recommended for room state.
- Add Stockfish-backed analysis.
- Deploy a playable online prototype.
- Store completed PGNs locally at first.

### Milestone 3: Persistent Learning

- Add user identity.
- Store match history, puzzle progress, and settings.
- Add moderation and child privacy review before wider release.

## Risk Register

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Praise feels fake | Ada may stop trusting the hosts | Use engine-backed feedback and honest wording |
| Too much animation slows play | Game feels distracting | Add intensity settings and keep ordinary moves light |
| Brilliant move overfires | Special moments lose meaning | Keep strict engine-backed criteria |
| Puzzle book cannot be used publicly | Content pipeline blocked | Confirm rights, use licensed or public-domain sources |
| Online play creates safety concerns | Public launch risk | Private rooms only for chess play; lobby chat moderated server-side from MVP2; never public matchmaking |
| Engine analysis is slow | Feedback delays | Use shallow real-time checks and deeper post-game analysis |
