// MyTeamsList — sidebar entry showing the teams the signed-in guest
// is on, plus a "Start a team" button. Subscribes to the guest doc's
// teamIds, then live-subscribes each team for the badge + name.

import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { doc, onSnapshot } from 'firebase/firestore'
import { db } from '../firebase/app'
import { useCastle } from '../castle/useCastle'
import { TeamBadge } from './TeamBadge'
import { useTeam } from './useTeam'
import { CreateTeamDialog } from './CreateTeamDialog'
import './MyTeamsList.css'

export function MyTeamsList() {
  const { identity } = useCastle()
  const navigate = useNavigate()
  const [teamIds, setTeamIds] = useState<string[] | null>(null)
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    if (!identity || identity.isBypass) { setTeamIds(null); return }
    const ref = doc(db, 'guests', identity.normalizedName)
    const unsub = onSnapshot(ref, (snap) => {
      const data = snap.data() as { teamIds?: string[] } | undefined
      setTeamIds(Array.isArray(data?.teamIds) ? data!.teamIds! : [])
    })
    return () => unsub()
  }, [identity])

  if (!identity || identity.isBypass) return null

  return (
    <aside className="puc-myteams">
      <h3 className="puc-myteams__title">My Teams</h3>
      {teamIds === null && <p className="puc-myteams__empty">Loading…</p>}
      {teamIds !== null && teamIds.length === 0 && (
        <p className="puc-myteams__empty">You're not on a team yet.</p>
      )}
      {teamIds !== null && teamIds.length > 0 && (
        <ul className="puc-myteams__list">
          {teamIds.map((id) => (
            <MyTeamRow key={id} teamId={id} onOpen={() => navigate(`/team/${id}`)} />
          ))}
        </ul>
      )}
      {(teamIds === null || teamIds.length < 2) && (
        <button
          type="button"
          className="puc-myteams__create"
          onClick={() => setCreating(true)}
        >
          + Start a team
        </button>
      )}
      {creating && <CreateTeamDialog onClose={() => setCreating(false)} />}
    </aside>
  )
}

function MyTeamRow({ teamId, onOpen }: { teamId: string; onOpen: () => void }) {
  const state = useTeam(teamId)
  if (state.kind !== 'ready') {
    return (
      <li className="puc-myteams__row puc-myteams__row--loading">
        Team {teamId}…
      </li>
    )
  }
  const team = state.team
  return (
    <li
      className="puc-myteams__row"
      onClick={onOpen}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen() } }}
    >
      <span className="puc-myteams__badge">
        <TeamBadge badge={team.badge} size={28} />
      </span>
      <span className="puc-myteams__name">{team.name}</span>
      <span className="puc-myteams__count">{team.memberCount}/20</span>
    </li>
  )
}
