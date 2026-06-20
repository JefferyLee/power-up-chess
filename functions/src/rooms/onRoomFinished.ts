// Firestore trigger that fires when an online chess room transitions
// into a final state. Updates both players' Elo (chessRating) and
// increments their rated-game count (chessGames). Bypass guests have
// no GuestDoc and are silently skipped.
//
// Why a trigger instead of inlining in submitMove / resignGame /
// claimTimeWin: there are three independent finalisation paths and a
// trigger keeps the rating logic in one place. Re-firings on the same
// document are idempotent because we gate on the status TRANSITION
// (before !== 'completed' && after === 'completed').

import { onDocumentUpdated } from 'firebase-functions/v2/firestore'
import { getFirestore } from 'firebase-admin/firestore'
import {
  ELO_DEFAULT,
  ELO_K_PROVISIONAL,
  ELO_K_SEASONED,
  ELO_PROVISIONAL_GAMES,
  type GuestDoc,
} from '../castle/types'
import { appendRecentlyPlayedTx } from '../castle/recentlyPlayed'
import { archiveFinishedGame } from './playerGames'
import type { RoomDoc } from './types'

function normalizeName(name: string): string {
  return name.trim().toLowerCase()
}

function kFactor(games: number): number {
  return games < ELO_PROVISIONAL_GAMES ? ELO_K_PROVISIONAL : ELO_K_SEASONED
}

/** Standard Elo expected score for `self` vs `opp`. */
function expectedScore(self: number, opp: number): number {
  return 1 / (1 + Math.pow(10, (opp - self) / 400))
}

/** Result-as-score for the white side. Black is 1 - that. */
function whiteScore(result: 'white' | 'black' | 'draw'): number {
  if (result === 'white') return 1
  if (result === 'black') return 0
  return 0.5
}

export const onRoomFinished = onDocumentUpdated('rooms/{roomId}', async (event) => {
  const before = event.data?.before.data() as RoomDoc | undefined
  const after = event.data?.after.data() as RoomDoc | undefined
  if (!before || !after) return
  // Only react to the transition INTO completed, with a real result.
  if (before.status === 'completed') return
  if (after.status !== 'completed') return
  if (!after.result) return
  if (!after.black) return  // shouldn't happen — finished games always had a joiner

  const db = getFirestore()
  const whiteName = normalizeName(after.white.displayName)
  const blackName = normalizeName(after.black.displayName)
  if (!whiteName || !blackName || whiteName === blackName) return

  // Archive the finished game into both players' history subcollections.
  // Independent of (and before) the rating transaction so it happens
  // even when a side is a bypass guest who earns no rating.
  await archiveFinishedGame(event.params.roomId, after)

  await db.runTransaction(async (tx) => {
    const whiteRef = db.collection('guests').doc(whiteName)
    const blackRef = db.collection('guests').doc(blackName)
    const [whiteSnap, blackSnap] = await Promise.all([tx.get(whiteRef), tx.get(blackRef)])
    // Bypass guests have no doc — skip rating altogether if either side is anonymous.
    if (!whiteSnap.exists || !blackSnap.exists) return

    const whiteDoc = whiteSnap.data() as GuestDoc
    const blackDoc = blackSnap.data() as GuestDoc
    const whiteR = whiteDoc.chessRating ?? ELO_DEFAULT
    const blackR = blackDoc.chessRating ?? ELO_DEFAULT
    const whiteG = whiteDoc.chessGames ?? 0
    const blackG = blackDoc.chessGames ?? 0

    const sWhite = whiteScore(after.result!)
    const sBlack = 1 - sWhite
    const eWhite = expectedScore(whiteR, blackR)
    const eBlack = 1 - eWhite

    const whiteDelta = Math.round(kFactor(whiteG) * (sWhite - eWhite))
    const blackDelta = Math.round(kFactor(blackG) * (sBlack - eBlack))

    tx.update(whiteRef, {
      chessRating: whiteR + whiteDelta,
      chessRatingDelta: whiteDelta,
      chessGames: whiteG + 1,
    })
    tx.update(blackRef, {
      chessRating: blackR + blackDelta,
      chessRatingDelta: blackDelta,
      chessGames: blackG + 1,
    })

    // Recently-played-with: each side bumps the other to the top of
    // their own list. Uses the displayName off the room (which is the
    // server-stored copy of what was on each player's identity at
    // game-start) so the casing stays nice.
    const now = Date.now()
    const blackPlayer = after.black!
    appendRecentlyPlayedTx(
      tx,
      whiteRef,
      whiteDoc,
      { normalizedName: blackName, displayName: blackPlayer.displayName },
      now,
    )
    appendRecentlyPlayedTx(
      tx,
      blackRef,
      blackDoc,
      { normalizedName: whiteName, displayName: after.white.displayName },
      now,
    )
  })
})
