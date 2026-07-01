# Product Decisions

Last updated: 2026-05-31

> **Build status (2026-07-01):** For which decisions below are actually live in the app, and the status of every feature, see **[`FEATURE_MAP.md`](FEATURE_MAP.md)** (authoritative). This file records *what was decided*; the feature map records *what is built*.

## Confirmed Decisions

1. MVP0 must support private room link online play across two different computers.
2. MVP0 should also support local two-player play.
3. MVP0 should include Stockfish analysis.
4. The first visual theme is Magic Forest.
5. Online play should start with private room links only.
6. Public matchmaking is out of scope for MVP0.
7. Ada Special Mode should frame Ada as a smart, brave chess player, not primarily as a princess or queen character.
8. Power-ups are rewards and learning aids, not rule-changing advantages in normal chess.
9. Lucy has a twin brother named Luca. Lucy and Luca are both Power Up Chess hosts.
10. The player can choose Lucy, Luca, both, or a surprise host when starting a session.
11. Most of the time both hosts are "home"; sometimes only Lucy or only Luca is available in the product story.
12. Luca should feel like a smart, kind, energetic boy with a playful, adventure-minded, tactically curious voice.
13. `docs/books_and_references/` is the project reference library for puzzle extraction, curriculum planning, and sourced host knowledge.

## Technical Stack Decisions (locked 2026-05-31)

14. **Frontend**: React + TypeScript + Vite. Custom chess UI; lightweight UI primitives library (e.g. Radix UI primitives) only for menus/dialogs/toggles.
15. **Chess rules**: chess.js, used on both client and server.
16. **Engine**: Stockfish WebAssembly running in the browser. **Post-game analysis only** in MVP0; no in-game labels.
17. **Backend**: Firebase. Specifically:
    - **Firebase Hosting** for the frontend.
    - **Firestore** for room state, with realtime listeners for live online play.
    - **Cloud Functions** as the authoritative move validator (re-runs chess.js server-side before accepting any write).
    - **Local storage / IndexedDB** for MVP0 match history; Firestore-backed history is an MVP1 concern.
18. **Host commentary LLM**: `gemini-3.5-flash`. Used in a **hybrid pattern**:
    - Ordinary moves: no commentary, or a one-word template ("Nice.").
    - Good / Excellent / Brilliant / Mistake / Blunder moves: LLM call with FEN, eval delta, best line, host persona.
    - Capture Spark cards: template-driven, no LLM.
    - Post-game Story Review: one LLM call per game.
19. **Move classification thresholds** (Lichess-style, locked for MVP0 — re-tune with real play data):
    - Inaccuracy: 50–100 cp loss
    - Mistake: 100–200 cp loss
    - Blunder: > 200 cp loss
    - Good / Excellent: cp loss ≤ 50, with Excellent reserved for top-engine matches in tactical positions
    - Brilliant: dedicated heuristic (best or near-best engine move + material sacrifice not immediately recovered + eval preserved or improved + position non-trivial). See `TECHNICAL_ARCHITECTURE.md` for full spec.
20. **MVP0 Power-up scope**: only **Capture Spark**. Tactic Bloom, Crown Spark, Replay Ribbon, Hint Sparkle are deferred.
21. **MVP0 Host UI**: single active host only. Player picks Lucy or Luca at session start. "Both" and "Surprise" defer to MVP1.
22. **Devices in MVP0**: desktop + tablet web only. No mobile-phone layout.
23. **Puzzle source**: puzzles may be extracted from the books in `docs/books_and_references/`. The user owns rights review for each source; engineering should not block on it but must store `rightsStatus` per puzzle.
24. **Repository hygiene**: `docs/books_and_references/` content (PDFs, EPUBs) is git-ignored. Only its `README.md` (catalog + rights status) is committed.

## MVP2 Decisions (locked 2026-06-01)

25. **The homepage becomes the Power Up Castle.** Visitors land at a public gate that shows the castle name, live guest count, and a top-5 global leaderboard. Knocking (click) or 5 s idle opens a wicket and presents a name + magic word note. See `docs/MVP2_PLAN.md`.
26. **`name + magic word` identity layer** sits on top of Anonymous Auth. Client-side `sha256(normalizedName + ':' + magicWord)`, stored server-side; no email, no password recovery. Three wrong attempts surface a bypass link → throwaway `Guest-NNNN` with no Firestore persistence and no castle points.
27. **Open shared chat in the Great Hall.** All guests in the lobby see one chat stream. Profanity filter + per-uid rate limits + report-flag + auto-hide. **No** in-game chat, **no** DMs.
28. **Castle Points are the unified currency.** Earned in Puzzle Garden (always) and chess rooms (only after unlock). Forest Adventure earns **zero** castle points — only its own in-game score. 200 points unlocks the three chess rooms; decay (5 pts after 1 day absent, 50 pts after 7 days, linear ramp) can re-lock.
29. **Hosts tell ambient chess stories** every ~3 minutes in the Hall when ≥1 guest present, capped at 6 stories/hour. Story content is extracted offline from `docs/books_and_references/` via `tools/story-import/`. Rights model mirrors puzzles (engineering stores `rightsStatus`; user reviews; anti-verbatim guardrail enforced in the pipeline). Runtime cost: zero LLM calls for ambient stories.
30. **Forest Adventure** is folded in as the fifth Hall door, ported from `../ada-advanture`. Always playable; its scores live in their own leaderboard separate from castle points.
31. **Themes are now bound to hosts.** Lucy ↔ Magic Forest, Luca ↔ Starry Universe. The standalone theme picker is removed. Host is rolled once per `sessionStorage` instance.
32. **Castle Terminal** (post-MVP2) is an optional fullscreen MUD-style command surface launched from a `⛶` toggle in the Hall chat panel. Includes a 6-room world map (+ unlockable Cellar), items, daily mystery riddles, hand-written lore, four text mini-games, `/play` vs Stockfish with built-in coach labels, `/puzzle` from the lichess bank, and `/ask Lucy|Luca` via `gemini-3.5-flash`. Reuses all existing castle infrastructure (castle points, invites, presence, public chat) without changing any other surface. Full spec: `docs/TERMINAL_TEXT_WORLD.md`.
33. **No DMs holds through the Terminal.** `/say` posts to the public Hall (tagged "🌀 from the secret tunnel"), `/me` is public, plain typed text in the Terminal becomes a private "mumble" the Hall does not see. No command sends a message to a specific user only.

## Implications

- MVP0 needs a small real-time backend (Firebase), not only static hosting.
- The recommended MVP0 deployment is Firebase Hosting for the frontend plus Firestore and Cloud Functions for private game rooms.
- Stockfish runs in the browser and only after games end, so in-game UX is not blocked by engine latency.
- LLM commentary is the only runtime dependency on a third-party API. For private/family MVP0 testing this is acceptable; before any public child-facing release, COPPA review and an opt-out path are required.
- Visual and copy direction should use Magic Forest atmosphere while keeping chess concepts readable and serious enough for a growing player.
- MVP0 ships single-host UI; persona and copy systems should still be structured so MVP1 can add Both/Surprise without rewrite.
- Reference materials can be read when a task needs puzzle sources, history facts, curriculum input, or rights metadata, but they should not be processed for unrelated implementation tasks.
