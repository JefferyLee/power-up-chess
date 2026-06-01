// OnlineList — sidebar of guests currently in the Hall.

import { useLobbyPresence } from './useLobbyChat'
import './OnlineList.css'

export function OnlineList({ youUid }: { youUid: string | null }) {
  const rows = useLobbyPresence()
  return (
    <aside className="puc-online">
      <h3 className="puc-online__title">In the Hall ({rows.length})</h3>
      {rows.length === 0 && <p className="puc-online__empty">just you for now</p>}
      <ul className="puc-online__list">
        {rows.map((p) => (
          <li
            key={p.sessionId}
            className={`puc-online__row${p.uid === youUid ? ' puc-online__row--you' : ''}`}
          >
            <span className="puc-online__name">
              {p.isBypass ? '👻 ' : ''}
              {p.displayName}
              {p.uid === youUid ? ' (you)' : ''}
            </span>
            <span className={`puc-online__chip puc-online__chip--${p.hostId}`}>{hostLabel(p.hostId)}</span>
          </li>
        ))}
      </ul>
    </aside>
  )
}

function hostLabel(hostId: 'lucy' | 'luca'): string {
  return hostId === 'lucy' ? '🌿 Lucy' : '✨ Luca'
}
