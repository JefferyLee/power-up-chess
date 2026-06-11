// HostFigure — full-body painterly figure of the on-duty host (Lucy or
// Luca), rendered from a generated PNG. Used as the centrepiece of the
// Hall's host card. Distinct from HostPortrait (the SVG head) which is
// still used for small chip contexts and the learn screens.

import type { HostId } from '../hosts/hosts'
import './HostFigure.css'

/** Cache-buster for the host PNGs (same rationale as DOOR_ART_VERSION
 *  in RoomDoor.tsx — stable filenames in /public). Bump on art change. */
const HOST_ART_VERSION = '1'

export function HostFigure({ hostId }: { hostId: HostId }) {
  const name = hostId === 'lucy' ? 'Lucy' : 'Luca'
  return (
    <img
      className={`puc-hostfig puc-hostfig--${hostId}`}
      src={`/sprites/hosts/${hostId}.png?v=${HOST_ART_VERSION}`}
      alt={`${name}, your castle host`}
      draggable={false}
    />
  )
}
