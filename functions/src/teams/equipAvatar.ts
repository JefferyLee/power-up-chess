// equipAvatar — set the signed-in guest's personal heraldic avatar.
//
// Reuses the team-badge sanitisation pipeline but strips the engraved-
// text fields: avatars don't get mottoes / monograms, only teams do.

import { getFirestore } from 'firebase-admin/firestore'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import type { TeamBadge } from '../castle/types'
import { sanitiseBadge } from './sanitiseBadge'

export interface EquipAvatarRequest {
  avatar: TeamBadge
}
export interface EquipAvatarResponse {
  ok: true
  avatar: TeamBadge
}

export const equipAvatar = onCall<EquipAvatarRequest, Promise<EquipAvatarResponse>>(
  async (req) => {
    if (!req.auth) throw new HttpsError('unauthenticated', 'Sign in first.')
    const uid = req.auth.uid

    const db = getFirestore()
    const idSnap = await db.doc(`chat_identity/${uid}`).get()
    const idData = idSnap.data() as
      | { displayName: string; normalizedName: string; isBypass: boolean }
      | undefined
    if (!idData || idData.isBypass || !idData.normalizedName) {
      throw new HttpsError('failed-precondition', 'Sign in with a magic word first.')
    }

    // Run through the same sanitiser as team badges, then strip the
    // text-related fields — avatars don't carry engraved text.
    const sanitised = sanitiseBadge(req.data?.avatar)
    const avatar: TeamBadge = {
      shape: sanitised.shape,
      layout: sanitised.layout,
      bg: sanitised.bg,
      ...(sanitised.bg2 ? { bg2: sanitised.bg2 } : {}),
      border: sanitised.border,
      symbol: sanitised.symbol,
      symbolColor: sanitised.symbolColor,
    }

    await db.doc(`guests/${idData.normalizedName}`).update({
      'cosmetics.avatar': avatar,
    })
    return { ok: true as const, avatar }
  },
)
