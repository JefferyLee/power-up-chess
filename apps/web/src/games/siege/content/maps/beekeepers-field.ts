import type { MapDef } from '../../sim/types'
import { g } from '../waves'

export const beekeepersField: MapDef = {
  id: 'beekeepers-field',
  order: 5,
  name: "Beekeeper's Field",
  subtitle: 'Build your own road',
  theme: 'forest',
  cols: 16,
  rows: 10,
  cells: [
    '################',
    '#oooooo#ooooooo#',
    '#oo#ooooooo#ooo#',
    '#oooo#oooooo#oo#',
    'Sooooooooooooo##',
    '#ooooooooooooooG',
    '#oo#oooo#oooooo#',
    '#oooooo#oo#oooo#',
    '#ooo#ooooooo#oo#',
    '################',
  ],
  waves: [
    { hpMult: 1.15, groups: [g('pawn', 8, 1.0, 0)] },
    { hpMult: 1.15, groups: [g('pawn', 8, 0.9, 0), g('knight', 4, 0.5, 5)] },
    { hpMult: 1.15, groups: [g('pawn', 10, 0.8, 0), g('bishop', 2, 2.0, 2)] },
    { hpMult: 1.2, groups: [g('rook', 2, 3.0, 0), g('bishop', 2, 2.0, 1)] },
    { hpMult: 1.2, groups: [g('knight', 14, 0.45, 0), g('pawn', 8, 0.8, 6)] },
    { hpMult: 1.25, groups: [g('pawn', 14, 0.7, 0), g('bishop', 3, 2.0, 3)] },
    { hpMult: 1.25, groups: [g('rook', 3, 3.0, 0), g('bishop', 2, 2.0, 1), g('pawn', 6, 0.9, 8)] },
    { hpMult: 1.3, groups: [g('knight', 18, 0.4, 0), g('pawn', 12, 0.7, 6), g('bishop', 3, 2.0, 8)] },
    { hpMult: 1.3, groups: [g('rook', 4, 3.0, 0), g('bishop', 4, 2.0, 1)] },
    { hpMult: 1.35, groups: [g('pawn', 24, 0.5, 0), g('bishop', 4, 2.0, 4), g('knight', 10, 0.4, 10)] },
    { hpMult: 1.45, groups: [g('rook', 5, 2.5, 0), g('bishop', 5, 2.0, 1), g('knight', 10, 0.4, 12)] },
  ],
  modifiers: [],
  startGold: 120,
  lives: 20,
  intro:
    'No road here. The black army walks the shortest way it can find, so build a winding wall of pieces and make it take the long way round.',
}
