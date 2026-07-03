// Floating circular "back to the Hall" button — fixed to the bottom-left
// corner of every routed screen except the Hall itself (the navigational
// root). Built for iPhone thumb reach in PWA standalone mode, where the
// top-left of the screen sits under the status bar / Dynamic Island.
//
// One tap ALWAYS returns to the Hall ('/') — not history.back(). A kid can
// wander review → archive → puzzle → … and still get home in exactly one
// tap, from anywhere, every time.

import { useLocation, useNavigate } from 'react-router-dom'
import './FloatingBack.css'

/** Routes where the floating button hides itself. The Hall is the
 *  navigational root; everywhere else is "below" it. */
const HIDDEN_ON: ReadonlySet<string> = new Set(['/'])

export function FloatingBack() {
  const navigate = useNavigate()
  const location = useLocation()
  if (HIDDEN_ON.has(location.pathname)) return null

  return (
    <button
      type="button"
      className="puc-fab-back"
      onClick={() => navigate('/')}
      aria-label="Back to the Hall"
      title="Back to the Hall"
    >
      <span aria-hidden="true">🏰</span>
    </button>
  )
}
