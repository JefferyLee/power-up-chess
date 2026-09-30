# Feature Map & Status (living)

Last updated: 2026-09-29 (REVIEW_2026-09 Phase 1 docs sweep)

This is the **one-page source of truth** for "what exists, where it lives, and how done it is." When docs and the running app disagree, trust this file (and the code). Older planning docs (`MVP_ROADMAP.md`, `PRD.md`, `OPEN_QUESTIONS.md`) describe intent; this describes reality.

Live app: <https://power-up-chess-dev.web.app> (custom domain **app.powerupcastle.app**, behind Cloudflare).
Landing: <https://powerupcastle-landing.web.app>.
Run locally: see [README](../README.md#quickstart) → `pnpm install && pnpm dev`.
Device policy: desktop + tablet primary; **phones supported (safe-area, ≥44px targets) but not a primary optimization target** (Jeff, 2026-07-02).

---

## 1. The Great Hall doors

Every door in the Hall (`apps/web/src/castle/HallScreen.tsx`), its route, whether it **earns/spends castle points**, and whether it's **standard chess** (real rules via chess.js) or a fun/rest diversion.

The Hall shows **three** visual sections matching the Tier column: "Learn chess" / "Play a game" / "Take a break" (Phase 2.2, 2026-07-03).

| Door | Route | Tier | Points | Standard chess? |
| --- | --- | --- | --- | --- |
| Learn chess (5 lessons) | `/learn` | learn | **+50** on series complete | yes (teaching) |
| Puzzle Garden | `/puzzles` | learn | earns on solve; **+10** Daily Five | yes (tactics) |
| Knight's Hop | `/knights-hop` | learn | — | piece-movement game |
| Endgame Drills | `/endgame` | learn | earns on first clear + lesson-master bonus | yes |
| Opening Trainer | `/openings` | learn | earns on first clear | yes |
| Online Chess | `/r/:roomId` | play | **gated ≥200**; review earns; takeback spends | yes |
| Local Chess | `/local` | play | ungated; review earns | yes |
| Practice with host (AI) | `/ai` | play | **gated ≥200**; review earns | yes |
| Hall of Games | `/archive` | play | review-only, **no award** | yes (replay/review) |
| Weekly Tournament | `/tournament` | play | — | yes (weekly cycle) |
| Forest Adventure | `/forest` | break | — | no (arcade) |
| Wizard's Duel | `/wizard` | break | **gated ≥1000** | **no** — "chess with magic spells, for fun, not practice" |
| Theme Shop | `/shop` | break | spends (cosmetics) | no |
| The Library (Book Owl) | `/library` | break | — | no (reading) |
| Knight's Run | `/knights-run` | break | — | no (auto-runner) |
| Tower Defense ("The Siege") | `/arcade/tower-defense` | break | **no castle points**; own leaderboard (`siege_leaderboards/global`, puzzle-board rules, opt-out honoured) | **no** — chess-themed arcade (towers are white pieces attacking the way they move), not chess practice. 3D rebuild 2026-09-25: 12-map campaign, endless, daily, bosses; `apps/web/src/games/siege/`, `functions/src/siege/`, spec `docs/SIEGE_DESIGN.md` |

Other routes not fronted by a Hall door: `/review` (post-game analysis), `/history` + `/history/:name` (match history), `/puzzles/{calibration,daily,leaderboard,legends,master,plot/:plot}`, `/learn/:lessonId`, `/endgame/:id`, `/openings/:id`, `/me` (adventurer plaque), `/team/:teamId`, `/wizard/:roomId`, *play* doors are real games (some need points to unlock), *break* doors are for fun and never change your chess. The one to watch is **Wizard's Duel** — it looks like chess but is a spell game, deliberately not chess practice.

---

## 2. Castle-point economy (quick reference)

- **Earn:** tutorial series complete **+50**; Daily Five complete **+10**; reviewing your *own* game awards crowns/points for Best/Excellent/Brilliant moves (server-authoritative). Viewing someone else's game or a Master game earns nothing (`award: false`).
- **Gates (checked against current balance, not lifetime):** Online **200**, AI Practice **200**, Wizard's Duel **1000** (server-configurable `wizardGateMinPoints`). Local is ungated.
- **Spend:** takeback costs escalate **100 / 200 / 800** (3 per game); cosmetics in the Shop.

---

## 3. Module status snapshot

Legend: **shipped** = live & working · **partial** = usable but incomplete/planned parts remain · **planned** = not built.

| Area | Status | Notes |
| --- | --- | --- |
| Standard chess rules (chess.js, client+server validator) | shipped | authoritative move validation in Cloud Functions |
| Online play (private room links) | shipped | no public matchmaking |
| Local pass-and-play | shipped | |
| AI practice (Stockfish opponent) | shipped | default untimed; 5 fixed presets + **⚖️ Adaptive** (win→harder, loss→easier, Phase 6 C6) |
| Post-game Stockfish analysis | shipped | depth 14 |
| Move classification (Best…Blunder) | shipped | matches locked thresholds in `engine/classify.ts` |
| Brilliant heuristic | shipped | 6-condition, precision-over-recall (`engine/brilliant.ts`) |
| Host commentary (Lucy/Luca via Gemini) | shipped | selective LLM; template fallback; cached |
| Post-game review + host story recap | shipped | 3rd-person "spectator" recap for masters/others' games |
| Puzzle Garden + Daily Five + Calibration + Leaderboard | shipped | |
| Puzzle-solve host explanations (Phase 6) | shipped | authored `explanation` → else on-demand `explainPuzzle` → motif template; candidate pre-authoring tool in `tools/puzzle-explain/` (B4) |
| Legends Hall + Master Atrium (puzzle museums) | shipped | already share `MuseumScreen` |
| Learn lessons (5) + tutorial reward | shipped | reward fires once for the series |
| Endgame drills, Opening trainer | shipped | |
| Castle identity (name + sha256 magic word) | shipped | not real auth by design |
| Castle points + unlock gates | shipped | see §2 |
| Paid takeback (all modes) | shipped | online = opponent-accepted offer |
| Hall of Games archive (browse/curate/masters) | shipped | classics + GM games, curator/admin tools |
| Great Hall shared chat | shipped | two-tier profanity (severe → reject, evasion-normalised) + rate-limit + report → auto-hide; LLM replies scrubbed; server-bound display names |
| Wizard chat → Hall mirror (Phase 1.1/1.2) | shipped | duel text mirrored verbatim, voice as metadata notice; report cascade hides room copy; NO private channels anywhere (audited 2026-07-03) |
| Moderation ban (Phase 1.3) | shipped | `setUserBan` (admin): guest.banned + banned_uids; blocks Hall + presence + Wizard posting |
| Gemini safetySettings (Phase 1.6) | shipped | BLOCK_LOW_AND_ABOVE on all 4 harm categories, single wrapper covers all 6 call sites |
| App Check (Phase 1.7) | **switchable** | Monitor mode today. 2026-09-29: every callable shares `APP_CHECK` from `functions/src/callableOptions.ts`; `APP_CHECK_ENFORCE=1` in `functions/.env` enforces (DECISIONS #54, supersedes the 2026-07-09 "monitor permanently" call). Jeff allowlists the custom domain on the reCAPTCHA key, then flips. History: enforcement 401'd 100% of app.powerupcastle.app traffic on 2026-07-03 → rolled back 2026-07-04. Abuse protection meanwhile: per-uid/per-name rate limits + daily quotas (Phase 1.8/3.5) |
| Infra hardening (Phase 1.8) | shipped | security headers, API-key referrer restriction, IP_HASH_SECRET, bypass rate-limit (10/day) |
| Ada UX pass (Phase 2) | shipped | AI Hint ×3/game (engine arrow) · Hall 3-tier split · review kid-mode (engine numbers folded) · MuteButton mounted + reduced-motion celebrations · friendly unlock copy ("N Daily Fives") · in-game host whispers (check/castle/promote, throttled templates) · invite dialog focus-trap/Escape · board keyboard cursor + aria · honest Shop/Tournament copy |
| Shared definitions (Phase 3.1) | shipped | one source of truth in `functions/src/shared/` (roomTypes, personas, wizard types+spells); web imports via `@shared` alias |
| Server LLM fallback (Phase 3.3) | shipped | commentary/recap/explain race an 8s timeout → honest template (`source:'fallback'`), never a naked 500 |
| Cross-device "my games" (Phase 3.4) | shipped | `syncDeviceGame` uploads local/AI games; `/history` merges account archive with device games |
| Per-name enter throttle (Phase 3.5) | shipped | `castle_enter_attempts_byname` window on top of per-uid |
| E2E smoke (Phase 3.6) | **partial** | Playwright gate+privacy specs green vs live site, weekly workflow; full sign-in happy path needs a disposable-identity story |
| Leaderboard opt-out (Phase 3.7) | shipped | `hideFromLeaderboards` via setPrivacyPrefs; enforced in gate top-5 / puzzle boards / find-player; toggle in Settings |
| In-app privacy note (Phase 3.8) | shipped | `/privacy`, linked from gate + Settings |
| callables.ts split (Phase 3.2) | won’t do | attempted + reverted; Jeff declined the dedicated pass (2026-07-03) — pure refactor, zero user value |
| Tournament | shipped | weekly cycle built: signup, pairings (`pairing.ts`), rounds (`startNextRound`), tournament rooms, result reporting, champion crown |
| Teams | shipped | `/team/:teamId` |
| Invitations (play/duel invites) | shipped | sendInvite/respond/cancel + InviteInbox (focus-trapped dialog) |
| Presence + Hearth ticker | shipped | 20s heartbeat, `chat_identity` shadow (server-bound names), online list + find player |
| CI (GitHub Actions) | shipped | typecheck+lint+test+build + emulator rules-tests on every push/PR; weekly E2E smoke workflow |
| Cosmetics / Theme Shop | shipped | 8 piece sets (classic, outline, cburnett, fantasy, animated Glowing Crystal, stone, chibi, hd), every entry `locked: false` in `cosmetics/pieceSets.tsx` — nothing is "coming soon"; the 🔒 branch in `ShopScreen.tsx` is unreachable |
| Library / Book Owl | shipped | proxies book-seek |
| Side games (Forest, Wizard's Duel, Knight's Hop, Knight's Run, The Siege) | shipped | `games/wizardv2` deleted 2026-09-29 (REVIEW Phase 0) |
| Terminal / MUD easter-egg | shipped | |
| PWA / offline shell | shipped | Workbox precache, Cloudflare no-cache headers |
| Landing site + parent guides + OG cards | shipped | `apps/landing/` (static, Firebase Hosting target `landing`): structured data, robots + sitemap, `guides/` (how-to-teach-a-kid-chess, is-online-chess-safe-for-kids); OpenGraph + Twitter cards on the app (`apps/web/index.html`, `og.png`) and on the guides |
| Mobile/iPad polish v2 (Phase 6) | shipped | safe-area insets on headers; `pointer:coarse` ≥44px tap targets; Plot/Daily/Leaderboard stack in iPad portrait |
| 3D board (three.js) | shipped | `apps/web/src/board3d/`; 🎲 3D/2D toggle (`useView3d`, remembered across screens) on Local / AI / Online / Review / Daily Five / Plot / Wizard's Duel; keyboard cursor + ARIA are 2D-only (REVIEW Phase 2) |
| LLM/TTS daily quota enforcement | shipped | `consumeDailyQuota`, chat rate-limit |
| Billing budget alert (COST_GUARDRAILS Layer 3) | shipped | $25/mo budget, 50/90/100% email alerts (verified 2026-07-03) |
| First-visit onboarding funnel | shipped | `FirstVisitGuide` — one-time, skippable (Phase 1A) |
| "Today's practice" aggregation | shipped | `TodaysPractice` card: Daily Five + practice + review-last (Phase 1B) |
| Learning GA events (daily_practice_started, tutorial_completed, story_review_opened) | shipped | wired into DailyFive / LessonScreen / review (Phase 4C) |
| Rough-game softening (Phase 2 #1) | shipped | 3+ own mistakes/blunders → one-time gentle nudge + softened recap |
| Grand win ceremony frequency (Phase 2 #4) | shipped | full crown ceremony reserved for first-win/milestone; ordinary wins get a lighter celebration (fireworks + recap) |
| Host notation scope (Phase 2 #5) | shipped | conversation = plain language; per-move review may name moves in simple SAN |
| Review commentary intensity cap (Phase 3C) | shipped | brilliancies always LLM; mistakes/blunders capped at 2 LLM comments each, rest varied templates |
| Classification thresholds (tuning) | **planned** | spec-compliant + real-world anchor tests; tuning for beginners needs Ada's real games (your call) |
| Server-side "delete my data" | shipped | `forgetMe` erases guest doc/games/chat/teams/tournament/feedback + full local wipe; control on `/me` (Phase 5) |
| Template-only (no-LLM) toggle | shipped | `/me` → Settings; gates review commentary + recap + story/ask-host (Gemini) |
| Privacy statement + COPPA self-check | shipped (docs) | `docs/PRIVACY.md` (parent-facing draft) + `docs/COPPA_CHECKLIST.md` |

---

## 4. Where to look

- Routes: `apps/web/src/App.tsx`
- Hall doors: `apps/web/src/castle/HallScreen.tsx`
- Engine feedback: `apps/web/src/engine/{classify,brilliant,analyzeGame}.ts`
- Host commentary / recap: `functions/src/commentary/`
- Castle identity + points: `apps/web/src/castle/`, `functions/src/castle/`
- 3D board: `apps/web/src/board3d/` · The Siege: `apps/web/src/games/siege/`, `functions/src/siege/`
- Landing + guides: `apps/landing/`
- Open product questions still unresolved: `docs/OPEN_QUESTIONS.md` (cross-check against §3 before assuming something is unbuilt)
