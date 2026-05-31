# Open Questions

## Resolved Decisions

See `DECISIONS.md` for the authoritative list. Highlights:

- MVP0 must include private room link online play across two different computers.
- MVP0 includes Stockfish analysis (post-game only).
- The first visual theme is Magic Forest.
- Online play starts with private room links only.
- Ada Special Mode emphasizes Ada as a smart, brave chess player.
- Lucy has a twin brother named Luca; both are hosts.
- Players can choose Lucy, Luca, both, or a surprise host (MVP0 ships Lucy or Luca only).
- **Stack**: React + TypeScript + Vite frontend, Firebase Hosting + Firestore + Cloud Functions backend, chess.js for rules, Stockfish WASM for analysis, `gemini-3.5-flash` for host commentary.
- **MVP0 devices**: desktop and tablet only, no phone layout.
- **MVP0 power-ups**: Capture Spark only.
- **Move classification**: Lichess-style cp thresholds + dedicated Brilliant heuristic.
- **Puzzles**: extracted from `docs/books_and_references/`; rights review owned by the user, not engineering.

## Product

1. Should games use clocks in MVP1, or should the first versions avoid time pressure?
2. Should undo be allowed in local games and AI practice?
3. Should online training games allow hints if both players agree?
4. What should happen when Ada makes several mistakes in a row: quieter comments, a learning break, or a suggested puzzle?
5. How rare should the Queen of the World ceremony be: once every few games, only for brilliant moves, or also for personal milestones?

## Hosts

1. Should the host call Ada by name every few messages, or only at important moments?
2. Should Lucy or Luca ever suggest taking a break?
3. Should Lucy's style be more teacher-like, more magical-host-like, or a balance?
4. Should Luca's style be more adventure-minded, more tactical, or more funny?
5. Should the selected host use chess notation in comments, or mostly natural language?
6. Should the selected host ask Ada what she was thinking after interesting moves?
7. In "both hosts" mode (MVP1), how often should the second host add a short reaction?

## Game Design

1. Should piece sets be purely decorative, or should each theme include special animations?
2. Should capture animations be short by default with an optional replay button?
3. Should power-up cards be collectible in a gallery?
4. Should power-up rewards depend on captured piece value?

## Puzzles

1. Rights status per source in `docs/books_and_references/` (owned by user; engineering tracks `rightsStatus` per puzzle).
2. Does each candidate book include FEN/notation text, or mostly diagrams? (Affects whether OCR is needed.)
3. Are solutions included in the EPUB/PDF, or do we need to derive them with the engine?
4. Should puzzle explanations be generated in the selected host's voice?
5. Should puzzle difficulty be estimated by engine depth, motif, player success rate, or manually at first?

## Safety And Privacy

1. Will MVP0 be used only by family/private testers, or shared more widely once it works?
2. Should player names be nicknames only?
3. Should all data be deletable from the beginning?
4. At what point should child privacy legal review happen before wider release?
5. Should there be a "no-LLM offline mode" toggle from day one, or only added before any public release?
