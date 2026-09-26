import type { MapDef } from '../../sim/types'
import { g } from '../waves'

export const shadowHall: MapDef = {
  id: 'shadow-hall',
  order: 10,
  name: 'Shadow Hall',
  subtitle: 'Eight pieces only',
  theme: 'lava',
  cols: 18,
  rows: 11,
  cells: [
    '##################',
    '#oooooooooooooooo#',
    '#oo#oooo#oooo#ooo#',
    '#oooooooooooooooo#',
    '#oo#oooo#oooo#ooo#',
    'SooooooooooooooooG',
    '#oo#oooo#oooo#ooo#',
    '#oooooooooooooooo#',
    '#oo#oooo#oooo#ooo#',
    '#oooooooooooooooo#',
    '##################',
  ],
  waves: [
    { hpMult: 1.2, groups: [g('pawn', 8, 1.1, 0)] },
    { hpMult: 1.2, groups: [g('pawn', 8, 0.9, 0), g('knight', 3, 0.6, 5)] },
    { hpMult: 1.2, groups: [g('pawn', 8, 0.9, 0), g('bishop', 2, 2.0, 2)] },
    { hpMult: 1.25, groups: [g('knight', 10, 0.45, 0), g('pawn', 8, 0.8, 5)] },
    { hpMult: 1.25, groups: [g('rook', 2, 3.0, 0), g('bishop', 2, 2.0, 1), g('pawn', 6, 0.9, 6)] },
    { hpMult: 1.3, groups: [g('pawn', 16, 0.6, 0), g('bishop', 3, 2.0, 3), g('knight', 6, 0.5, 10)] },
    { hpMult: 1.3, groups: [g('queen', 1, 4.0, 0), g('bishop', 3, 2.0, 1), g('rook', 2, 3.0, 4)] },
    {
      hpMult: 1.35,
      groups: [g('knight', 16, 0.4, 0), g('bishop', 4, 2.0, 3), g('rook', 2, 3.0, 8), g('pawn', 10, 0.7, 12)],
    },
    { hpMult: 1.5, groups: [g('rook', 5, 3.0, 0), g('bishop', 5, 2.0, 1), g('pawn', 10, 0.7, 10)] },
    { hpMult: 1.65, groups: [g('queen', 3, 4.0, 0), g('bishop', 6, 2.0, 1), g('rook', 3, 3.0, 2)] },
    {
      hpMult: 1.8,
      groups: [
        g('pawn', 30, 0.5, 0),
        g('bishop', 4, 2.0, 4),
        g('knight', 16, 0.4, 8),
        g('rook', 3, 3.0, 14),
        g('queen', 1, 4.0, 18),
      ],
    },
    { hpMult: 1.9, groups: [g('queen', 5, 4.0, 0), g('bishop', 8, 2.0, 1), g('rook', 5, 3.0, 2)] },
    {
      hpMult: 2.0,
      boss: 'shadowQueen',
      groups: [g('bishop', 8, 2.0, 0), g('knight', 12, 0.4, 4), g('rook', 3, 3.0, 6), g('queen', 2, 4.0, 10)],
    },
  ],
  modifiers: ['maxTowers8'],
  startGold: 140,
  lives: 20,
  intro:
    'Only eight towers fit in the Shadow Hall, so upgrade what you have. When the Queen splits in three, the real one keeps her crown.',
}
