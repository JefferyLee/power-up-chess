// OpeningsRoute — list of opening lessons with per-opening progress
// from the guest doc (P2.J Slice 2).

import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { doc, onSnapshot } from 'firebase/firestore'
import { db } from '../firebase/app'
import { useCastle } from '../castle/useCastle'
import { OPENINGS } from './openings'
import './OpeningsRoute.css'

interface OpeningProgressDoc {
  openingProgress?: Partial<Record<string, {
    clearedIndexes?: number[]
    lessonMasteredAt?: number
  }>>
}

export function OpeningsRoute() {
  const navigate = useNavigate()
  const { identity } = useCastle()
  const [progress, setProgress] = useState<OpeningProgressDoc['openingProgress']>({})

  useEffect(() => {
    if (!identity || identity.isBypass) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setProgress({})
      return
    }
    const ref = doc(db, 'guests', identity.normalizedName)
    const unsub = onSnapshot(ref, (snap) => {
      const data = snap.data() as OpeningProgressDoc | undefined
      setProgress(data?.openingProgress ?? {})
    })
    return () => unsub()
  }, [identity])

  return (
    <div className="puc-op">
      <header className="puc-op__header">
        <button
          type="button"
          className="puc-op__back"
          onClick={() => navigate('/')}
          aria-label="Back to hall"
        >
          ←
        </button>
        <div className="puc-op__title-wrap">
          <h1 className="puc-op__title">Opening Trainer</h1>
          <p className="puc-op__sub">
            Find the principled move. Clear each position for 5 castle
            points; master the whole opening for a 20-point bonus.
          </p>
        </div>
      </header>

      <main className="puc-op__main">
        <div className="puc-op__grid">
          {OPENINGS.map((opening) => {
            const op = progress?.[opening.id]
            const clearedCount = op?.clearedIndexes?.length ?? 0
            const total = opening.positions.length
            const mastered = !!op?.lessonMasteredAt
            return (
              <button
                key={opening.id}
                type="button"
                className={
                  'puc-op__card ' + (mastered ? 'puc-op__card--mastered' : '')
                }
                onClick={() => navigate(`/openings/${opening.id}`)}
              >
                <div className="puc-op__card-flavour" aria-hidden="true">
                  {opening.flavour}
                </div>
                <h2 className="puc-op__card-title">{opening.name}</h2>
                <p className="puc-op__card-blurb">{opening.blurb}</p>
                <div className="puc-op__card-progress" aria-label="Progress">
                  <div className="puc-op__card-progress-bar">
                    <div
                      className="puc-op__card-progress-fill"
                      style={{ width: `${(clearedCount / total) * 100}%` }}
                    />
                  </div>
                  <span className="puc-op__card-progress-text">
                    {mastered
                      ? '✓ Mastered'
                      : `${clearedCount} / ${total} positions`}
                  </span>
                </div>
                <div className="puc-op__card-meta">
                  <span className="puc-op__card-cta">
                    {mastered ? 'Replay →' : clearedCount > 0 ? 'Continue →' : 'Start →'}
                  </span>
                </div>
              </button>
            )
          })}
        </div>

        <p className="puc-op__note">
          Branching variations (Black’s alternatives, sidelines) land in a
          later slice. For now each opening is one main line.
        </p>
      </main>
    </div>
  )
}
