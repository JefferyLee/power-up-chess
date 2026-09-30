// CastleSign — wooden billboard at the castle gate. Pre-auth, public.
//
// Collapsed: a small "📜 What's inside?" tag hanging on the wall.
// Expanded: parchment overlay with the castle's ad copy + a Share
// button that adaptively picks the best path the platform supports:
// Web Share API (iOS / macOS PWA → system share sheet) → Clipboard
// API (image to clipboard) → download. A secondary "save as image"
// link is always available as an explicit escape hatch.

import { useEffect, useState } from 'react'
import { downloadShareImage, generateShareImage, SHARE_URL } from './shareImage'
import './CastleSign.css'

const SHARE_TITLE = 'Power Up Castle'
const SHARE_TEXT = 'A warm, safe home where kids learn chess by playing.'

// Verb-led parallel structure. Each line ≤ 15 words. The leading
// word + em-dash render as a bold lede so the eye can skim.
const FEATURES: Array<{ verb: string; rest: string }> = [
  { verb: 'Learn',   rest: 'Chess Basics + Knight’s Hop, short interactive lessons' },
  { verb: 'Solve',   rest: '5,300+ adaptive puzzles, six plots, daily Today’s Five' },
  { verb: 'Play',    rest: 'invite friends, weekly tournament, or train vs Lucy / Luca' },
  { verb: 'Explore', rest: 'Forest Adventure, Wizard’s Duel, Knight’s Run, Story Bookshelf' },
  { verb: 'Collect', rest: 'piece sets, boards, daily streaks; check your Adventurer’s Plaque' },
  { verb: 'Chat',    rest: 'Great Hall — find any player, peek at their plaque' },
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

  /** Primary share path. Feature-detects at call time:
   *   1. navigator.share + files → native share sheet (iOS / macOS).
   *   2. navigator.clipboard.write(ClipboardItem) → image to pasteboard.
   *   3. Fallback: trigger download.
   *  Cancelled native shares are silent (user picked "X" out of the
   *  sheet — no toast needed). Failures fall through to the next path.
   */
  const onShare = async () => {
    if (busy) return
    setBusy(true)
    setShareNote(null)
    try {
      const blob = await generateShareImage()
      const file = new File([blob], 'power-up-castle.png', { type: 'image/png' })

      // 1. Native share sheet — best on iOS / macOS PWA.
      if (
        typeof navigator !== 'undefined' &&
        typeof navigator.share === 'function' &&
        typeof navigator.canShare === 'function' &&
        navigator.canShare({ files: [file] })
      ) {
        try {
          await navigator.share({
            files: [file],
            title: SHARE_TITLE,
            text: SHARE_TEXT,
            url: SHARE_URL,
          })
          setShareNote('Shared.')
          return
        } catch (err) {
          // AbortError = user cancelled the share sheet — that's fine,
          // don't surface a toast. Other errors fall through to clipboard.
          if (err instanceof Error && err.name === 'AbortError') return
          console.warn('navigator.share failed, trying clipboard:', err)
        }
      }

      // 2. Image to clipboard — best on desktop Chrome / Edge.
      if (
        typeof navigator !== 'undefined' &&
        navigator.clipboard &&
        typeof ClipboardItem !== 'undefined' &&
        typeof navigator.clipboard.write === 'function'
      ) {
        try {
          await navigator.clipboard.write([
            new ClipboardItem({ 'image/png': blob }),
          ])
          setShareNote('Copied to clipboard — paste it anywhere.')
          return
        } catch (err) {
          console.warn('clipboard.write failed, falling back to download:', err)
        }
      }

      // 3. Plain old download — works in every browser.
      triggerDownload(blob, 'power-up-castle.png')
      setShareNote('Image downloaded — share it anywhere.')
    } catch (err) {
      console.warn('share image failed:', err)
      setShareNote('Could not build the share image. Try again.')
    } finally {
      setBusy(false)
    }
  }

  /** Explicit "give me the file" escape hatch — always downloads
   *  regardless of what the primary Share path would choose. Useful
   *  on platforms where the auto choice ended up in clipboard but the
   *  user actually wants a file. */
  const onSave = async () => {
    if (busy) return
    setBusy(true)
    setShareNote(null)
    try {
      await downloadShareImage()
      setShareNote('Image downloaded.')
    } catch (err) {
      console.warn('save image failed:', err)
      setShareNote('Could not build the share image. Try again.')
    } finally {
      setBusy(false)
    }
  }

  function triggerDownload(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    setTimeout(() => URL.revokeObjectURL(url), 5000)
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
                <li key={i}>
                  <b>{line.verb}</b> — {line.rest}
                </li>
              ))}
            </ul>
            <p className="puc-sign-overlay__ages">
              Ages 5+ · every chess level — from &ldquo;what&apos;s a knight?&rdquo; to &ldquo;I just hit 1500.&rdquo;
            </p>
            <p className="puc-sign-overlay__safety">
              Safe by design — no personal info, server-moderated chat, online play by friend invite only.
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
                {busy ? 'Drawing…' : 'Share this castle'}
              </button>
            </div>
            <button
              type="button"
              className="puc-sign-overlay__save"
              onClick={onSave}
              disabled={busy}
            >
              or save as image
            </button>
            {shareNote && <p className="puc-sign-overlay__note">{shareNote}</p>}
          </div>
        </div>
      )}
    </>
  )
}
