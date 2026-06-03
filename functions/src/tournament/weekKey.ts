// LA-localised ISO week key for the Weekly Tournament.
//
// Same algorithm as refreshPuzzleLeaderboards.ts but exported so the
// tournament callables can share it. ISO weeks start Monday; a week
// straddling year boundaries belongs to whichever year contains its
// Thursday.

const PROJECT_TZ = 'America/Los_Angeles'

export function tournamentWeekKey(epochMs: number = Date.now()): string {
  return isoWeekKey(epochMs, PROJECT_TZ)
}

function isoWeekKey(epochMs: number, tz: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(epochMs))
  const y = Number(parts.find((p) => p.type === 'year')!.value)
  const m = Number(parts.find((p) => p.type === 'month')!.value)
  const d = Number(parts.find((p) => p.type === 'day')!.value)
  const date = new Date(Date.UTC(y, m - 1, d))
  const dayOfWeek = date.getUTCDay() || 7
  date.setUTCDate(date.getUTCDate() + 4 - dayOfWeek)
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1))
  const weekNum = Math.ceil(
    ((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7,
  )
  return `${date.getUTCFullYear()}-W${String(weekNum).padStart(2, '0')}`
}
