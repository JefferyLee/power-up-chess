// Floating circular "back to the Hall" button — fixed to the bottom-left
// corner of every routed screen except the Hall itself (the navigational
// root). Built for iPhone thumb reach in PWA standalone mode, where the
// top-left of the screen sits under the status bar / Dynamic Island.
//
// One tap ALWAYS returns to the Hall ('/') — not history.back(). A kid can
// wander review → archive → puzzle → … and still get home in exactly one
// tap, from anywhere, every time.

import { useLocation, useNavigate } from 'react-router-dom'
import { babelReturnUrl } from './babel'
import './FloatingBack.css'

/** Routes where the floating button hides itself. The Hall is the
 *  navigational root; everywhere else is "below" it. */
const HIDDEN_ON: ReadonlySet<string> = new Set(['/'])

export function FloatingBack() {
  const navigate = useNavigate()
  const location = useLocation()
  const hallHidden = HIDDEN_ON.has(location.pathname)
  // Visitors who walked in from the Corner of Babel get a second disc,
  // stacked above the castle one, that leads back to the library door
  // they came through. It shows in the Hall too — that's where they are.
  const babelUrl = babelReturnUrl()
  if (hallHidden && !babelUrl) return null

  return (
    <>
      {babelUrl && (
        <a
          className={`puc-fab-back puc-fab-babel${hallHidden ? ' puc-fab-babel--alone' : ''}`}
          href={babelUrl}
          aria-label="Back to the Corner of Babel"
          title="Back to the Corner of Babel"
        >
          <span aria-hidden="true">📚</span>
        </a>
      )}
      {!hallHidden && (
        <button
          type="button"
          className="puc-fab-back"
          onClick={() => navigate('/')}
          aria-label="Back to the Hall"
          title="Back to the Hall"
        >
          <span aria-hidden="true">🏰</span>
        </button>
      )}
    </>
  )
}
