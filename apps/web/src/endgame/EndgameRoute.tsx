// EndgameRoute — list of endgame technique drills with per-lesson
// progress badges from the guest doc (P2.K Slice 3).

import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { doc, onSnapshot } from 'firebase/firestore'
import { db } from '../firebase/app'
import { useCastle } from '../castle/useCastle'
import { LESSONS } from './lessons'
import './EndgameRoute.css'

interface EndgameProgressDoc {
  endgameProgress?: Partial<Record<string, {
    clearedPositions?: string[]
    lessonMasteredAt?: number
  }>>
}

export function EndgameRoute() {
  const navigate = useNavigate()
  const { identity } = useCastle()
  const [progress, setProgress] = useState<EndgameProgressDoc['endgameProgress']>({})

  useEffect(() => {
    if (!identity || identity.isBypass) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setProgress({})
      return
    }
    const ref = doc(db, 'guests', identity.normalizedName)
    const unsub = onSnapshot(ref, (snap) => {
      const data = snap.data() as EndgameProgressDoc | undefined
      setProgress(data?.endgameProgress ?? {})
    })
    return () => unsub()
  }, [identity])

  return (
    <div className="puc-eg">
      <header className="puc-eg__header">
        <button
          type="button"
          className="puc-eg__back"
          onClick={() => navigate('/')}
          aria-label="Back to hall"
        >
          ←
        </button>
        <div className="puc-eg__title-wrap">
          <h1 className="puc-eg__title">Endgame Drills</h1>
          <p className="puc-eg__sub">
            Practise the classic checkmate techniques against an unforgiving
            defender. Clear each position for 5 castle points; master the
            whole lesson for a 20-point bonus.
          </p>
        </div>
      </header>

      <main className="puc-eg__main">
        <div className="puc-eg__grid">
          {LESSONS.map((lesson) => {
            const lp = progress?.[lesson.id]
            const clearedCount = lp?.clearedPositions?.length ?? 0
            const total = lesson.positions.length
            const mastered = !!lp?.lessonMasteredAt
            return (
              <button
                key={lesson.id}
                type="button"
                className={
                  'puc-eg__card ' + (mastered ? 'puc-eg__card--mastered' : '')
                }
                onClick={() => navigate(`/endgame/${lesson.id}`)}
              >
                <div className="puc-eg__card-pieces" aria-hidden="true">
                  {lesson.pieceSummary}
                </div>
                <div className="puc-eg__card-body">
                  <h2 className="puc-eg__card-title">{lesson.title}</h2>
                  <p className="puc-eg__card-goal">{lesson.goal}</p>
                  <p className="puc-eg__card-tech">{lesson.technique}</p>
                  <div className="puc-eg__card-progress" aria-label="Progress">
                    <div className="puc-eg__card-progress-bar">
                      <div
                        className="puc-eg__card-progress-fill"
                        style={{ width: `${(clearedCount / total) * 100}%` }}
                      />
                    </div>
                    <span className="puc-eg__card-progress-text">
                      {mastered
                        ? '✓ Mastered'
                        : `${clearedCount} / ${total} cleared`}
                    </span>
                  </div>
                </div>
                <div className="puc-eg__card-cta">
                  {mastered ? 'Replay →' : clearedCount > 0 ? 'Continue →' : 'Drill →'}
                </div>
              </button>
            )
          })}
        </div>
      </main>
    </div>
  )
}
