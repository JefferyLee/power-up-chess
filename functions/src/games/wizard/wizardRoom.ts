// Cloud Functions for Wizard's Duel online play.
//
// Mirrors the chess online pattern (createRoom / joinRoom / submitMove)
// but with the wizard engine, plus an extra submitWizardSpell that runs
// the castle-points deduction in the SAME transaction as the spell apply
// so we never apply a spell without charging or vice versa.

import { getFirestore, type Firestore, type Transaction } from 'firebase-admin/firestore'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { generateRoomId } from '../../rooms/roomId'
import { postRoomInvite } from '../../castle/postRoomInvite'
import { WizardChess, type SerializedEffect, type WizardRoomState } from './WizardChess'
import { EXTRA_TIME_BONUS_MS, spellById } from './spells'
import type { SpellId, WizardActionRecord } from './types'
import type { Color, Square } from '../../shared/chessTypes'
import type { GuestDoc } from '../../castle/types'

const STARTING_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
const MAX_TRIES = 5

// Sudden-death clock: 8 minutes per side, no per-move increment. The
// only way to add time is the 'extra-time' spell (10 castle points → +60 s).
const INITIAL_MS = 8 * 60 * 1000
const INCREMENT_MS = 0

interface TimeControl {
  initialMs: number
  incrementMs: number
}

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
  endReason: 'checkmate' | 'timeout' | 'resign' | null
  timeControl: TimeControl
  whiteTimeMs: number
  blackTimeMs: number
  /** Server-ms when the side-to-move's clock started ticking. null while
   *  waiting for the second player or after the game ends. */
  lastTickServerTs: number | null
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
        timeControl: { initialMs: INITIAL_MS, incrementMs: INCREMENT_MS },
        whiteTimeMs: INITIAL_MS,
        blackTimeMs: INITIAL_MS,
        lastTickServerTs: null,
        createdAt: now,
        updatedAt: now,
      }
      try {
        await ref.create(doc)
        void postRoomInvite({ roomKind: 'wizard', roomId, openerName: slot.displayName })
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

      const now = Date.now()
      // White's clock starts ticking now — that's the side-to-move when
      // the room flips to live.
      tx.update(ref, { black: slot, status: 'live', updatedAt: now, lastTickServerTs: now })
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

      const now = Date.now()
      const tick = tickClock(room, callerColor, now, { addIncrement: true })
      if (tick.flagged) {
        tx.update(ref, {
          ...tick.update,
          status: 'completed',
          winner: opposite(callerColor),
          endReason: 'timeout',
          updatedAt: now,
        })
        throw new HttpsError('failed-precondition', 'Your time ran out.')
      }

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
        ...tick.update,
        updatedAt: now,
      }
      const status = engine.status()
      if (status.kind === 'king_captured') {
        update.status = 'completed'
        update.winner = status.winner
        update.endReason = 'checkmate'
        update.lastTickServerTs = null
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

      const now = Date.now()
      // 'extra-time' is its own time bonus — skip the standard increment.
      // Other spells use the regular Fischer increment.
      const isTimeSpell = spellId === 'extra-time'
      const tick = tickClock(room, callerColor, now, { addIncrement: !isTimeSpell })
      if (tick.flagged) {
        tx.update(roomRef, {
          ...tick.update,
          status: 'completed',
          winner: opposite(callerColor),
          endReason: 'timeout',
          updatedAt: now,
        })
        throw new HttpsError('failed-precondition', 'Your time ran out.')
      }
      if (isTimeSpell) {
        if (callerColor === 'w') {
          tick.update.whiteTimeMs = (tick.update.whiteTimeMs ?? room.whiteTimeMs) + EXTRA_TIME_BONUS_MS
        } else {
          tick.update.blackTimeMs = (tick.update.blackTimeMs ?? room.blackTimeMs) + EXTRA_TIME_BONUS_MS
        }
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
        ...tick.update,
        updatedAt: now,
      }
      tx.update(roomRef, update)

      return { ok: true as const, castlePoints: nextPoints }
    })
  },
)

// ── resignWizardGame ────────────────────────────────────────────────────
//
// Caller forfeits the duel. Allowed from either seated player while the
// room is live. The opposite color becomes the winner, endReason='resign'.

