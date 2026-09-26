// Balance tables from docs/SIEGE_DESIGN.md §2–§6. Numbers here are the
// doc's; if a value is not in the doc it is called out in a comment.
import type {
  BossDef,
  BossId,
  EnemyDef,
  EnemyType,
  Modifier,
  Offset,
  Pattern,
  SpellDef,
  SpellId,
  TowerDef,
  TowerLevel,
  TowerStats,
  TowerType,
} from './types'

export const DIAGONALS: readonly Offset[] = [[1, 1], [1, -1], [-1, 1], [-1, -1]]
export const ORTHOGONALS: readonly Offset[] = [[1, 0], [-1, 0], [0, 1], [0, -1]]
export const RING8: readonly Offset[] = [...DIAGONALS, ...ORTHOGONALS]
export const KNIGHT_JUMPS: readonly Offset[] = [
  [1, -2], [2, -1], [2, 1], [1, 2], [-1, 2], [-2, 1], [-2, -1], [-1, -2],
]

const noAttack: TowerStats = { damage: 0, fireRate: 0, range: 0 }

export const TOWER_DEFS: Record<TowerType, TowerDef> = {
  pawn: {
    type: 'pawn',
    name: 'Pawn',
    cost: 40,
    pattern: { kind: 'cells', offsets: DIAGONALS },
    levels: [
      { damage: 12, fireRate: 1.6, range: 0 },
      { damage: 18, fireRate: 1.9, range: 0 },
    ],
    upgradeCost: 35,
    branches: [
      {
        id: 'spear',
        name: 'Spear',
        cost: 60,
        stats: { damage: 22, fireRate: 1.9, range: 0 },
        pattern: { kind: 'cells', offsets: RING8 },
        description: 'Hits the four straight neighbours too — eight cells around it.',
      },
      // The doc lists one pawn branch; the contract needs two. Phalanx keeps
      // the diagonals and simply hits harder, for a pawn that stays a pawn.
      {
        id: 'phalanx',
        name: 'Phalanx',
        cost: 60,
        stats: { damage: 30, fireRate: 2.2, range: 0 },
        description: 'Still the four diagonals, but quicker and much harder.',
      },
    ],
    defaultTargeting: 'first',
    description: 'Captures on its four diagonals, just like on the board. Cheap, and it can promote later.',
  },
  knight: {
    type: 'knight',
    name: 'Knight',
    cost: 90,
    pattern: { kind: 'cells', offsets: KNIGHT_JUMPS },
    levels: [
      { damage: 34, fireRate: 0.9, range: 0, splash: 1 },
      { damage: 48, fireRate: 1.0, range: 0, splash: 1 },
    ],
    upgradeCost: 70,
    branches: [
      {
        id: 'storm',
        name: 'Storm',
        cost: 120,
        stats: { damage: 48, fireRate: 1.0, range: 0, splash: 1, chain: { targets: 3, falloff: 0.6 } },
        description: 'Its landing throws lightning to three more enemies nearby, a little weaker each jump.',
      },
      {
        id: 'charger',
        name: 'Charger',
        cost: 120,
        stats: { damage: 52, fireRate: 1.6, range: 0, splash: 1 },
        description: 'Jumps almost twice as often.',
      },
    ],
    defaultTargeting: 'first',
    description: 'Lands on the eight L-shaped cells and splashes the neighbours of whatever it hits.',
  },
  bishop: {
    type: 'bishop',
    name: 'Bishop',
    cost: 110,
    pattern: { kind: 'lines', dirs: DIAGONALS, length: 4 },
    levels: [
      { damage: 26, fireRate: 1.1, range: 4 },
      { damage: 36, fireRate: 1.1, range: 5 },
    ],
    upgradeCost: 80,
    branches: [
      {
        id: 'frost',
        name: 'Frost',
        cost: 130,
        // slow.factor is the speed multiplier while slowed (45 % slower).
        stats: { damage: 36, fireRate: 1.1, range: 5, slow: { factor: 0.55, seconds: 1.5 } },
        description: 'Everything it touches walks 45 % slower for a moment. Knights jump right through it.',
      },
      {
        id: 'sun',
        name: 'Sun',
        cost: 130,
        stats: { damage: 40, fireRate: 1.1, range: 5, burn: { dps: 12, seconds: 3 } },
        description: 'Sets its target burning: 12 damage a second for three seconds.',
      },
    ],
    defaultTargeting: 'first',
    description: 'Slides along its four diagonals and hits the first enemy it meets on each, like a real bishop.',
  },
  rook: {
    type: 'rook',
    name: 'Rook',
    cost: 140,
    pattern: { kind: 'lines', dirs: ORTHOGONALS, length: 5 },
    levels: [
      { damage: 60, fireRate: 0.6, range: 5 },
      { damage: 85, fireRate: 0.6, range: 6 },
    ],
    upgradeCost: 100,
    branches: [
      {
        id: 'cannon',
        name: 'Cannon',
        cost: 160,
        stats: { damage: 95, fireRate: 0.6, range: 6, splash: 1 },
        description: 'Its shot bursts on landing and hurts the neighbours too.',
      },
      {
        id: 'siege',
        name: 'Siege',
        cost: 160,
        stats: { damage: 120, fireRate: 0.6, range: 6, pierce: true },
        description: 'Goes straight through armour. The answer to rooks and shielded bosses.',
      },
    ],
    defaultTargeting: 'first',
    description: 'Slides along its row and column, hitting the first enemy in each direction. Slow but heavy.',
  },
  queen: {
    type: 'queen',
    name: 'Queen',
    cost: 260,
    pattern: { kind: 'lines', dirs: RING8, length: 4 },
    levels: [
      { damage: 45, fireRate: 0.9, range: 4 },
      { damage: 62, fireRate: 0.9, range: 5 },
    ],
    upgradeCost: 180,
    branches: [
      {
        id: 'fury',
        name: 'Fury',
        cost: 240,
        stats: { damage: 62, fireRate: 1.5, range: 5 },
        description: 'Fires much faster in all eight directions.',
      },
      {
        id: 'empress',
        name: 'Empress',
        cost: 240,
        stats: { damage: 75, fireRate: 0.9, range: 7 },
        description: 'Sees seven cells in every direction and hits harder.',
      },
    ],
    defaultTargeting: 'first',
    description: 'Rook and bishop in one: eight directions, first enemy on each line. Expensive, and worth it.',
  },
  king: {
    type: 'king',
    name: 'King',
    cost: 180,
    unique: true,
    pattern: { kind: 'aura', offsets: RING8 },
    levels: [
      { ...noAttack, aura: { damageMult: 1.25, rateMult: 1.15, goldMult: 1 } },
      { ...noAttack, aura: { damageMult: 1.4, rateMult: 1.25, goldMult: 1 } },
    ],
    upgradeCost: 120,
    branches: [
      {
        id: 'rally',
        name: 'Rally',
        cost: 150,
        stats: { ...noAttack, aura: { damageMult: 1.5, rateMult: 1.4, goldMult: 1 } },
        description: 'The eight pieces around him hit 50 % harder and 40 % faster.',
      },
      {
        id: 'treasury',
        name: 'Treasury',
        cost: 150,
        stats: { ...noAttack, aura: { damageMult: 1.4, rateMult: 1.25, goldMult: 1.5 } },
        description: 'Kills by the pieces around him pay half again as much gold.',
      },
    ],
    defaultTargeting: 'first',
    description: 'Never attacks. The eight pieces around him fight harder. One king per board.',
  },
}

