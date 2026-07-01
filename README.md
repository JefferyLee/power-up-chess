# Power Up Chess

Power Up Chess is a joyful, encouragement-first chess learning game for Ada and other 8-10 year old learners.

The game uses standard chess rules, but wraps every meaningful moment in playful feedback: capture celebrations, power-up cards, beautiful move animations, gentle coaching, and twin text-based hosts, Lucy and Luca, who help the player feel brave, capable, and curious.

The first audience is Ada, currently around 300-500 rating strength. The long-term ambition is an online browser game that can support many children safely, with rich themes, puzzles, match history, review, and engine-backed feedback.

## Quickstart

```bash
pnpm install          # pnpm 10 monorepo (Node 22)
pnpm dev              # web app on Vite → http://localhost:5173
```

Other scripts (run from repo root): `pnpm build`, `pnpm typecheck`, `pnpm test`, `pnpm lint`, `pnpm emulators` (Firebase). Cloud Functions and Firestore back the live app; most screens work against the deployed backend during local `dev`.

- **Live app:** <https://power-up-chess-dev.web.app> (custom domain **app.powerupcastle.app**, via Cloudflare)
- **What's built + all routes/doors:** [Feature Map & Status](docs/FEATURE_MAP.md) — start here to see current reality vs. the planning docs below.

## Product Documents

- [Feature Map & Status](docs/FEATURE_MAP.md) — **living source of truth** (what exists, where, how done)
- [Product Requirements](docs/PRD.md)
- [Product Decisions](docs/DECISIONS.md)
- [MVP Roadmap](docs/MVP_ROADMAP.md)
- [Game Design](docs/GAME_DESIGN.md)
- [Host Personas](docs/HOST_PERSONAS.md)
- [Technical Architecture](docs/TECHNICAL_ARCHITECTURE.md)
- [Puzzle Content Pipeline](docs/PUZZLE_CONTENT_PIPELINE.md)
- [Reference Materials](docs/REFERENCE_MATERIALS.md)
- [Open Questions](docs/OPEN_QUESTIONS.md)

## Current Product Direction

- Power-ups are rewards and learning aids, not rule-changing advantages in normal chess.
- MVP0 should be a deployed, playable web prototype with private room links for two-player online games across different computers.
- MVP0 should include Stockfish-backed analysis.
- The first visual theme should be Magic Forest.
- MVP1 should deliver the full core learning loop: online play, local play, Lucy/Luca coaching, engine-backed move feedback, power-up rewards, puzzle training, match history, and post-game review.
- The interface should be in English.
- The tone should feel magical and celebratory, but never fake. Lucy and Luca should be honest, kind, and accurate.
- Ada Special Mode should emphasize Ada as a smart, brave chess player.
