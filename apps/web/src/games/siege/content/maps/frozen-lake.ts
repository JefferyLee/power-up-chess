import type { MapDef } from '../../sim/types'
import { g } from '../waves'

export const frozenLake: MapDef = {
  id: 'frozen-lake',
  order: 7,
  name: 'Frozen Lake',
  subtitle: 'No time to think',
  theme: 'frost',
  cols: 16,
  rows: 11,
  cells: [
    '#######S########',
    '#oooooooooooooo#',
    '#ooo#oooooo#ooo#',
    '#oooooooooooooo#',
    '#o#ooooo##ooooo#',
    '#ooooooooooooo##',
    '#oooo#ooooooo#o#',
    '#ooooooo#oooooo#',
    '#o#oooooooooo#o#',
    '#oooooooooooooo#',
    '########G#######',
  ],
  waves: [
    { hpMult: 1.0, groups: [g('pawn', 6, 1.2, 0)] },
    { hpMult: 1.0, groups: [g('pawn', 8, 1.0, 0), g('knight', 2, 0.6, 6)] },
    { hpMult: 1.05, groups: [g('pawn', 10, 0.9, 0), g('bishop', 1, 2.0, 3)] },
    { hpMult: 1.05, groups: [g('knight', 8, 0.5, 0), g('pawn', 8, 0.8, 5)] },
    { hpMult: 1.1, groups: [g('rook', 1, 3.0, 0), g('bishop', 2, 2.0, 1), g('pawn', 8, 0.8, 4)] },
    { hpMult: 1.1, groups: [g('pawn', 14, 0.7, 0), g('knight', 6, 0.5, 8)] },
    { hpMult: 1.15, groups: [g('rook', 2, 3.0, 0), g('bishop', 2, 2.0, 1), g('pawn', 10, 0.8, 6)] },
    { hpMult: 1.15, groups: [g('queen', 1, 4.0, 0), g('bishop', 3, 2.0, 1), g('pawn', 12, 0.8, 4)] },
    { hpMult: 1.2, groups: [g('knight', 16, 0.4, 0), g('bishop', 3, 2.0, 3), g('rook', 2, 3.0, 8)] },
    { hpMult: 1.25, groups: [g('pawn', 24, 0.5, 0), g('bishop', 4, 2.0, 4), g('knight', 10, 0.4, 10)] },
    { hpMult: 1.3, groups: [g('rook', 4, 3.0, 0), g('bishop', 4, 2.0, 1), g('queen', 1, 4.0, 6)] },
    {
      hpMult: 1.35,
      groups: [g('queen', 2, 4.0, 0), g('bishop', 4, 2.0, 1), g('rook', 3, 3.0, 2), g('knight', 12, 0.4, 12)],
    },
  ],
  modifiers: ['rush'],
  startGold: 120,
  lives: 20,
  intro:
    'The ice is open ground and the black army comes at a run. The countdowns are short, so plan your maze before you press start.',
}
