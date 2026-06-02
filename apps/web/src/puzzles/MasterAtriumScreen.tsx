// MasterAtriumScreen — 2500-3000 challenge-tier museum. Thin wrapper
// that feeds the shared MuseumScreen its callable + copy. The gate is
// lower than Legends (25 vs 50 solves) so it sits as a warmup.

import { MuseumScreen, type MuseumConfig } from './MuseumScreen'
import { callGetMasterAtriumList } from '../firebase/callables'

const MASTER_CONFIG: MuseumConfig = {
  variant: 'master',
  loadList: callGetMasterAtriumList,
  copy: {
    loading: "Opening the Master's Atrium…",
    accessError: "Master's Atrium is for signed-in guests with a magic word.",
    loadError: "Could not load Master's Atrium.",
    lockedTitle: "Master's Atrium is locked",
    lockedBlurbReason: 'to step inside.',
    galleryTitle: "Master's Atrium",
    metaLabel: 'Touched',
    intro:
      'Hundreds of strong-tactical puzzles in the 2500–3000 range. Warmup before the Legends.',
    playingTitlePrefix: 'Master plaque',
    solvedBadgeEmoji: '🥈',
    solvedBadgeAria: 'Touched',
    resultHeadSuccess: '🥈 Touched plaque!',
  },
}

export function MasterAtriumScreen() {
  return <MuseumScreen config={MASTER_CONFIG} />
}
