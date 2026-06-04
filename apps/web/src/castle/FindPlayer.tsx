// FindPlayer — small input + suggestion list that lets the kid look up
// any guest by name prefix and open their plaque.
//
// Hits the findPlayer callable with a 250ms debounce; matches render
// as a dropdown of tappable names. Clicking opens UserCard via
// NameLink. Closes on outside-click / Escape.

import { useCallback, useEffect, useRef, useState } from 'react'
import { callFindPlayer, type FindPlayerMatch } from '../firebase/callables'
import { NameLink } from '../invitations/NameLink'
import './FindPlayer.css'

const DEBOUNCE_MS = 250

export function FindPlayer() {
  const [query, setQuery] = useState('')
  const [matches, setMatches] = useState<FindPlayerMatch[] | null>(null)
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const inflightRef = useRef<number>(0)

  // Debounced lookup. The inflightRef token guards against an older
  // request landing after a newer one and overwriting fresher results.
  useEffect(() => {
    const trimmed = query.trim()
    if (trimmed.length < 2) {
      setMatches(null)
      return
    }
    const token = ++inflightRef.current
    const t = window.setTimeout(() => {
      callFindPlayer({ query: trimmed })
        .then((res) => {
          if (token !== inflightRef.current) return
          setMatches(res.matches)
        })
        .catch((err) => {
          if (token !== inflightRef.current) return
          console.warn('findPlayer failed', err)
          setMatches([])
        })
    }, DEBOUNCE_MS)
    return () => window.clearTimeout(t)
  }, [query])

  // Click outside / Escape closes the dropdown.
  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const handlePick = useCallback(() => {
    setQuery('')
    setMatches(null)
    setOpen(false)
  }, [])

  const showDropdown = open && (
    matches === null && query.trim().length >= 2
      ? true
      : matches !== null && query.trim().length >= 2
  )

  return (
    <div className="puc-findplayer" ref={wrapRef}>
      <input
        type="text"
        className="puc-findplayer__input"
        value={query}
        placeholder="Find a player…"
        onFocus={() => setOpen(true)}
        onChange={(e) => { setQuery(e.target.value); setOpen(true) }}
        maxLength={20}
        autoComplete="off"
      />
      {showDropdown && (
        <div className="puc-findplayer__dropdown">
          {matches === null ? (
            <p className="puc-findplayer__msg">Searching…</p>
          ) : matches.length === 0 ? (
            <p className="puc-findplayer__msg">No one matches "{query.trim()}".</p>
          ) : (
            <ul className="puc-findplayer__list">
              {matches.map((m) => (
                <li key={m.normalizedName} onClick={handlePick}>
                  <NameLink
                    normalizedName={m.normalizedName}
                    displayName={m.displayName}
                    className="puc-findplayer__name"
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
