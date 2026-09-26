import type { MapDef } from '../../sim/types'
import { g } from '../waves'

export const forestPath: MapDef = {
  id: 'forest-path',
  order: 4,
  name: 'Forest Path',
  subtitle: 'Two gates in the fog',
  theme: 'forest',
  cols: 16,
  rows: 10,
  cells: [
    '################',
    'S...pppp#ppppp##',
    'ppp.ppppppppp..G',
    'ppp.....ppppp.pp',
    'ppppppp.....p.pp',
    'ppp#ppp.ppp.p.pp',
    'pppp....ppp.p.p#',
    'pppp.pp#ppp...p#',
    'S....ppppp#ppppp',
    '################',
  ],
  waves: [
    { hpMult: 1.1, groups: [g('pawn', 6, 1.0, 0, 0), g('pawn', 4, 1.0, 4, 1)] },
    { hpMult: 1.1, groups: [g('pawn', 8, 0.9, 0, 0), g('knight', 4, 0.5, 5, 1)] },
    { hpMult: 1.1, groups: [g('knight', 6, 0.5, 0, 0), g('knight', 6, 0.5, 1, 1), g('pawn', 4, 1.0, 8, 0)] },
    { hpMult: 1.15, groups: [g('pawn', 8, 0.9, 0, 0), g('bishop', 2, 2.0, 2, 0), g('rook', 1, 3.0, 0, 1)] },
    { hpMult: 1.15, groups: [g('pawn', 14, 0.7, 0, 1), g('knight', 8, 0.5, 6, 0)] },
    { hpMult: 1.2, groups: [g('rook', 2, 3.0, 0, 0), g('bishop', 2, 2.0, 1, 0), g('pawn', 8, 0.8, 4, 1)] },
    {
      hpMult: 1.2,
      groups: [g('knight', 10, 0.4, 0, 0), g('knight', 10, 0.4, 1, 1), g('bishop', 2, 2.0, 8, 0), g('pawn', 8, 0.8, 8, 1)],
    },
    { hpMult: 1.25, groups: [g('rook', 3, 3.0, 0, 1), g('bishop', 3, 2.0, 1, 1), g('pawn', 10, 0.7, 0, 0)] },
    { hpMult: 1.25, groups: [g('pawn', 16, 0.5, 0, 0), g('knight', 8, 0.4, 4, 1), g('rook', 2, 3.0, 12, 0)] },
    {
      hpMult: 1.35,
      groups: [
        g('rook', 2, 3.0, 0, 0),
        g('rook', 2, 3.0, 0, 1),
        g('bishop', 2, 2.0, 1, 0),
        g('bishop', 2, 2.0, 1, 1),
        g('pawn', 12, 0.6, 8, 1),
        g('knight', 8, 0.4, 12, 0),
      ],
    },
  ],
  modifiers: ['fog'],
  startGold: 120,
  lives: 20,
  unlocksSpell: 'pin',
  intro:
    'Two gates, and a fog that shortens every line by one square. Knights do not mind fog: their jumps stay the same.',
}
