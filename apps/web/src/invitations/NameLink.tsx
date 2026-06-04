// NameLink — tappable display name that opens the player's plaque
// (UserCard) in a modal portal. Single helper used from every
// surface that shows a name: Hall of Champions, ChatPanel,
// Tournament standings, InviteInbox, future Recently Played list.
//
// Falls back to a plain span when normalizedName is missing (bypass
// guests, or signed-out viewers) so the UI still reads sensibly.

import { useState, type ReactNode } from 'react'
import { useCastle } from '../castle/useCastle'
import { UserCard } from './UserCard'

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
  const [open, setOpen] = useState(false)
  const label = children ?? displayName
  // Bypass guests + signed-out viewers can't open the plaque (the
  // getPublicProfile callable requires auth + a normalizedName).
  if (!normalizedName || !identity) {
    return <span className={className}>{label}</span>
  }
  return (
    <>
      <button
        type="button"
        className={className}
        onClick={(e) => { e.stopPropagation(); setOpen(true) }}
        title={`View ${displayName}'s plaque`}
      >
        {label}
      </button>
      {open && (
        <UserCard
          normalizedName={normalizedName}
          selfNormalizedName={identity.normalizedName}
          selfCastlePoints={identity.castlePoints ?? 0}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  )
}
