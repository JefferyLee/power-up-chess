// Shared host byline shown in the AI-practice and online-game headers: the
// host's name plus a short context blurb, with room for a trailing chip
// (e.g. "Spectating"). Uses the puc-local__host* classes from
// LocalGameScreen.css, which both consumers already import — so this is a
// pure markup dedup with no visual change.

import type { ReactNode } from 'react'

export function HostByline({
  name,
  blurb,
  children,
}: {
  name: string
  blurb: ReactNode
  children?: ReactNode
}) {
  return (
    <div className="puc-local__host">
      <span className="puc-local__host-name">{name}</span>
      <span className="puc-local__host-blurb">{blurb}</span>
      {children}
    </div>
  )
}
