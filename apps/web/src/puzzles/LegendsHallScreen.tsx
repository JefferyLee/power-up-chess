// LegendsHallScreen — museum-style gallery of the 100 Legends puzzles.
// Thin wrapper that feeds the shared MuseumScreen its callable + copy.

import { MuseumScreen, type MuseumConfig } from './MuseumScreen'
import { callGetLegendsList } from '../firebase/callables'

const LEGENDS_CONFIG: MuseumConfig = {
  variant: 'legends',
  loadList: callGetLegendsList,
  copy: {
    loading: 'Opening the Legends Hall…',
    accessError: 'Legends Hall is for signed-in guests with a magic word.',
    loadError: 'Could not load Legends Hall.',
    lockedTitle: 'Legends Hall is locked',
    lockedBlurbReason: 'to earn the key.',
    galleryTitle: 'Legends Hall',
    metaLabel: 'Badges',
    intro:
      'One hundred master-tier puzzles. Solve any for a permanent gold badge.',
    playingTitlePrefix: 'Legends plaque',
    solvedBadgeEmoji: '🏅',
    solvedBadgeAria: 'Solved',
    resultHeadSuccess: '🏅 Badge earned!',
  },
}

export function LegendsHallScreen() {
  return <MuseumScreen config={LEGENDS_CONFIG} />
}
