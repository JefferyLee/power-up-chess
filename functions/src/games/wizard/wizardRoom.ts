// Cloud Functions for Wizard's Duel online play.
//
// Mirrors the chess online pattern (createRoom / joinRoom / submitMove)
// but with the wizard engine, plus an extra submitWizardSpell that runs
// the castle-points deduction in the SAME transaction as the spell apply
// so we never apply a spell without charging or vice versa.

import { FieldValue, getFirestore, type Firestore, type Transaction } from 'firebase-admin/firestore'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { generateRoomId } from '../../rooms/roomId'
import { sanitisePieceSetId } from '../../cosmetics/registry'
import { postGameStarted } from '../../castle/postGameStarted'
import { WizardChess, type SerializedEffect, type WizardRoomState } from './WizardChess'
import { EXTRA_TIME_BONUS_MS, spellById } from './spells'
import { reserveAndPriceSpell, type SpellPricing } from './wizardSpellPricing'
import type { SpellId, WizardActionRecord } from './types'
import type { Color, Square } from '../../shared/chessTypes'
import {
  AWARD_CAPS,
  CROWN_HOURS,
  CROWN_THRESHOLD,
  DUEL_HALO_HOURS,
  type GuestDoc,
} from '../../castle/types'
import { wizardGateMinPoints } from './wizardGate'
import type { ChatMessageDoc } from '../../castle/chatTypes'
import { appendAuditTx } from '../../castle/audit'
import { extractIp } from '../../castle/ipGeo'
import { requireOwnedGuest } from '../../castle/requireOwner'

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
  /** This player's equipped piece-set at game start. Locked for the
   *  duration; both viewers render this side's pieces in this set. */
  pieceSetId?: string
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
  pieceSetId?: string
}
interface JoinRoomRequest {
  roomId: string
  displayName: string
  normalizedName: string
  isBypass: boolean
  pieceSetId?: string
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
    // Opening a duel costs castle points; bypass guests have no balance,
    // so we refuse them and ask them to register a magic word.
    if (slot.isBypass || !slot.normalizedName) {
      throw new HttpsError(
        'permission-denied',
        'Bypass guests can\'t open Wizard\'s Duels. Set a magic word in the castle gate first.',
      )
    }
    const db = getFirestore()
    const now = Date.now()
    const cost = AWARD_CAPS.wizardRoomOpenCost
    const callerIp = extractIp(req)

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
      // Wizard-duel gate — opening requires the looser of 1000 castle
      // points and the rolling top-10% threshold. Pulled outside the
      // tx because it's a read of a public stats doc, not the guest.
      const gateMin = await wizardGateMinPoints(db)

      // Returns false on room-id collision so the outer loop retries with a
      // fresh id; throws HttpsError on real failures (not your name, no
      // guest, low balance).
      const committed = await db.runTransaction(async (tx) => {
        // Ownership + balance from the snapshot we debit; the seat takes
        // the guest doc's displayName, not whatever the request said.
        const { ref: guestRef, guest } = await requireOwnedGuest(db, req.auth!.uid, slot.normalizedName, tx)
        if (guest.castlePoints < gateMin) {
          throw new HttpsError(
            'failed-precondition',
            `Wizard's Duel unlocks at ${gateMin} castle points; you have ${guest.castlePoints}. Solve puzzles or win chess games to earn more.`,
          )
        }
        if (guest.castlePoints < cost) {
          throw new HttpsError(
            'failed-precondition',
            `Need ${cost} castle points to open a duel; you have ${guest.castlePoints}.`,
          )
        }
        const roomSnap = await tx.get(ref)
        if (roomSnap.exists) return false
        tx.create(ref, { ...doc, white: { ...slot, displayName: guest.displayName } })
        tx.update(guestRef, { castlePoints: FieldValue.increment(-cost) })
        appendAuditTx(tx, {
          normalizedName: slot.normalizedName!,
          uid: req.auth!.uid,
          delta: -cost,
          before: guest.castlePoints,
          after: guest.castlePoints - cost,
          source: 'room-open:wizard',
          metadata: { roomId },
          ...(callerIp ? { ip: callerIp } : {}),
        })
        return true
      })