export const ENEMY_DEFS: Record<EnemyType, EnemyDef> = {
  pawn: { type: 'pawn', name: 'Black Pawn', hp: 60, speed: 1.0, armor: 0, reward: 6, leak: 1, scale: 1 },
  knight: {
    type: 'knight',
    name: 'Black Knight',
    hp: 45,
    speed: 2.0,
    armor: 0,
    reward: 8,
    leak: 1,
    slowImmune: true,
    scale: 1.1,
  },
  bishop: {
    type: 'bishop',
    name: 'Black Bishop',
    hp: 90,
    speed: 1.2,
    armor: 0,
    reward: 10,
    leak: 1,
    healer: { radius: 1.5, hps: 6 },
    scale: 1.15,
  },
  rook: { type: 'rook', name: 'Black Rook', hp: 420, speed: 0.7, armor: 0.5, reward: 22, leak: 2, scale: 1.25 },
  queen: { type: 'queen', name: 'Black Queen', hp: 700, speed: 1.1, armor: 0.3, reward: 40, leak: 3, scale: 1.4 },
}

export const BOSS_DEFS: Record<BossId, BossDef> = {
  blackKnight: {
    id: 'blackKnight',
    name: 'The Black Knight',
    title: 'Rider of the Old Bridge',
    hp: 1800,
    speed: 1.3,
    armor: 0.1,
    reward: 150,
    leak: 5,
    scale: 1.6,
    phases: [
      { atHpFraction: 1.0, abilities: [{ kind: 'dash', cells: 3, every: 6, telegraph: 1.2 }] },
      { atHpFraction: 0.5, abilities: [{ kind: 'summon', enemy: 'knight', count: 4, every: 12 }] },
    ],
    intro: 'Here comes the Black Knight. When the road ahead of him lights up, he is about to dash — keep your diagonals on it.',
  },
  ironRook: {
    id: 'ironRook',
    name: 'The Iron Rook',
    title: 'Warden of the Iron Mine',
    // Balance pass: 3200 HP / 3 layers was unbeatable for the greedy bot
    // even with rooks; 2600 / 2 layers (0.3 + 2 × 0.15 = 0.6 armour).
    hp: 2600,
    speed: 0.6,
    armor: 0.3,
    reward: 260,
    leak: 6,
    scale: 1.8,
    phases: [
      {
        atHpFraction: 1.0,
        abilities: [
          { kind: 'shield', layers: 2, armorPerLayer: 0.15 },
          { kind: 'emp', radius: 2, stun: 3, every: 10, telegraph: 1.5 },
        ],
      },
      { atHpFraction: 0.66, abilities: [], dropShieldLayers: 1 },
      { atHpFraction: 0.33, abilities: [], dropShieldLayers: 1 },
    ],
    intro: 'The Iron Rook walks slowly and wears two shields. Each shield you break lets more of your hits through.',
  },
  frostBishop: {
    id: 'frostBishop',
    name: 'The Frost Bishop',
    title: 'Keeper of the Frost Chapel',
    hp: 3600,
    speed: 1.0,
    armor: 0.2,
    reward: 300,
    leak: 6,
    scale: 1.7,
    phases: [
      { atHpFraction: 1.0, abilities: [{ kind: 'freezeLines', length: 5, stun: 4, every: 9, telegraph: 1.5 }] },
      { atHpFraction: 0.6, abilities: [{ kind: 'teleportBack', cells: 6, heal: 0.1 }] },
      {
        atHpFraction: 0.3,
        abilities: [
          { kind: 'teleportBack', cells: 6, heal: 0.1 },
          { kind: 'healAura', radius: 2, hps: 20 },
        ],
      },
    ],
    intro: 'The Frost Bishop freezes along its diagonals, the same lines a bishop moves on. Pieces off those lines keep firing.',
  },
  shadowQueen: {
    id: 'shadowQueen',
    name: 'The Shadow Queen',
    title: 'Mistress of the Shadow Hall',
    hp: 5200,
    speed: 1.1,
    armor: 0.3,
    reward: 400,
    leak: 8,
    scale: 1.9,
    phases: [
      { atHpFraction: 1.0, abilities: [{ kind: 'summon', enemy: 'bishop', count: 2, every: 14 }] },
      // count = decoys spawned; with the real queen that makes three.
      { atHpFraction: 0.5, abilities: [{ kind: 'split', count: 2, decoyHpFraction: 0.25, decoyLeak: 2 }] },
    ],
    intro: 'The Shadow Queen will split into three when she is hurt. Only the one wearing the crown is real — trust your eyes.',
  },
  darkKing: {
    id: 'darkKing',
    name: 'The Dark King',
    title: 'Lord of the Dark Throne',
    hp: 8000,
    speed: 0.55,
    armor: 0.35,
    reward: 800,
    leak: 20,
    scale: 2.1,
    phases: [
      {
        atHpFraction: 1.0,
        abilities: [
          { kind: 'callWave', enemy: 'pawn', count: 6, every: 15 },
          { kind: 'healAura', radius: 2, hps: 15 },
        ],
      },
      { atHpFraction: 0.75, abilities: [{ kind: 'emp', radius: 2, stun: 2.5, every: 12, telegraph: 1.5 }] },
      { atHpFraction: 0.5, abilities: [{ kind: 'summon', enemy: 'rook', count: 2, every: 20 }] },
      { atHpFraction: 0.25, abilities: [{ kind: 'callWave', enemy: 'knight', count: 6, every: 10 }], speed: 0.8 },
    ],
    intro: 'The Dark King has come himself, with his whole army behind him. Hold the gate and he will resign.',
  },
}

