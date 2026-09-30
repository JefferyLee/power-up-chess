# Tower Defense rebuild — "the black army marches" (design + contracts)

Status: **in build** (2026-09-25). Decisions by Jeff: chess theme, no castle
points, global leaderboard with the puzzle-leaderboard rules, all three
phases at once. Replaces the vendored Canvas-2D game under
`apps/web/public/tower-defense/` (iframe; deleted 2026-09-29) with an in-app React + three.js
game at the same Hall door and route (`/arcade/tower-defense`).

Why chess-themed: towers are white pieces that attack the way they move,
so a game Ada plays for fun rehearses piece movement. Enemies are the
black army. Nothing bleeds: pieces pop and topple, like the 3D board.

## 1. Core rules

- A grid map (12×8 … 18×12 cells) on the castle table. Cell kinds:
  `wall` (nothing), `road` (enemies walk, no building), `plot` (build
  only), `open` (walkable until a tower sits on it — maze maps).
  Enemies path-find (BFS flow field to the goal) over walkable cells; a
  placement that would cut every spawn off from the goal is refused.
- Waves spawn from one or more gates and walk to the castle gate. Each
  leak costs lives (pawn 1 … boss 5–20). 20 lives.
- Build phase countdown before wave 1 (12 s) and between waves (8 s);
  "Start now" pays 2 gold per remaining second. Speed ×1 / ×2, pause.
- Gold: kill rewards + wave clear bonus `20 + 8 × wave`. Sell = 60 % of
  everything spent on that tower.
- Win = clear the last wave. Stars: 3 = no lives lost, 2 = ≤ 3 lost,
  1 = won. Score = rewards + wave bonuses + stars × 500. Endless score =
  waves × 100 + rewards.

## 2. Towers = white pieces (attack pattern = movement)

Pattern kinds: `cells` (a fixed set of offsets), `lines` (slide along
directions up to `length` cells and hit the FIRST enemy in each direction,
like a real slider is blocked by the first piece), `aura` (no attack;
buffs towers on the offsets). Hovering a piece in the shop or on the board
shows exactly the cells it can hit, in the same green as the 2D/3D
board's legal-move highlights.

| Piece | Cost | Pattern | L1 dmg / rate | L2 (+cost) | L3 branches (+cost) |
| --- | --- | --- | --- | --- | --- |
| Pawn | 40 | cells: 4 diagonals | 12 / 1.6 | 18 / 1.9 (+35) | **Spear** +4 orthogonals, 22 dmg (+60); **Phalanx** 4 diagonals, 30 dmg / 2.2 (+60). Any pawn can **promote** to another piece at any level for `cost(piece) − 40`. |
| Knight | 90 | cells: 8 L-cells, splash r1 (50 %) | 34 / 0.9 | 48 / 1.0 (+70) | **Storm** chain lightning ×3, 0.6 falloff (+120); **Charger** 52 / 1.6 (+120) |
| Bishop | 110 | lines: 4 diagonals, len 4 | 26 / 1.1 | 36 / 1.1, len 5 (+80) | **Frost** slow 45 % 1.5 s (+130); **Sun** burn 12 dps 3 s, 40 dmg (+130) |
| Rook | 140 | lines: 4 orthogonals, len 5 | 60 / 0.6 | 85 / 0.6, len 6 (+100) | **Cannon** splash r1, 95 dmg (+160); **Siege** armour pierce, 120 dmg (+160) |
| Queen | 260 | lines: 8 dirs, len 4 | 45 / 0.9 | 62 / 0.9, len 5 (+180) | **Fury** rate 1.5 (+240); **Empress** len 7, 75 dmg (+240) |
| King | 180, **one per board** | aura: 8 neighbours | +25 % dmg, +15 % rate | +40 % / +25 % (+120) | **Rally** +50 % / +40 % (+150); **Treasury** aura towers' kills pay +50 % gold (+150) |

Targeting for `cells` towers: first / last / strongest / weakest, chosen
in the tower panel (default first). Lines always hit the first enemy
along the line (that IS the chess rule).

## 3. Enemies = the black army

| Type | HP | Speed (cells/s) | Armour | Reward | Leak | Trait |
| --- | --- | --- | --- | --- | --- | --- |
| pawn | 60 | 1.0 | 0 | 6 | 1 | — |
| knight | 45 | 2.0 | 0 | 8 | 1 | slow-immune (it jumps) |
| bishop | 90 | 1.2 | 0 | 10 | 1 | heals allies within 1.5 cells, 6 hp/s |
| rook | 420 | 0.7 | 0.5 | 22 | 2 | — |
| queen | 700 | 1.1 | 0.3 | 40 | 3 | — |

