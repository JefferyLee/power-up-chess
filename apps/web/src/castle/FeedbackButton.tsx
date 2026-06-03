// FeedbackButton — under the host card. Opens a small dialog where any
// signed-in guest can send a bug report or suggestion to Jeff. The
// submission goes through submitFeedback (rate-limited 8/day per uid)
// and lands in the feedback/ collection; Jeff sees it live via the
// inbox pill in the Hall header.

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useLocation } from 'react-router-dom'
import { callSubmitFeedback } from '../firebase/callables'
import { useCastle } from './useCastle'
import './FeedbackButton.css'

type Kind = 'bug' | 'suggestion'

type SendState =
  | { kind: 'idle' }
  | { kind: 'sending' }
  | { kind: 'ok' }
  | { kind: 'error'; message: string }

const MAX_LEN = 500

export function FeedbackButton() {
  const { identity } = useCastle()
  const location = useLocation()
  const [open, setOpen] = useState(false)
  const [kind, setKind] = useState<Kind>('suggestion')
  const [text, setText] = useState('')
  const [state, setState] = useState<SendState>({ kind: 'idle' })

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const reset = () => {
    setText('')
    setKind('suggestion')
    setState({ kind: 'idle' })
  }
  const close = () => {
    setOpen(false)
    // Defer reset so the closing animation doesn't show a flash of
    // empty state.
    window.setTimeout(reset, 200)
  }

  const onSubmit = async () => {
    if (!identity) return
    const trimmed = text.trim()
    if (!trimmed) return
    setState({ kind: 'sending' })
    try {
      await callSubmitFeedback({
        kind,
        text: trimmed,
        route: location.pathname,
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
        authorName: identity.displayName,
        normalizedName: identity.normalizedName,
        isBypass: identity.isBypass,
      })
      setState({ kind: 'ok' })
      window.setTimeout(close, 1400)
    } catch (e) {
      setState({
        kind: 'error',
        message: e instanceof Error ? e.message : String(e),
      })
    }
  }

  if (!identity) return null

  return (
    <>
      <button
        type="button"
        className="puc-feedback__open"
        onClick={() => setOpen(true)}
        aria-label="Send a bug report or suggestion"
      >
        💡 Suggest / report a bug
      </button>

      {open && createPortal(
        <div
          className="puc-feedback-overlay"
          role="dialog"
          aria-label="Send feedback"
          onClick={(e) => { if (e.target === e.currentTarget) close() }}
        >
          <div className="puc-feedback__card">
            <button
              type="button"
              className="puc-feedback__close"
              onClick={close}
              aria-label="Close feedback"
            >✕</button>
            <h2 className="puc-feedback__title">Tell Jeff</h2>
            <p className="puc-feedback__sub">
              Bug, idea, complaint, kind word — anything works. He reads them all.
            </p>

            <div className="puc-feedback__kind">
              <label className={'puc-feedback__chip ' + (kind === 'suggestion' ? 'puc-feedback__chip--on' : '')}>
                <input
                  type="radio"
                  name="puc-fb-kind"
                  value="suggestion"
                  checked={kind === 'suggestion'}
                  onChange={() => setKind('suggestion')}
                />
                💡 Suggestion
              </label>
              <label className={'puc-feedback__chip ' + (kind === 'bug' ? 'puc-feedback__chip--on' : '')}>
                <input
                  type="radio"
                  name="puc-fb-kind"
                  value="bug"
                  checked={kind === 'bug'}
                  onChange={() => setKind('bug')}
                />
                🐞 Bug
              </label>
            </div>

            <textarea
              className="puc-feedback__text"
              value={text}
              onChange={(e) => setText(e.target.value.slice(0, MAX_LEN))}
              placeholder={
                kind === 'bug'
                  ? 'What were you doing? What did you expect? What happened instead?'
                  : 'What would make this better?'
              }
              rows={5}
              autoFocus
            />
            <div className="puc-feedback__meta">
              <span>{text.length} / {MAX_LEN}</span>
            </div>

            {state.kind === 'error' && (
              <p className="puc-feedback__error">{state.message}</p>
            )}
            {state.kind === 'ok' && (
              <p className="puc-feedback__ok">Sent — thanks!</p>
            )}

            <div className="puc-feedback__actions">
              <button
                type="button"
                className="puc-feedback__btn"
                onClick={close}
                disabled={state.kind === 'sending'}
              >
                Cancel
              </button>
              <button
                type="button"
                className="puc-feedback__btn puc-feedback__btn--primary"
                onClick={onSubmit}
                disabled={state.kind === 'sending' || text.trim().length === 0}
              >
                {state.kind === 'sending' ? 'Sending…' : 'Send'}
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}
