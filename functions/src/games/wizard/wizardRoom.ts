// Cloud Functions for Wizard's Duel online play.
//
// Mirrors the chess online pattern (createRoom / joinRoom / submitMove)
// but with the wizard engine, plus an extra submitWizardSpell that runs
// the castle-points deduction in the SAME transaction as the spell apply
// so we never apply a spell without charging or vice versa.

import { getFirestore, type Firestore, type Transaction } from 'firebase-admin/firestore'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { generateRoomId } from '../../rooms/roomId'
import { WizardChess, type SerializedEffect, type WizardRoomState } from './WizardChess'
import { spellById } from './spells'
import type { SpellId, WizardActionRecord } from './types'
import type { Color, Square } from '../../shared/chessTypes'
import type { GuestDoc } from '../../castle/types'

const STARTING_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
const MAX_TRIES = 5

interface PlayerSlot {
  uid: string
  displayName: string
  /** Empty for bypass guests (they can't cast spells). */
  normalizedName: string
  isBypass: boolean
}

interface WizardRoomDoc {
  white: PlayerSlot
  black: PlayerSlot | null
  status: 'waiting' | 'live' | 'completed'
  fen: string
  currentTurn: Color
  plyCount: number
  effects: SerializedEffect[]
  actions: WizardActionRecord[]
  winner: Color | null
  endReason: 'checkmate' | null
  createdAt: number
  updatedAt: number
}

interface CreateRoomRequest {
  displayName: string
  normalizedName: string
  isBypass: boolean
}
interface JoinRoomRequest {
  roomId: string
  displayName: string
  normalizedName: string
  isBypass: boolean
}
interface SubmitMoveRequest {
  roomId: string
  from: Square
  to: Square
}
interface SubmitSpellRequest {
  roomId: string
  spellId: SpellId
  targets: Square[]
}

// ── createWizardRoom ────────────────────────────────────────────────────

export const createWizardRoom = onCall<CreateRoomRequest, Promise<{ roomId: string }>>(
  async (req) => {
    if (!req.auth) throw new HttpsError('unauthenticated', 'Sign in first.')
    const slot = validatePlayer(req.auth.uid, req.data)
    const db = getFirestore()
    const now = Date.now()
    for (let i = 0; i < MAX_TRIES; i++) {
      const roomId = generateRoomId()
      const ref = db.doc(`wizard_rooms/${roomId}`)
      const doc: WizardRoomDoc = {
        white: slot,
        black: null,
        status: 'waiting',
        fen: STARTING_FEN,
        currentTurn: 'w',
        plyCount: 0,
        effects: [],
        actions: [],
        winner: null,
        endReason: null,
        createdAt: now,
        updatedAt: now,
      }
      try {
        await ref.create(doc)
        return { roomId }
      } catch (err: unknown) {
        const code = (err as { code?: number | string }).code
        if (code === 6 || code === 'already-exists') continue
        throw err
      }
    }
    throw new HttpsError('internal', 'Could not allocate a unique roomId; please retry.')
  },
)

// ── joinWizardRoom ──────────────────────────────────────────────────────

export const joinWizardRoom = onCall<JoinRoomRequest, Promise<{ color: Color }>>(
  async (req) => {
    if (!req.auth) throw new HttpsError('unauthenticated', 'Sign in first.')
    const uid = req.auth.uid
    const slot = validatePlayer(uid, req.data)
    const roomId = String(req.data?.roomId ?? '')
    if (!roomId) throw new HttpsError('invalid-argument', 'roomId required.')
    const db = getFirestore()
    const ref = db.doc(`wizard_rooms/${roomId}`)

    return db.runTransaction(async (tx) => {
      const snap = await tx.get(ref)
      if (!snap.exists) throw new HttpsError('not-found', 'Room not found.')
      const room = snap.data() as WizardRoomDoc

      if (room.white.uid === uid) return { color: 'w' as const }
      if (room.black?.uid === uid) return { color: 'b' as const }
      if (room.black) throw new HttpsError('failed-precondition', 'Room is full.')

      tx.update(ref, { black: slot, status: 'live', updatedAt: Date.now() })
      return { color: 'b' as const }
    })
  },
)

// ── submitWizardMove ────────────────────────────────────────────────────

