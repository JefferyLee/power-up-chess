// HearthTicker — the collapsed face of the Hall chat. Shows the
// latest few messages (max 5, within the last 4 hours) as compact
// one-line rows so the Hall feels alive at a glance. Herald action
// messages keep a small inline CTA chip (Join / Spectate / Sign up)
// because those are the highest-value taps in the chat.
//
// Clicking anywhere on the ticker expands it (desktop: in-place full
// ChatPanel; phones: bottom sheet) via the onExpand callback.

import { useNavigate } from 'react-router-dom'
import { useLobbyMessages, type ChatMessage, type ChatMessageAction } from './useLobbyChat'
import './HearthTicker.css'

const MAX_ROWS = 5
const FRESH_WINDOW_MS = 4 * 60 * 60 * 1000

function actionView(action: ChatMessageAction): { label: string; path: string } | null {
  switch (action.kind) {
    case 'join-room':
      return {
        label: action.roomKind === 'wizard' ? 'Enter duel' : 'Join',
        path: action.roomKind === 'wizard' ? `/wizard/${action.roomId}` : `/r/${action.roomId}`,
      }
    case 'join-open-room':
      return {
        label: action.roomKind === 'wizard' ? 'Enter duel' : 'Join',
        path: action.roomKind === 'wizard' ? `/wizard/${action.roomId}` : `/r/${action.roomId}`,
      }
    case 'spectate-room':
      return {
        label: 'Spectate',
        path: action.roomKind === 'wizard' ? `/wizard/${action.roomId}` : `/r/${action.roomId}`,
      }
    case 'join-tournament':
      return { label: 'Sign up', path: '/tournament' }
    default:
      return null
  }
}

export function HearthTicker({ onExpand }: { onExpand: () => void }) {
  const navigate = useNavigate()
  const messages = useLobbyMessages()
  const cutoff = Date.now() - FRESH_WINDOW_MS
  const recent: ChatMessage[] = messages
    .filter((m) => m.ts >= cutoff)
    .slice(-MAX_ROWS)

  return (
    <section
      className="puc-ticker"
      role="button"
      tabIndex={0}
      onClick={onExpand}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onExpand() } }}
      aria-label="Open the Great Hall chat"
    >
      <header className="puc-ticker__head">
        <span className="puc-ticker__title">🔥 The Hearth</span>
        <span className="puc-ticker__expand">▸ open chat</span>
      </header>
      {recent.length === 0 ? (
        <p className="puc-ticker__quiet">The hall is quiet right now — say hello!</p>
      ) : (
        <ul className="puc-ticker__rows">
          {recent.map((m) => {
            const act = m.action ? actionView(m.action) : null
            return (
              <li key={m.id} className={`puc-ticker__row puc-ticker__row--${m.kind}`}>
                <span className="puc-ticker__name">
                  {m.kind === 'system' ? '📯' : m.kind === 'host' ? (m.hostId === 'lucy' ? '🌿' : '✨') : ''}
                  {m.name}:
                </span>
                <span className="puc-ticker__text">{m.text}</span>
                {act && (
                  <button
                    type="button"
                    className="puc-ticker__cta"
                    onClick={(e) => { e.stopPropagation(); navigate(act.path) }}
                  >
                    ▸ {act.label}
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
