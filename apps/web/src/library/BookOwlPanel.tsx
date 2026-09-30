// BookOwlPanel — the Library's Book Owl. Tap the owl, pick one of the
// curated topics, and it fetches a four-era reading list of REAL
// books (via the seekBooks proxy → book-seek). Every book card offers
// owl-voice read-aloud through the Edge-TTS callable.
//
// Topics are a fixed human-reviewed list — no free-text input reaches
// the LLM pipeline (child-safety rule).

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  callSeekBooks,
  callSynthesizeStoryAudio,
  type SeekBook,
  type SeekList,
  type SeekSection,
} from '../firebase/callables'
import { SEEK_TOPIC_CHIPS } from './seekTopics'
import './BookOwlPanel.css'

import { friendlyError } from '../errors/friendlyError'
const OWL_SRC = '/sprites/hall/book-owl.png?v=1'

type Phase =
  | { kind: 'closed' }
  | { kind: 'topics' }
  | { kind: 'fetching'; topicId: string }
  | { kind: 'list'; list: SeekList }
  | { kind: 'not-ready'; topicId: string }

/** Follows the Library's EN/中文 toggle: labels, intros, notes and the
 *  read-aloud voice all switch. The data is bilingual in one payload
 *  (book-seek generates both languages per book). */
export function BookOwlPanel({ lang }: { lang: 'en' | 'cn' }) {
  const [phase, setPhase] = useState<Phase>({ kind: 'closed' })
  const cacheRef = useRef(new Map<string, SeekList>())
  const cnMode = lang === 'cn'

  // ── Owl-voice playback. First synthesis takes a few seconds (cold
  // function + Edge-TTS), so the button gets an explicit "summoning"
  // state and results are cached per key — replays are instant. ──
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const audioCache = useRef(new Map<string, string>())
  const [speakingKey, setSpeakingKey] = useState<string | null>(null)
  const [loadingKey, setLoadingKey] = useState<string | null>(null)
  const [speakError, setSpeakError] = useState<string | null>(null)
  const stopAudio = useCallback(() => {
    audioRef.current?.pause()
    audioRef.current = null
    setSpeakingKey(null)
  }, [])
  useEffect(() => {
    const cache = audioCache.current
    return () => {
      stopAudio()
      for (const url of cache.values()) URL.revokeObjectURL(url)
      cache.clear()
    }
  }, [stopAudio])

  // Switching language mid-playback stops the old-language audio.
  useEffect(() => {
    stopAudio()
    setLoadingKey(null)
  }, [lang, stopAudio])

  const speakSeq = useRef(0)
  const speak = useCallback(async (rawKey: string, text: string) => {
    const key = `${lang}:${rawKey}`
    if (speakingKey === key || loadingKey === key) {
      // Tap-again cancels — bump the sequence so an in-flight
      // synthesis result is cached but NOT auto-played.
      speakSeq.current++
      stopAudio()
      setLoadingKey(null)
      return
    }
    setSpeakError(null)
    stopAudio()
    const seq = ++speakSeq.current
    let url = audioCache.current.get(key)
    if (!url) {
      setLoadingKey(key)
      try {
        const res = await callSynthesizeStoryAudio({
          voice: cnMode ? 'cn' : 'owl',
          text: text.slice(0, 3900),
        })
        const bytes = Uint8Array.from(atob(res.audioBase64), (c) => c.charCodeAt(0))
        url = URL.createObjectURL(new Blob([bytes], { type: res.mimeType }))
        audioCache.current.set(key, url)
      } catch (e) {
        if (speakSeq.current === seq) {
          setLoadingKey(null)
          setSpeakError(friendlyError(e, 'summoning the owl’s voice'))
        }
        return
      }
      if (speakSeq.current !== seq) return
      setLoadingKey(null)
    }
    setSpeakingKey(key)
    const audio = new Audio(url)
    audioRef.current = audio
    audio.onended = stopAudio
    audio.onerror = stopAudio
    try {
      await audio.play()
    } catch {
      stopAudio()
    }
  }, [speakingKey, loadingKey, stopAudio, lang, cnMode])

  const speakIcon = (rawKey: string): string => {
    const key = `${lang}:${rawKey}`
    return loadingKey === key ? '⏳' : speakingKey === key ? '⏹' : '🔊'
  }
  const speakOn = (rawKey: string): boolean => {
    const key = `${lang}:${rawKey}`
    return speakingKey === key || loadingKey === key
  }

  const pickTopic = useCallback(async (topicId: string) => {
    stopAudio()
    const cached = cacheRef.current.get(topicId)
    if (cached) {
      setPhase({ kind: 'list', list: cached })
      return
    }
    setPhase({ kind: 'fetching', topicId })
    try {
      const res = await callSeekBooks(topicId)
      if (res.ok) {
        cacheRef.current.set(topicId, res.list)
        setPhase({ kind: 'list', list: res.list })
      } else {
        setPhase({ kind: 'not-ready', topicId })
      }
    } catch {
      setPhase({ kind: 'not-ready', topicId })
    }
  }, [stopAudio])

  const fetchingChip =
    phase.kind === 'fetching'
      ? SEEK_TOPIC_CHIPS.find((t) => t.id === phase.topicId)
      : undefined

  return (
    <section className={'puc-owl' + (phase.kind === 'closed' ? '' : ' puc-owl--open')}>
      <button
        type="button"
        className="puc-owl__perch"
        onClick={() => {
          stopAudio()
          setPhase(phase.kind === 'closed' ? { kind: 'topics' } : { kind: 'closed' })
        }}
        aria-expanded={phase.kind !== 'closed'}
      >
        <img className="puc-owl__img" src={OWL_SRC} alt="" />
        <span className="puc-owl__intro">
          <span className="puc-owl__name">{cnMode ? '寻书猫头鹰' : 'The Book Owl'}</span>
          <span className="puc-owl__tag">
            {phase.kind === 'closed'
              ? cnMode
                ? '想读什么？我去帮你找真正的好书！'
                : 'What would you like to read about? I can fetch real books!'
              : cnMode ? '收起书目' : 'Tuck the lists away'}
          </span>
        </span>
      </button>

      {phase.kind === 'topics' && (
        <div className="puc-owl__topics">
          {SEEK_TOPIC_CHIPS.map((t) => (
            <button
              key={t.id}
              type="button"
              className="puc-owl__chip"
              onClick={() => { void pickTopic(t.id) }}
            >
              {cnMode ? t.cn : t.en}
            </button>
          ))}
        </div>
      )}

      {speakError && <p className="puc-owl__status" role="alert">{speakError}</p>}

      {phase.kind === 'fetching' && (
        <p className="puc-owl__status">
          {cnMode
            ? `🦉 猫头鹰飞去书海里取「${fetchingChip?.cn ?? ''}」的书单了……`
            : `🦉 The owl flaps off into the stacks for books about ${fetchingChip?.en ?? ''}…`}
        </p>
      )}

      {phase.kind === 'not-ready' && (
        <p className="puc-owl__status">
          {cnMode
            ? '🦉 这份书单猫头鹰还没找齐，请过一会儿再来问我。'
            : '🦉 That list is still being gathered — ask again in a little while.'}
          <button type="button" className="puc-owl__again" onClick={() => setPhase({ kind: 'topics' })}>
            {cnMode ? '换个主题' : 'Pick another topic'}
          </button>
        </p>
      )}

      {phase.kind === 'list' && (
        <div className="puc-owl__list">
          <div className="puc-owl__list-head">
            <h3 className="puc-owl__list-title">
              {cnMode ? `关于「${phase.list.labelCn}」的书` : `Books about ${phase.list.label}`}
            </h3>
            <button type="button" className="puc-owl__again" onClick={() => { stopAudio(); setPhase({ kind: 'topics' }) }}>
              {cnMode ? '← 换个主题' : '← Pick another topic'}
            </button>
          </div>
          {phase.list.sections.map((s) => (
            <div key={s.key} className="puc-owl__section">
              <h4 className="puc-owl__section-title">
                {cnMode ? s.titleCn : s.title}
                <button
                  type="button"
                  className={'puc-owl__speak' + (speakOn(s.key) ? ' puc-owl__speak--on' : '')}
                  onClick={() => { void speak(s.key, sectionScript(s, cnMode)) }}
                  title={cnMode ? '听猫头鹰读这一组' : 'Hear the owl read this shelf'}
                >
                  {speakIcon(s.key)}
                </button>
              </h4>
              <div className="puc-owl__books">
                {s.books.map((b, i) => {
                  const key = `${s.key}-${i}`
                  return (
                    <div key={key} className="puc-owl__book">
                      {b.coverUrl ? (
                        <img className="puc-owl__cover" src={b.coverUrl} alt="" loading="lazy" />
                      ) : (
                        <span className="puc-owl__cover puc-owl__cover--ph">📕</span>
                      )}
                      <div className="puc-owl__book-body">
                        <p className="puc-owl__book-title">
                          {b.title}
                          {b.verified && <span className="puc-owl__verified" title="Verified real book">✓</span>}
                        </p>
                        <p className="puc-owl__book-meta">
                          {b.author}{b.year ? ` · ${b.year}` : ''}
                        </p>
                        <p className="puc-owl__book-intro">
                          {cnMode ? b.introCn || b.intro : b.intro}
                        </p>
                      </div>
                      <button
                        type="button"
                        className={'puc-owl__speak' + (speakOn(key) ? ' puc-owl__speak--on' : '')}
                        onClick={() => { void speak(key, bookScript(b, cnMode)) }}
                        title={cnMode ? '听猫头鹰介绍这本书' : 'Hear the owl introduce this book'}
                      >
                        {speakIcon(key)}
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
          {(cnMode ? phase.list.notesCn || phase.list.notes : phase.list.notes) && (
            <p className="puc-owl__notes">
              {cnMode ? phase.list.notesCn || phase.list.notes : phase.list.notes}
            </p>
          )}
        </div>
      )}
    </section>
  )
}

function bookScript(b: SeekBook, cnMode: boolean): string {
  if (cnMode && b.introCn) {
    const year = b.year ? `，${b.year}年出版` : ''
    return `《${b.title}》，作者 ${b.author}${year}。${b.introCn}`
  }
  const year = b.year ? `, published ${b.year}` : ''
  return `${b.title}, by ${b.author}${year}. ${b.intro}`
}

function sectionScript(s: SeekSection, cnMode: boolean): string {
  if (cnMode) {
    return `${s.titleCn}。${s.books.map((b) => bookScript(b, true)).join(' 下一本：')}`
  }
  return `${s.title}. ${s.books.map((b) => bookScript(b, false)).join(' Next: ')}`
}
