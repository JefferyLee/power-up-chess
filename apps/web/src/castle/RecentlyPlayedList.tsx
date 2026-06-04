// RecentlyPlayedList — Hall sidebar list of the up-to-12 most recent
// guests the signed-in kid played a chess game with or accepted an
// invite from. Lets them tap into any one's plaque even when offline.
//
// Online entries get a green dot + chip; offline entries are dim but
// still tappable.

import { useEffect, useState } from 'react'
import { callGetRecentlyPlayed, type RecentlyPlayedEntry } from '../firebase/callables'
import { useCastle } from './useCastle'
import { NameLink } from '../invitations/NameLink'
import './RecentlyPlayedList.css'

export function RecentlyPlayedList() {
  const { identity } = useCastle()
  const [entries, setEntries] = useState<RecentlyPlayedEntry[] | null>(null)

  useEffect(() => {
    if (!identity || identity.isBypass) return
    let cancelled = false
    callGetRecentlyPlayed()
      .then((res) => { if (!cancelled) setEntries(res.entries) })
      .catch((err) => {
        console.warn('getRecentlyPlayed failed', err)
        if (!cancelled) setEntries([])
      })
    // Refetch on focus so the online dots reflect current state when
    // the kid switches tabs back to the Hall.
    const refresh = () => {
      callGetRecentlyPlayed()
        .then((res) => { if (!cancelled) setEntries(res.entries) })
        .catch(() => { /* keep previous list */ })
    }
    window.addEventListener('focus', refresh)
    return () => {
      cancelled = true
      window.removeEventListener('focus', refresh)
    }
  }, [identity])

  // Bypass guests don't have a list; render nothing rather than empty
  // section taking space.
  if (!identity || identity.isBypass) return null
  if (entries === null) return null  // still loading — keep silent
  if (entries.length === 0) {
    return (
      <aside className="puc-recently">
        <h3 className="puc-recently__title">Recently played</h3>
        <p className="puc-recently__empty">no recent partners yet</p>
      </aside>
    )
  }
  return (
    <aside className="puc-recently">
      <h3 className="puc-recently__title">Recently played</h3>
      <ul className="puc-recently__list">
        {entries.map((e) => (
          <li
            key={e.normalizedName}
            className={'puc-recently__row' + (e.online ? '' : ' puc-recently__row--offline')}
          >
            <span
              className={'puc-recently__dot' + (e.online ? ' puc-recently__dot--on' : '')}
              aria-hidden="true"
              title={e.online ? 'Online now' : 'Offline'}
            />
            <NameLink
              normalizedName={e.normalizedName}
              displayName={e.displayName}
              className="puc-recently__name"
            />
            {e.online && e.here && e.here !== 'hall' && (
              <span className="puc-recently__where">{labelFor(e.here)}</span>
            )}
          </li>
        ))}
      </ul>
    </aside>
  )
}

function labelFor(here: NonNullable<RecentlyPlayedEntry['here']>): string {
  switch (here) {
    case 'chess': return 'chess'
    case 'wizard': return 'duel'
    case 'puzzle': return 'puzzles'
    case 'practice': return 'AI'
    case 'local': return 'local'
    case 'forest': return 'forest'
    case 'hall': return ''
  }
}
