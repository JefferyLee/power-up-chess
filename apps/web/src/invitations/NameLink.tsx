// NameLink — tappable display name that opens the player's plaque.
// Single helper used from every surface that shows a name: Hall of
// Champions, ChatPanel, Tournament standings, InviteInbox, FindPlayer
// results, future Recently Played list.
//
// The actual UserCard is mounted at the app root (see UserCardHost);
// this component is now just a trigger. The earlier shape rendered
// <UserCard> inline, which tied the modal's lifetime to NameLink's
// — when NameLink's container unmounted mid-interaction (FindPlayer
// dropdown collapsing, chat scrollback dropping a message), the
// plaque vanished. UserCardHost is the load-bearing fix.
//
// Falls back to a plain span when normalizedName is missing (bypass
// guests, or signed-out viewers) so the UI still reads sensibly.

import type { ReactNode } from 'react'
import { useCastle } from '../castle/useCastle'
import { useUserCard } from './UserCardHost'

interface Props {
  /** The lookup key. Omit / pass empty string to render a non-link. */
  normalizedName?: string | null
  /** Human-readable name — used as the visible label + accessible
   *  tooltip. The lookup uses normalizedName, not this. */
  displayName: string
  /** Optional override for what's rendered inside the link — useful
   *  when the parent wants the name nested in a richer chip / chevron
   *  layout. Defaults to displayName text. */
  children?: ReactNode
  /** Classes applied to the underlying <button> (or <span> fallback). */
  className?: string
}

export function NameLink({ normalizedName, displayName, children, className }: Props) {
  const { identity } = useCastle()
  const userCard = useUserCard()
  const label = children ?? displayName
  // Bypass guests + signed-out viewers can't open the plaque (the
  // getPublicProfile callable requires auth + a normalizedName).
  if (!normalizedName || !identity) {
    return <span className={className}>{label}</span>
  }
  return (
    <button
      type="button"
      className={className}
      onClick={(e) => { e.stopPropagation(); userCard.open(normalizedName) }}
      title={`View ${displayName}'s plaque`}
    >
      {label}
    </button>
  )
}
