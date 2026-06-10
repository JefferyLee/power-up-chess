# Lintel prompts

Each `lintel-*.txt` produces one bas-relief icon for a Hall door's lintel
zone in `apps/web/src/castle/HallScreen.tsx`. The shared style is
designed to read as "stone carving on a castle doorway" so the 14 doors
feel like a single set, even though each is drawn fresh.

## Generate one

```bash
pnpm --filter @power-up-chess/generate-image gen \
  --label lintel-online-v1 \
  --prompt-file prompts/lintel-online.txt \
  --ratio 1:1
```

Output lands at `tools/generate-image/output/lintel-online-v1-<ts>.png`.

## Drop the background

The doors render the lintel on dark wood; backgrounds must be
transparent so the door colour shows around the carved subject.

```bash
pnpm --filter @power-up-chess/generate-image gen \
  --label lintel-online \
  --bg-remove output/lintel-online-v1-<ts>.png
```

Result lands as `tools/generate-image/output/lintel-online-<ts>.png`.

## Land it

Copy the bg-removed PNG into the web app's public sprites tree:

```bash
cp tools/generate-image/output/lintel-online-<ts>.png \
   apps/web/public/sprites/lintel/online.png
```

Then add `iconKey="online"` to the matching `<RoomDoor … />` in
`HallScreen.tsx`. The door will start rendering the PNG; if the file
is absent the emoji fallback (existing `icon` prop) keeps showing.

## Door → file mapping

| Door label (HallScreen) | iconKey | Prompt file |
| --- | --- | --- |
| Learn chess | `learn` | `lintel-learn.txt` |
| Puzzle Garden | `puzzles` | `lintel-puzzles.txt` |
| Online Chess | `online` | `lintel-online.txt` |
| Local Chess | `local` | `lintel-local.txt` |
| Practice with [host] | `practice-ai` | `lintel-practice-ai.txt` |
| Knight's Hop | `knights-hop` | `lintel-knights-hop.txt` |
| Endgame Drills | `endgame` | `lintel-endgame.txt` |
| Opening Trainer | `opening` | `lintel-opening.txt` |
| Forest Adventure | `forest` | `lintel-forest.txt` |
| Wizard's Duel | `wizard` | `lintel-wizard.txt` |
| Theme Shop | `shop` | `lintel-shop.txt` |
| Story Library | `library` | `lintel-library.txt` |
| Weekly Tournament | `tournament` | `lintel-tournament.txt` |
| Knight's Run | `knights-run` | `lintel-knights-run.txt` |

## Iterating

If a generation comes out wrong, regenerate with a higher version
label (`lintel-online-v2`) before bg-remove. Keep the prior PNG in
`output/` until the new one is approved — it's the only way to A/B
quickly.

## Style header (shared)

Every prompt opens with the same 5-line bas-relief style description.
If you tweak the shared style, edit it in every file or factor the
common block into a single edit — there's no `@include` mechanism on
the model side.
