// LibraryRoute — the Story Library. Exposes all 108 host-retold
// chess stories that previously only appeared in the Hall's ambient
// rotation.
//
// Stories are grouped by source book; the kid picks a host voice
// (Lucy / Luca) which decides both the displayed text variant and
// the TTS playback. No quizzes here — this is a sit-and-read corner.
//
// The bundle is a static asset served from /stories.bundle.json
// (mirrored on build by functions/scripts/bundle-stories.mjs).

import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCastle } from '../castle/useCastle'
import './LibraryRoute.css'

interface BundledStory {
  id: string
  title: string
  variants: { lucy: string; luca: string }
  motif: string
  era?: string
  source: { book?: string; author?: string }
}

interface Bundle {
  count: number
  stories: BundledStory[]
}

type HostVoice = 'lucy' | 'luca'

export function LibraryRoute() {
  const navigate = useNavigate()
  const { hostId } = useCastle()

  const [bundle, setBundle] = useState<Bundle | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Voice defaults to whoever is on duty so the library matches the
  // tone the kid already heard in the Hall.
  const [voice, setVoice] = useState<HostVoice>(hostId)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [speakingId, setSpeakingId] = useState<string | null>(null)
  const speakingRef = useRef<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void fetch('/stories.bundle.json')
      .then((r) => r.json() as Promise<Bundle>)
      .then((b) => {
        if (cancelled) return
        setBundle(b)
      })
      .catch((err) => {
        if (cancelled) return
        console.error('Library: failed to load story bundle', err)
        setError('Could not load the library. Try again later.')
      })
    return () => {
      cancelled = true
    }
  }, [])

  // Stop any in-flight speech when the kid navigates away.
  useEffect(() => {
    return () => {
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.cancel()
      }
    }
  }, [])

  const groups = useMemo(() => groupByBook(bundle?.stories ?? []), [bundle])

  const speak = (story: BundledStory) => {
    if (typeof window === 'undefined' || !window.speechSynthesis) {
      // Browser without speechSynthesis support — just no-op; the read
      // button is still useful as visual feedback that the feature
      // exists, and the text is shown on the page already.
      return
    }
    const synth = window.speechSynthesis
    // Toggle off if already speaking this story.
    if (speakingRef.current === story.id) {
      synth.cancel()
      speakingRef.current = null
      setSpeakingId(null)
      return
    }
    synth.cancel()
    const utterance = new SpeechSynthesisUtterance(story.variants[voice])
    utterance.lang = 'en-US'
    utterance.rate = 0.95
    // Try to pick a voice that loosely matches each host (female for
    // Lucy, male for Luca). The Web Speech API exposes a noisy voice
    // list; we just take the first match by name pattern.
    const allVoices = synth.getVoices()
    const wantedMatch = voice === 'lucy'
      ? /female|samantha|victoria|karen|moira|tessa|kathy|allison|ava/i
      : /male|alex|fred|daniel|oliver|tom|aaron/i
    const picked = allVoices.find((v) => v.lang.startsWith('en') && wantedMatch.test(v.name))
    if (picked) utterance.voice = picked
    utterance.onend = () => {
      if (speakingRef.current === story.id) {
        speakingRef.current = null
        setSpeakingId(null)
      }
    }
    utterance.onerror = utterance.onend
    speakingRef.current = story.id
    setSpeakingId(story.id)
    synth.speak(utterance)
  }

  return (
    <div className="puc-library">
      <header className="puc-library__header">
        <button
          type="button"
          className="puc-library__back"
          onClick={() => navigate('/')}
          aria-label="Back to hall"
        >
          ←
        </button>
        <div className="puc-library__title-wrap">
          <h1 className="puc-library__title">Story Library</h1>
          <p className="puc-library__sub">
            {bundle ? `${bundle.count} chess stories — read or listen.` : 'Opening the library…'}
          </p>
        </div>
        <div
          className="puc-library__voice"
          role="radiogroup"
          aria-label="Reader voice"
        >
          <button
            type="button"
            role="radio"
            aria-checked={voice === 'lucy'}
            className={
              'puc-library__voice-btn ' +
              (voice === 'lucy' ? 'puc-library__voice-btn--on' : '')
            }
            onClick={() => setVoice('lucy')}
          >
            Lucy
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={voice === 'luca'}
            className={
              'puc-library__voice-btn ' +
              (voice === 'luca' ? 'puc-library__voice-btn--on' : '')
            }
            onClick={() => setVoice('luca')}
          >
            Luca
          </button>
        </div>
      </header>

      {error && <p className="puc-library__error">{error}</p>}

      <main className="puc-library__main">
        {groups.map((group) => (
          <section key={group.book} className="puc-library__group">
            <h2 className="puc-library__group-title">{group.book}</h2>
            {group.author && (
              <p className="puc-library__group-author">by {group.author}</p>
            )}
            <ul className="puc-library__list">
              {group.stories.map((story) => {
                const expanded = expandedId === story.id
                const speaking = speakingId === story.id
                return (
                  <li
                    key={story.id}
                    className={
                      'puc-library__story ' +
                      (expanded ? 'puc-library__story--open' : '')
                    }
                  >
                    <button
                      type="button"
                      className="puc-library__story-head"
                      onClick={() =>
                        setExpandedId((prev) => (prev === story.id ? null : story.id))
                      }
                      aria-expanded={expanded}
                    >
                      <span className="puc-library__story-title">{story.title}</span>
                      {story.era && (
                        <span className="puc-library__story-era">{story.era}</span>
                      )}
                      <span
                        className="puc-library__story-chevron"
                        aria-hidden="true"
                      >
                        {expanded ? '▾' : '▸'}
                      </span>
                    </button>
                    {expanded && (
                      <div className="puc-library__story-body">
                        <p className="puc-library__story-text">
                          {story.variants[voice]}
                        </p>
                        <div className="puc-library__story-actions">
                          <button
                            type="button"
                            className={
                              'puc-library__story-tts ' +
                              (speaking ? 'puc-library__story-tts--on' : '')
                            }
                            onClick={() => speak(story)}
                          >
                            {speaking ? '⏹ Stop' : '🔊 Read aloud'}
                          </button>
                          <span className="puc-library__story-meta">
                            {story.motif}
                          </span>
                        </div>
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          </section>
        ))}
      </main>
    </div>
  )
}

interface Group {
  book: string
  author?: string
  stories: BundledStory[]
}

function groupByBook(stories: BundledStory[]): Group[] {
  const byBook = new Map<string, Group>()
  for (const s of stories) {
    const book = s.source.book ?? 'Other tales'
    const existing = byBook.get(book)
    if (existing) {
      existing.stories.push(s)
    } else {
      byBook.set(book, {
        book,
        author: s.source.author,
        stories: [s],
      })
    }
  }
  // Sort books alphabetically, but pull "Other tales" to the end.
  const groups = Array.from(byBook.values()).sort((a, b) => {
    if (a.book === 'Other tales') return 1
    if (b.book === 'Other tales') return -1
    return a.book.localeCompare(b.book)
  })
  // Sort stories within each book alphabetically by title for
  // predictable browsing.
  for (const g of groups) {
    g.stories.sort((a, b) => a.title.localeCompare(b.title))
  }
  return groups
}
