// Siege simulation — the shared CONTRACT between sim/, content/, view/
// and ui/. Pure types; no three.js, no React. See docs/SIEGE_DESIGN.md
// for the rules and the balance tables these types carry.
//
// Coordinates: cells are (c, r) with c = column (x, →) and r = row
// (y, ↓), 0-based. Continuous positions are in cell units, so cell
// (c, r)'s centre is (c + 0.5, r + 0.5).

export interface Cell {
  c: number
  r: number
}

export type CellKind = 'wall' | 'road' | 'plot' | 'open'

export type TowerType = 'pawn' | 'knight' | 'bishop' | 'rook' | 'queen' | 'king'
export type EnemyType = 'pawn' | 'knight' | 'bishop' | 'rook' | 'queen'
export type BossId = 'blackKnight' | 'ironRook' | 'frostBishop' | 'shadowQueen' | 'darkKing'
export type Targeting = 'first' | 'last' | 'strongest' | 'weakest'
export type SpellId = 'fork' | 'pin' | 'skewer' | 'castling'
export type Modifier = 'fog' | 'noQueens' | 'maxTowers8' | 'lowBudget' | 'rush' | 'shielded' | 'noKing'
export type Theme = 'courtyard' | 'forest' | 'frost' | 'lava' | 'throne'
export type TowerLevel = 1 | 2 | 3

// ── Attack patterns ──────────────────────────────────────────────────
export type Offset = readonly [dc: number, dr: number]

export type Pattern =
  /** Hits enemies standing on these cells (relative to the tower). */
  | { kind: 'cells'; offsets: ReadonlyArray<Offset> }
  /** Slides along each direction up to `length` cells and hits the
   *  FIRST enemy met in that direction (blocked like a real slider). */
  | { kind: 'lines'; dirs: ReadonlyArray<Offset>; length: number }
  /** No attack; buffs towers standing on these cells. */
  | { kind: 'aura'; offsets: ReadonlyArray<Offset> }

// ── Definitions (data tables live in sim/defs.ts) ────────────────────
export interface TowerStats {
  /** Damage per hit. 0 for auras. */
  damage: number
  /** Shots per second. */
  fireRate: number
  /** Line length for `lines` patterns; ignored otherwise. */
  range: number
  /** Splash radius in cells around the hit enemy (50 % damage). */
  splash?: number
  slow?: { factor: number; seconds: number }
  burn?: { dps: number; seconds: number }
  pierce?: boolean
  /** Chain lightning: extra targets and per-jump damage falloff. */
  chain?: { targets: number; falloff: number }
  /** Aura buffs (king). */
  aura?: { damageMult: number; rateMult: number; goldMult: number }
}

export interface BranchDef {
  id: string
  name: string
  cost: number
  stats: TowerStats
  /** Replaces the base pattern (e.g. Spear pawn adds orthogonals). */
  pattern?: Pattern
  description: string
}

export interface TowerDef {
  type: TowerType
  name: string
  cost: number
  /** At most one on the board (king). */
  unique?: boolean
  pattern: Pattern
  /** Level 1 and level 2 stats. */
  levels: readonly [TowerStats, TowerStats]
  /** Cost of the L1→L2 upgrade. */
  upgradeCost: number
  /** The two level-3 specialisations. */
  branches: readonly [BranchDef, BranchDef]
  defaultTargeting: Targeting
  description: string
}

export interface EnemyDef {
  type: EnemyType
  name: string
  hp: number
  /** Cells per second. */
  speed: number
  /** 0..1 fraction of damage removed (unless pierced). */
  armor: number
  reward: number
  /** Lives lost when it reaches the gate. */
  leak: number
  slowImmune?: boolean
  healer?: { radius: number; hps: number }
  /** Render scale relative to a pawn. */
  scale: number
}

export type BossAbility =
  | { kind: 'summon'; enemy: EnemyType; count: number; every: number }
  | { kind: 'dash'; cells: number; every: number; telegraph: number }
  | { kind: 'emp'; radius: number; stun: number; every: number; telegraph: number }
  | { kind: 'freezeLines'; length: number; stun: number; every: number; telegraph: number }
  | { kind: 'teleportBack'; cells: number; heal: number }
  | { kind: 'shield'; layers: number; armorPerLayer: number }
  | { kind: 'split'; count: number; decoyHpFraction: number; decoyLeak: number }
  | { kind: 'healAura'; radius: number; hps: number }
  | { kind: 'callWave'; enemy: EnemyType; count: number; every: number }

