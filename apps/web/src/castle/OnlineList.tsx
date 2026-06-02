// OnlineList — Hall sidebar showing who's where.
//
// Top section: people in the Hall (default).
// Then one section per active game room (chess room / wizard duel) with
// every occupant in it. A "Watch" button beside each name navigates the
// viewer into that room as a spectator. Rooms with no occupants are
// skipped (their presence rows TTL-expire after 60 s).

import { useNavigate } from 'react-router-dom'
import { groupPresence, useLobbyPresence, type RoomOccupancy } from './useLobbyChat'
import './OnlineList.css'

export function OnlineList({ youUid }: { youUid: string | null }) {
  const rows = useLobbyPresence()
  const groups = groupPresence(rows)

  return (
    <aside className="puc-online">
      <h3 className="puc-online__title">In the Hall ({groups.hall.length})</h3>
      {groups.hall.length === 0 && <p className="puc-online__empty">just you for now</p>}
      <ul className="puc-online__list">
        {groups.hall.map((p) => (
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

      {groups.rooms.map((room) => (
        <RoomSection key={`${room.kind}:${room.roomId}`} room={room} youUid={youUid} />
      ))}
    </aside>
  )
}

function RoomSection({ room, youUid }: { room: RoomOccupancy; youUid: string | null }) {
  const navigate = useNavigate()
  const path = room.kind === 'wizard' ? `/wizard/${room.roomId}` : `/r/${room.roomId}`
  const heading = room.kind === 'wizard' ? `✨ Wizard's Duel · ${room.roomId}` : `🏰 Chess room · ${room.roomId}`
  return (
    <section className={`puc-online__room puc-online__room--${room.kind}`}>
      <h4 className="puc-online__room-title">
        {heading} ({room.occupants.length})
      </h4>
      <ul className="puc-online__list">
        {room.occupants.map((p) => (
          <li
            key={p.sessionId}
            className={`puc-online__row${p.uid === youUid ? ' puc-online__row--you' : ''}`}
          >
            <span className="puc-online__name">
              {p.isBypass ? '👻 ' : ''}
              {p.displayName}
              {p.uid === youUid ? ' (you)' : ''}
            </span>
            {p.uid !== youUid && (
              <button
                type="button"
                className="puc-online__follow"
                onClick={() => navigate(path)}
                title={`Watch this ${room.kind === 'wizard' ? 'duel' : 'game'}`}
              >
                ▸ Watch
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}

function hostLabel(hostId: 'lucy' | 'luca'): string {
  return hostId === 'lucy' ? '🌿 Lucy' : '✨ Luca'
}
