// Power Up Chess Cloud Functions entrypoint.

import { initializeApp } from 'firebase-admin/app'
import { onRequest } from 'firebase-functions/v2/https'

initializeApp()

export const healthcheck = onRequest((_req, res) => {
  res.json({ ok: true, service: 'power-up-chess', phase: 3 })
})

export { createRoom } from './rooms/createRoom'
export { joinRoom } from './rooms/joinRoom'
export { submitMove } from './rooms/submitMove'
export { resignGame } from './rooms/resignGame'
export { claimTimeWin } from './rooms/claimTimeWin'
export { hostCommentary } from './commentary/hostCommentary'
export { gameRecap } from './commentary/gameRecap'
export { castleEnter } from './castle/castleEnter'
export { castleBypass } from './castle/castleBypass'
export { awardCastlePoints } from './castle/awardCastlePoints'
export { refreshCastlePublicStats } from './castle/refreshCastlePublicStats'
export { refreshCastleLivePulse } from './castle/refreshCastleLivePulse'
export { postChat } from './castle/postChat'
export { setPresence } from './castle/setPresence'
export { hostAmbientStory } from './castle/hostAmbientStory'
export { hostStoryAnswer } from './castle/hostStoryAnswer'
export { hostTellStory } from './castle/hostTellStory'
export { cleanupPresence } from './castle/cleanupPresence'
export { submitForestScore } from './forest/submitForestScore'
export {
  createWizardRoom,
  joinWizardRoom,
  submitWizardMove,
  submitWizardSpell,
  claimWizardTimeWin,
  resignWizardGame,
} from './games/wizard/wizardRoom'
export { postWizardMessage, postWizardVoice } from './games/wizard/wizardChat'
export { getNextPuzzle } from './puzzles/getNextPuzzle'
export { submitPuzzleAttempt } from './puzzles/submitPuzzleAttempt'
export { getCalibrationSet, submitCalibration } from './puzzles/calibration'
export { refreshPuzzleLeaderboards } from './puzzles/refreshPuzzleLeaderboards'
export { getDailyFive } from './puzzles/dailyFive'
export { getLegendsList } from './puzzles/legends'
export { getMasterAtriumList } from './puzzles/masterAtrium'
export { submitFeedback, markFeedbackRead } from './feedback/feedback'
export { awardTutorialComplete } from './castle/awardTutorialComplete'
export { purchaseCosmetic } from './cosmetics/purchaseCosmetic'
export { equipCosmetic } from './cosmetics/equipCosmetic'
export { cleanupStaleRooms } from './cleanup/cleanupRooms'
export { cleanupOldLobbyMessages } from './cleanup/cleanupOldLobbyMessages'
export { cleanupDormantGuests } from './cleanup/cleanupDormantGuests'
