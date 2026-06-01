// Pre-entry warning for Wizard's Duel. Per the user's instruction: be
// explicit that this is NOT real chess so kids don't carry weird habits
// (pieces freezing, summoning extra pawns) back into actual chess.

import './WizardWarningDialog.css'

interface Props {
  onConfirm: () => void
  onCancel: () => void
}

export function WizardWarningDialog({ onConfirm, onCancel }: Props) {
  return (
    <div className="puc-wizardwarn" role="dialog" aria-modal="true" aria-labelledby="puc-wizardwarn-title">
      <div className="puc-wizardwarn__backdrop" onClick={onCancel} />
      <div className="puc-wizardwarn__panel">
        <h2 id="puc-wizardwarn-title" className="puc-wizardwarn__title">
          ✨ A magical warning
        </h2>
        <p className="puc-wizardwarn__body">
          The Wizard&apos;s Duel uses the same pieces as chess, but the rules
          have been <strong>bent by magic</strong>. Pieces can be frozen.
          Bishops can pass through walls. New pawns can appear out of thin
          air. It&apos;s a different game.
        </p>
        <p className="puc-wizardwarn__body">
          That means anything you learn here <strong>does not work in real
          chess</strong>. If you want to get better at chess, play in the
          other rooms: Online, Local, Practice, or Puzzle Garden.
        </p>
        <p className="puc-wizardwarn__body puc-wizardwarn__body--em">
          Real chess is for getting better. Wizard&apos;s Duel is just for fun.
        </p>
        <div className="puc-wizardwarn__actions">
          <button type="button" className="puc-wizardwarn__cancel" onClick={onCancel}>
            Take me back to the Hall
          </button>
          <button type="button" className="puc-wizardwarn__confirm" onClick={onConfirm}>
            I understand — enter the duel
          </button>
        </div>
      </div>
    </div>
  )
}
