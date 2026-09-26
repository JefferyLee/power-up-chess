import type { MapDef } from '../../sim/types'
import { g } from '../waves'

export const ironMine: MapDef = {
  id: 'iron-mine',
  order: 6,
  name: 'Iron Mine',
  subtitle: 'Armour underground',
  theme: 'forest',
  cols: 16,
  rows: 10,
  cells: [
    '################',
    '##pp#pppp#....##',
    'S.....ppp#.pp.p#',
    '#ppp#.ppp#.pp.p#',
    '#pppp.pppp.pp.##',
    '##ppp......pp.p#',
    '#pppp#pppp#pp.p#',
    '#ppp#ppp......p#',
    '##pppppp.pppp###',
    '########G#######',
  ],
  waves: [
    { hpMult: 1.2, groups: [g('pawn', 8, 1.0, 0), g('knight', 2, 0.6, 7)] },
    { hpMult: 1.2, groups: [g('pawn', 10, 0.8, 0), g('bishop', 2, 2.0, 2)] },
    { hpMult: 1.2, groups: [g('rook', 2, 3.0, 0), g('pawn', 6, 0.9, 4)] },
    { hpMult: 1.25, groups: [g('knight', 16, 0.4, 0), g('pawn', 10, 0.7, 6)] },
    { hpMult: 1.25, groups: [g('queen', 1, 4.0, 0), g('bishop', 4, 1.5, 1), g('pawn', 8, 0.8, 6)] },
    { hpMult: 1.3, groups: [g('pawn', 14, 0.7, 0), g('rook', 3, 3.0, 5)] },
    {
      hpMult: 1.3,
      groups: [g('knight', 20, 0.4, 0), g('bishop', 4, 2.0, 3), g('pawn', 14, 0.6, 8), g('rook', 1, 3.0, 14)],
    },
    { hpMult: 1.35, groups: [g('queen', 2, 4.0, 0), g('bishop', 3, 2.0, 1), g('rook', 2, 3.0, 2)] },
    { hpMult: 1.4, groups: [g('rook', 4, 3.0, 0), g('bishop', 4, 2.0, 1), g('pawn', 10, 0.7, 8)] },
    {
      hpMult: 1.4,
      groups: [g('pawn', 28, 0.5, 0), g('bishop', 4, 2.0, 4), g('knight', 14, 0.4, 8), g('rook', 2, 3.0, 14)],
    },
    { hpMult: 1.45, groups: [g('queen', 3, 4.0, 0), g('bishop', 4, 2.0, 1), g('rook', 3, 3.0, 2)] },
    { hpMult: 1.55, boss: 'ironRook', groups: [g('pawn', 8, 0.8, 0), g('rook', 3, 3.0, 3), g('bishop', 2, 2.0, 4)] },
  ],
  modifiers: ['shielded'],
  startGold: 120,
  lives: 20,
  unlocksSpell: 'skewer',
  intro:
    'Every enemy wears extra armour down in the mine, and the Iron Rook shields itself in layers. Bring damage that pierces.',
}
