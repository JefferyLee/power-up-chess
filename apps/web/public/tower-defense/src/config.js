import { buildPathCells } from './utils.js?v=2';

export const SPRITE_CFG = {
  grass:          'towerDefense_tile039.png',
  path:           'towerDefense_tile001.png',
  tower_arrow:    'towerDefense_tile204.png',
  tower_cannon:   'towerDefense_tile205.png',
  tower_ice:      'towerDefense_tile136.png',
  tower_laser:    'towerDefense_tile207.png',
  tower_mortar:   'towerDefense_tile206.png',
  tower_tesla:    'towerDefense_tile208.png',
  enemy_basic:    'towerDefense_tile227.png',
  enemy_fast:     'towerDefense_tile229.png',
  enemy_tank:     'towerDefense_tile251.png',
  enemy_armored:  'towerDefense_tile250.png',
  enemy_swarm:    'towerDefense_tile228.png',
  enemy_boss:     'towerDefense_tile252.png',
  bullet_arrow:   'towerDefense_tile277.png',
  bullet_cannon:  'towerDefense_tile278.png',
  bullet_ice:     'towerDefense_tile279.png',
  bullet_mortar:  'towerDefense_tile280.png',
};

export const SPRITE_BASE = 'assets/sprites/';
export const CFG_KEYS = Object.keys(SPRITE_CFG);

export const SFX_CFG = {
  arrow:       'assets/sounds/arrow.ogg',
  cannon:      'assets/sounds/cannon.ogg',
  ice:         'assets/sounds/freeze.wav',
  explosion:   'assets/sounds/explosion.ogg',
  die_basic:   'assets/sounds/die_basic.ogg',
  die_fast:    'assets/sounds/die_fast.ogg',
  die_tank:    'assets/sounds/die_tank.ogg',
  die_boss:    'assets/sounds/die_tank.ogg',
  die_armored: 'assets/sounds/die_tank.ogg',
  die_swarm:   'assets/sounds/die_fast.ogg',
  place:       'assets/sounds/place.ogg',
  sell:        'assets/sounds/coins.ogg',
  victory:     'assets/sounds/victory.mp3',
  gameover:    'assets/sounds/gameover.ogg',
};

export const MUSIC_SRC = 'assets/music/bgm.mp3';

export const CELL = 40;
export const COLS = 24;
export const ROWS = 15;
export const CW = COLS * CELL;
export const CH = ROWS * CELL;

export const WAYPOINTS = [
  [-1, 1], [4, 1], [4, 7], [10, 7], [10, 2], [16, 2], [16, 11], [21, 11], [21, 4], [COLS, 4],
];

export const PATH_CELLS = buildPathCells(WAYPOINTS, COLS, ROWS);

export const TDEFS = [
  { id: 'arrow', name: 'Arrow', cost: 60, color: '#92400e', accent: '#d97706', emoji: '🏹',
    damage: 22, range: 3.2, rate: 1.5, splash: 0, slow: 0, armorPierce: false, chainCount: 0, minRange: 0,
    targeting: 'first', desc: 'Fast · single target',
    upgrades: [
      { cost: 45, label: 'Compound Bow', dmgMult: 1.6, rangeMult: 1.15, rateMult: 1.3 },
      { cost: 70, label: 'War Arrows', dmgMult: 2.5, rangeMult: 1.3, rateMult: 1.6 },
    ] },
  { id: 'cannon', name: 'Cannon', cost: 130, color: '#374151', accent: '#9ca3af', emoji: '💣',
    damage: 80, range: 2.6, rate: 0.45, splash: 0.9, slow: 0, armorPierce: true, chainCount: 0, minRange: 0,
    targeting: 'strongest', desc: 'Area · armor pierce',
    upgrades: [
      { cost: 80, label: 'Heavy Shell', dmgMult: 1.6, rangeMult: 1.1, rateMult: 1.25 },
      { cost: 120, label: 'Siege Cannon', dmgMult: 2.5, rangeMult: 1.25, rateMult: 1.5 },
    ] },
  { id: 'ice', name: 'Ice', cost: 90, color: '#1e40af', accent: '#60a5fa', emoji: '❄',
    damage: 9, range: 2.8, rate: 1.1, splash: 0, slow: 0.5, armorPierce: false, chainCount: 0, minRange: 0,
    targeting: 'first', desc: 'Slows enemies',
    upgrades: [
      { cost: 60, label: 'Deep Freeze', dmgMult: 1.4, rangeMult: 1.2, rateMult: 1.3 },
      { cost: 85, label: 'Blizzard', dmgMult: 2.0, rangeMult: 1.4, rateMult: 1.55 },
    ] },
  { id: 'laser', name: 'Laser', cost: 220, color: '#7f1d1d', accent: '#f87171', emoji: '🔆',
    damage: 13, range: 4.6, rate: 4.2, splash: 0, slow: 0, armorPierce: false, chainCount: 0, minRange: 0,
    targeting: 'closest', desc: 'Rapid · very long range',
    upgrades: [
      { cost: 110, label: 'Focus Lens', dmgMult: 1.6, rangeMult: 1.15, rateMult: 1.3 },
      { cost: 155, label: 'Death Ray', dmgMult: 2.4, rangeMult: 1.3, rateMult: 1.65 },
    ] },
  { id: 'mortar', name: 'Mortar', cost: 180, color: '#78350f', accent: '#fb923c', emoji: '🔥',
    damage: 125, range: 5.0, rate: 0.28, splash: 1.6, slow: 0, armorPierce: true, chainCount: 0, minRange: 1.8,
    targeting: 'strongest', desc: 'Huge splash · long range',
    upgrades: [
      { cost: 100, label: 'Incendiary', dmgMult: 1.5, rangeMult: 1.1, rateMult: 1.35 },
      { cost: 140, label: 'Devastator', dmgMult: 2.3, rangeMult: 1.2, rateMult: 1.65 },
    ] },
  { id: 'tesla', name: 'Tesla', cost: 260, color: '#312e81', accent: '#818cf8', emoji: '⚡',
    damage: 45, range: 3.0, rate: 1.0, splash: 0, slow: 0, armorPierce: false, chainCount: 3, minRange: 0,
    targeting: 'first', desc: 'Chains to 3 enemies',
    upgrades: [
      { cost: 120, label: 'Arc Amplifier', dmgMult: 1.5, rangeMult: 1.15, rateMult: 1.25, chainCount: 4 },
      { cost: 165, label: 'Storm Core', dmgMult: 2.2, rangeMult: 1.3, rateMult: 1.55, chainCount: 5 },
    ] },
];

