// LibraryRoute — bookshelf visualisation of the 108 host-retold chess
// stories. Each "spine" is one source book; its width encodes all-time
// reads across the whole castle (heat) and a golden fill at the bottom
// encodes the SIGNED-IN guest's reading progress in that book.
//
// Tap a spine → a drawer slides up showing every story in that book.
// Inside the drawer the kid can read inline + tap "🔊 Read aloud" to
// hear it. Read stories carry a ✓ check next to their title.

import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCastle } from '../castle/useCastle'
import {
  callGetLibraryShelves,
  callMarkStoryRead,
  callSynthesizeStoryAudio,
  type LibraryShelfEntry,
} from '../firebase/callables'
import { speakLong, type SpeakLongHandle } from '../audio/speakLong'
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

const HEAT_BUCKETS = [
  { max: 50, label: 'cool', width: 44 },
  { max: 200, label: 'warm', width: 60 },
  { max: Infinity, label: 'hot', width: 78 },
] as const
const HOT_GLOW_TOP_N = 5

function heatBucket(reads: number): (typeof HEAT_BUCKETS)[number] {
  for (const b of HEAT_BUCKETS) {
    if (reads <= b.max) return b
  }
  return HEAT_BUCKETS[HEAT_BUCKETS.length - 1]!
}

function hslForBook(book: string): { primary: string; deep: string } {
  let h = 0
  for (let i = 0; i < book.length; i++) {
    h = (h * 31 + book.charCodeAt(i)) % 360
  }
  return {
    primary: `hsl(${h}, 55%, 42%)`,
    deep: `hsl(${(h + 25) % 360}, 60%, 24%)`,
  }
}

