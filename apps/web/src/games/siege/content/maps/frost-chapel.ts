import type { MapDef } from '../../sim/types'
import { g } from '../waves'

export const frostChapel: MapDef = {
  id: 'frost-chapel',
  order: 8,
  name: 'Frost Chapel',
  subtitle: 'Cold diagonals',
  theme: 'frost',
  cols: 16,
  rows: 11,
  cells: [
    '################',
    '#ppp#pppp#ppp#p#',
    '#p......pppppp##',
    '#p.ppp#.pppp...G',
    '#p.pppp.pppp.pp#',
    'S..pp#p.pppp.p##',
    '#ppppp#.pp#p.pp#',
    '#pppppp.pppp.pp#',
    '#pp#ppp......pp#',
    '#pppppp#pppp#pp#',
    '################',
  ],
  waves: [
    { hpMult: 1.15, groups: [g('pawn', 8, 1.0, 0), g('bishop', 1, 2.0, 4)] },
    { hpMult: 1.15, groups: [g('knight', 6, 0.5, 0), g('pawn', 8, 0.9, 4)] },
    { hpMult: 1.15, groups: [g('rook', 1, 3.0, 0), g('bishop', 2, 2.0, 1), g('pawn', 6, 0.9, 4)] },
    { hpMult: 1.2, groups: [g('knight', 12, 0.4, 0), g('pawn', 10, 0.7, 5), g('bishop', 2, 2.0, 8)] },
    { hpMult: 1.2, groups: [g('queen', 1, 4.0, 0), g('bishop', 3, 2.0, 1), g('pawn', 8, 0.8, 4)] },
    { hpMult: 1.25, groups: [g('pawn', 14, 0.6, 0), g('rook', 2, 3.0, 4), g('bishop', 2, 2.0, 5)] },
    {
      hpMult: 1.25,
      groups: [g('knight', 18, 0.4, 0), g('bishop', 4, 2.0, 3), g('rook', 2, 3.0, 8), g('pawn', 10, 0.7, 12)],
    },
    {
      hpMult: 1.3,
      groups: [g('queen', 2, 4.0, 0), g('bishop', 4, 2.0, 1), g('rook', 2, 3.0, 6), g('pawn', 8, 0.8, 10)],
    },
    {
      hpMult: 1.35,
      groups: [g('rook', 4, 3.0, 0), g('bishop', 4, 2.0, 1), g('knight', 10, 0.4, 10), g('pawn', 10, 0.7, 14)],
    },
    {
      hpMult: 1.4,
      groups: [g('pawn', 24, 0.5, 0), g('bishop', 4, 2.0, 4), g('knight', 14, 0.4, 8), g('rook', 2, 3.0, 16)],
    },
    { hpMult: 1.5, groups: [g('queen', 3, 4.0, 0), g('bishop', 4, 2.0, 1), g('rook', 3, 3.0, 2)] },
    {
      hpMult: 1.6,
      boss: 'frostBishop',
      groups: [g('bishop', 4, 2.0, 0), g('knight', 8, 0.4, 4), g('rook', 2, 3.0, 6), g('pawn', 8, 0.8, 10)],
    },
  ],
  modifiers: [],
  startGold: 120,
  lives: 20,
  unlocksSpell: 'castling',
  intro:
    'The Frost Bishop freezes any tower standing on its diagonals. Keep your strongest pieces off those lines: a frozen rook fires nothing.',
}
