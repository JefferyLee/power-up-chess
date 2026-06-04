// Shared helpers for tearing a team down — used by disbandTeam,
// leaveTeam (last-member case), and the future cron sweep.

import type { FieldValue, Firestore, Transaction } from 'firebase-admin/firestore'
import { FieldValue as FV } from 'firebase-admin/firestore'
import type { TeamDoc } from '../castle/types'

/** Delete the team doc + free the name lock + strip teamId from every
 *  member's guest doc. Must be called inside a transaction; every
 *  guest doc and the name-lock doc must have been read in the same
 *  txn first (the helper does its own reads). */
export async function disbandTeamTx(
  tx: Transaction,
  team: TeamDoc,
  db: Firestore,
): Promise<void> {
  // Read every member's guest doc + the name-lock — required because
  // we'll write to them after; Firestore txns require all reads before
  // any writes.
  const memberRefs = team.members.map((m) => db.doc(`guests/${m.normalizedName}`))
  const nameLockRef = db.doc(`team_names/${encodeURIComponent(team.normalizedName)}`)
  const memberSnaps = await Promise.all(memberRefs.map((r) => tx.get(r)))
  const lockSnap = await tx.get(nameLockRef)

  // Phase 2: writes.
  for (let i = 0; i < memberRefs.length; i++) {
    if (memberSnaps[i]?.exists) {
      tx.update(memberRefs[i]!, { teamIds: (FV as unknown as typeof FieldValue).arrayRemove(team.teamId) })
    }
  }
  if (lockSnap.exists) tx.delete(nameLockRef)
  tx.delete(db.doc(`teams/${team.teamId}`))
}