export function LibraryRoute() {
  const navigate = useNavigate()
  const { hostId } = useCastle()

  const [bundle, setBundle] = useState<Bundle | null>(null)
  const [shelves, setShelves] = useState<LibraryShelfEntry[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [voice, setVoice] = useState<HostVoice>(hostId)
  const [openBook, setOpenBook] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [speakingId, setSpeakingId] = useState<string | null>(null)
  const [loadingId, setLoadingId] = useState<string | null>(null)
  const speakingRef = useRef<string | null>(null)
  const readMarkedRef = useRef<Set<string>>(new Set())

  const audioCacheRef = useRef<Map<string, string>>(new Map())
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const speechRef = useRef<SpeakLongHandle | null>(null)

  // Load story bundle + shelf stats in parallel. Bundle drives the
  // drawer contents; shelves drive the spine sizing/heat/progress.
  useEffect(() => {
    let cancelled = false
    void fetch('/stories.bundle.json')
      .then((r) => r.json() as Promise<Bundle>)
      .then((b) => { if (!cancelled) setBundle(b) })
      .catch((err) => {
        if (cancelled) return
        console.error('Library: bundle fetch failed', err)
        setError('Could not load the library. Try again later.')
      })
    callGetLibraryShelves()
      .then((res) => { if (!cancelled) setShelves(res.shelves) })
      .catch((err) => {
        if (cancelled) return
        console.warn('Library: shelves fetch failed', err)
        // Fall back to bundle-derived shelves (no heat / no progress).
        setShelves([])
      })
    return () => { cancelled = true }
  }, [])

  // Stop any in-flight speech when the kid navigates away + release
  // every cached blob URL so we don't leak memory.
  useEffect(() => {
    const cache = audioCacheRef.current
    return () => {
      audioRef.current?.pause()
      audioRef.current = null
      speechRef.current?.cancel()
      speechRef.current = null
      for (const url of cache.values()) URL.revokeObjectURL(url)
      cache.clear()
    }
  }, [])

  useEffect(() => {
    audioRef.current?.pause()
    audioRef.current = null
    speechRef.current?.cancel()
    speechRef.current = null
    speakingRef.current = null
    setSpeakingId(null)
    setLoadingId(null)
  }, [voice])

  // Story map keyed by id for fast drawer lookups.
  const storiesByBook = useMemo(() => {
    const m = new Map<string, BundledStory[]>()
    if (!bundle) return m
    for (const s of bundle.stories) {
      const k = s.source.book ?? 'Other tales'
      const existing = m.get(k)
      if (existing) existing.push(s)
      else m.set(k, [s])
    }
    for (const list of m.values()) {
      list.sort((a, b) => a.title.localeCompare(b.title))
    }
    return m
  }, [bundle])

  // Hot-N book ids (by reads) — these get the gold glow on the spine.
  const hotKeys = useMemo(() => {
    if (!shelves) return new Set<string>()
    return new Set(
      [...shelves]
        .sort((a, b) => b.reads - a.reads)
        .slice(0, HOT_GLOW_TOP_N)
        .filter((s) => s.reads > 0)
        .map((s) => s.bookKey),
    )
  }, [shelves])

  // Read-marker dispatcher — fire-and-forget, deduped per tab.
  const markRead = (storyId: string) => {
    if (readMarkedRef.current.has(storyId)) return
    readMarkedRef.current.add(storyId)
    // Optimistic UI: bump local kidReadCount + the kidReadIds tracking
    // so the drawer ✓ + the spine fill update immediately.
    setShelves((prev) => {
      if (!prev) return prev
      const bookKey = bundle?.stories.find((s) => s.id === storyId)?.source.book ?? 'Other tales'
      return prev.map((s) =>
        s.bookKey === bookKey && s.storyIds.includes(storyId)
          ? { ...s, kidReadCount: Math.min(s.totalStories, s.kidReadCount + 1) }
          : s,
      )
    })
    setReadIdsLocal((prev) => new Set(prev).add(storyId))
    callMarkStoryRead({ storyId }).catch((err) => console.warn('markStoryRead failed', err))
  }

  // Locally-tracked read ids (server-mirrored on next visit). Seeded
  // by what we infer the kidReadCount represents: we don't know the
  // exact ids on first load, so we just track newly-marked-in-this-tab
  // ids for ✓ rendering inside the drawer.
  const [readIdsLocal, setReadIdsLocal] = useState<Set<string>>(new Set())

  const stopAll = () => {
    audioRef.current?.pause()
    audioRef.current = null
    speechRef.current?.cancel()
    speechRef.current = null
    speakingRef.current = null
    setSpeakingId(null)
  }

  const speakViaBrowser = (story: BundledStory) => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return
    const wantedMatch = voice === 'lucy'
      ? /female|samantha|victoria|karen|moira|tessa|kathy|allison|ava/i
      : /male|alex|fred|daniel|oliver|tom|aaron/i
    speakingRef.current = story.id
    setSpeakingId(story.id)
    const finish = () => {
      if (speakingRef.current === story.id) {
        speakingRef.current = null
        setSpeakingId(null)
      }
      speechRef.current = null
    }
    speechRef.current = speakLong({
      text: story.variants[voice],
      lang: 'en-US',
      rate: 0.95,
      pickVoice: (voices) => voices.find((v) => v.lang.startsWith('en') && wantedMatch.test(v.name)),
      onEnd: finish,
      onError: finish,
    })
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
    audio.play().catch(() => finish())
  }

  const speak = async (story: BundledStory) => {
    if (speakingRef.current === story.id || loadingId === story.id) {
      stopAll()
      setLoadingId(null)
      return
    }
    stopAll()
    markRead(story.id)

    const staticUrl = `/audio/${story.id}-${voice}.mp3`
    if (await staticExists(staticUrl)) {
      playFromUrl(story, staticUrl)
      return
    }
    const cacheKey = `${story.id}:${voice}`
    const cached = audioCacheRef.current.get(cacheKey)
    if (cached) {
      playFromUrl(story, cached)
      return
    }
    setLoadingId(story.id)
    try {
      const res = await callSynthesizeStoryAudio({ voice, text: story.variants[voice] })
      if (loadingId !== null && loadingId !== story.id) return
      const blob = base64ToBlob(res.audioBase64, res.mimeType)
      const url = URL.createObjectURL(blob)
      audioCacheRef.current.set(cacheKey, url)
      setLoadingId(null)
      playFromUrl(story, url)
    } catch (err) {
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

  const openBookShelf = shelves?.find((s) => s.bookKey === openBook)
  const openBookStories = openBook ? storiesByBook.get(openBook) ?? [] : []

  // Group shelves into rows for the bookshelf. Mobile fits 5 spines
  // per shelf, desktop fits 10 — we just chunk in CSS via flex-wrap
  // and let the wood-plank background tile vertically.
  const shelfRows = shelves ?? []

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
            {bundle
              ? `${bundle.count} chess stories — read or listen.`
              : 'Opening the library…'}
          </p>
        </div>
        <div className="puc-library__voice" role="radiogroup" aria-label="Reader voice">
          <button
            type="button"
            role="radio"
            aria-checked={voice === 'lucy'}
            className={'puc-library__voice-btn ' + (voice === 'lucy' ? 'puc-library__voice-btn--on' : '')}
            onClick={() => setVoice('lucy')}
          >
            Lucy
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={voice === 'luca'}
            className={'puc-library__voice-btn ' + (voice === 'luca' ? 'puc-library__voice-btn--on' : '')}
            onClick={() => setVoice('luca')}
          >
            Luca
          </button>
        </div>
      </header>

      {error && <p className="puc-library__error">{error}</p>}

      <main className="puc-library__bookshelf">
        {shelfRows.length === 0 ? (
          <p className="puc-library__loading">Polishing the shelves…</p>
        ) : (
          <div className="puc-library__shelf">
            {shelfRows.map((shelf) => (
              <BookSpine
                key={shelf.bookKey}
                shelf={shelf}
                hot={hotKeys.has(shelf.bookKey)}
                onOpen={() => {
                  setOpenBook(shelf.bookKey)
                  setExpandedId(null)
                }}
              />
            ))}
          </div>
        )}
      </main>

      {openBook && openBookShelf && (
        <BookDrawer
          shelf={openBookShelf}
          stories={openBookStories}
          voice={voice}
          expandedId={expandedId}
          speakingId={speakingId}
          loadingId={loadingId}
          readIds={readIdsLocal}
          onToggleExpand={(id) => {
            setExpandedId((prev) => (prev === id ? null : id))
            if (expandedId !== id) markRead(id)
          }}
          onSpeak={(s) => { void speak(s) }}
          onClose={() => {
            setOpenBook(null)
            setExpandedId(null)
            stopAll()
          }}
        />
      )}
    </div>
  )
}

function BookSpine({
  shelf,
  hot,
  onOpen,
}: {
  shelf: LibraryShelfEntry
  hot: boolean
  onOpen: () => void
}) {
  const bucket = heatBucket(shelf.reads)
  const colors = hslForBook(shelf.bookKey)
  const progressPct = shelf.totalStories > 0
    ? Math.round((shelf.kidReadCount / shelf.totalStories) * 100)
    : 0
  const finished = progressPct >= 100
  return (
    <button
      type="button"
      className={
        'puc-spine' +
        (hot ? ' puc-spine--hot' : '') +
        (finished ? ' puc-spine--finished' : '')
      }
      onClick={onOpen}
      style={{
        ['--spine-w' as string]: `${bucket.width}px`,
        ['--spine-color' as string]: colors.primary,
        ['--spine-color-deep' as string]: colors.deep,
        ['--spine-progress' as string]: `${progressPct}%`,
      }}
      title={`${shelf.bookKey} · ${shelf.kidReadCount}/${shelf.totalStories} read · ${shelf.reads} total reads`}
      aria-label={`${shelf.bookKey}, ${shelf.kidReadCount} of ${shelf.totalStories} read`}
    >
      {finished && <span className="puc-spine__seal" aria-hidden="true">✓</span>}
      {hot && <span className="puc-spine__hot" aria-hidden="true">🔥</span>}
      <span className="puc-spine__title">{shelf.bookKey}</span>
      <span className="puc-spine__progress" aria-hidden="true" />
    </button>
  )
}

function BookDrawer({
  shelf,
  stories,
  voice,
  expandedId,
  speakingId,
  loadingId,
  readIds,
  onToggleExpand,
  onSpeak,
  onClose,
}: {
  shelf: LibraryShelfEntry
  stories: BundledStory[]
  voice: HostVoice
  expandedId: string | null
  speakingId: string | null
  loadingId: string | null
  readIds: Set<string>
  onToggleExpand: (id: string) => void
  onSpeak: (s: BundledStory) => void
  onClose: () => void
}) {
  // ESC closes the drawer.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const colors = hslForBook(shelf.bookKey)
  return (
    <div
      className="puc-drawer-overlay"
      role="dialog"
      aria-label={`${shelf.bookKey} stories`}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="puc-drawer"
        style={{ ['--drawer-color' as string]: colors.primary }}
      >
        <header className="puc-drawer__head">
          <div className="puc-drawer__head-text">
            <h2 className="puc-drawer__title">{shelf.bookKey}</h2>
            {shelf.author && <p className="puc-drawer__author">by {shelf.author}</p>}
            <p className="puc-drawer__meta">
              {shelf.kidReadCount} / {shelf.totalStories} read · {shelf.reads} total reads
            </p>
          </div>
          <button
            type="button"
            className="puc-drawer__close"
            onClick={onClose}
            aria-label="Close"
          >✕</button>
        </header>
        <ul className="puc-drawer__list">
          {stories.map((story) => {
            const expanded = expandedId === story.id
            const speaking = speakingId === story.id
            const loading = loadingId === story.id
            const read = readIds.has(story.id)
            return (
              <li
                key={story.id}
                className={'puc-drawer__story ' + (expanded ? 'puc-drawer__story--open' : '')}
              >
                <button
                  type="button"
                  className="puc-drawer__story-head"
                  onClick={() => onToggleExpand(story.id)}
                  aria-expanded={expanded}
                >
                  <span
                    className={'puc-drawer__story-check' + (read ? ' puc-drawer__story-check--on' : '')}
                    aria-hidden="true"
                  >
                    {read ? '✓' : ''}
                  </span>
                  <span className="puc-drawer__story-title">{story.title}</span>
                  {story.era && <span className="puc-drawer__story-era">{story.era}</span>}
                  <span className="puc-drawer__story-chevron" aria-hidden="true">
                    {expanded ? '▾' : '▸'}
                  </span>
                </button>
                {expanded && (
                  <div className="puc-drawer__story-body">
                    <p className="puc-drawer__story-text">{story.variants[voice]}</p>
                    <div className="puc-drawer__story-actions">
                      <button
                        type="button"
                        className={
                          'puc-drawer__story-tts ' +
                          (speaking ? 'puc-drawer__story-tts--on ' : '') +
                          (loading ? 'puc-drawer__story-tts--loading' : '')
                        }
                        onClick={() => onSpeak(story)}
                        disabled={loading}
                      >
                        {loading
                          ? `⏳ Loading ${voice === 'lucy' ? 'Lucy' : 'Luca'}…`
                          : speaking
                            ? '⏹ Stop'
                            : '🔊 Read aloud'}
                      </button>
                      <span className="puc-drawer__story-meta">{story.motif}</span>
                    </div>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}

function base64ToBlob(base64: string, mimeType: string): Blob {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new Blob([bytes], { type: mimeType })
}
