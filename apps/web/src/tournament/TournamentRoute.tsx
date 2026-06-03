// TournamentRoute — Weekly Tournament page (P2.H Slice 1).
//
// Slice 1 ships the registration phase only. The page loads the
// current week's tournament via the getCurrentTournament callable
// (which lazy-creates the doc on first visit of the week), then
// subscribes to the Firestore doc directly so a new sign-up appears
// in the list without a manual refresh.
//
// Pairing, play, results, and the winner-crown cosmetic land in
// later slices.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { doc, onSnapshot } from 'firebase/firestore'
import { db } from '../firebase/app'
import { useCastle } from '../castle/useCastle'
import {
  callGetCurrentTournament,
  callRegisterForTournament,
  type TournamentDoc,
} from '../firebase/callables'
import './TournamentRoute.css'

export function TournamentRoute() {
  const navigate = useNavigate()
  const { identity } = useCastle()
  const [tournament, setTournament] = useState<TournamentDoc | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [registering, setRegistering] = useState(false)
  const [registerError, setRegisterError] = useState<string | null>(null)

  // Boot: ask the server for (or lazily create) this week's
  // tournament, then subscribe to the doc for live updates.
  useEffect(() => {
    let cancelled = false
    let unsub: (() => void) | null = null
    void callGetCurrentTournament()
      .then((res) => {
        if (cancelled) return
        setTournament(res.tournament)
        setLoading(false)
        // Subscribe so other kids' registrations appear live.
        const ref = doc(db, 'tournaments', res.tournament.weekKey)
        unsub = onSnapshot(ref, (snap) => {
          const data = snap.data() as TournamentDoc | undefined
          if (data) setTournament(data)
        })
      })
      .catch((err) => {
        if (cancelled) return
        setError(messageFor(err))
        setLoading(false)
      })
    return () => {
      cancelled = true
      if (unsub) unsub()
    }
  }, [])

  const isRegistered = useMemo(() => {
    if (!tournament || !identity) return false
    return tournament.participants.some(
      (p) => p.normalizedName === identity.normalizedName,
    )
  }, [tournament, identity])

  const onRegister = useCallback(async () => {
    if (!identity || identity.isBypass || !identity.sessionId) return
    if (!tournament) return
    setRegistering(true)
    setRegisterError(null)
    try {
      const res = await callRegisterForTournament({
        normalizedName: identity.normalizedName,
        sessionId: identity.sessionId,
      })
      setTournament(res.tournament)
    } catch (err) {
      setRegisterError(messageFor(err))
    } finally {
      setRegistering(false)
    }
  }, [identity, tournament])

  return (
    <div className="puc-tour">
      <header className="puc-tour__header">
        <button
          type="button"
          className="puc-tour__back"
          onClick={() => navigate('/')}
          aria-label="Back to hall"
        >
          ←
        </button>
        <div className="puc-tour__title-wrap">
          <h1 className="puc-tour__title">Weekly Tournament</h1>
          <p className="puc-tour__sub">
            Sign up Monday – Sunday. Pairings + play arrive in the next
            update.
          </p>
        </div>
      </header>

      <main className="puc-tour__main">
        {loading && <p className="puc-tour__loading">Opening the registration desk…</p>}
        {error && <p className="puc-tour__error">{error}</p>}

        {tournament && (
          <section className="puc-tour__card">
            <div className="puc-tour__card-head">
              <div>
                <p className="puc-tour__week-label">Tournament</p>
                <h2 className="puc-tour__week">{tournament.weekKey}</h2>
              </div>
              <span
                className={
                  'puc-tour__status puc-tour__status--' + tournament.status
                }
              >
                {labelForStatus(tournament.status)}
              </span>
            </div>

            <p className="puc-tour__closes">
              Registration closes <strong>{formatDate(tournament.closesAt)}</strong>
            </p>

            <RegistrationPanel
              identity={identity}
              isRegistered={isRegistered}
              registering={registering}
              error={registerError}
              onRegister={onRegister}
            />

            <div className="puc-tour__list">
              <h3 className="puc-tour__list-title">
                {tournament.participants.length === 0
                  ? 'No registrations yet — be the first!'
                  : `Registered (${tournament.participants.length})`}
              </h3>
              {tournament.participants.length > 0 && (
                <ul className="puc-tour__list-ul">
                  {[...tournament.participants]
                    .sort((a, b) => a.registeredAt - b.registeredAt)
                    .map((p, i) => (
                      <li
                        key={p.normalizedName}
                        className={
                          'puc-tour__list-row ' +
                          (p.normalizedName === identity?.normalizedName
                            ? 'puc-tour__list-row--me'
                            : '')
                        }
                      >
                        <span className="puc-tour__list-num">#{i + 1}</span>
                        <span className="puc-tour__list-name">
                          {p.displayName}
                        </span>
                        <span className="puc-tour__list-time">
                          {formatJoined(p.registeredAt)}
                        </span>
                      </li>
                    ))}
                </ul>
              )}
            </div>
          </section>
        )}

        <aside className="puc-tour__roadmap">
          <h3 className="puc-tour__roadmap-title">Coming soon</h3>
          <ul>
            <li>Swiss pairings auto-generate Wednesday</li>
            <li>Play your round through a private room link</li>
            <li>Standings update live as games finish</li>
            <li>Winner gets a crown cosmetic + 100 castle points</li>
            <li>Entry will require 50 puzzle solves THIS week</li>
          </ul>
        </aside>
      </main>
    </div>
  )
}

function RegistrationPanel({
  identity,
  isRegistered,
  registering,
  error,
  onRegister,
}: {
  identity: ReturnType<typeof useCastle>['identity']
  isRegistered: boolean
  registering: boolean
  error: string | null
  onRegister: () => void
}) {
  if (!identity) {
    return (
      <p className="puc-tour__hint">Sign in to register.</p>
    )
  }
  if (identity.isBypass) {
    return (
      <p className="puc-tour__hint">
        Tournament entry needs a real magic-word account. Bypass guests
        can watch but not enter.
      </p>
    )
  }
  if (isRegistered) {
    return (
      <p className="puc-tour__registered">
        ✓ You&apos;re registered for this week.
      </p>
    )
  }
  return (
    <div className="puc-tour__register">
      <button
        type="button"
        className="puc-tour__btn puc-tour__btn--primary"
        onClick={onRegister}
        disabled={registering}
      >
        {registering ? 'Registering…' : 'Register me'}
      </button>
      {error && <p className="puc-tour__error">{error}</p>}
      <p className="puc-tour__hint">
        Beta gate: need at least 5 puzzles solved.
      </p>
    </div>
  )
}

function labelForStatus(status: TournamentDoc['status']): string {
  if (status === 'registration') return 'Registration open'
  if (status === 'active') return 'Rounds in play'
  return 'Closed'
}

function formatDate(epochMs: number): string {
  return new Date(epochMs).toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatJoined(epochMs: number): string {
  const mins = Math.max(0, Math.floor((Date.now() - epochMs) / 60_000))
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

function messageFor(err: unknown): string {
  if (err && typeof err === 'object' && 'message' in err) {
    return String((err as { message: string }).message)
  }
  return 'Something went wrong. Try again.'
}
