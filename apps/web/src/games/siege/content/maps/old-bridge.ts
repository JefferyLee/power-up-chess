import type { MapDef } from '../../sim/types'
import { g } from '../waves'

export const oldBridge: MapDef = {
  id: 'old-bridge',
  order: 3,
  name: 'The Old Bridge',
  subtitle: 'The Black Knight rides',
  theme: 'courtyard',
  cols: 14,
  rows: 9,
  cells: [
    '##############',
    '#ppp#pp##ppppp',
    'S....pp##p...p',
    'pppp.pp##p.p.p',
    'ppp#.pp##p.p.p',
    'pppp.......p.p',
    'ppppppp##ppp.p',
    'pppppp###ppp.p',
    '############G#',
  ],
  waves: [
    { hpMult: 1.05, groups: [g('pawn', 8, 1.0, 0)] },
    { hpMult: 1.05, groups: [g('pawn', 6, 1.0, 0), g('knight', 4, 0.5, 5)] },
    { hpMult: 1.05, groups: [g('pawn', 10, 0.8, 0), g('bishop', 2, 2.0, 2)] },
    { hpMult: 1.1, groups: [g('rook', 1, 3.0, 0), g('pawn', 6, 0.9, 3)] },
    { hpMult: 1.1, groups: [g('knight', 12, 0.45, 0), g('pawn', 6, 0.9, 6)] },
    { hpMult: 1.15, groups: [g('rook', 2, 3.0, 0), g('bishop', 2, 2.0, 1), g('pawn', 8, 0.8, 6)] },
    { hpMult: 1.15, groups: [g('pawn', 16, 0.5, 0), g('bishop', 2, 2.0, 2), g('knight', 10, 0.4, 8)] },
    { hpMult: 1.2, groups: [g('rook', 3, 3.0, 0), g('bishop', 3, 2.0, 1), g('pawn', 4, 1.0, 10)] },
    {
      hpMult: 1.2,
      groups: [g('knight', 12, 0.4, 0), g('bishop', 2, 2.0, 3), g('pawn', 10, 0.7, 5), g('rook', 2, 3.0, 12)],
    },
    { hpMult: 1.25, boss: 'blackKnight', groups: [g('pawn', 8, 0.8, 0), g('knight', 6, 0.5, 6)] },
  ],
  modifiers: [],
  startGold: 120,
  lives: 20,
  intro:
    'Rooks are slow and armoured, and the Black Knight waits at the end. A rook tower fires along a straight line, and the bridge is one.',
}
