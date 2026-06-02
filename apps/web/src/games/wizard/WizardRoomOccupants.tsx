// Who's in this duel right now — players + spectators.
//
// Reuses the same Hall presence stream (lobby/presence/items) and just
// filters to rows whose location is this room. Spectators heartbeat
// the same way players do via usePresenceHeartbeat({kind:'wizard',roomId}),
// so this list updates in real time as people walk in / out.

import { useMemo } from 'react'
import { useLobbyPresence, type PresenceRow } from '../../castle/useLobbyChat'
import './WizardRoomOccupants.css'

interface Props {
  roomId: string
  /** uid + displayName for each seated player so we can split the rows. */
  playerUids: {
    w: { uid: string; name: string }
    b: { uid: string; name: string } | null
  }
  youUid: string | null
}

export function WizardRoomOccupants({ roomId, playerUids, youUid }: Props) {
  const presence = useLobbyPresence()
  const here = useMemo(
    () => presence.filter((p) => p.location?.kind === 'wizard' && p.location.roomId === roomId),
    [presence, roomId],
  )

  const spectators = here.filter(
    (p) => p.uid !== playerUids.w.uid && (!playerUids.b || p.uid !== playerUids.b.uid),
  )

  return (
    <div className="puc-wdroom">
      <div className="puc-wdroom__section">
        <h4 className="puc-wdroom__title">Duelists</h4>
        <ul className="puc-wdroom__list">
          <PlayerLine label="White" name={playerUids.w.name} uid={playerUids.w.uid} youUid={youUid} />
          {playerUids.b
            ? <PlayerLine label="Black" name={playerUids.b.name} uid={playerUids.b.uid} youUid={youUid} />
            : <li className="puc-wdroom__row puc-wdroom__row--empty">Black — waiting…</li>}
        </ul>
      </div>
      <div className="puc-wdroom__section">
        <h4 className="puc-wdroom__title">Watching ({spectators.length})</h4>
        {spectators.length === 0 ? (
          <p className="puc-wdroom__empty">No spectators yet.</p>
        ) : (
          <ul className="puc-wdroom__list">
            {spectators.map((s) => (
              <SpectatorLine key={s.sessionId} row={s} youUid={youUid} />
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function PlayerLine({
  label, name, uid, youUid,
}: {
  label: string
  name: string
  uid: string
  youUid: string | null
}) {
  const isYou = uid === youUid
  return (
    <li className={`puc-wdroom__row${isYou ? ' puc-wdroom__row--you' : ''}`}>
      <span className="puc-wdroom__name">{name}{isYou ? ' (you)' : ''}</span>
      <span className="puc-wdroom__tag puc-wdroom__tag--player">{label}</span>
    </li>
  )
}

function SpectatorLine({ row, youUid }: { row: PresenceRow; youUid: string | null }) {
  const isYou = row.uid === youUid
  return (
    <li className={`puc-wdroom__row${isYou ? ' puc-wdroom__row--you' : ''}`}>
      <span className="puc-wdroom__name">
        {row.isBypass ? '👻 ' : ''}
        {row.displayName}
        {isYou ? ' (you)' : ''}
      </span>
      <span className="puc-wdroom__tag puc-wdroom__tag--spectator">watching</span>
    </li>
  )
}
