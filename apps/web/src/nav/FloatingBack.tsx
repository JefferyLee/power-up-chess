// Floating circular "back" button — fixed to the bottom-left corner
// of every routed screen except the Hall (the top-level page; nothing
// to go back to). Built for iPhone thumb reach in PWA standalone
// mode, where the top-left of the screen sits under the status bar /
// Dynamic Island and can be genuinely unreachable.
//
// Defaults: tap → window.history.back(), or '/' as a safety net when
// the user landed here via a direct deep link.

import { useLocation, useNavigate } from 'react-router-dom'
import './FloatingBack.css'

interface Props {
  /** When set, tap navigates here instead of going back in history. */
  to?: string
  /** Override the tap handler entirely (confirm-and-leave flows). */
  onBack?: () => void
}

/** Routes where the floating back hides itself. The Hall is the
 *  navigational root; everywhere else is "below" it. */
const HIDDEN_ON: ReadonlySet<string> = new Set(['/'])

export function FloatingBack({ to, onBack }: Props = {}) {
  const navigate = useNavigate()
  const location = useLocation()
  if (HIDDEN_ON.has(location.pathname)) return null

  const handle = () => {
    if (onBack) { onBack(); return }
    if (to) { navigate(to); return }
    if (window.history.length > 1) navigate(-1)
    else navigate('/')
  }

  return (
    <button
      type="button"
      className="puc-fab-back"
      onClick={handle}
      aria-label="Back"
      title="Back"
    >
      <span aria-hidden="true">←</span>
    </button>
  )
}