export const EDEFS = {
  basic:   { hp: 95, speed: 65, reward: 10, color: '#ef4444', r: 9, armor: 0, noSlow: false, split: false },
  fast:    { hp: 50, speed: 125, reward: 12, color: '#eab308', r: 7, armor: 0, noSlow: false, split: false },
  tank:    { hp: 650, speed: 30, reward: 40, color: '#8b5cf6', r: 14, armor: 0.3, noSlow: false, split: false },
  armored: { hp: 340, speed: 42, reward: 28, color: '#475569', r: 12, armor: 0.55, noSlow: false, split: false },
  swarm:   { hp: 20, speed: 145, reward: 4, color: '#86efac', r: 5, armor: 0, noSlow: true, split: false },
  boss:    { hp: 3800, speed: 22, reward: 220, color: '#dc2626', r: 20, armor: 0.4, noSlow: true, split: true },
};

export const WAVES = [
  [{ type: 'basic', count: 10, gap: 1.0 }],
  [{ type: 'basic', count: 14, gap: 0.75 }, { type: 'fast', count: 8, gap: 0.6, delay: 4 }],
  [{ type: 'swarm', count: 30, gap: 0.12 }, { type: 'basic', count: 10, gap: 0.7, delay: 1 }],
  [{ type: 'tank', count: 3, gap: 4.5 }, { type: 'basic', count: 18, gap: 0.55, delay: 0 }],
  [{ type: 'fast', count: 20, gap: 0.38 }, { type: 'swarm', count: 35, gap: 0.1, delay: 0 }],
  [{ type: 'armored', count: 6, gap: 2.5 }, { type: 'fast', count: 16, gap: 0.3, delay: 0 }],
  [{ type: 'tank', count: 5, gap: 2.0 }, { type: 'swarm', count: 45, gap: 0.08, delay: 0 }],
  [{ type: 'basic', count: 25, gap: 0.3 }, { type: 'tank', count: 4, gap: 2.0, delay: 0 }, { type: 'fast', count: 18, gap: 0.28, delay: 4 }],
  [{ type: 'armored', count: 10, gap: 1.8 }, { type: 'swarm', count: 40, gap: 0.09, delay: 0 }],
  [{ type: 'boss', count: 1, gap: 8 }, { type: 'tank', count: 6, gap: 1.5, delay: 0 }, { type: 'fast', count: 28, gap: 0.22, delay: 0 }],
  [{ type: 'tank', count: 8, gap: 1.5 }, { type: 'swarm', count: 55, gap: 0.07, delay: 0 }, { type: 'fast', count: 22, gap: 0.25, delay: 5 }],
  [{ type: 'armored', count: 12, gap: 1.6 }, { type: 'swarm', count: 35, gap: 0.1, delay: 0 }],
  [{ type: 'boss', count: 2, gap: 9 }, { type: 'fast', count: 30, gap: 0.22, delay: 0 }, { type: 'tank', count: 8, gap: 1.2, delay: 4 }],
  [{ type: 'swarm', count: 70, gap: 0.07 }, { type: 'armored', count: 12, gap: 1.4, delay: 0 }],
  [{ type: 'boss', count: 3, gap: 7 }, { type: 'tank', count: 10, gap: 1.0, delay: 0 }],
  [{ type: 'basic', count: 28, gap: 0.28 }, { type: 'fast', count: 32, gap: 0.2, delay: 0 }, { type: 'armored', count: 14, gap: 0.7, delay: 6 }],
  [{ type: 'boss', count: 3, gap: 7 }, { type: 'armored', count: 14, gap: 1.1, delay: 0 }, { type: 'fast', count: 35, gap: 0.17, delay: 0 }],
  [{ type: 'tank', count: 14, gap: 0.95 }, { type: 'boss', count: 4, gap: 6, delay: 0 }, { type: 'swarm', count: 50, gap: 0.08, delay: 0 }],
  [{ type: 'boss', count: 4, gap: 6 }, { type: 'armored', count: 16, gap: 0.9, delay: 0 }, { type: 'swarm', count: 60, gap: 0.07, delay: 0 }],
  [{ type: 'boss', count: 6, gap: 5 }, { type: 'tank', count: 16, gap: 0.8, delay: 0 }, { type: 'armored', count: 20, gap: 0.5, delay: 0 }, { type: 'swarm', count: 70, gap: 0.06, delay: 0 }],
];