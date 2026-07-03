// Settings block on the Adventurer's Plaque: the template-only hosts switch
// (parental AI-privacy / offline toggle), the public-leaderboard visibility
// opt-out (Phase 3.7), and a link to the privacy note (Phase 3.8).

import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useTemplateOnly, setTemplateOnly } from '../hosts/templateOnly'
import { callSetPrivacyPrefs } from '../firebase/callables'
import { useCastle } from '../castle/useCastle'
import './SettingsPanel.css'

const HIDE_LB_KEY = 'puc:hide-leaderboards'

export function SettingsPanel() {
  const templateOnly = useTemplateOnly()
  const { identity } = useCastle()
  // Server is the source of truth; localStorage just remembers the last
  // choice so the checkbox renders correctly without an extra fetch.
  const [hideLb, setHideLb] = useState(() => {
    try { return localStorage.getItem(HIDE_LB_KEY) === '1' } catch { return false }
  })
  const [savingLb, setSavingLb] = useState(false)

  const toggleHideLb = async (next: boolean) => {
    if (!identity || identity.isBypass) return
    setSavingLb(true)
    try {
      await callSetPrivacyPrefs(identity.normalizedName, next)
      setHideLb(next)
      try { localStorage.setItem(HIDE_LB_KEY, next ? '1' : '0') } catch { /* ok */ }
    } catch { /* leave as-is; user can retry */ } finally {
      setSavingLb(false)
    }
  }

  return (
    <section className="puc-settings">
      <h3 className="puc-settings__title">Settings</h3>
      <label className="puc-settings__row">
        <span className="puc-settings__text">
          <b className="puc-settings__label">Template-only hosts</b>
          <span className="puc-settings__hint">
            Turns off AI commentary on your games — Lucy &amp; Luca use built-in lines only, and nothing
            about your games is sent to the AI. (Shared Great Hall chatter is unaffected.)
          </span>
        </span>
        <input
          type="checkbox"
          className="puc-settings__toggle"
          checked={templateOnly}
          onChange={(e) => setTemplateOnly(e.target.checked)}
          aria-label="Template-only hosts"
        />
      </label>
      {identity && !identity.isBypass && (
        <label className="puc-settings__row">
          <span className="puc-settings__text">
            <b className="puc-settings__label">Hide me from public leaderboards</b>
            <span className="puc-settings__hint">
              Keeps your name off the castle gate top-5, the puzzle leaderboards and player search.
              Friends you play with still see your name in games.
            </span>
          </span>
          <input
            type="checkbox"
            className="puc-settings__toggle"
            checked={hideLb}
            disabled={savingLb}
            onChange={(e) => { void toggleHideLb(e.target.checked) }}
            aria-label="Hide me from public leaderboards"
          />
        </label>
      )}
      <p className="puc-settings__hint">
        <Link to="/privacy" className="puc-settings__link">How Power Up Chess handles your data →</Link>
      </p>
    </section>
  )
}
