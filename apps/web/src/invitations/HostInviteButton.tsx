// HostInviteButton — under the Lucy / Luca portrait in the Hall.
//
// Clicking opens a small dialog that:
//   1. Auto-picks the AI difficulty matching the user's lifetime-earn
//      title (so a Sorcerer doesn't get Beginner mode).
//   2. Lets the user pick a time control (reuses the standard preset
//      list).
//   3. Navigates straight to /ai/Practice with the right state — the
//      AI Practice route already handles the rest.
//
// Free — there's no per-invite CP cost for AI games (the existing
// chess-room open cost is the only economic gate on chess play).

import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { DEFAULT_DIFFICULTY_ID, DIFFICULTY_PRESETS, type DifficultyId } from '../ai/difficulty'
import {
  DEFAULT_TIME_CONTROL_ID,
  TIME_CONTROL_PRESETS,
  type TimeControlPreset,
} from '../clock/timeControl'
import { useCastle } from '../castle/useCastle'
import { HOSTS, type HostId } from '../hosts/hosts'
import './HostInviteButton.css'

interface Props {
  hostId: HostId
}

/** Map the user's lifetime-earn title to a sensible default difficulty.
 *  We deliberately stay one notch easier than what a strict rating-based
 *  mapping would pick — kids should feel like winners more often than
 *  not against the host. */
function defaultDifficultyFor(lifetimeEarned: number): DifficultyId {
  if (lifetimeEarned >= 10000) return 'hard'      // Archmage
  if (lifetimeEarned >= 2000)  return 'medium'    // Sorcerer
  if (lifetimeEarned >= 500)   return 'easy'      // Adept
  return 'beginner'                                // Apprentice / no title
}

export function HostInviteButton({ hostId }: Props) {
  const [open, setOpen] = useState(false)
  const { identity } = useCastle()
  const host = HOSTS[hostId]

  if (!identity) return null

  return (
    <>
      <button
        type="button"
        className="puc-host-invite__btn"
        onClick={() => setOpen(true)}
        title={`Play a quick game vs ${host.name} (AI)`}
      >
        ♞ Invite {host.name} to play
      </button>
      {open && (
        <HostInviteDialog
          hostId={hostId}
          // identity.castlePoints is the current balance, not lifetime — but
          // it's a close-enough proxy for auto-difficulty since spending (chat
          // costs, room opens) is modest. A misclassified Sorcerer who's been
          // spending hard will manually crank the difficulty.
          lifetimeEarnedProxy={identity.castlePoints ?? 0}
          displayName={identity.displayName}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  )
}

function HostInviteDialog({
  hostId,
  lifetimeEarnedProxy,
  displayName,
  onClose,
}: {
  hostId: HostId
  lifetimeEarnedProxy: number
  displayName: string
  onClose: () => void
}) {
  const navigate = useNavigate()
  const host = HOSTS[hostId]
  const [difficultyId, setDifficultyId] = useState<DifficultyId>(
    defaultDifficultyFor(lifetimeEarnedProxy) ?? DEFAULT_DIFFICULTY_ID,
  )
  const [tcId, setTcId] = useState<string>(DEFAULT_TIME_CONTROL_ID)
  const selectedTc =
    TIME_CONTROL_PRESETS.find((p) => p.id === tcId) ?? TIME_CONTROL_PRESETS[0]!

  const onStart = (preset: TimeControlPreset) => {
    navigate('/ai', {
      state: {
        hostId,
        playerName: displayName,
        difficultyId,
        timeControl: preset.value,
      },
    })
  }

  return createPortal(
    <div
      className="puc-host-invite"
      role="dialog"
      aria-label={`Invite ${host.name} to play`}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="puc-host-invite__card">
        <h2 className="puc-host-invite__title">Play a quick game vs {host.name}</h2>
        <p className="puc-host-invite__sub">
          {host.name} always accepts. Pick a difficulty and a time control.
        </p>

        <fieldset className="puc-host-invite__field">
          <legend>Difficulty (auto-picked for your level)</legend>
          <div className="puc-host-invite__grid">
            {DIFFICULTY_PRESETS.map((d) => (
              <button
                key={d.id}
                type="button"
                className={
                  'puc-host-invite__option'
                  + (d.id === difficultyId ? ' puc-host-invite__option--on' : '')
                }
                onClick={() => setDifficultyId(d.id)}
                title={d.blurb}
              >
                <span className="puc-host-invite__option-short">{d.short}</span>
                <span className="puc-host-invite__option-label">{d.label}</span>
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset className="puc-host-invite__field">
          <legend>Time control</legend>
          <div className="puc-host-invite__grid">
            {TIME_CONTROL_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                className={
                  'puc-host-invite__option'
                  + (preset.id === tcId ? ' puc-host-invite__option--on' : '')
                }
                onClick={() => setTcId(preset.id)}
              >
                <span className="puc-host-invite__option-short">{preset.short}</span>
                <span className="puc-host-invite__option-label">{preset.label}</span>
              </button>
            ))}
          </div>
        </fieldset>

        <div className="puc-host-invite__actions">
          <button type="button" className="puc-host-invite__btn" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="puc-host-invite__btn puc-host-invite__btn--primary"
            onClick={() => onStart(selectedTc)}
          >
            Start the game
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
