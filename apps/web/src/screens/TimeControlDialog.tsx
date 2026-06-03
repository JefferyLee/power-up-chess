// TimeControlDialog — picker shown when a kid opens an Online Chess
// private room. Picks the room's clock; cancel returns without creating.

import { useState } from 'react'
import { createPortal } from 'react-dom'
import {
  DEFAULT_TIME_CONTROL_ID,
  TIME_CONTROL_PRESETS,
  type TimeControlPreset,
} from '../clock/timeControl'
import './TimeControlDialog.css'

export function TimeControlDialog({
  onCancel,
  onConfirm,
  busy,
}: {
  onCancel: () => void
  onConfirm: (preset: TimeControlPreset) => void
  busy?: boolean
}) {
  const [selectedId, setSelectedId] = useState<string>(DEFAULT_TIME_CONTROL_ID)
  const selected =
    TIME_CONTROL_PRESETS.find((p) => p.id === selectedId) ??
    TIME_CONTROL_PRESETS[0]!

  return createPortal(
    <div
      className="puc-tc"
      role="dialog"
      aria-label="Choose time control"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onCancel()
      }}
    >
      <div className="puc-tc__card">
        <h2 className="puc-tc__title">How fast should the game be?</h2>
        <p className="puc-tc__sub">
          You can pick a tight 5-minute blitz, a relaxed 1-day correspondence,
          or anything in between.
        </p>
        <div className="puc-tc__grid">
          {TIME_CONTROL_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              className={
                'puc-tc__option' +
                (preset.id === selectedId ? ' puc-tc__option--on' : '')
              }
              onClick={() => setSelectedId(preset.id)}
            >
              <span className="puc-tc__option-short">{preset.short}</span>
              <span className="puc-tc__option-label">{preset.label}</span>
            </button>
          ))}
        </div>
        <div className="puc-tc__actions">
          <button
            type="button"
            className="puc-tc__btn"
            onClick={onCancel}
            disabled={busy}
          >
            Cancel
          </button>
          <button
            type="button"
            className="puc-tc__btn puc-tc__btn--primary"
            onClick={() => onConfirm(selected)}
            disabled={busy}
          >
            {busy ? 'Opening…' : `Open room (${selected.short})`}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
