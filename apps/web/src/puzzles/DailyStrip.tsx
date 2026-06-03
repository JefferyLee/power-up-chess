// "Today's Five" hero strip — five stones that fill in as the kid
// solves the five hand-picked daily puzzles. Used both at the top of
// the Puzzle Garden and again on the Hall page, so the kid sees the
// daily quest both when entering puzzles and when wandering the lobby.
//
// The component only renders the visual strip; the daily set itself is
// fetched lazily by /puzzles/daily — tapping the strip just navigates
// there. Pass `null` for `daily` to render an empty (five-pending) strip.

import './DailyStrip.css'

export interface DailyStripState {
  /** length-5 array of results: true=solved, false=failed/skip, null=not attempted. */
  results: Array<boolean | null>
}

interface Props {
  daily: DailyStripState | null
  onOpen: () => void
  /** Compact (Hall) variant — one slim row instead of the tall garden hero. */
  compact?: boolean
}

export function DailyStrip({ daily, onOpen, compact = false }: Props) {
  const slots: Array<boolean | null> =
    daily && Array.isArray(daily.results) && daily.results.length === 5
      ? daily.results
      : [null, null, null, null, null]
  const allDone = slots.every((r) => r !== null && r !== undefined)
  const solved = slots.filter((r) => r === true).length
  return (
    <button
      type="button"
      className={
        'puc-dailystrip' +
        (allDone ? ' puc-dailystrip--done' : '') +
        (compact ? ' puc-dailystrip--compact' : '')
      }
      onClick={onOpen}
    >
      <div className="puc-dailystrip__glyph" aria-hidden="true">⭐</div>
      <div className="puc-dailystrip__body">
        <div className="puc-dailystrip__head">
          <span className="puc-dailystrip__chip">Today</span>
          <span className="puc-dailystrip__title">
            {allDone ? "Today's Five — done!" : "Today's Five"}
          </span>
        </div>
        <div className="puc-dailystrip__sub">
          {allDone
            ? `${solved} of 5 solved — come back tomorrow`
            : 'Hand-picked daily quest · +10 castle points on completion'}
        </div>
        <div className="puc-dailystrip__stones" aria-hidden="true">
          {slots.map((r, i) => (
            <span
              key={i}
              className={
                'puc-dailystrip__stone ' +
                (r === true
                  ? 'puc-dailystrip__stone--solved'
                  : r === false
                    ? 'puc-dailystrip__stone--failed'
                    : 'puc-dailystrip__stone--pending')
              }
            />
          ))}
        </div>
      </div>
      <div className="puc-dailystrip__cta" aria-hidden="true">
        {allDone ? 'Review →' : 'Open →'}
      </div>
    </button>
  )
}
