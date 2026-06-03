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
import { callSynthesizeStoryAudio } from '../firebase/callables'
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
  const [loadingId, setLoadingId] = useState<string | null>(null)
  const speakingRef = useRef<string | null>(null)

  // Edge-TTS audio cache + active <Audio> handle. URLs are blob URLs
  // (created via URL.createObjectURL); we revoke them on unmount so
  // the browser releases the underlying memory.
  const audioCacheRef = useRef<Map<string, string>>(new Map())
  const audioRef = useRef<HTMLAudioElement | null>(null)

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

  // Stop any in-flight speech when the kid navigates away + release
  // every cached blob URL so we don't leak memory.
  useEffect(() => {
    const cache = audioCacheRef.current
    return () => {
      audioRef.current?.pause()
      audioRef.current = null
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.cancel()
      }
      for (const url of cache.values()) {
        URL.revokeObjectURL(url)
      }
      cache.clear()
    }
  }, [])

  const groups = useMemo(() => groupByBook(bundle?.stories ?? []), [bundle])

  // Switching reader voice mid-listen should stop whatever was
  // playing — the cached audio is per (story, voice), so the kid
  // would hear two voices interleave otherwise.
  useEffect(() => {
    audioRef.current?.pause()
    audioRef.current = null
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel()
    }
    speakingRef.current = null
    setSpeakingId(null)
    setLoadingId(null)
  }, [voice])

  const stopAll = () => {
    audioRef.current?.pause()
    audioRef.current = null
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel()
    }
    speakingRef.current = null
    setSpeakingId(null)
  }

  // Browser-native fallback (Web Speech API) — used when Edge-TTS is
  // unreachable. Less natural than Aria/Guy but always available.
  const speakViaBrowser = (story: BundledStory) => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return
    const synth = window.speechSynthesis
    synth.cancel()
    const utterance = new SpeechSynthesisUtterance(story.variants[voice])
    utterance.lang = 'en-US'
    utterance.rate = 0.95
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

  const playFromUrl = (story: BundledStory, url: string) => {
    const audio = new Audio(url)
    audioRef.current = audio
    speakingRef.current = story.id
    setSpeakingId(story.id)
    const finish = () => {
      if (audioRef.current === audio) {
        audioRef.current = null
        if (speakingRef.current === story.id) {
          speakingRef.current = null
          setSpeakingId(null)
        }
      }
    }
    audio.onended = finish
    audio.onerror = finish
    audio.play().catch(() => {
      // Autoplay blocked or other media error — clear state silently.
      finish()
    })
  }

  const speak = async (story: BundledStory) => {
    // Toggle off if this story is already speaking (or loading).
    if (speakingRef.current === story.id || loadingId === story.id) {
      stopAll()
      setLoadingId(null)
      return
    }
    // Stop whatever else might be running first.
    stopAll()

    // Tier 1: pre-generated static asset under /audio/. Instant on
    // repeat plays via the browser's HTTP cache; ~30-60 KB first hit.
    const staticUrl = `/audio/${story.id}-${voice}.mp3`
    if (await staticExists(staticUrl)) {
      playFromUrl(story, staticUrl)
      return
    }

    // Tier 2: Edge-TTS via Cloud Function. Used for stories added
    // after the last pre-generation pass, or as a backup if the
    // static file failed to ship.
    const cacheKey = `${story.id}:${voice}`
    const cached = audioCacheRef.current.get(cacheKey)
    if (cached) {
      playFromUrl(story, cached)
      return
    }

    setLoadingId(story.id)
    try {
      const res = await callSynthesizeStoryAudio({
        voice,
        text: story.variants[voice],
      })
      if (loadingId !== null && loadingId !== story.id) return
      const blob = base64ToBlob(res.audioBase64, res.mimeType)
      const url = URL.createObjectURL(blob)
      audioCacheRef.current.set(cacheKey, url)
      setLoadingId(null)
      playFromUrl(story, url)
    } catch (err) {
      // Tier 3: browser Web Speech. Robotic but always available.
      console.warn('Edge-TTS callable failed, falling back to browser speech', err)
      setLoadingId(null)
      speakViaBrowser(story)
    }
  }

  async function staticExists(url: string): Promise<boolean> {
    try {
      const res = await fetch(url, { method: 'HEAD' })
      return res.ok
    } catch {
      return false
    }
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
                const loading = loadingId === story.id
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
                              (speaking ? 'puc-library__story-tts--on ' : '') +
                              (loading ? 'puc-library__story-tts--loading' : '')
                            }
                            onClick={() => speak(story)}
                            disabled={loading}
                          >
                            {loading
                              ? `⏳ Loading ${voice === 'lucy' ? 'Lucy' : 'Luca'}…`
                              : speaking
                                ? '⏹ Stop'
                                : '🔊 Read aloud'}
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

function base64ToBlob(base64: string, mimeType: string): Blob {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new Blob([bytes], { type: mimeType })
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
