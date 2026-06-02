// Time control: the chess-clock configuration shared between client and
// server (and persisted in the user's profile).
//
// MVP supports unlimited play (null) plus a small set of presets. Custom
// values can be added later — keeping the surface tight avoids accidentally
// exposing weird formats (like 0+0) that we never tested.

export interface TimeControl {
  initialMs: number
  /** Extra time added to the moving side after every move. 0 = no increment. */
  incrementMs: number
}

export interface TimeControlPreset {
  id: string
  label: string
  short: string
  value: TimeControl | null
}

export const TIME_CONTROL_PRESETS: TimeControlPreset[] = [
  { id: '5-0', label: '5 minutes', short: '5 min', value: { initialMs: 5 * 60_000, incrementMs: 0 } },
  { id: '10-0', label: '10 minutes', short: '10 min', value: { initialMs: 10 * 60_000, incrementMs: 0 } },
  { id: '15-10', label: '15 + 10', short: '15+10', value: { initialMs: 15 * 60_000, incrementMs: 10_000 } },
  // Correspondence-style — long enough that a kid can think over a meal
  // without flagging. Same clock display logic handles hours fine.
  { id: '1-day', label: '1 day', short: '1d', value: { initialMs: 24 * 60 * 60_000, incrementMs: 0 } },
  { id: 'untimed', label: 'No clock', short: '∞', value: null },
]

export const DEFAULT_TIME_CONTROL_ID = '10-0'

export function presetById(id: string): TimeControlPreset {
  return TIME_CONTROL_PRESETS.find((p) => p.id === id) ?? TIME_CONTROL_PRESETS[0]!
}

/** Format ms as m:ss or h:mm:ss. Always shows tenths under 10 seconds so the
 *  low-time warning isn't a static "0:09". */
export function formatClock(ms: number): string {
  const clamped = Math.max(0, ms)
  const totalSec = clamped / 1000
  const hours = Math.floor(totalSec / 3600)
  const minutes = Math.floor((totalSec % 3600) / 60)
  const seconds = totalSec % 60
  if (clamped < 10_000) {
    return `${Math.floor(seconds)}.${Math.floor((seconds % 1) * 10)}`
  }
  const wholeSec = Math.floor(seconds)
  const ss = wholeSec.toString().padStart(2, '0')
  if (hours > 0) {
    const mm = minutes.toString().padStart(2, '0')
    return `${hours}:${mm}:${ss}`
  }
  return `${minutes}:${ss}`
}
