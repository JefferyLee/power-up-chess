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
}

export function DailyStrip({ daily, onOpen }: Props) {
  const slots: Array<boolean | null> =
    daily && Array.isArray(daily.results) && daily.results.length === 5
      ? daily.results
      : [null, null, null, null, null]
  const allDone = slots.every((r) => r !== null && r !== undefined)
  const solved = slots.filter((r) => r === true).length
  return (
    <button
      type="button"
      className={'puc-daily ' + (allDone ? 'puc-daily--done' : '')}
      onClick={onOpen}
    >
      <div className="puc-daily__glyph" aria-hidden="true">⭐</div>
      <div className="puc-daily__body">
        <div className="puc-daily__head">
          <span className="puc-daily__chip">Today</span>
          <span className="puc-daily__title">
            {allDone ? "Today's Five — done!" : "Today's Five"}
          </span>
        </div>
        <div className="puc-daily__sub">
          {allDone
            ? `${solved} of 5 solved — come back tomorrow`
            : 'Hand-picked daily quest · +10 castle points on completion'}
        </div>
        <div className="puc-daily__stones" aria-hidden="true">
          {slots.map((r, i) => (
            <span
              key={i}
              className={
                'puc-daily__stone ' +
                (r === true
                  ? 'puc-daily__stone--solved'
                  : r === false
                    ? 'puc-daily__stone--failed'
                    : 'puc-daily__stone--pending')
              }
            />
          ))}
        </div>
      </div>
      <div className="puc-daily__cta" aria-hidden="true">
        {allDone ? 'Review →' : 'Open →'}
      </div>
    </button>
  )
}
