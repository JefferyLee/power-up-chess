// OpeningsRoute — list of opening lessons.

import { useNavigate } from 'react-router-dom'
import { OPENINGS } from './openings'
import './OpeningsRoute.css'

export function OpeningsRoute() {
  const navigate = useNavigate()
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
            Find the principled move. Each lesson walks through a famous
            opening one decision at a time.
          </p>
        </div>
      </header>

      <main className="puc-op__main">
        <div className="puc-op__grid">
          {OPENINGS.map((opening) => (
            <button
              key={opening.id}
              type="button"
              className="puc-op__card"
              onClick={() => navigate(`/openings/${opening.id}`)}
            >
              <div className="puc-op__card-flavour" aria-hidden="true">
                {opening.flavour}
              </div>
              <h2 className="puc-op__card-title">{opening.name}</h2>
              <p className="puc-op__card-blurb">{opening.blurb}</p>
              <div className="puc-op__card-meta">
                <span>{opening.positions.length} positions</span>
                <span className="puc-op__card-cta">Start →</span>
              </div>
            </button>
          ))}
        </div>

        <p className="puc-op__note">
          Branching variations (Black’s alternatives, sidelines) land in a
          later slice. For now each opening is one main line.
        </p>
      </main>
    </div>
  )
}
