import type { MapDef } from '../../sim/types'
import { g } from '../waves'

export const courtyardGate: MapDef = {
  id: 'courtyard-gate',
  order: 1,
  name: 'Courtyard Gate',
  subtitle: 'Where the pawns learn',
  theme: 'courtyard',
  cols: 12,
  rows: 8,
  cells: [
    '############',
    'S....ppp#pp#',
    'pppp.ppppp##',
    'pppp......p#',
    'pp#pppppp.p#',
    'pp........p#',
    'pp.ppp#ppp##',
    'ppG#########',
  ],
  waves: [
    { hpMult: 1.0, groups: [g('pawn', 6, 1.2, 0)] },
    { hpMult: 1.0, groups: [g('pawn', 8, 1.0, 0)] },
    { hpMult: 1.0, groups: [g('pawn', 6, 1.0, 0), g('knight', 3, 0.6, 8)] },
    { hpMult: 1.0, groups: [g('pawn', 10, 0.8, 0)] },
    { hpMult: 1.0, groups: [g('knight', 8, 0.5, 0), g('pawn', 6, 1.0, 6)] },
    { hpMult: 1.05, groups: [g('pawn', 12, 0.7, 0), g('knight', 4, 0.5, 10)] },
    { hpMult: 1.05, groups: [g('pawn', 10, 0.7, 0), g('knight', 8, 0.5, 8)] },
    { hpMult: 1.1, groups: [g('pawn', 16, 0.5, 0), g('knight', 6, 0.4, 10)] },
  ],
  modifiers: [],
  startGold: 120,
  lives: 20,
  intro:
    'Six black pawns are coming up the courtyard road. Your pawns hit the four diagonals, so one beside the road covers two road squares at once.',
}