      if (committed) {
        // Hall post moved to the live-transition site (joinDuel below)
        // so we don't advertise duels that the opener walks away from.
        return { roomId }
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

    // Same gate as createWizardRoom — bypass guests can't join either
    // (they have no guest doc / no castlePoints).
    if (slot.isBypass || !slot.normalizedName) {
      throw new HttpsError(
        'permission-denied',
        'Bypass guests can\'t join Wizard\'s Duels. Set a magic word in the castle gate first.',
      )
    }
    const gateMin = await wizardGateMinPoints(db)
    // Prove the caller owns the name they're sitting down as, and seat
    // them under the guest doc's displayName (server-bound).
    const { guest: joiner } = await requireOwnedGuest(db, uid, slot.normalizedName)
    if (joiner.castlePoints < gateMin) {
      throw new HttpsError(
        'failed-precondition',
        `Wizard's Duel unlocks at ${gateMin} castle points; you have ${joiner.castlePoints}.`,
      )
    }
    const seat: PlayerSlot = { ...slot, displayName: joiner.displayName }

    const result = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref)
      if (!snap.exists) throw new HttpsError('not-found', 'Room not found.')
      const room = snap.data() as WizardRoomDoc

      if (room.white.uid === uid) return { color: 'w' as const, justWentLive: false as const }
      if (room.black?.uid === uid) return { color: 'b' as const, justWentLive: false as const }
      if (room.black) throw new HttpsError('failed-precondition', 'Room is full.')

      // H.7 — refuse self-vs-self even from a second device of the same
      // castle account. The session-evict mechanism will sign the older
      // device out within ~20 s, but this catches the immediate race.
      if (!slot.isBypass && slot.normalizedName && room.white.normalizedName === slot.normalizedName) {
        throw new HttpsError(
          'failed-precondition',
          'You can\'t play yourself — this duel was opened from your own account.',
        )
      }

      const now = Date.now()
      // White's clock starts ticking now — that's the side-to-move when
      // the room flips to live.
      tx.update(ref, { black: seat, status: 'live', updatedAt: now, lastTickServerTs: now })
      return {
        color: 'b' as const,
        justWentLive: true as const,
        whiteName: room.white.displayName,
        blackName: seat.displayName,
      }
    })

    if (result.justWentLive) {
      void postGameStarted({
        roomKind: 'wizard',
        roomId,
        whiteName: result.whiteName,
        blackName: result.blackName,
      })
    }
    return { color: result.color }
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
        const winner = opposite(callerColor)
        await applyDuelPayouts(tx, room, winner)
        tx.update(ref, {
          ...tick.update,
          status: 'completed',
          winner,
          endReason: 'timeout',
          updatedAt: now,
        })
        scheduleDuelAnnouncement(roomId, room, winner, 'timeout')
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
        await applyDuelPayouts(tx, room, status.winner)
      }
      tx.update(ref, update)
      if (status.kind === 'king_captured') {
        scheduleDuelAnnouncement(roomId, room, status.winner, 'checkmate')
      }
    })
    return { ok: true }
  },
)

// ── submitWizardSpell ───────────────────────────────────────────────────

export const submitWizardSpell = onCall<
  SubmitSpellRequest,
  Promise<{ ok: true; castlePoints: number; pricing: SpellPricing }>
