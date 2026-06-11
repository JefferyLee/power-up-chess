// CurrentStoryPanel — renders the host's latest ambient story under
// the Hall's host portrait. Reads castle_live/current_story (public
// doc, written server-side by pickAndPostStory).
//
// Behaviour:
//   • Hides if the doc is for a different host than the one currently
//     on duty (host rotation cleared their tale).
//   • Collapsed by default on phone widths so it doesn't crowd the
//     screen; one tap expands.
//   • Read-aloud button reuses the library's TTS pipeline (static
//     /audio/<id>-<voice>.mp3 → Edge-TTS callable → browser fallback).

import { useEffect, useRef, useState } from 'react'
import { doc, onSnapshot } from 'firebase/firestore'
import { db } from '../firebase/app'
import type { HostId } from '../hosts/hosts'
import { callSynthesizeStoryAudio } from '../firebase/callables'
import { speakLong, type SpeakLongHandle } from '../audio/speakLong'
import './CurrentStoryPanel.css'

interface CurrentStory {
  hostId: HostId
  storyId: string
  title: string
  body: string
  postedAt: number
  messageId: string
}

interface Props {
  currentHostId: HostId
  /** Force-collapsed on phone widths via parent media query check.
   *  Parent supplies via window match; component starts collapsed
   *  there but the kid can tap to expand. */
  defaultCollapsed?: boolean
}

export function CurrentStoryPanel({ currentHostId, defaultCollapsed }: Props) {
  const [story, setStory] = useState<CurrentStory | null>(null)
  const [expanded, setExpanded] = useState(!defaultCollapsed)
  const [speaking, setSpeaking] = useState(false)
  const [loading, setLoading] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const speechRef = useRef<SpeakLongHandle | null>(null)
  const cacheRef = useRef<Map<string, string>>(new Map())

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'castle_live', 'current_story'), (snap) => {
      if (!snap.exists()) { setStory(null); return }
      setStory(snap.data() as CurrentStory)
    })
    return () => unsub()
  }, [])

  // Stop any playback + release audio handles on unmount.
  useEffect(() => {
    const cache = cacheRef.current
    return () => {
      audioRef.current?.pause()
      audioRef.current = null
      speechRef.current?.cancel()
      speechRef.current = null
      for (const url of cache.values()) URL.revokeObjectURL(url)
      cache.clear()
    }
  }, [])

  if (!story) return null
  // Stale tale from the other host — hide. The next story this host
  // tells will overwrite the doc.
  if (story.hostId !== currentHostId) return null

  const hostName = story.hostId === 'lucy' ? 'Lucy' : 'Luca'
  const paragraphs = story.body.split(/\n+/).filter((p) => p.trim().length > 0)

  const stop = () => {
    audioRef.current?.pause()
    audioRef.current = null
    speechRef.current?.cancel()
    speechRef.current = null
    setSpeaking(false)
  }

  const play = (url: string) => {
    const audio = new Audio(url)
    audioRef.current = audio
    setSpeaking(true)
    const finish = () => {
      if (audioRef.current === audio) audioRef.current = null
      setSpeaking(false)
    }
    audio.onended = finish
    audio.onerror = finish
    audio.play().catch(finish)
  }

  const speakFallback = () => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return
    setSpeaking(true)
    speechRef.current = speakLong({
      text: story.body,
      lang: 'en-US',
      rate: 0.95,
      onEnd: () => { speechRef.current = null; setSpeaking(false) },
      onError: () => { speechRef.current = null; setSpeaking(false) },
    })
  }

  const onSpeak = async () => {
    if (speaking || loading) { stop(); setLoading(false); return }
    // Tier 1: in-memory blob cache for this session — holds both
    // previously-downloaded static mp3s and synthesized audio.
    const cacheKey = `${story.storyId}:${story.hostId}`
    const cached = cacheRef.current.get(cacheKey)
    if (cached) { play(cached); return }
    setLoading(true)
    // Tier 2: pre-baked static mp3, downloaded IN FULL before playing.
    // Streaming the file URL directly was the source of random
    // mid-story cutoffs on iOS: Safari fetches media in Range chunks,
    // and any mid-stream hiccup (iOS killing the service worker,
    // a dropped segment request) stops playback cold. A blob in
    // memory has nothing left to interrupt. Content-type check
    // matters too: Firebase's SPA rewrite answers MISSING files with
    // 200 index.html — without it we'd "play" HTML and never reach
    // the fallbacks.
    const staticUrl = `/audio/${story.storyId}-${story.hostId}.mp3`
    try {
      const res = await fetch(staticUrl)
      const type = res.headers.get('content-type') ?? ''
      if (res.ok && type.startsWith('audio/')) {
        const blob = await res.blob()
        const url = URL.createObjectURL(blob)
        cacheRef.current.set(cacheKey, url)
        setLoading(false)
        play(url)
        return
      }
    } catch { /* fall through */ }
    // Tier 3: Edge-TTS via Cloud Function.
    try {
      const res = await callSynthesizeStoryAudio({ voice: story.hostId, text: story.body })
      const bytes = Uint8Array.from(atob(res.audioBase64), (c) => c.charCodeAt(0))
      const blob = new Blob([bytes], { type: res.mimeType })
      const url = URL.createObjectURL(blob)
      cacheRef.current.set(cacheKey, url)
      setLoading(false)
      play(url)
    } catch (err) {
      console.warn('TTS callable failed, falling back to browser speech', err)
      setLoading(false)
      speakFallback()
    }
  }

  return (
    <section className={'puc-story-panel' + (expanded ? '' : ' puc-story-panel--collapsed')}>
      <header className="puc-story-panel__head">
        <span className="puc-story-panel__chip">
          {story.hostId === 'lucy' ? '🌿' : '✨'} {hostName} is telling
        </span>
        <button
          type="button"
          className="puc-story-panel__expand"
          onClick={() => setExpanded((v) => !v)}
          aria-label={expanded ? 'Collapse story' : 'Expand story'}
        >
          {expanded ? '▾' : '▸'}
        </button>
      </header>
      <h3 className="puc-story-panel__title">{story.title}</h3>
      {expanded && (
        <>
          <div className="puc-story-panel__body">
            {paragraphs.map((p, i) => <p key={i}>{p}</p>)}
          </div>
          <button
            type="button"
            className={
              'puc-story-panel__tts' +
              (speaking ? ' puc-story-panel__tts--on' : '') +
              (loading ? ' puc-story-panel__tts--loading' : '')
            }
            onClick={() => { void onSpeak() }}
            disabled={loading}
          >
            {loading
              ? `⏳ Loading ${hostName}…`
              : speaking
                ? '⏹ Stop'
                : `🔊 Read aloud (${hostName})`}
          </button>
        </>
      )}
    </section>
  )
}