export const resignWizardGame = onCall<{ roomId: string }, Promise<{ ok: true }>>(
  async (req) => {
    if (!req.auth) throw new HttpsError('unauthenticated', 'Sign in first.')
    const uid = req.auth.uid
    const roomId = String(req.data?.roomId ?? '')
    if (!roomId) throw new HttpsError('invalid-argument', 'roomId required.')
    const db = getFirestore()
    const ref = db.doc(`wizard_rooms/${roomId}`)

    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref)
      if (!snap.exists) throw new HttpsError('not-found', 'Room not found.')
      const room = snap.data() as WizardRoomDoc
      // Idempotent: re-resigning a completed game is a no-op.
      if (room.status === 'completed') return
      if (room.status !== 'live') throw new HttpsError('failed-precondition', 'Game is not in progress.')

      const callerColor = colorFor(uid, room)
      if (callerColor === null) throw new HttpsError('permission-denied', 'Not a player.')

      tx.update(ref, {
        status: 'completed',
        winner: opposite(callerColor),
        endReason: 'resign',
        lastTickServerTs: null,
        updatedAt: Date.now(),
      })
    })
    return { ok: true }
  },
)

// ── claimWizardTimeWin ──────────────────────────────────────────────────
//
// Caller asserts that the opponent's clock has run out. Server compares
// (serverNow - lastTickServerTs) to the opponent's stored remaining time
// to validate, then flips the room to completed with endReason 'timeout'.

interface ClaimTimeRequest { roomId: string }

export const claimWizardTimeWin = onCall<ClaimTimeRequest, Promise<{ ok: true }>>(
  async (req) => {
    if (!req.auth) throw new HttpsError('unauthenticated', 'Sign in first.')
    const uid = req.auth.uid
    const roomId = String(req.data?.roomId ?? '')
    if (!roomId) throw new HttpsError('invalid-argument', 'roomId required.')

    const db = getFirestore()
    const ref = db.doc(`wizard_rooms/${roomId}`)

    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref)
      if (!snap.exists) throw new HttpsError('not-found', 'Room not found.')
      const room = snap.data() as WizardRoomDoc

      // Idempotent — re-claiming a finished game is a no-op.
      if (room.status === 'completed') return
      if (room.status !== 'live') throw new HttpsError('failed-precondition', 'Game is not in progress.')
      if (room.lastTickServerTs === null) {
        throw new HttpsError('failed-precondition', 'This game has no running clock.')
      }

      const callerColor = colorFor(uid, room)
      if (callerColor === null) throw new HttpsError('permission-denied', 'Not a player.')
      if (callerColor === room.currentTurn) {
        // You can't claim a flag-fall while your OWN clock is the one ticking.
        throw new HttpsError('failed-precondition', 'It is your turn — you cannot claim time.')
      }

      const now = Date.now()
      const elapsed = now - room.lastTickServerTs
      const opponentTime = room.currentTurn === 'w' ? room.whiteTimeMs : room.blackTimeMs
      if (elapsed < opponentTime) {
        throw new HttpsError('failed-precondition', 'Opponent has not run out of time.')
      }

      const update: Partial<WizardRoomDoc> = {
        status: 'completed',
        winner: callerColor,
        endReason: 'timeout',
        lastTickServerTs: null,
        updatedAt: now,
      }
      if (room.currentTurn === 'w') update.whiteTimeMs = 0
      else update.blackTimeMs = 0
      tx.update(ref, update)
    })

    return { ok: true }
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

function opposite(c: Color): Color {
  return c === 'w' ? 'b' : 'w'
}

interface TickOptions { addIncrement: boolean }
interface TickResult {
  /** Partial room update (whiteTimeMs / blackTimeMs / lastTickServerTs). */
  update: Partial<WizardRoomDoc>
  /** True if the side-to-move ran out of time before completing this turn. */
  flagged: boolean
}

/** Deduct elapsed time from the side-to-move's clock and (optionally) add the
 *  Fischer increment. Returns a partial update + a flag-fall indicator. */
function tickClock(
  room: WizardRoomDoc,
  movingColor: Color,
  now: number,
  opts: TickOptions,
): TickResult {
  const update: Partial<WizardRoomDoc> = {}
  if (room.lastTickServerTs === null) {
    // Defensive: shouldn't happen for live games, but handle gracefully.
    update.lastTickServerTs = now
    return { update, flagged: false }
  }
  const elapsed = now - room.lastTickServerTs
  const remaining = (movingColor === 'w' ? room.whiteTimeMs : room.blackTimeMs) - elapsed
  if (remaining <= 0) {
    if (movingColor === 'w') update.whiteTimeMs = 0
    else update.blackTimeMs = 0
    update.lastTickServerTs = null
    return { update, flagged: true }
  }
  const next = remaining + (opts.addIncrement ? room.timeControl.incrementMs : 0)
  if (movingColor === 'w') update.whiteTimeMs = next
  else update.blackTimeMs = next
  update.lastTickServerTs = now
  return { update, flagged: false }
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
