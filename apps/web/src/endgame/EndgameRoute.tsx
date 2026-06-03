// EndgameRoute — list of endgame technique drills (P2.K Slice 1).

import { useNavigate } from 'react-router-dom'
import { LESSONS } from './lessons'
import './EndgameRoute.css'

export function EndgameRoute() {
  const navigate = useNavigate()
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
            defender.
          </p>
        </div>
      </header>

      <main className="puc-eg__main">
        <div className="puc-eg__grid">
          {LESSONS.map((lesson) => (
            <button
              key={lesson.id}
              type="button"
              className="puc-eg__card"
              onClick={() => navigate(`/endgame/${lesson.id}`)}
            >
              <div className="puc-eg__card-pieces" aria-hidden="true">
                {lesson.pieceSummary}
              </div>
              <div className="puc-eg__card-body">
                <h2 className="puc-eg__card-title">{lesson.title}</h2>
                <p className="puc-eg__card-goal">{lesson.goal}</p>
                <p className="puc-eg__card-tech">{lesson.technique}</p>
              </div>
              <div className="puc-eg__card-cta">Drill →</div>
            </button>
          ))}
        </div>

        <p className="puc-eg__note">
          More positions (K + P vs K opposition, basic pawn endings) arrive
          once the hint system lands.
        </p>
      </main>
    </div>
  )
}
