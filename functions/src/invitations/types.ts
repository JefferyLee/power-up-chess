// Player-to-player chess invitation data model.
//
// Lifecycle:
//   sendInvite → 'pending'                        (sender pays 5 CP up-front)
//     ├─ respondInvite('accept')  → 'accepted'    (server spawns the room, sets roomId)
//     ├─ respondInvite('decline') → 'declined'
//     ├─ respondInvite('ignore')  → 'ignored'
//     ├─ cancelInvite             → 'cancelled'   (sender bails before recipient sees it)
//     └─ TTL elapses              → 'expired'     (treated as expired by client filter,
//                                                   doc deleted by scheduled sweep)
//
// All transitions are once-only (status === 'pending' guard inside the txn).

import type { TimeControl } from '../rooms/types'

export type InvitationStatus =
  | 'pending'
  | 'accepted'
  | 'declined'
  | 'ignored'
  | 'cancelled'
  | 'expired'

export interface InvitationDoc {
  /** Mirrors the Firestore document id; redundant but convenient on reads. */
  inviteId: string

  fromUid: string
  /** Display name at send time — snapshot so historical lists render correctly. */
  fromName: string
  /** Normalized lookup key for guests/{name}. */
  fromNormalizedName: string

  /** Convenience field — the freshest known uid for the recipient. Used
   *  as the room's black.playerId on accept. */
  toUid: string
  /** Every known uid for the recipient (capped to the most recent N).
   *  Drives the recipient's onSnapshot via array-contains so an invite
   *  reaches whichever device the recipient is currently using —
   *  Anonymous Auth mints a fresh uid per browser/device, so the same
   *  magic-word account can hold several. */
  toUids: string[]
  toName: string
  toNormalizedName: string

  timeControl: TimeControl | null
  /** Picked server-side at send time so neither side can spoof their preferred host. */
  hostMode: 'lucy' | 'luca'

  /** Sender's equipped piece-set id at send time. Carried through to the
   *  spawned room's white.pieceSetId on accept so the sender's pieces
   *  render in their chosen set on both players' screens. */
  fromPieceSetId?: string

  status: InvitationStatus
  createdAt: number
  /** UTC ms; client filters out invitations past this even before TTL sweep. */
  expiresAt: number

  /** Set on accept; the spawned room id. */
  roomId?: string
}

/** Invitations expire 60 s after send. Long enough to glance + decide,
 *  short enough that a forgotten invite doesn't sit in the inbox. */
export const INVITE_TTL_MS = 60_000

/** 5 castle points to send — same as the chess room open cost, charged
 *  whether the invitation is accepted, declined, ignored, or expires.
 *  On accept the room itself is free since the sender already paid. */
export const INVITE_COST_CP = 5

/** Per-uid daily cap. The 5 CP cost is the primary throttle; this is a
 *  hard ceiling that catches stuck retry loops. */
export const INVITE_DAILY_LIMIT = 20