export interface BossPhase {
  /** Phase begins when hp/maxHp ≤ this. Phase 1 is 1.0. */
  atHpFraction: number
  /** Added to the abilities of earlier phases. */
  abilities: BossAbility[]
  /** Overrides for this phase onward. */
  speed?: number
  armor?: number
  /** Iron Rook: shield layers dropped when this phase begins. */
  dropShieldLayers?: number
}

export interface BossDef {
  id: BossId
  name: string
  title: string
  hp: number
  speed: number
  armor: number
  reward: number
  leak: number
  scale: number
  phases: BossPhase[]
  /** One line, host voice, shown on the intro banner. */
  intro: string
}

export interface SpellDef {
  id: SpellId
  name: string
  cooldown: number
  /** Campaign map id that unlocks it. */
  unlockMap: string
  description: string
}

// ── Content ──────────────────────────────────────────────────────────
export interface WaveGroup {
  type: EnemyType
  count: number
  /** Seconds between spawns in the group. */
  gap: number
  /** Seconds after the wave starts before the group begins. */
  delay: number
  /** Index into the map's spawn gates (default 0). */
  gate?: number
}

export interface WaveDef {
  groups: WaveGroup[]
  /** Spawned after the last group of the wave, from gate 0. */
  boss?: BossId
  /** Multiplies every enemy's HP in this wave (default 1). */
  hpMult?: number
}

/** Map cell characters for `MapDef.cells`:
 *  '#' wall · '.' road · 'p' plot · 'o' open · 'S' spawn gate (road) ·
 *  'G' goal gate (road). Gates are numbered in reading order. */
export interface MapDef {
  id: string
  /** 1-based campaign order; 0 for non-campaign maps. */
  order: number
  name: string
  subtitle: string
  theme: Theme
  cols: number
  rows: number
  cells: string[]
  waves: WaveDef[]
  modifiers: Modifier[]
  startGold: number
  lives: number
  unlocksSpell?: SpellId
  /** One line, host voice, on the map card. */
  intro: string
}

// ── Live state (the renderer reads this every frame) ─────────────────
export interface Vec2 {
  x: number
  y: number
}

export interface TowerState {
  id: number
  type: TowerType
  cell: Cell
  level: TowerLevel
  branch: string | null
  targeting: Targeting
  /** Sim time until which the tower cannot fire (boss EMP / freeze). */
  stunnedUntil: number
  kills: number
  /** Gold spent on it so far (sell value = 60 %). */
  spent: number
  /** True when a king's aura currently covers it. */
  buffed: boolean
  /** 0..1 progress to the next shot — the view uses it for recoil. */
  cooldown: number
}

export interface EnemyState {
  id: number
  type: EnemyType | BossId
  boss: boolean
  /** Shadow Queen decoy: no crown, dies for nothing. */
  decoy: boolean
  hp: number
  maxHp: number
  armor: number
  /** Continuous position in cell units. */
  pos: Vec2
  /** Unit direction of travel (for facing). */
  dir: Vec2
  /** Cells travelled along its path — first/last targeting. */
  progress: number
  /** Remaining path length to the gate. */
  remaining: number
  speedMult: number
  slowUntil: number
  frozenUntil: number
  burnUntil: number
  burnDps: number
  shieldLayers: number
  /** Boss: current phase index. */
  phase: number
  /** Time it was spawned / last hit — for the view's flashes. */
  spawnedAt: number
  hitAt: number
}

export interface ProjectileState {
  id: number
  kind: 'arrow' | 'jump' | 'bolt'
  from: Vec2
  to: Vec2
  /** 0..1 along the flight. */
  t: number
}

export interface BeamState {
  id: number
  kind: 'rook' | 'bishop' | 'queen' | 'chain' | 'skewer'
  from: Vec2
  to: Vec2
  /** Seconds left; starts at `life`. */
  ttl: number
  life: number
}

export interface Telegraph {
  id: number
  kind: 'ring' | 'cells' | 'line'
  cells: Cell[]
  /** Seconds left. */
  ttl: number
  life: number
  /** What it warns of. */
  ability: BossAbility['kind'] | 'spell'
}

export interface SpellState {
  ready: boolean
  /** Seconds until ready. */
  cooldown: number
  unlocked: boolean
}

export type Phase = 'build' | 'wave' | 'won' | 'lost'

