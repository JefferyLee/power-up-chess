// useTakeback — the paid, 3-per-game takeback ("悔棋") for games the
// device owns (Local and AI). The account is charged first; the board
// only reverts once the charge lands. Online rooms need the opponent's
// consent and go through the server instead (OnlineGameScreen).

import { useCallback, useMemo, useState } from 'react'
import { useCastle } from '../castle/useCastle'
import { callSpendOnTakeback } from '../firebase/callables'
import { takebackCost } from './takeback'

import { friendlyError } from '../errors/friendlyError'
export interface TakebackApi {
  /** Cost of the next takeback, or null once the limit is reached. */
  nextCost: number | null
  canTakeback: boolean
  /** The only thing in the way is castle points. */
  tooPoor: boolean
  takeback: () => Promise<void>
  /** Why the last takeback didn't happen (charge refused). Cleared on the next try / reset. */
  error: string | null
  /** New game → three takebacks again. */
  reset: () => void
}

/** `allowed` is the screen's own gate (game on, your turn, plies to
 *  revert…); `undo` reverts the board. */
export function useTakeback(allowed: boolean, undo: () => void): TakebackApi {
  const { identity, setCastlePoints } = useCastle()
  const [used, setUsed] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const nextCost = takebackCost(used)
  const signedIn = !!identity && !identity.isBypass
  const tooPoor = signedIn && nextCost !== null && identity.castlePoints < nextCost
  const canTakeback = allowed && signedIn && nextCost !== null && !tooPoor && !busy

  const takeback = useCallback(async () => {
    if (!canTakeback || !identity) return
    setBusy(true)
    setError(null)
    try {
      const points = await callSpendOnTakeback(
        identity.normalizedName,
        identity.sessionId ?? '',
        used + 1,
      )
      setCastlePoints(points)
      undo()
      setUsed((n) => n + 1)
    } catch (e) {
      // Charge refused (balance / session) — the board stays as it is.
      setError(friendlyError(e, 'paying for the takeback'))
    } finally {
      setBusy(false)
    }
  }, [canTakeback, identity, used, undo, setCastlePoints])

  const reset = useCallback(() => { setUsed(0); setError(null) }, [])

  return useMemo(
    () => ({ nextCost, canTakeback, tooPoor, takeback, error, reset }),
    [nextCost, canTakeback, tooPoor, takeback, error, reset],
  )
}
