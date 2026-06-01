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
