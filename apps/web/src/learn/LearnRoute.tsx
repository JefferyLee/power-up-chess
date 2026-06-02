// LearnRoute — list of available lessons. Click → start the runner.
//
// Sequential progression isn't enforced; a kid can jump to any
// lesson. The Hall surfaces lesson 1 prominently for newcomers.

import { useNavigate } from 'react-router-dom'
import { HostPortrait } from '../castle/HostPortrait'
import { LESSONS } from './lessons'
import './LearnRoute.css'

export function LearnRoute() {
  const navigate = useNavigate()

  return (
    <div className="puc-learn">
      <header className="puc-learn__header">
        <button
          type="button"
          className="puc-learn__back"
          onClick={() => navigate('/')}
          aria-label="Back to castle"
        >
          ←
        </button>
        <h1 className="puc-learn__title">Learn chess</h1>
      </header>

      <main className="puc-learn__main">
        <p className="puc-learn__intro">
          Five short lessons, about five minutes each. Lucy and Luca will walk
          you through everything from how a knight jumps to how to start a game.
        </p>

        <ol className="puc-learn__list">
          {LESSONS.map((lesson, i) => (
            <li
              key={lesson.id}
              className="puc-learn__card"
            >
              <button
                type="button"
                className="puc-learn__card-btn"
                onClick={() => navigate(`/learn/${lesson.id}`)}
              >
                <span className="puc-learn__card-num">{i + 1}</span>
                <span className="puc-learn__card-portrait">
                  <HostPortrait hostId={lesson.hostId} variant="lobby" />
                </span>
                <span className="puc-learn__card-body">
                  <span className="puc-learn__card-title">{lesson.title}</span>
                  <span className="puc-learn__card-blurb">{lesson.blurb}</span>
                  <span className="puc-learn__card-meta">
                    ~{lesson.estimatedMinutes} min · {lesson.hostId === 'lucy' ? 'Lucy' : 'Luca'}
                  </span>
                </span>
                <span className="puc-learn__card-cta">Start →</span>
              </button>
            </li>
          ))}
        </ol>

        {LESSONS.length < 5 && (
          <p className="puc-learn__more">
            More lessons coming soon — captures, checkmate, special moves, and
            opening tips.
          </p>
        )}
      </main>
    </div>
  )
}
