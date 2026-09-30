// castle_point_audit — append-only ledger for every CP balance change.
//
// Instrumented call sites (write to this collection):
//   castleEnter (starter / check-in / streak / decay)
//   awardCastlePoints (puzzle / chess-win / chess-review / mystery)
//   submitPuzzleAttempt (puzzle:solve, puzzle:daily-bonus)
//   submitEndgameClear / submitOpeningClear (position / lesson-master)
//   submitForestScore (forest:run)
//   closeTournament (tournament:winner)
//   awardTutorialComplete (tutorial:complete)
//   purchaseCosmetic (purchase:<pieceSetId>)
//   createRoom / createWizardRoom (room-open:chess / room-open:wizard)
//   submitWizardSpell (wizard-spell:<id>)
//   applyDuelPayouts → resignWizardGame + claimWizardTimeWin + submitWizardMove
//                       (duel:winner / duel:loser)
//   sendInvite (invite:send)
//   createTeam (team:create)
//
// Not yet instrumented (low value or low blast radius):
//   postChat — 1 CP/message, high volume, would dominate the ledger.
//             Add if abuse pattern develops.
//   castSkill — currently paused (not exported from index.ts).
//

//
// Why this exists: until this collection, the only record of a CP change
// was the overwritten castlePoints number on the guest doc. If a kid
// showed up with 1500 CP worth of cosmetics after solving zero puzzles,
// there was no way to trace where the points came from. Now every
// callable that mutates castlePoints writes a row here in the same
// transaction, so the trail is atomic and tamper-proof at the rules
// layer (Firestore rules deny all client access).
//
// Schema is intentionally flat — no subcollections, single index on
// (normalizedName, serverTs desc) for "show me the last N changes for
// this guest" queries. Add fields here as needed; never break removals.

import { getFirestore } from 'firebase-admin/firestore'
import type { Transaction } from 'firebase-admin/firestore'
import { hashIp } from './ipGeo'

export interface CpAuditEntry {
  /** Lower-cased guest name — same key shape as guests/{name}. */
  normalizedName: string
  /** Auth uid that triggered the change. null for scheduled writes. */
  uid: string | null
  /** Signed delta. -1500 for a purchase, +25 for a duel win, etc. */
  delta: number
  /** castlePoints BEFORE this entry was applied. */
  before: number
  /** castlePoints AFTER this entry was applied. */
  after: number
  /** Source label, format `'group:detail'`. Examples:
   *    'castleEnter:starter' / 'castleEnter:check-in' / 'castleEnter:streak'
   *    'castleEnter:decay'  (negative delta)
   *    'award:puzzle' / 'award:chess-win:ai-medium' / 'award:chess-review' / 'award:mystery'
   *    'puzzle:solve' / 'puzzle:daily-bonus'
   *    'endgame:position' / 'endgame:lesson-master'
   *    'opening:position' / 'opening:lesson-master'
   *    'forest:run'
   *    'tournament:winner'
   *    'tutorial:complete'
   *    'purchase:<pieceSetId>'
   *    'room-open:chess' / 'room-open:wizard'
   *    'wizard-spell:<spellId>'
   *    'duel:winner' / 'duel:loser'
   *    'invite:send'
   *    'team:create'
   *    'chat:post'
   *  Always lowercase. */
  source: string
  /** Optional structured context — puzzle id, opponent id, room id, etc.
   *  Keep small (Firestore doc limit is 1 MiB; we expect ~1k entries
   *  per guest per year, so room is ample but don't dump objects). */
  metadata?: Record<string, string | number | boolean>
  /** HMAC-SHA256 of the client IP at write time (ipGeo.hashIp) so admin
   *  investigations can still ask "same source as that other change?"
   *  without a raw address ever landing in Firestore. Absent for
   *  scheduled / server-initiated writes. */
  ipHash?: string
  /** Server-side wall clock at write time (ms). */
  serverTs: number
}

/** What call sites hand us: the row minus the server-filled fields,
 *  plus the RAW client IP from extractIp(). It is hashed here and never
 *  written, so no call site has to know about hashing. */
export type CpAuditInput = Omit<CpAuditEntry, 'serverTs' | 'ipHash'> & { ip?: string }

/** Pure: the exact document that gets persisted for an input. */
export function toAuditRecord(entry: CpAuditInput, now = Date.now()): CpAuditEntry {
  const { ip, ...rest } = entry
  return { ...rest, ...(ip ? { ipHash: hashIp(ip) } : {}), serverTs: now }
}

/** Append a CP-change row in the SAME transaction as the castlePoints
 *  write. Use this in every callable that runs inside `runTransaction`.
 *  The ledger entry succeeds iff the balance change succeeds — no
 *  drift between truth and trail. */
export function appendAuditTx(tx: Transaction, entry: CpAuditInput): void {
  const ref = getFirestore().collection('castle_point_audit').doc()
  tx.set(ref, toAuditRecord(entry))
}

/** Standalone variant — use ONLY when the CP write itself can't be
 *  inside a transaction (rare: postChat does this for the 1-CP chat
 *  cost, for example). The audit happens after the fact so a crash
 *  between the two leaves a gap; prefer appendAuditTx whenever you
 *  can move the CP write into a tx. */
export async function appendAudit(entry: CpAuditInput): Promise<void> {
  await getFirestore().collection('castle_point_audit').add(toAuditRecord(entry))
}
