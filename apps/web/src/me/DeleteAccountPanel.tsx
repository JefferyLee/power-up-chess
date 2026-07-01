// A clearly-labeled, irreversible "delete my account & data" control for the
// Adventurer's Plaque. Two-step confirm so it can't be triggered by accident;
// on success it wipes local data and returns to the Castle gate.

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCastle } from '../castle/useCastle'
import { forgetMeAndWipe } from '../castle/forgetMe'
import './DeleteAccountPanel.css'

export function DeleteAccountPanel() {
  const { identity, signOut } = useCastle()
  const navigate = useNavigate()
  const [step, setStep] = useState<'idle' | 'confirm' | 'working' | 'error'>('idle')

  if (!identity || identity.isBypass) return null

  const doDelete = async () => {
    setStep('working')
    try {
      await forgetMeAndWipe(identity.normalizedName)
      signOut()
      navigate('/', { replace: true })
    } catch {
      setStep('error')
    }
  }

  return (
    <section className="puc-danger">
      <h3 className="puc-danger__title">Delete my account &amp; data</h3>
      {step === 'idle' && (
        <>
          <p className="puc-danger__note">
            Removes your name, castle points, games, puzzles, chat messages and progress
            everywhere — on this device and on our servers. This can&apos;t be undone.
          </p>
          <button type="button" className="puc-danger__btn" onClick={() => setStep('confirm')}>
            Delete everything…
          </button>
        </>
      )}
      {step === 'confirm' && (
        <>
          <p className="puc-danger__note puc-danger__note--warn">
            Are you sure? Everything about <b>{identity.displayName}</b> will be gone forever.
          </p>
          <div className="puc-danger__row">
            <button type="button" className="puc-danger__btn puc-danger__btn--go" onClick={() => { void doDelete() }}>
              Yes, delete forever
            </button>
            <button type="button" className="puc-danger__btn puc-danger__btn--ghost" onClick={() => setStep('idle')}>
              Keep my account
            </button>
          </div>
        </>
      )}
      {step === 'working' && <p className="puc-danger__note">Deleting everything…</p>}
      {step === 'error' && (
        <>
          <p className="puc-danger__note puc-danger__note--warn">Something went wrong. Nothing was fully deleted — please try again.</p>
          <button type="button" className="puc-danger__btn" onClick={() => setStep('confirm')}>Try again</button>
        </>
      )}
    </section>
  )
}