export const SPELL_DEFS: Record<SpellId, SpellDef> = {
  fork: {
    id: 'fork',
    name: 'Fork',
    cooldown: 30,
    unlockMap: 'kitchen-garden',
    description: '120 damage to the two enemies furthest along the path inside a 5×5 square.',
  },
  pin: {
    id: 'pin',
    name: 'Pin',
    cooldown: 35,
    unlockMap: 'forest-path',
    description: 'Freezes every enemy in a 3×3 square for 3 seconds (bosses 1.5).',
  },
  skewer: {
    id: 'skewer',
    name: 'Skewer',
    cooldown: 40,
    unlockMap: 'iron-mine',
    description: '90 armour-piercing damage to every enemy on a whole row or column.',
  },
  castling: {
    id: 'castling',
    name: 'Castling',
    cooldown: 45,
    unlockMap: 'frost-chapel',
    description: 'Swap two of your pieces. Also shakes off any stun on them.',
  },
}

export const MODIFIER_INFO: Record<Modifier, { name: string; description: string }> = {
  fog: { name: 'Fog', description: 'Sliding pieces see one cell less.' },
  noQueens: { name: 'No Queens', description: 'Queens sit this one out.' },
  maxTowers8: { name: 'Eight Pieces', description: 'At most eight pieces on the board.' },
  lowBudget: { name: 'Low Budget', description: 'You start with 70 gold.' },
  rush: { name: 'Rush', description: 'Three-second countdowns and the black army walks 25 % faster.' },
  shielded: { name: 'Shielded', description: 'Every enemy wears extra armour (+0.2).' },
  noKing: { name: 'No King', description: 'No king on this map, so no aura.' },
}

/** Stats for a tower at this level; level 3 reads the chosen branch. */
export function towerStats(def: TowerDef, level: TowerLevel, branch: string | null): TowerStats {
  if (level === 3) {
    const b = def.branches.find((x) => x.id === branch)
    if (b) return b.stats
  }
  return level === 1 ? def.levels[0] : def.levels[1]
}

/** Pattern for a tower at this level (a branch may override it). */
export function towerPattern(def: TowerDef, level: TowerLevel, branch: string | null): Pattern {
  if (level === 3) {
    const b = def.branches.find((x) => x.id === branch)
    if (b?.pattern) return b.pattern
  }
  return def.pattern
}

export function isBossId(type: EnemyType | BossId): type is BossId {
  return type in BOSS_DEFS
}
