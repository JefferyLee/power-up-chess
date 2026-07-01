// Small settings block on the Adventurer's Plaque. Currently one control:
// the template-only hosts switch (a parental AI-privacy / offline toggle).

import { useTemplateOnly, setTemplateOnly } from '../hosts/templateOnly'
import './SettingsPanel.css'

export function SettingsPanel() {
  const templateOnly = useTemplateOnly()
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
    </section>
  )
}
