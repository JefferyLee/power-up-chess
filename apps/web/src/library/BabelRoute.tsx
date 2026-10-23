// BabelRoute — the room behind the small door at the foot of the
// Library's shelves. It is Jeff's own corner of the Library of Babel,
// already built and served at zhipeng.li; the castle just opens the
// door and shows it inside the frame, so the kid never really leaves.

import { useNavigate } from 'react-router-dom'
import './BabelRoute.css'

const BABEL_URL = 'https://zhipeng.li/'

export function BabelRoute() {
  const navigate = useNavigate()
  return (
    <div className="puc-babel">
      <button
        type="button"
        className="puc-babel__back"
        onClick={() => navigate('/library')}
        aria-label="Back to the Library"
      >
        ← The Library
      </button>
      <iframe
        className="puc-babel__frame"
        src={BABEL_URL}
        title="A Corner of the Library of Babel"
        allow="fullscreen"
        referrerPolicy="no-referrer"
      />
      <a
        className="puc-babel__external"
        href={BABEL_URL}
        target="_blank"
        rel="noopener noreferrer"
      >
        Open in a new tab ↗
      </a>
    </div>
  )
}
