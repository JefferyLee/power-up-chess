// FeedbackInbox — only visible to the dev (normalizedName === 'jeff').
//
// Pill in the Hall header shows unread count; click opens a snapshot-
// listening panel of recent feedback newest-first with kind icon, text,
// author, route, timestamp, and a mark-as-read button.
//
// Firestore rule guards the read (cross-doc lookup against guests/jeff).

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
} from 'firebase/firestore'
import { db } from '../firebase/app'
import { useCastle } from './useCastle'
import { callMarkFeedbackRead } from '../firebase/callables'
import './FeedbackInbox.css'

const ADMIN_NORMALIZED_NAME = 'jeff'
const MAX_VISIBLE = 50

interface FeedbackRow {
  id: string
  kind: 'bug' | 'suggestion'
  text: string
  route: string
  authorName: string
  authorNormalizedName: string
  authorIsBypass: boolean
  userAgent?: string
  ts: number
  read: boolean
}

function isAdmin(normalizedName: string): boolean {
  return normalizedName.toLowerCase() === ADMIN_NORMALIZED_NAME
}

export function FeedbackInbox() {
  const { identity } = useCastle()
  const amAdmin = !!identity && !identity.isBypass && isAdmin(identity.normalizedName)
  const [rows, setRows] = useState<FeedbackRow[]>([])
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!amAdmin) return
    const q = query(
      collection(db, 'feedback'),
      orderBy('ts', 'desc'),
      limit(MAX_VISIBLE),
    )
    const unsub = onSnapshot(
      q,
      (snap) => {
        const next = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<FeedbackRow, 'id'>) }))
        setRows(next)
      },
      (err) => {
        console.warn('FeedbackInbox snapshot:', err)
      },
    )
    return unsub
  }, [amAdmin])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  if (!amAdmin) return null

  const unread = rows.filter((r) => !r.read).length

  const markRead = async (id: string, read: boolean) => {
    try {
      await callMarkFeedbackRead({ id, read })
    } catch (err) {
      console.warn('markFeedbackRead failed:', err)
    }
  }

  return (
    <>
      <button
        type="button"
        className={'puc-inbox-pill' + (unread > 0 ? ' puc-inbox-pill--unread' : '')}
        onClick={() => setOpen(true)}
        aria-label={`Open feedback inbox${unread > 0 ? `, ${unread} unread` : ''}`}
      >
        📮 Inbox{unread > 0 ? ` · ${unread}` : ''}
      </button>

      {open && createPortal(
        <div
          className="puc-inbox-overlay"
          role="dialog"
          aria-label="Feedback inbox"
          onClick={(e) => { if (e.target === e.currentTarget) setOpen(false) }}
        >
          <div className="puc-inbox">
            <header className="puc-inbox__head">
              <h2 className="puc-inbox__title">Feedback inbox</h2>
              <span className="puc-inbox__count">
                {rows.length} total · {unread} unread
              </span>
              <button
                type="button"
                className="puc-inbox__close"
                onClick={() => setOpen(false)}
                aria-label="Close inbox"
              >✕</button>
            </header>
            {rows.length === 0 ? (
              <p className="puc-inbox__empty">Quiet so far. Feedback will land here live.</p>
            ) : (
              <ul className="puc-inbox__list">
                {rows.map((r) => (
                  <li
                    key={r.id}
                    className={'puc-inbox__row ' + (r.read ? 'puc-inbox__row--read' : 'puc-inbox__row--unread')}
                  >
                    <div className="puc-inbox__row-head">
                      <span className={'puc-inbox__chip puc-inbox__chip--' + r.kind}>
                        {r.kind === 'bug' ? '🐞 Bug' : '💡 Suggestion'}
                      </span>
                      <span className="puc-inbox__author">
                        {r.authorIsBypass ? '👻 ' : ''}{r.authorName || 'anon'}
                        {r.route && <span className="puc-inbox__route"> · {r.route}</span>}
                      </span>
                      <span className="puc-inbox__ts">{formatAgo(r.ts)}</span>
                    </div>
                    <p className="puc-inbox__text">{r.text}</p>
                    {r.userAgent && (
                      <p className="puc-inbox__ua" title={r.userAgent}>
                        {trimUA(r.userAgent)}
                      </p>
                    )}
                    <div className="puc-inbox__actions">
                      <button
                        type="button"
                        className="puc-inbox__btn"
                        onClick={() => markRead(r.id, !r.read)}
                      >
                        {r.read ? 'Mark unread' : 'Mark read'}
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}

function formatAgo(ts: number): string {
  const diff = Date.now() - ts
  if (diff < 60_000) return 'just now'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
  return `${Math.floor(diff / 86_400_000)}d ago`
}

function trimUA(ua: string): string {
  // Pull out the most useful chunk — browser + OS hints.
  const macMatch = ua.match(/(Mac OS X [^)]+)/)
  const iosMatch = ua.match(/(iPhone[^)]+|iPad[^)]+)/)
  const winMatch = ua.match(/(Windows NT [^;)]+)/)
  const androidMatch = ua.match(/(Android [^;)]+)/)
  const browserMatch =
    ua.match(/Chrome\/([\d.]+)/) ||
    ua.match(/Safari\/([\d.]+)/) ||
    ua.match(/Firefox\/([\d.]+)/)
  const platform = iosMatch?.[1] || androidMatch?.[1] || macMatch?.[1] || winMatch?.[1] || ''
  const browser = browserMatch ? `${browserMatch[0].split('/')[0]} ${browserMatch[1]?.split('.')[0]}` : ''
  return [platform, browser].filter(Boolean).join(' · ') || ua.slice(0, 80)
}
