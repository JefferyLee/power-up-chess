# Feature Map & Status (living)

Last updated: 2026-07-01

This is the **one-page source of truth** for "what exists, where it lives, and how done it is." When docs and the running app disagree, trust this file (and the code). Older planning docs (`MVP_ROADMAP.md`, `PRD.md`, `OPEN_QUESTIONS.md`) describe intent; this describes reality.

Live app: <https://power-up-chess-dev.web.app> (custom domain **app.powerupcastle.app**, behind Cloudflare).
Landing: <https://powerupcastle-landing.web.app>.
Run locally: see [README](../README.md#quickstart) → `pnpm install && pnpm dev`.

---

## 1. The Great Hall doors

Every door in the Hall (`apps/web/src/castle/HallScreen.tsx`), its route, whether it **earns/spends castle points**, and whether it's **standard chess** (real rules via chess.js) or a fun/rest diversion.

The Hall today shows **two** visual sections: "Learn and play chess" (learn + play merged) and "Take a break". The **Tier** column below is the intended three-way split (learn / play / break) — splitting the UI is Phase 1C, not yet done.

| Door | Route | Tier | Points | Standard chess? |
| --- | --- | --- | --- | --- |
| Learn chess (5 lessons) | `/learn` | learn | **+50** on series complete | yes (teaching) |
| Puzzle Garden | `/puzzles` | learn | earns on solve; **+10** Daily Five | yes (tactics) |
| Knight's Hop | `/knights-hop` | learn | — | piece-movement game |
| Endgame Drills | `/endgame` | learn | — | yes |
| Opening Trainer | `/openings` | learn | — | yes |
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
| Tower Defense | `/arcade/tower-defense` | break | — | no (vendored mini-game) |

Other routes not fronted by a Hall door: `/review` (post-game analysis), `/history` + `/history/:name` (match history), `/puzzles/{calibration,daily,leaderboard,legends,master,plot/:plot}`, `/learn/:lessonId`, `/endgame/:id`, `/openings/:id`, `/me` (adventurer plaque), `/team/:teamId`, `/wizard/:roomId`, `/wizard/v2/:roomId`.

**Ada's-eye rule of thumb:** *learn* doors teach chess, *play* doors are real games (some need points to unlock), *break* doors are for fun and never change your chess. The one to watch is **Wizard's Duel** — it looks like chess but is a spell game, deliberately not chess practice.

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
| Great Hall shared chat | shipped | profanity + rate-limit + report-flag → auto-hide at 3 distinct reports |
| Tournament | shipped | weekly cycle built: signup, pairings (`pairing.ts`), rounds (`startNextRound`), tournament rooms, result reporting, champion crown |
| Teams | shipped | `/team/:teamId` |
| Cosmetics / Theme Shop | **partial** | more sets "unlock soon" |
| Library / Book Owl | shipped | proxies book-seek |
| Side games (Forest, Wizard's Duel + v2, Knight's Hop, Knight's Run, Tower Defense) | shipped | |
| Terminal / MUD easter-egg | shipped | |
| PWA / offline shell | shipped | Workbox precache, Cloudflare no-cache headers |
| Mobile/iPad polish v2 (Phase 6) | shipped | safe-area insets on headers; `pointer:coarse` ≥44px tap targets; Plot/Daily/Leaderboard stack in iPad portrait |
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
- Open product questions still unresolved: `docs/OPEN_QUESTIONS.md` (cross-check against §3 before assuming something is unbuilt)
