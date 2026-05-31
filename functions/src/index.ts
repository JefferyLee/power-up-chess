// Power Up Chess Cloud Functions entrypoint.
//
// Phase 0 stub. Real functions land in Phase 3 (rooms.ts) and Phase 5 (commentary.ts):
//   - createRoom, joinRoom, submitMove   (Phase 3)
//   - hostCommentary, gameRecap          (Phase 5)

import { initializeApp } from 'firebase-admin/app'
import { onRequest } from 'firebase-functions/v2/https'

initializeApp()

export const healthcheck = onRequest((_req, res) => {
  res.json({ ok: true, service: 'power-up-chess', phase: 0 })
})