Armour removes that fraction of damage unless the hit pierces. Waves
carry an `hpMult`; endless uses `1 + 0.08 × wave` and lets the heavy
pieces in slowly: at most ⌈wave / 2⌉ bishops, ⌈wave / 4⌉ rooks and
⌈wave / 8⌉ queens per wave.

## 4. Bosses (phases start when HP ≤ fraction; each phase ADDS to the last)

Bosses ignore the `shielded` modifier: their armour is this table's plus
any shield layers, on every map.

| Boss | Map | HP / speed / armour | Reward / leak | Phases |
| --- | --- | --- | --- | --- |
| The Black Knight | 3 | 1800 / 1.3 / 0.1 | 150 / 5 | 1.0 dash 3 cells every 6 s (telegraph 1.2 s) · 0.5 + summon 4 knights every 12 s |
| The Iron Rook | 6 | 2600 / 0.6 / 0.3 + 2 shield layers × 0.15 | 260 / 6 | 1.0 EMP r2 stuns towers 3 s every 10 s (telegraph 1.5 s) · 0.66 loses a layer · 0.33 loses the last |
| The Frost Bishop | 8 | 3600 / 1.0 / 0.2 | 300 / 6 | 1.0 freezes towers on its 4 diagonals (len 5) 4 s every 9 s (telegraph 1.5 s) · 0.6 teleports back 6 cells and heals 10 % (once) · 0.3 again + heal aura r2 20 hp/s |
| The Shadow Queen | 10 | 5200 / 1.1 / 0.3 | 400 / 8 | 1.0 summon 2 bishops every 14 s · 0.5 splits into 3 (one real — it keeps the crown; decoys have 25 % of her HP, leak 2) |
| The Dark King | 12 | 8000 / 0.55 / 0.35 | 800 / 20 | 1.0 calls 6 pawns every 15 s, heal aura r2 15 hp/s · 0.75 + EMP r2 2.5 s every 12 s · 0.5 + summon 2 rooks every 20 s · 0.25 speed 0.8, calls 6 knights every 10 s |

Boss intro (skippable): camera dolly to the gate, name banner, game
speed ramps 1 → 0.25 → 1 over ~2.5 s, boss music sting. Telegraphs are
rings/lines on the cells for the telegraph duration so Ada can react.
Defeat: the piece topples slowly (the Dark King "resigns"), then pops.

## 5. Spells (cooldown only, no gold; unlocked by campaign progress)

| Spell | Unlock | Cooldown | Effect |
| --- | --- | --- | --- |
| Fork | map 2 | 30 s | 120 dmg to the 2 enemies furthest along the path inside a 5×5 around the target cell |
| Pin | map 4 | 35 s | freezes every enemy in a 3×3 for 3 s (bosses 1.5 s) |
| Skewer | map 6 | 40 s | 90 piercing dmg to every enemy on a whole row or column |
| Castling | map 8 | 45 s | swap two of your towers (also clears their stun) |

## 6. Campaign, modifiers, endless, daily

Modifiers: `fog` (line length −1), `noQueens`, `maxTowers8`, `lowBudget`
(70 gold), `rush` (countdowns 3 s, enemy speed ×1.25), `shielded` (+0.2
armour on everything but bosses), `noKing`.

| # | Map | Theme | Size | Waves | Notes |
| --- | --- | --- | --- | --- | --- |
| 1 | Courtyard Gate | courtyard | 12×8 | 8 | tutorial: pawns + knights only |
| 2 | Kitchen Garden | courtyard | 14×9 | 10 | unlocks Fork |
| 3 | The Old Bridge | courtyard | 14×9 | 10 | boss Black Knight |
| 4 | Forest Path | forest | 16×10 | 10 | two gates; `fog`; unlocks Pin |
| 5 | Beekeeper's Field | forest | 16×10 | 11 | open field (maze building) |
| 6 | Iron Mine | forest | 16×10 | 12 | boss Iron Rook; `shielded`; unlocks Skewer |
| 7 | Frozen Lake | frost | 16×11 | 12 | open; `rush` |
| 8 | Frost Chapel | frost | 16×11 | 12 | boss Frost Bishop; unlocks Castling |
| 9 | Lava Steps | lava | 18×11 | 13 | two gates; `noQueens` |
| 10 | Shadow Hall | lava | 18×11 | 13 | open; boss Shadow Queen; `maxTowers8` |
| 11 | Throne Approach | throne | 18×12 | 14 | three gates; `lowBudget` |
| 12 | The Dark Throne | throne | 18×12 | 15 | boss Dark King; `shielded` + `rush` |

