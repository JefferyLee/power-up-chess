// createTournamentRoom — mints a private game room for a tournament
// pairing and stamps the roomId onto the pairing.
//
// Differs from castle/rooms createRoom in two ways:
//   1. No castle-point cost (tournament play shouldn't double-bill).
//   2. Caller MUST be the pairing's white player (so the room's
//      white slot lines up with the pairing colours; the black
//      player then joins via the existing joinRoom flow).

import { getFirestore } from 'firebase-admin/firestore'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { generateRoomId } from '../rooms/roomId'
import type { RoomDoc } from '../rooms/types'
import { requireOwnedGuest } from '../castle/requireOwner'
import { BYE_OPPONENT, type TournamentDoc } from './types'
import { tournamentWeekKey } from './weekKey'

const STARTING_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
const MAX_TRIES = 5

export interface CreateTournamentRoomRequest {
  normalizedName: string
  sessionId: string
  roundIndex: number
  pairingIndex: number
}

export interface CreateTournamentRoomResponse {
  ok: true
  roomId: string
}

export const createTournamentRoom = onCall<
  CreateTournamentRoomRequest,
  Promise<CreateTournamentRoomResponse>
>(async (req) => {
  if (!req.auth) {
    throw new HttpsError('unauthenticated', 'Sign in first.')
  }
  const uid = req.auth.uid
  const normalizedName = String(req.data?.normalizedName ?? '').trim().toLowerCase()
  const sessionId = String(req.data?.sessionId ?? '').trim()
  const roundIndex = Number(req.data?.roundIndex)
  const pairingIndex = Number(req.data?.pairingIndex)
  if (
    !normalizedName ||
    !Number.isInteger(roundIndex) ||
    !Number.isInteger(pairingIndex)
  ) {
    throw new HttpsError('invalid-argument', 'Bad payload.')
  }

  const db = getFirestore()
  const tournamentRef = db.doc(`tournaments/${tournamentWeekKey()}`)

  // 1) Validate inside a quick read transaction first — cheaper than
  //    minting + rolling back a room. If a roomId already exists we
  //    just return it (idempotent).
  const validation = await db.runTransaction(async (tx) => {
    const [tSnap, { guest }] = await Promise.all([
      tx.get(tournamentRef),
      requireOwnedGuest(db, uid, normalizedName, tx, { sessionId }),
    ])
    if (!tSnap.exists) {
      throw new HttpsError('not-found', 'No tournament this week.')
    }
    const tournament = tSnap.data() as TournamentDoc
    if (tournament.status !== 'active') {
      throw new HttpsError('failed-precondition', 'Tournament is not active.')
    }
    const round = tournament.rounds?.[roundIndex]
    const pairing = round?.pairings[pairingIndex]
    if (!round || !pairing) {
      throw new HttpsError('not-found', 'Pairing not found.')
    }
    if (pairing.black === BYE_OPPONENT) {
      throw new HttpsError(
        'failed-precondition',
        'Byes don\'t need a game room.',
      )
    }
    if (pairing.white !== normalizedName) {
      throw new HttpsError(
        'permission-denied',
        'Only the White player can open the room for this pairing.',
      )
    }
    return {
      tournament,
      pairing,
      whiteDisplayName: guest.displayName,
      existingRoomId: pairing.roomId,
    }
  })

  if (validation.existingRoomId) {
    return { ok: true, roomId: validation.existingRoomId }
  }

  // 2) Mint a fresh room. We loop on roomId collisions like createRoom
  //    does. Tournament rooms have no cost; the white player is the
  //    caller, black slot stays null until joinRoom fills it.
  const hostMode: 'lucy' | 'luca' = Math.random() < 0.5 ? 'lucy' : 'luca'
  const now = Date.now()
  for (let i = 0; i < MAX_TRIES; i++) {
    const roomId = generateRoomId()
    const ref = db.doc(`rooms/${roomId}`)
    const doc: RoomDoc = {
      white: { playerId: uid, displayName: validation.whiteDisplayName },
      black: null,
      status: 'waiting',
      currentFen: STARTING_FEN,
      hostMode,
      theme: 'magic-forest',
      moves: [],
      timeControl: null,
      whiteTimeMs: null,
      blackTimeMs: null,
      lastTickServerTs: null,
      createdAt: now,
      updatedAt: now,
    }
    const committed = await db.runTransaction(async (tx) => {
      const collision = await tx.get(ref)
      if (collision.exists) return false
      // Re-read the pairing so we don't double-stamp if another
      // caller raced us between validate + mint.
      const tSnap = await tx.get(tournamentRef)
      if (!tSnap.exists) return false
      const tournament = tSnap.data() as TournamentDoc
      const round = tournament.rounds?.[roundIndex]
      const pairing = round?.pairings[pairingIndex]
      if (!pairing) return false
      if (pairing.roomId) {
        // Someone else minted while we were here — return their id.
        return pairing.roomId
      }
      tx.create(ref, doc)
      const updatedRound = {
        ...round!,
        pairings: round!.pairings.map((p, i) =>
          i === pairingIndex ? { ...p, roomId } : p,
        ),
      }
      const updatedRounds = tournament.rounds.map((r, i) =>
        i === roundIndex ? updatedRound : r,
      )
      tx.update(tournamentRef, { rounds: updatedRounds })
      return roomId
    })
    if (committed === false) continue
    return { ok: true, roomId: committed }
  }
  throw new HttpsError('aborted', 'Could not allocate a room id. Try again.')
})