export interface SimState {
  time: number
  speed: 1 | 2
  paused: boolean
  phase: Phase
  gold: number
  lives: number
  livesMax: number
  /** 1-based; 0 before the first wave. */
  wave: number
  /** 0 in endless. */
  waveTotal: number
  /** Seconds until the next wave auto-starts (build phase). */
  countdown: number
  /** Enemies still to spawn in the current wave. */
  pending: number
  towers: TowerState[]
  enemies: EnemyState[]
  projectiles: ProjectileState[]
  beams: BeamState[]
  telegraphs: Telegraph[]
  spells: Record<SpellId, SpellState>
  score: number
  kills: number
  leaks: number
  /** Current flow-field path from each gate to the goal (for arrows). */
  paths: Cell[][]
  /** Set while a boss is alive. */
  boss: EnemyState | null
  /** Boss intro progress 0..1 while a boss is being introduced (the sim
   *  slows itself to 0.25× in the middle); 1 when no intro is running.
   *  The view uses it for the camera dolly + banner. */
  bossIntro: number
  /** The boss being introduced while bossIntro < 1. */
  introBoss: BossId | null
}

// ── Events (returned by tick(); consumed once for fx + sound) ────────
export type SimEvent =
  | { kind: 'shot'; towerId: number; from: Vec2; to: Vec2; towerType: TowerType }
  | { kind: 'hit'; enemyId: number; at: Vec2; damage: number; crit: boolean }
  | { kind: 'kill'; enemyId: number; at: Vec2; type: EnemyType | BossId; reward: number }
  | { kind: 'spawn'; enemyId: number; at: Vec2; type: EnemyType | BossId }
  | { kind: 'leak'; enemyId: number; livesLost: number }
  | { kind: 'waveStart'; wave: number }
  | { kind: 'waveClear'; wave: number; bonus: number }
  | { kind: 'bossSpawn'; boss: BossId; enemyId: number }
  | { kind: 'bossPhase'; boss: BossId; phase: number }
  | { kind: 'bossAbility'; boss: BossId; ability: BossAbility['kind']; at: Vec2 }
  | { kind: 'bossDefeat'; boss: BossId; at: Vec2 }
  | { kind: 'telegraph'; telegraphId: number }
  | { kind: 'stun'; towerId: number; seconds: number }
  | { kind: 'spell'; spell: SpellId; at: Cell }
  | { kind: 'build'; towerId: number; type: TowerType; cell: Cell }
  | { kind: 'upgrade'; towerId: number; level: TowerLevel; branch: string | null }
  | { kind: 'promote'; towerId: number; to: TowerType }
  | { kind: 'sell'; cell: Cell; refund: number }
  | { kind: 'castling'; a: Cell; b: Cell }
  | { kind: 'combo'; count: number }
  | { kind: 'won'; stars: 1 | 2 | 3; score: number }
  | { kind: 'lost'; wave: number; score: number }

// ── Sim API ──────────────────────────────────────────────────────────
export type SpellTarget =
  | { kind: 'cell'; cell: Cell }
  | { kind: 'line'; cell: Cell; orientation: 'row' | 'col' }
  | { kind: 'towers'; a: number; b: number }

export interface SimOptions {
  map: MapDef
  seed: number
  /** Endless mode: waves come from `waveGenerator` instead of the map,
   *  forever (waveTotal = 0). */
  endless?: boolean
  /** Endless wave source (content/endless.ts). Required when `endless`. */
  waveGenerator?: (wave: number) => WaveDef
  /** Spells the player has unlocked in the campaign. */
  unlockedSpells: SpellId[]
  /** Extra modifiers on top of the map's (daily challenge). */
  modifiers?: Modifier[]
}

export interface Sim {
  /** Mutated in place every tick — read, never write. */
  readonly state: SimState
  readonly map: MapDef
  /** Advance by `dt` real seconds (speed/pause applied inside). Returns
   *  the events since the previous call. */
  tick(dt: number): SimEvent[]
  canBuild(cell: Cell, type: TowerType): { ok: boolean; reason?: string }
  build(cell: Cell, type: TowerType): boolean
  canUpgrade(towerId: number): { ok: boolean; cost: number; reason?: string }
  upgrade(towerId: number): boolean
  chooseBranch(towerId: number, branchId: string): boolean
  canPromote(towerId: number, to: TowerType): { ok: boolean; cost: number; reason?: string }
  promote(towerId: number, to: TowerType): boolean
  sell(towerId: number): number
  setTargeting(towerId: number, mode: Targeting): void
  castSpell(id: SpellId, target: SpellTarget): boolean
  /** Skip the build countdown (pays the early bonus). */
  startWave(): void
  /** End the boss intro early (state.bossIntro → 1). */
  skipIntro(): void
  setSpeed(speed: 1 | 2): void
  setPaused(paused: boolean): void
  /** Cells a tower of this type/level/branch at `cell` can hit (or
   *  buff) — for shop hover and the tower panel. */
  attackCells(type: TowerType, cell: Cell, level: TowerLevel, branch: string | null): Cell[]
  towerAt(cell: Cell): TowerState | null
  cellKind(cell: Cell): CellKind | null
}
