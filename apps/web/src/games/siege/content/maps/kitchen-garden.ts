import type { MapDef } from '../../sim/types'
import { g } from '../waves'

export const kitchenGarden: MapDef = {
  id: 'kitchen-garden',
  order: 2,
  name: 'Kitchen Garden',
  subtitle: 'Healers among the herbs',
  theme: 'courtyard',
  cols: 14,
  rows: 9,
  cells: [
    '##############',
    '#ppppp#pppppp#',
    'S......pppppp#',
    '#ppppp.ppp#pp#',
    '#pppp#.......#',
    '#pp#pppppppp.#',
    '#p...........#',
    '#p.pppp#pppp##',
    '##G###########',
  ],
  waves: [
    { hpMult: 1.0, groups: [g('pawn', 7, 1.1, 0)] },
    { hpMult: 1.0, groups: [g('pawn', 10, 0.9, 0)] },
    { hpMult: 1.0, groups: [g('pawn', 8, 1.0, 0), g('knight', 4, 0.5, 6)] },
    { hpMult: 1.05, groups: [g('pawn', 9, 0.9, 0), g('bishop', 2, 2.0, 2)] },
    { hpMult: 1.05, groups: [g('knight', 10, 0.45, 0), g('pawn', 6, 1.0, 5)] },
    { hpMult: 1.1, groups: [g('pawn', 12, 0.7, 0), g('bishop', 3, 2.0, 3)] },
    { hpMult: 1.1, groups: [g('pawn', 10, 0.8, 0), g('bishop', 2, 2.0, 2), g('knight', 8, 0.5, 8)] },
    { hpMult: 1.15, groups: [g('pawn', 16, 0.6, 0), g('bishop', 2, 2.0, 4)] },
    { hpMult: 1.15, groups: [g('knight', 10, 0.45, 0), g('pawn', 10, 0.7, 5), g('bishop', 3, 2.0, 7)] },
    { hpMult: 1.2, groups: [g('pawn', 18, 0.5, 0), g('bishop', 4, 1.5, 3), g('knight', 8, 0.4, 12)] },
  ],
  modifiers: [],
  startGold: 120,
  lives: 20,
  unlocksSpell: 'fork',
  intro:
    'The black bishops heal anyone walking near them. Take the healer out first, and the rest of the wave gets a lot easier.',
}
