// Client-side mirror of the server's invitations types. Re-declared here
// instead of imported from functions/ so the web bundle doesn't carry the
// functions-side dependency graph.

import type { TimeControl } from '../clock/timeControl'

export type InvitationStatus =
  | 'pending'
  | 'accepted'
  | 'declined'
  | 'ignored'
  | 'cancelled'
  | 'expired'

export interface InvitationDoc {
  inviteId: string
  fromUid: string
  fromName: string
  fromNormalizedName: string
  /** Legacy single-uid field; redundant with toUids on new docs. */
  toUid: string
  /** Every known uid for the recipient. The listener uses
   *  array-contains so an invite reaches whichever device the recipient
   *  is currently signed in on. */
  toUids: string[]
  toName: string
  toNormalizedName: string
  timeControl: TimeControl | null
  hostMode: 'lucy' | 'luca'
  status: InvitationStatus
  createdAt: number
  expiresAt: number
  roomId?: string
}

/** Server constants surfaced for client copy ("send for 5 ✦") and timer UX. */
export const INVITE_COST_CP = 5
export const INVITE_TTL_MS = 60_000
