import type { Color } from '../chess/types'
import './ResignDialog.css'

interface LocalProps {
  mode: 'local'
  whiteName: string
  blackName: string
  onResign: (resigner: Color) => void
  onCancel: () => void
}

interface OnlineProps {
  mode: 'online'
  yourName: string
  busy?: boolean
  onResign: () => void
  onCancel: () => void
}

type Props = LocalProps | OnlineProps

export function ResignDialog(props: Props) {
  return (
    <div className="puc-resign" role="dialog" aria-modal="true" aria-labelledby="puc-resign-title">
      <div className="puc-resign__backdrop" onClick={props.onCancel} />
      <div className="puc-resign__card">
        <h2 id="puc-resign-title" className="puc-resign__title">
          {props.mode === 'local' ? 'Who resigns?' : 'Resign this game?'}
        </h2>
        <p className="puc-resign__body">
          {props.mode === 'local'
            ? 'The other side wins the game.'
            : `If you resign, ${props.yourName ? `${props.yourName} loses` : 'you lose'} this game.`}
        </p>
        <div className="puc-resign__actions">
          {props.mode === 'local' ? (
            <>
              <button
                type="button"
                className="puc-resign__btn"
                onClick={() => props.onResign('w')}
              >
                {props.whiteName} resigns
              </button>
              <button
                type="button"
                className="puc-resign__btn"
                onClick={() => props.onResign('b')}
              >
                {props.blackName} resigns
              </button>
              <button type="button" className="puc-resign__btn puc-resign__btn--ghost" onClick={props.onCancel}>
                Cancel
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className="puc-resign__btn puc-resign__btn--danger"
                onClick={props.onResign}
                disabled={props.busy}
              >
                {props.busy ? 'Resigning…' : 'Yes, resign'}
              </button>
              <button type="button" className="puc-resign__btn puc-resign__btn--ghost" onClick={props.onCancel}>
                Cancel
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
