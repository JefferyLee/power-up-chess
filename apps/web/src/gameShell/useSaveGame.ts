// useSaveGame — persist a finished game exactly once per id: the
// IndexedDB history, a `game_end` analytics event and, for a signed-in
// guest, the account archive so "my games" follow the name + magic
// word to any device. Screens hand in a memoised record (null while
// the game is still going); the hook stamps `playedAt`.

import { useEffect, useRef } from 'react'
import { useCastle } from '../castle/useCastle'
import { track } from '../firebase/analytics'
import { callSyncDeviceGame } from '../firebase/callables'
import { saveGame } from '../history/api'
import type { SavedGame } from '../history/db'

export interface FinishedGame {
  record: Omit<SavedGame, 'playedAt'> & { playedAt?: number }
  /** Extra fields on the `game_end` analytics event. */
  trackExtra?: Record<string, string | number>
  /** Mirror to the account archive — Local and AI games only; online
   *  rooms are archived by the server. */
  sync?: boolean
}

export function useSaveGame(finished: FinishedGame | null): void {
  const { identity } = useCastle()
  const savedIdRef = useRef<string | null>(null)
  useEffect(() => {
    if (!finished || savedIdRef.current === finished.record.id) return
    savedIdRef.current = finished.record.id
    const { trackExtra, sync } = finished
    const record: SavedGame = { playedAt: Date.now(), ...finished.record }
    track('game_end', {
      mode: record.mode,
      result: record.result,
      end_reason: record.endReason,
      move_count: record.moveCount,
      ...trackExtra,
    })
    saveGame(record).catch((err) => {
      console.warn(`[history] failed to save ${record.mode} game`, err)
    })
    if (sync && record.mode !== 'online' && identity && !identity.isBypass) {
      const { finalFen: _finalFen, mode, ...rest } = record
      void callSyncDeviceGame({ ...rest, mode }).catch(() => { /* offline is fine */ })
    }
  }, [finished, identity])
}
