# Master games (Hall of Games · 名局)

The "名局 / Masters" tab in the Hall of Games is backed by a static,
browsable archive of grandmaster games.

## What ships

Generated assets (committed) live in `apps/web/public/master-games/`:

- `index.json` — interned browse index: player + event dictionaries, the
  5 hand-curated **classics** (with original blurbs + inline PGN), and one
  compact row per master game `[id, wIdx, bIdx, evIdx, year, resultCode, eco, plies]`.
- `g/NNNN.json` — PGN move text, sharded (lazy-loaded only when a game is opened).

## Source corpus (NOT committed)

`source/` is **git-ignored**. It holds raw player PGN collections
downloaded from [PGN Mentor](https://www.pgnmentor.com/files.html)
(player files for the world champions + contemporary top players).

Game **scores are public-domain facts** — only factual metadata + the
move text are shipped. **No annotations are copied.** The per-game host
commentary a kid sees comes entirely from the engine + LLM review
pipeline at open time (the same one used for their own games).

## Rebuild

```bash
# 1. populate source/ with *.pgn collections (see MARQUEE in import.mjs
#    for the player set), then:
node tools/games-import/import.mjs
```

The importer validates **every** game through chess.js (illegal /
unfinished / too-short games are dropped), keeps only games where BOTH
players are marquee names (famous-vs-famous), dedups, interns strings,
and rewrites `apps/web/public/master-games/`. The 5 classics live in
`tools/games-import/classics.js`.