export const submitWizardMove = onCall<SubmitMoveRequest, Promise<{ ok: true }>>(
  async (req) => {
    if (!req.auth) throw new HttpsError('unauthenticated', 'Sign in first.')
    const uid = req.auth.uid
    const { roomId, from, to } = req.data ?? {}
    if (!roomId || !from || !to) throw new HttpsError('invalid-argument', 'Missing fields.')
    const db = getFirestore()
    const ref = db.doc(`wizard_rooms/${roomId}`)

    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref)
      if (!snap.exists) throw new HttpsError('not-found', 'Room not found.')
      const room = snap.data() as WizardRoomDoc
      if (room.status !== 'live') throw new HttpsError('failed-precondition', 'Room not live.')
      const callerColor = colorFor(uid, room)
      if (callerColor === null) throw new HttpsError('permission-denied', 'Not a player.')
      if (callerColor !== room.currentTurn) throw new HttpsError('failed-precondition', 'Not your turn.')

      const engine = WizardChess.fromState(stateOf(room))
      const rec = engine.move({ from: from as Square, to: to as Square })
      if (!rec) throw new HttpsError('invalid-argument', 'Illegal move.')

      const next = engine.toState()
      const update: Partial<WizardRoomDoc> = {
        fen: next.fen,
        currentTurn: next.currentTurn,
        plyCount: next.plyCount,
        effects: next.effects,
        actions: next.actions,
        updatedAt: Date.now(),
      }
      const status = engine.status()
      if (status.kind === 'king_captured') {
        update.status = 'completed'
        update.winner = status.winner
        update.endReason = 'checkmate'
      }
      tx.update(ref, update)
    })
    return { ok: true }
  },
)

// ── submitWizardSpell ───────────────────────────────────────────────────

export const submitWizardSpell = onCall<SubmitSpellRequest, Promise<{ ok: true; castlePoints: number }>>(
  async (req) => {
    if (!req.auth) throw new HttpsError('unauthenticated', 'Sign in first.')
    const uid = req.auth.uid
    const { roomId, spellId, targets } = req.data ?? {}
    if (!roomId || !spellId || !Array.isArray(targets)) {
      throw new HttpsError('invalid-argument', 'Missing fields.')
    }
    const spell = spellById(spellId)
    const db = getFirestore()
    const roomRef = db.doc(`wizard_rooms/${roomId}`)

    return db.runTransaction(async (tx) => {
      const roomSnap = await tx.get(roomRef)
      if (!roomSnap.exists) throw new HttpsError('not-found', 'Room not found.')
      const room = roomSnap.data() as WizardRoomDoc
      if (room.status !== 'live') throw new HttpsError('failed-precondition', 'Room not live.')
      const callerColor = colorFor(uid, room)
      if (callerColor === null) throw new HttpsError('permission-denied', 'Not a player.')
      if (callerColor !== room.currentTurn) throw new HttpsError('failed-precondition', 'Not your turn.')

      const callerSlot = callerColor === 'w' ? room.white : room.black!
      if (callerSlot.isBypass || !callerSlot.normalizedName) {
        throw new HttpsError('permission-denied', 'Bypass guests cannot cast spells (no castle points to spend).')
      }

      // Check & charge castle points atomically.
      const guestRef = db.doc(`guests/${callerSlot.normalizedName}`)
      const guestSnap = await tx.get(guestRef)
      if (!guestSnap.exists) throw new HttpsError('failed-precondition', 'Guest record missing.')
      const guest = guestSnap.data() as GuestDoc
      if (guest.castlePoints < spell.cost) {
        throw new HttpsError('failed-precondition', `Need ${spell.cost} castle points, you have ${guest.castlePoints}.`)
      }

      const engine = WizardChess.fromState(stateOf(room))
      const rec = engine.castSpell(spellId, targets as Square[])
      if (!rec) throw new HttpsError('invalid-argument', 'Illegal spell.')

      const nextPoints = guest.castlePoints - spell.cost
      tx.update(guestRef, { castlePoints: nextPoints })

      const next = engine.toState()
      const update: Partial<WizardRoomDoc> = {
        fen: next.fen,
        currentTurn: next.currentTurn,
        plyCount: next.plyCount,
        effects: next.effects,
        actions: next.actions,
        updatedAt: Date.now(),
      }
      tx.update(roomRef, update)

      return { ok: true as const, castlePoints: nextPoints }
    })
  },
)

// ── Helpers ─────────────────────────────────────────────────────────────

function validatePlayer(uid: string, data: unknown): PlayerSlot {
  const d = (data ?? {}) as { displayName?: unknown; normalizedName?: unknown; isBypass?: unknown }
  const displayName = String(d.displayName ?? '').trim().slice(0, 40)
  const normalizedName = String(d.normalizedName ?? '').trim().toLowerCase()
  const isBypass = d.isBypass === true
  if (!displayName) throw new HttpsError('invalid-argument', 'displayName required.')
  if (!isBypass && !normalizedName) throw new HttpsError('invalid-argument', 'normalizedName required for non-bypass.')
  return { uid, displayName, normalizedName, isBypass }
}

function colorFor(uid: string, room: WizardRoomDoc): Color | null {
  if (room.white.uid === uid) return 'w'
  if (room.black?.uid === uid) return 'b'
  return null
}

function stateOf(room: WizardRoomDoc): WizardRoomState {
  return {
    fen: room.fen,
    currentTurn: room.currentTurn,
    plyCount: room.plyCount,
    effects: room.effects,
    actions: room.actions,
  }
}

// Silence unused warnings — these types are only used by Firestore reads.
void undefined as unknown as Firestore
void undefined as unknown as Transaction
