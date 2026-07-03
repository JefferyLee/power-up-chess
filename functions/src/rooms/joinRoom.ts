import { getFirestore } from 'firebase-admin/firestore'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import type { JoinRoomRequest, JoinRoomResponse, RoomDoc } from './types'
import { sanitisePieceSetId } from '../cosmetics/registry'
import { postGameStarted } from '../castle/postGameStarted'

/**
 * Adds the caller as the black player and flips the room to `live`, OR
 * — for a returning player whose castle name matches one of the seats
 * but whose anonymous-auth uid has changed (disconnect / device switch)
 * — reclaims the matching seat by updating its playerId.
 *
 * Idempotent for the room's original creator (white) — calling joinRoom on
 * your own room is a no-op success so that returning to a waiting-room link
 * does not error.
 */
export const joinRoom = onCall<JoinRoomRequest, Promise<JoinRoomResponse>>({ enforceAppCheck: true },async (req) => {
  if (!req.auth) {
    throw new HttpsError('unauthenticated', 'Sign in before joining a room.')
  }
  const uid = req.auth.uid
  const roomId = (req.data.roomId ?? '').trim()
  if (!/^[A-Za-z0-9]{4,12}$/.test(roomId)) {
    throw new HttpsError('invalid-argument', 'Invalid room id.')
  }
  let displayName = (req.data.displayName ?? '').trim().slice(0, 32)
  if (displayName.length === 0) {
    throw new HttpsError('invalid-argument', 'displayName is required.')
  }

  const db = getFirestore()
  const ref = db.doc(`rooms/${roomId}`)

  // Verify the caller's castle name against chat_identity (set by
  // setPresence on entry). Trusting the request's normalizedName
  // directly would let anyone "reclaim" any seat by sending the right
  // name. Falls back to the request only when chat_identity hasn't
  // been written yet — first-join flows still work that way.
  const idSnap = await db.doc(`chat_identity/${uid}`).get()
  const idData = idSnap.data() as
    | { displayName: string; normalizedName: string; isBypass: boolean }
    | undefined
  const verifiedNormalizedName = idData && !idData.isBypass
    ? idData.normalizedName
    : String(req.data.normalizedName ?? '').trim().toLowerCase()
  // Phase 1.4: when a verified identity exists, the seat shows THAT name —
  // a modified client can't sit down under someone else's nickname.
  if (idData?.displayName) {
    displayName = idData.displayName.trim().slice(0, 32) || displayName
  }

  const result = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref)
    if (!snap.exists) {
      throw new HttpsError('not-found', 'Room not found.')
    }
    const room = snap.data() as RoomDoc
    const now = Date.now()
    const blackPieceSetId = sanitisePieceSetId(req.data.pieceSetId)

    // Idempotent: re-calling join with a matching uid is a no-op.
    if (room.white.playerId === uid) return room
    if (room.black && room.black.playerId === uid) return room

    // Reclaim path: caller's verified castle name matches a seat but
    // the uid has changed (e.g., new device, cleared anon-auth). Swap
    // the playerId in place, refresh displayName + pieceSetId, leave
    // everything else (clock, moves, status) untouched.
    if (verifiedNormalizedName) {
      if (room.white.normalizedName === verifiedNormalizedName) {
        const updated: RoomDoc = {
          ...room,
          white: {
            ...room.white,
            playerId: uid,
            displayName,
            ...(blackPieceSetId ? { pieceSetId: blackPieceSetId } : {}),
          },
          updatedAt: now,
        }
        tx.set(ref, updated)
        return updated
      }
      if (room.black && room.black.normalizedName === verifiedNormalizedName) {
        const updated: RoomDoc = {
          ...room,
          black: {
            ...room.black,
            playerId: uid,
            displayName,
            ...(blackPieceSetId ? { pieceSetId: blackPieceSetId } : {}),
          },
          updatedAt: now,
        }
        tx.set(ref, updated)
        return updated
      }
    }

    if (room.status !== 'waiting') {
      throw new HttpsError('failed-precondition', 'Room is no longer accepting players.')
    }
    if (room.black) {
      throw new HttpsError('failed-precondition', 'Room already has two players.')
    }

    const updated: RoomDoc = {
      ...room,
      black: {
        playerId: uid,
        displayName,
        ...(blackPieceSetId ? { pieceSetId: blackPieceSetId } : {}),
        ...(verifiedNormalizedName ? { normalizedName: verifiedNormalizedName } : {}),
      },
      status: 'live',
      // White is to move at game start, so white's clock starts ticking now.
      // For an untimed room, lastTickServerTs stays null.
      lastTickServerTs: room.timeControl ? now : null,
      updatedAt: now,
    }
    tx.set(ref, updated)
    return { room: updated, justWentLive: true as const }
  })

  // Reclaim + idempotent re-joins don't carry the flag (they return
  // a raw RoomDoc), only the genuine black-joining path does. That's
  // the moment to fire the Hall "X vs Y just started" post.
  if ('justWentLive' in result && result.justWentLive) {
    const r = result.room
    if (r.white?.displayName && r.black?.displayName) {
      void postGameStarted({
        roomKind: 'chess',
        roomId,
        whiteName: r.white.displayName,
        blackName: r.black.displayName,
      })
    }
  }

  const status = ('room' in result ? result.room : result).status
  return { roomId, status }
})
