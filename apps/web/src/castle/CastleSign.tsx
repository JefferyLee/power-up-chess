// CastleSign — wooden billboard at the castle gate. Pre-auth, public.
//
// Collapsed: a small "📜 What's inside?" tag hanging on the wall.
// Expanded: parchment overlay with the castle's ad copy + a Share button
// that generates a PNG (title + tagline + features + URL + QR code)
// and downloads it via an <a download> link.

import { useEffect, useState } from 'react'
import { downloadShareImage } from './shareImage'
import './CastleSign.css'

const FEATURES: string[] = [
  '5,300+ puzzles that adapt to your level — six themed plots, daily quests, master + legend tiers',
  'Play friends privately by room link — 5-min blitz to 1-day correspondence',
  'Practice with Lucy or Luca, two AI hosts who chat about your moves',
  'Forest Adventure + Wizard’s Duel — playful side games that earn castle points',
  'The Great Hall — moderated lobby chat. No DMs, no public matchmaking, display names only.',
  '[NEW] Chess Basics — 5 short interactive lessons that take first-timers from zero',
  '[NEW] Story Library — 108 chess stories, read or listened to in Lucy or Luca’s voice',
  '[NEW] Theme Shop — collect piece sets (Cburnett, Fantasy, Glowing Crystal) with castle points',
  '[NEW] Knight’s Hop — learn each piece by playing AS it, one chess-legal hop at a time',
]

export function CastleSign() {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [shareNote, setShareNote] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const onShare = async () => {
    if (busy) return
    setBusy(true)
    setShareNote(null)
    try {
      await downloadShareImage()
      setShareNote('Image downloaded — share it anywhere.')
    } catch (err) {
      console.warn('share image failed:', err)
      setShareNote('Could not build the share image. Try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <button
        type="button"
        className="puc-sign"
        aria-label="Read about Power Up Castle"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <span className="puc-sign__icon" aria-hidden="true">📜</span>
        <span className="puc-sign__label">What&apos;s inside?</span>
      </button>

      {open && (
        <div
          className="puc-sign-overlay"
          role="dialog"
          aria-label="About Power Up Castle"
          onClick={(e) => { if (e.target === e.currentTarget) setOpen(false) }}
        >
          <div className="puc-sign-overlay__card">
            <button
              type="button"
              className="puc-sign-overlay__close"
              onClick={() => setOpen(false)}
              aria-label="Close sign"
            >
              ✕
            </button>
            <div className="puc-sign-overlay__pin" aria-hidden="true" />
            <h2 className="puc-sign-overlay__title">Power Up Castle</h2>
            <p className="puc-sign-overlay__tagline">
              A warm, safe home where kids learn chess by playing.
            </p>
            <ul className="puc-sign-overlay__list">
              {FEATURES.map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
            <p className="puc-sign-overlay__ages">
              Ages 8–12 · every chess level — from &ldquo;what&apos;s a knight?&rdquo; to &ldquo;I just hit 1500.&rdquo;
            </p>
            <p className="puc-sign-overlay__safety">
              Safe by design: no personal info collected, chat is server-moderated,
              and online play happens only with friends you share a link with.
            </p>
            <div className="puc-sign-overlay__actions">
              <button
                type="button"
                className="puc-sign-overlay__btn"
                onClick={() => setOpen(false)}
              >
                Close
              </button>
              <button
                type="button"
                className="puc-sign-overlay__btn puc-sign-overlay__btn--primary"
                onClick={onShare}
                disabled={busy}
              >
                {busy ? 'Drawing…' : '↓ Share this castle'}
              </button>
            </div>
            {shareNote && <p className="puc-sign-overlay__note">{shareNote}</p>}
          </div>
        </div>
      )}
    </>
  )
}
