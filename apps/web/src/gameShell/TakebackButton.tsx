import type { TakebackApi } from './useTakeback'

export function TakebackButton({ takeback, readyTitle }: { takeback: TakebackApi; readyTitle: string }) {
  const { nextCost, canTakeback, tooPoor, error } = takeback
  return (
    <>
    <button
      type="button"
      onClick={() => { void takeback.takeback() }}
      disabled={!canTakeback}
      title={
        nextCost === null
          ? 'No takebacks left this game (max 3)'
          : tooPoor
            ? `Need ${nextCost}✦ to take back`
            : readyTitle
      }
    >
      {nextCost === null ? 'Takeback ✗' : `↩ Takeback (−${nextCost}✦)`}
    </button>
    {error && <span className="puc-takeback__err" role="alert">{error}</span>}
    </>
  )
}