A map unlocks when the previous one has ≥ 1 star. Endless (after any
win on a map): generated waves (`8 + 2 × wave` enemies, heavy pieces
capped as in §3), boss every 5 waves rotating through the five. Daily:
seed = date key, map rotates by day, endless rules, global leaderboard by
score. Achievements are local (no castle points).

### Balance

`content/balance.test.ts` runs the greedy bot (`sim/autoplay.ts`: buys by
path-cells-covered × dps per gold, saves for a clearly better piece,
upgrades, promotes pawns, places one king; never casts spells, never
mazes, never sells) on every campaign map with seeds 1–3 plus endless on
Courtyard Gate and Lava Steps, and asserts: maps 1–2 win with 3 stars,
3–8 win, 9–12 reach ≥ 65 % of their waves, endless reaches wave 12 on
Courtyard Gate (so both boss waves) and 8 on Lava Steps, and no map's
start gold buys more than three pawns. The bot is a floor — a child with
spells and a maze does better — so a map it wins easily is a map to make
harder, not easier. Campaign runs are seed-independent (the RNG only
jitters summons). Result at the 2026-09-25 tuning:

| Map | Bot | Map | Bot |
| --- | --- | --- | --- |
| 1 Courtyard Gate | win 8/8, 20 lives, 3★ | 7 Frozen Lake | win 12/12, 6 lives, 1★ |
| 2 Kitchen Garden | win 10/10, 20 lives, 3★ | 8 Frost Chapel | win 12/12, 7 lives, 1★ |
| 3 The Old Bridge | win 10/10, 20 lives, 3★ | 9 Lava Steps | win 13/13, 2 lives, 1★ |
| 4 Forest Path | win 10/10, 20 lives, 3★ | 10 Shadow Hall | lost on wave 10/13 |
| 5 Beekeeper's Field | win 11/11, 10 lives, 1★ | 11 Throne Approach | win 14/14, 5 lives, 1★ |
| 6 Iron Mine | win 12/12, 9 lives, 1★ | 12 The Dark Throne | lost on wave 15/15 (the Dark King) |
| ∞ Courtyard Gate | dies on wave 15 (Frost Bishop) | ∞ Lava Steps | dies on wave 15 (Frost Bishop) |

Tuning notes: every late map's `hpMult` now starts at 1.0–1.2 and climbs
to the old ending, because each map starts from the same 120–140 gold
whatever its number — the difficulty lives in the later waves, the
modifiers and the boss, not in wave 1. Frozen Lake (7) and Shadow Hall
(10) are open maps judged against a bot that walks the straight line;
their curves are the gentlest of the second half (7: 1.0 → 1.35, 10:
1.2 for waves 1–8 then 1.5 → 2.0) and a child who builds a maze will
find them easier than their neighbours. Throne Approach's wave 1 is five
pawns at 1.1, spaced 1.5 s, so one pawn at the crossroads holds it on
70 gold. The Dark Throne starts at 1.2 because `shielded` + `rush`
already multiply everything by ~1.5.

## 7. Engineering

```
apps/web/src/games/siege/
  sim/        pure TS simulation, fixed 60 Hz steps, seeded RNG, no three/React
              types.ts (contract), defs.ts (tables above), path.ts, sim.ts,
              bosses.ts, spells.ts, autoplay.ts (greedy bot for balance tests)
  content/    maps/*.ts (12 campaign maps), endless.ts, daily.ts
  view/       R3F scene: instanced grid + enemies, procedural white/black
              pieces (board3d/pieceGeometry), beams/projectiles/telegraphs,
              board3d fx (SparkBurst, RingPulse, Torch), camera rig, boss intro
  ui/         SiegeScreen (route), map select, HUD, shop, tower panel, spell
              bar, results, leaderboard, progress persistence
functions/src/siege/   leaderboard refresh (puzzle pattern)
```

The renderer reads `sim.state` every frame (refs, no React state per
tick) and consumes `sim.tick(dt)`'s event list for effects and sounds.
All chess-pattern math lives in `sim/` and is unit-tested (patterns,
line blocking, flow field + block rule, economy, phases, spells).
Performance target: iPad, ≤ 300 enemies via `InstancedMesh`, ≤ 150 draw
calls.

Persistence: campaign stars / spells / achievements in
`localStorage` (`puc.siege.progress`) mirrored per guest in Firestore;
leaderboard = puzzle-leaderboard pattern (display names only, bypass
guests excluded).
