import type { MapDef } from '../../sim/types'
import { g } from '../waves'

export const darkThrone: MapDef = {
  id: 'dark-throne',
  order: 12,
  name: 'The Dark Throne',
  subtitle: 'Face the Dark King',
  theme: 'throne',
  cols: 18,
  rows: 12,
  cells: [
    '##################',
    '##pp###pGp###pp###',
    '#pppp#pp.pp#ppppp#',
    '#pppppp#.#ppppppp#',
    '##ppppp#.#pppppp##',
    '#ppppppp.pppppppp#',
    '#pppp#pp.pp#ppppp#',
    '#ppppppp.pppppppp#',
    '#ppppppp......ppp#',
    '#ppp#ppppppp#.ppp#',
    'S.............ppp#',
    '##################',
  ],
  waves: [
    { hpMult: 1.2, groups: [g('pawn', 7, 1.2, 0)] },
    { hpMult: 1.2, groups: [g('pawn', 8, 1.0, 0), g('knight', 3, 0.6, 6)] },
    { hpMult: 1.25, groups: [g('pawn', 8, 0.9, 0), g('bishop', 2, 2.0, 2)] },
    { hpMult: 1.3, groups: [g('rook', 1, 3.0, 0), g('bishop', 2, 2.0, 1), g('pawn', 6, 0.9, 5)] },
    { hpMult: 1.35, groups: [g('knight', 12, 0.4, 0), g('pawn', 8, 0.7, 5), g('bishop', 2, 2.0, 8)] },
    { hpMult: 1.4, groups: [g('queen', 1, 4.0, 0), g('bishop', 3, 2.0, 1), g('pawn', 8, 0.8, 6)] },
    { hpMult: 1.5, groups: [g('pawn', 16, 0.6, 0), g('rook', 2, 3.0, 4), g('bishop', 2, 2.0, 5)] },
    {
      hpMult: 1.6,
      groups: [g('knight', 18, 0.4, 0), g('bishop', 4, 2.0, 3), g('rook', 2, 3.0, 8), g('pawn', 8, 0.8, 12)],
    },
    { hpMult: 1.7, groups: [g('queen', 2, 4.0, 0), g('bishop', 4, 2.0, 1), g('rook', 2, 3.0, 6)] },
    { hpMult: 1.8, groups: [g('rook', 4, 3.0, 0), g('bishop', 4, 2.0, 1), g('pawn', 12, 0.7, 10)] },
    {
      hpMult: 1.9,
      groups: [
        g('pawn', 30, 0.5, 0),
        g('bishop', 4, 2.0, 4),
        g('knight', 16, 0.4, 8),
        g('rook', 3, 3.0, 14),
        g('queen', 1, 4.0, 18),
      ],
    },
    { hpMult: 2.0, groups: [g('queen', 4, 4.0, 0), g('bishop', 6, 2.0, 1), g('rook', 4, 3.0, 2)] },
    {
      hpMult: 2.05,
      groups: [g('knight', 30, 0.4, 0), g('bishop', 8, 2.0, 3), g('rook', 4, 3.0, 8), g('queen', 2, 4.0, 14)],
    },
    {
      hpMult: 2.1,
      groups: [g('queen', 5, 4.0, 0), g('bishop', 8, 2.0, 1), g('rook', 5, 3.0, 2), g('pawn', 12, 0.7, 12)],
    },
    {
      hpMult: 2.2,
      boss: 'darkKing',
      groups: [g('rook', 4, 3.0, 0), g('bishop', 6, 2.0, 1), g('pawn', 12, 0.7, 6), g('queen', 3, 4.0, 10)],
    },
  ],
  modifiers: ['shielded', 'rush'],
  startGold: 140,
  lives: 20,
  intro:
    'The Dark King is slow, armoured, and calls the whole black army to his side. There is one long road to the throne: line your rooks up along it.',
}
