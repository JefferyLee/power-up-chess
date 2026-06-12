// seekBooks — the Book Owl's fetch. Proxies the book-seek project's
// public getReadingList endpoint (separate Firebase project; its CORS
// only admits bookseek origins, so the castle must call server-side).
//
// Safety model: the topic must be on the human-reviewed SEEK_TOPICS
// allowlist — free text never reaches book-seek from here. Results
// are normalised (English only) and cached in this project's
// Firestore (library_seek/{topicId}) so the castle keeps answering
// even if book-seek is down; entries refresh after 30 days.
//
// All topics are pre-generated against book-seek and looked up by
// their exact stored key (see seekTopics.ts storedTopic), so the
// "not-ready" branch should be rare in practice.

import { getFirestore } from 'firebase-admin/firestore'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { SEEK_TOPICS_BY_ID } from './seekTopics'

const READING_LIST_URL = 'https://getreadinglist-b2ffxmlqoa-uc.a.run.app'
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000

export interface SeekBooksRequest {
  topicId: string
}

export interface SeekBook {
  title: string
  author: string
  year: string
  intro: string
  /** Chinese introduction from book-seek's parallel cn list. Empty
   *  string when the upstream cn section is missing (legacy topics). */
  introCn: string
  coverUrl?: string
  verified?: boolean
}

export interface SeekSection {
  key: string
  title: string
  titleCn: string
  books: SeekBook[]
}

export interface SeekList {
  topicId: string
  label: string
  labelCn: string
  sections: SeekSection[]
  notes?: string
  notesCn?: string
}

export type SeekBooksResponse =
  | { ok: true; list: SeekList }
  | { ok: false; status: 'not-ready' }

/** Bump when SeekList's shape changes — older cache docs refetch. */
const CACHE_VERSION = 2

const SECTIONS: Array<{ key: string; title: string; titleCn: string }> = [
  { key: 'Earliest_or_Most_Original_Works', title: 'The earliest books', titleCn: '最早的书' },
  { key: 'Most_Important_and_Influential_Works', title: 'The classics', titleCn: '影响深远的经典' },
  { key: 'Modern_or_Contemporary_Classics', title: 'Modern favourites', titleCn: '现代佳作' },
  { key: 'Latest_Currently_Popular_or_Cutting_Edge_Works', title: 'Hot off the press', titleCn: '最新出版' },
]

interface RawBook {
  Title?: string
  Author?: string
  Publication_Year?: string
  Introduction?: string
  coverUrl?: string
  verified?: boolean
}

function asArray(v: unknown): RawBook[] {
  if (Array.isArray(v)) return v as RawBook[]
  if (v && typeof v === 'object') return [v as RawBook]
  return []
}

function normalise(topicId: string, label: string, labelCn: string, readingList: {
  en?: Record<string, unknown>
  cn?: Record<string, unknown>
}): SeekList {
  const en = readingList.en ?? {}
  const cn = readingList.cn ?? {}
  const sections: SeekSection[] = []
  for (const s of SECTIONS) {
    // en/cn are parallel arrays — same Title/Author per index, the
    // Introduction is translated.
    const cnBooks = asArray(cn[s.key])
    const books: SeekBook[] = asArray(en[s.key]).map((b, i) => ({
      title: b.Title ?? '',
      author: b.Author ?? '',
      year: b.Publication_Year ?? '',
      intro: b.Introduction ?? '',
      introCn: cnBooks[i]?.Introduction ?? '',
      ...(b.coverUrl ? { coverUrl: b.coverUrl } : {}),
      ...(typeof b.verified === 'boolean' ? { verified: b.verified } : {}),
    })).filter((b) => b.title.length > 0)
    if (books.length > 0) sections.push({ ...s, books })
  }
  const notes = typeof en['Additional_Notes'] === 'string' ? (en['Additional_Notes'] as string) : undefined
  const notesCn = typeof cn['Additional_Notes'] === 'string' ? (cn['Additional_Notes'] as string) : undefined
  return {
    topicId,
    label,
    labelCn,
    sections,
    ...(notes ? { notes } : {}),
    ...(notesCn ? { notesCn } : {}),
  }
}

export const seekBooks = onCall<SeekBooksRequest, Promise<SeekBooksResponse>>(
  async (req) => {
    if (!req.auth) {
      throw new HttpsError('unauthenticated', 'Sign in first.')
    }
    const topic = SEEK_TOPICS_BY_ID.get(req.data?.topicId ?? '')
    if (!topic) {
      throw new HttpsError('invalid-argument', 'Unknown topic.')
    }

    const db = getFirestore()
    const cacheRef = db.collection('library_seek').doc(topic.id)
    const cached = await cacheRef.get()
    if (cached.exists) {
      const data = cached.data() as { list: SeekList; fetchedAt: number; v?: number }
      if (data.v === CACHE_VERSION && Date.now() - data.fetchedAt < CACHE_TTL_MS) {
        return { ok: true, list: data.list }
      }
    }

    let res: Response
    try {
      res = await fetch(`${READING_LIST_URL}?topic=${encodeURIComponent(topic.storedTopic)}`)
    } catch (err) {
      console.error('seekBooks: book-seek unreachable', err)
      return { ok: false, status: 'not-ready' }
    }
    if (!res.ok) {
      if (res.status !== 404) console.error('seekBooks: book-seek error', res.status)
      return { ok: false, status: 'not-ready' }
    }

    const body = (await res.json()) as {
      Reading_List?: { en?: Record<string, unknown>; cn?: Record<string, unknown> }
    }
    if (!body.Reading_List) {
      return { ok: false, status: 'not-ready' }
    }
    const list = normalise(topic.id, topic.en, topic.cn, body.Reading_List)
    await cacheRef.set({ list, fetchedAt: Date.now(), v: CACHE_VERSION })
    return { ok: true, list }
  },
)