>(
  async (req) => {
    if (!req.auth) throw new HttpsError('unauthenticated', 'Sign in first.')
    const uid = req.auth.uid
    const { roomId, spellId, targets } = req.data ?? {}
    if (!roomId || !spellId || !Array.isArray(targets)) {
      throw new HttpsError('invalid-argument', 'Missing fields.')
    }
    spellById(spellId)  // sanity check that the id is known
    const db = getFirestore()
    const roomRef = db.doc(`wizard_rooms/${roomId}`)
    const spellCallerIp = extractIp(req)

    return db.runTransaction(async (tx) => {
      // ── Phase 1: all reads ────────────────────────────────────────────
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

      // The seat's name was verified at create/join time, but rooms that
      // predate that check are still live — re-prove ownership here
      // before spending the guest's points.
      const { ref: guestRef, guest } = await requireOwnedGuest(db, uid, callerSlot.normalizedName, tx)

      // Compute pricing + reserve quota/supply (also reads, then writes).
      // If anything later throws, all of these writes roll back with the tx.
      const now = Date.now()
      const pricing = await reserveAndPriceSpell(tx, uid, spellId, now, db)
      if (!pricing) {
        throw new HttpsError(
          'resource-exhausted',
          'This spell is sold out castle-wide today. Try again tomorrow or pick another.',
        )
      }
      if (guest.castlePoints < pricing.effectiveCost) {
        const surgeNote = pricing.effectiveCost > pricing.baseCost
          ? ` (surge ×${(pricing.effectiveCost / pricing.baseCost).toFixed(1)})`
          : ''
        throw new HttpsError(
          'failed-precondition',
          `Need ${pricing.effectiveCost} castle points${surgeNote}; you have ${guest.castlePoints}.`,
        )
      }

      // 'extra-time' is its own time bonus — skip the standard increment.
      const isTimeSpell = spellId === 'extra-time'
      const tick = tickClock(room, callerColor, now, { addIncrement: !isTimeSpell })
      if (tick.flagged) {
        const winner = opposite(callerColor)
        await applyDuelPayouts(tx, room, winner)
        tx.update(roomRef, {
          ...tick.update,
          status: 'completed',
          winner,
          endReason: 'timeout',
          updatedAt: now,
        })
        scheduleDuelAnnouncement(roomId, room, winner, 'timeout')
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

      // ── Phase 2: remaining writes ─────────────────────────────────────
      const nextPoints = guest.castlePoints - pricing.effectiveCost
      tx.update(guestRef, { castlePoints: nextPoints })
      appendAuditTx(tx, {
        normalizedName: callerSlot.normalizedName!,
        uid,
        delta: -pricing.effectiveCost,
        before: guest.castlePoints,
        after: nextPoints,
        source: `wizard-spell:${spellId}`,
        metadata: {
          roomId,
          spellId,
          baseCost: pricing.baseCost,
          effectiveCost: pricing.effectiveCost,
        },
        ...(spellCallerIp ? { ip: spellCallerIp } : {}),
      })

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

      return { ok: true as const, castlePoints: nextPoints, pricing }
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

      const winner = opposite(callerColor)
      await applyDuelPayouts(tx, room, winner)
      tx.update(ref, {
        status: 'completed',
        winner,
        endReason: 'resign',
        lastTickServerTs: null,
        updatedAt: Date.now(),
      })
      scheduleDuelAnnouncement(roomId, room, winner, 'resign')
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

      // The mover is the side whose clock is running. Whoever called
      // (mover or opponent or spectator-now-rejected-above), the loser
      // is always the mover — that's whose flag fell. Letting the
      // mover self-claim covers the case where the opponent is offline
      // and would otherwise leave the duel stuck in 'live' forever.
      const moverColor = room.currentTurn
      const moverTime = moverColor === 'w' ? room.whiteTimeMs : room.blackTimeMs
      const now = Date.now()
      const elapsed = now - room.lastTickServerTs
      if (elapsed < moverTime) {
        throw new HttpsError('failed-precondition', 'The clock has not run out yet.')
      }
      const winner = opposite(moverColor)

      const update: Partial<WizardRoomDoc> = {
        status: 'completed',
        winner,
        endReason: 'timeout',
        lastTickServerTs: null,
        updatedAt: now,
      }
      if (moverColor === 'w') update.whiteTimeMs = 0
      else update.blackTimeMs = 0
      await applyDuelPayouts(tx, room, winner)
      tx.update(ref, update)
      scheduleDuelAnnouncement(roomId, room, winner, 'timeout')
    })

    return { ok: true }
  },
)

// ── Duel completion side-effects ────────────────────────────────────────
//
// Payouts: winner +25, loser +5 (consolation). Both deducted via the
// existing castle-points mechanic — non-bypass guests only, since bypass
// guests have no persistent balance.
//
// Announcement: posted to the Hall as a system message AFTER the txn
// commits (best-effort, no retries — duplicate announcements are worse
// than missing ones). Uses scheduleDuelAnnouncement so we don't have to
// thread a deferred-write through every caller.

async function applyDuelPayouts(
  tx: Transaction,
  room: WizardRoomDoc,
  winner: Color,
): Promise<void> {
  const winnerSlot = winner === 'w' ? room.white : room.black
  const loserSlot = winner === 'w' ? room.black : room.white
  const db = getFirestore()
  const now = Date.now()
  const haloExpiresAt = now + DUEL_HALO_HOURS * 60 * 60 * 1000
  const crownExtensionMs = CROWN_HOURS * 60 * 60 * 1000

  // Firestore transactions require ALL reads before ANY writes. Earlier
  // this function read winner → wrote winner → read loser, which threw
  // INTERNAL whenever both players had castle accounts (i.e. the common
  // case). Batch the reads first, then issue both writes.
  const winnerRef = winnerSlot && !winnerSlot.isBypass && winnerSlot.normalizedName
    ? db.doc(`guests/${winnerSlot.normalizedName}`)
    : null
  const loserRef = loserSlot && !loserSlot.isBypass && loserSlot.normalizedName
    ? db.doc(`guests/${loserSlot.normalizedName}`)
    : null
  const [winnerSnap, loserSnap] = await Promise.all([
    winnerRef ? tx.get(winnerRef) : Promise.resolve(null),
    loserRef ? tx.get(loserRef) : Promise.resolve(null),
  ])

  if (winnerRef && winnerSnap && winnerSnap.exists) {
    const winnerDoc = winnerSnap.data() as GuestDoc
    const nextStreak = (winnerDoc.cosmetics?.winStreak ?? 0) + 1
    // Phase D: lifetime-earn lazy-migrates from current balance for old guests.
    const lifetimePrev = winnerDoc.lifetimeEarned ?? Math.max(0, winnerDoc.castlePoints)
    const updates: Record<string, unknown> = {
      castlePoints: FieldValue.increment(AWARD_CAPS.duelWinner),
      lifetimeEarned: lifetimePrev + AWARD_CAPS.duelWinner,
      'cosmetics.duelWinnerExpiresAt': haloExpiresAt,
      'cosmetics.winStreak': nextStreak,
    }
    // Hitting (or staying past) the threshold extends the crown another
    // CROWN_HOURS from now — so a sustained streak keeps the crown lit.
    if (nextStreak >= CROWN_THRESHOLD) {
      updates['cosmetics.winStreakCrownExpiresAt'] = now + crownExtensionMs
    }
    tx.update(winnerRef, updates)
    appendAuditTx(tx, {
      normalizedName: winnerSlot!.normalizedName!,
      // No specific actor — payout fires from the room's terminal state
      // (timeout / resign / checkmate). The caller varies per code path.
      uid: null,
      delta: AWARD_CAPS.duelWinner,
      before: winnerDoc.castlePoints,
      after: winnerDoc.castlePoints + AWARD_CAPS.duelWinner,
      source: 'duel:winner',
      metadata: { streak: nextStreak },
    })
  }
  if (loserRef && loserSnap && loserSnap.exists) {
    const loserDoc = loserSnap.data() as GuestDoc
    const lifetimePrev = loserDoc.lifetimeEarned ?? Math.max(0, loserDoc.castlePoints)
    tx.update(loserRef, {
      castlePoints: FieldValue.increment(AWARD_CAPS.duelLoser),
      lifetimeEarned: lifetimePrev + AWARD_CAPS.duelLoser,
      // Loss resets the streak; the crown lives out its natural expiry.
      'cosmetics.winStreak': 0,
    })
    appendAuditTx(tx, {
      normalizedName: loserSlot!.normalizedName!,
      uid: null,
      delta: AWARD_CAPS.duelLoser,
      before: loserDoc.castlePoints,
      after: loserDoc.castlePoints + AWARD_CAPS.duelLoser,
      source: 'duel:loser',
    })
  }
}

function scheduleDuelAnnouncement(
  roomId: string,
  room: WizardRoomDoc,
  winner: Color,
  reason: 'checkmate' | 'timeout' | 'resign',
): void {
  // Defer the Hall write to the next microtask so the room transaction
  // commits first. We don't await — duel responsiveness > announcement
  // certainty. Errors logged, not thrown.
  void Promise.resolve().then(async () => {
    try {
      const db = getFirestore()
      const winnerSlot = winner === 'w' ? room.white : room.black
      const loserSlot = winner === 'w' ? room.black : room.white
      const winnerName = winnerSlot?.displayName ?? 'Someone'
      const loserName = loserSlot?.displayName ?? 'their opponent'
      const flavor =
        reason === 'checkmate' ? 'checkmated' :
        reason === 'timeout' ? 'outlasted' :
        'won by resignation against'
      const msg: ChatMessageDoc = {
        name: 'Castle herald',
        uid: '',
        normalizedName: '',
        isBypass: false,
        kind: 'system',
        text: `🏆 ${winnerName} ${flavor} ${loserName} in a Wizard's Duel!`,
        ts: Date.now(),
        action: { kind: 'join-room', roomKind: 'wizard', roomId, openerName: winnerName },
      }
      await db.collection('lobby/messages/items').add(msg)
    } catch (err) {
      console.warn('scheduleDuelAnnouncement failed:', err)
    }
  })
}

// ── Helpers ─────────────────────────────────────────────────────────────

// Shapes the request into a seat. The displayName here is provisional:
// createWizardRoom / joinWizardRoom replace it with the guest doc's
// server-bound spelling once requireOwnedGuest has proven the name is
// the caller's, so a modified client can't sit down under someone
// else's nickname.
function validatePlayer(uid: string, data: unknown): PlayerSlot {
  const d = (data ?? {}) as { displayName?: unknown; normalizedName?: unknown; isBypass?: unknown; pieceSetId?: unknown }
  const displayName = String(d.displayName ?? '').trim().slice(0, 40)
  const normalizedName = String(d.normalizedName ?? '').trim().toLowerCase()
  const isBypass = d.isBypass === true
  if (!displayName) throw new HttpsError('invalid-argument', 'displayName required.')
  if (!isBypass && !normalizedName) throw new HttpsError('invalid-argument', 'normalizedName required for non-bypass.')
  const pieceSetId = sanitisePieceSetId(d.pieceSetId)
  return { uid, displayName, normalizedName, isBypass, ...(pieceSetId ? { pieceSetId } : {}) }
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
