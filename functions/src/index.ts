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
export { postChat } from './castle/postChat'
export { setPresence } from './castle/setPresence'
export { hostAmbientStory } from './castle/hostAmbientStory'
export { hostStoryAnswer } from './castle/hostStoryAnswer'
export { cleanupPresence } from './castle/cleanupPresence'
export { submitForestScore } from './forest/submitForestScore'
export {
  createWizardRoom,
  joinWizardRoom,
  submitWizardMove,
  submitWizardSpell,
} from './games/wizard/wizardRoom'
export { postWizardMessage, postWizardVoice } from './games/wizard/wizardChat'
export { cleanupStaleRooms } from './cleanup/cleanupRooms'
