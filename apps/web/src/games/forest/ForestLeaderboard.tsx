// Top-10 Forest scores, fetched fresh whenever refreshKey changes (the
// route bumps the key after each completed run).

import { useEffect, useState } from 'react'
import { collection, getDocs, limit, orderBy, query } from 'firebase/firestore'
import { db } from '../../firebase/app'
import './ForestLeaderboard.css'
import { useAuthUid } from '../../auth/useAuthUid'

interface Row {
  normalizedName: string
  displayName: string
  best: number
}

export function ForestLeaderboard({
  refreshKey,
  youNormalizedName,
}: {
  refreshKey: number
  youNormalizedName: string
}) {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [err, setErr] = useState<string | null>(null)

  // Wait for anonymous auth — a read before sign-in is denied by the rules.
  const authReady = useAuthUid().status === 'ready'
  useEffect(() => {
    if (!authReady) return
    let cancelled = false
    const load = async () => {
      try {
        const q = query(collection(db, 'forest_leaderboard'), orderBy('best', 'desc'), limit(10))
        const snap = await getDocs(q)
        if (cancelled) return
        setRows(snap.docs.map((d) => d.data() as Row))
        setErr(null)
      } catch (e) {
        if (cancelled) return
        setErr(e instanceof Error ? e.message : String(e))
      }
    }
    void load()
    return () => { cancelled = true }
  }, [refreshKey, authReady])

  return (
    <div className="puc-forestlb">
      <h3 className="puc-forestlb__title">Top Forest Scores</h3>
      {err && <p className="puc-forestlb__err">couldn&apos;t load — {err}</p>}
      {!err && rows === null && <p className="puc-forestlb__empty">loading…</p>}
      {!err && rows && rows.length === 0 && (
        <p className="puc-forestlb__empty">nobody has finished a run yet — be the first!</p>
      )}
      {!err && rows && rows.length > 0 && (
        <ol className="puc-forestlb__list">
          {rows.map((r, i) => (
            <li
              key={r.normalizedName}
              className={`puc-forestlb__row${r.normalizedName === youNormalizedName ? ' puc-forestlb__row--you' : ''}`}
            >
              <span className="puc-forestlb__rank">{i + 1}</span>
              <span className="puc-forestlb__name">{r.displayName}</span>
              <span className="puc-forestlb__score">{r.best}</span>
            </li>
          ))}
        </ol>
      )}
      <p className="puc-forestlb__note">
        Forest scores are separate from castle points — they live here in the Forest leaderboard.
      </p>
    </div>
  )
}
