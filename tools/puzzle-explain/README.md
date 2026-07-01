# Puzzle explanation candidates

Generates **candidate** child-friendly explanations for Puzzle Garden puzzles,
for human review before anything ships (per `docs/PUZZLE_CONTENT_PIPELINE.md`
Stages 5–6, and the child-safety gate in `docs/DECISIONS.md`).

It reuses the deployed `explainPuzzle` Cloud Function, so candidates match the
live Lucy/Luca voice exactly — no separate LLM key needed. (The app already
falls back to this same function live when a puzzle has no authored
explanation; this tool just lets you pre-author + review the good ones.)

## Generate

```bash
node tools/puzzle-explain/generate.mjs --max-diff 550 --limit 40 --host lucy
```

- Reads Firebase web config from `apps/web/.env.local`, signs in anonymously,
  validates each solution's SAN via chess.js, and calls the function for the N
  easiest puzzles under the difficulty cap (Ada's range is ~300–500).
- Writes `data/puzzles/explanations-review.json`:
  `[{ id, difficulty, motifs, fen, san, host, candidate, source, rightsStatus }]`.
- Respects the function's 120/day quota — keep `--limit` modest.

## Review (human gate — Jeff)

1. Open `data/puzzles/explanations-review.json`.
2. For each entry: check the `candidate` matches the position/solution and reads
   well for an 8–10 year old. Edit the text or delete the entry.
3. Keep only approved entries; set `rightsStatus: "approved"`.

## Merge (after review)

Approved `explanation` values go onto the puzzles in Firestore
(`puzzles/{id}.explanation`). Once a puzzle has an authored explanation the app
shows it directly and never calls the LLM for it (see `PuzzleExplanation.tsx`).
The merge step needs admin access — do it from the Firebase console or a small
admin-SDK script; not automated here so nothing unreviewed can reach the app.
