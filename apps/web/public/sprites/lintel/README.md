# Lintel sprites

Bas-relief PNG icons rendered on each Hall door's lintel. Drop generated
files here as `<iconKey>.png` and add `iconKey="<key>"` to the matching
`<RoomDoor … />` in `apps/web/src/castle/HallScreen.tsx`. The door's
SVG renders the PNG inside a 52×52 area; the rest of the door art
unchanged.

| Door | iconKey | Source prompt |
| --- | --- | --- |
| Learn chess | `learn` | `tools/generate-image/prompts/lintel-learn.txt` |
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

See `tools/generate-image/prompts/README.md` for the gen → bg-remove →
land workflow.
