// TournamentRoute — Weekly Tournament page (P2.H Slice 2).
//
// Three modes driven by tournament.status:
//   registration  — sign-up panel + participant list
//   active        — pairings + my-pairing card + result buttons +
//                   standings + start-next-round / close buttons
//   closed        — winner banner + final standings
//
// Pairings are server-generated (Swiss greedy via startNextRound).
// Result reporting is honour-based for Slice 2: either player can
// post the outcome, first report wins. Slice 3 will plug the
// actual play loop into existing /r/<roomId> private rooms and
// award the winner a crown + 100 castle points.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { doc, onSnapshot } from 'firebase/firestore'
import { db } from '../firebase/app'
import { useCastle } from '../castle/useCastle'
import { NameLink } from '../invitations/NameLink'
const TOURNAMENT_WINNER_REWARD_PTS = 100
import {
  BYE_OPPONENT,
  callCloseTournament,
  callCreateTournamentRoom,
  callDisputeTournamentResult,
  callGetCurrentTournament,
  callOverrideTournamentResult,
  callRegisterForTournament,
  callReportTournamentResult,
  callStartNextRound,
  callUnregisterFromTournament,
  type Pairing,
  type PairingResult,
  type TournamentDoc,
  type TournamentRound,
} from '../firebase/callables'
import './TournamentRoute.css'

/** Single-admin gate — keep this in sync with the server-side guard
 *  in overrideTournamentResult.ts. */
const ADMIN_NORMALIZED_NAME = 'jeff'

export function TournamentRoute() {
  const navigate = useNavigate()
  const { identity, setCastlePoints } = useCastle()
  const [tournament, setTournament] = useState<TournamentDoc | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    let unsub: (() => void) | null = null
    void callGetCurrentTournament()
      .then((res) => {
        if (cancelled) return
        setTournament(normalizeTournament(res.tournament))
        setLoading(false)
        const ref = doc(db, 'tournaments', res.tournament.weekKey)
        unsub = onSnapshot(ref, (snap) => {
          const data = snap.data() as TournamentDoc | undefined
          if (data) setTournament(normalizeTournament(data))
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

  const scores = useMemo(() => {
    if (!tournament) return new Map<string, number>()
    return computeScores(tournament)
  }, [tournament])

  const onRegister = useCallback(async () => {
    if (!identity || identity.isBypass || !identity.sessionId || !tournament) return
    setBusy('register')
    setActionError(null)
    try {
      const res = await callRegisterForTournament({
        normalizedName: identity.normalizedName,
        sessionId: identity.sessionId,
      })
      setTournament(normalizeTournament(res.tournament))
    } catch (err) {
      setActionError(messageFor(err))
    } finally {
      setBusy(null)
    }
  }, [identity, tournament])

  const onUnregister = useCallback(async () => {
    if (!identity || identity.isBypass || !identity.sessionId) return
    if (!confirm('Cancel your registration? You can sign up again before round 1 starts.')) {
      return
    }
    setBusy('unregister')
    setActionError(null)
    try {
      const res = await callUnregisterFromTournament({
        normalizedName: identity.normalizedName,
        sessionId: identity.sessionId,
      })
      setTournament(normalizeTournament(res.tournament))
    } catch (err) {
      setActionError(messageFor(err))
    } finally {
      setBusy(null)
    }
  }, [identity])

  const onStartRound = useCallback(async () => {
    if (!identity || identity.isBypass || !identity.sessionId) return
    setBusy('round')
    setActionError(null)
    try {
      const res = await callStartNextRound({
        normalizedName: identity.normalizedName,
        sessionId: identity.sessionId,
      })
      setTournament(normalizeTournament(res.tournament))
    } catch (err) {
      setActionError(messageFor(err))
    } finally {
      setBusy(null)
    }
  }, [identity])

  const onOpenRoom = useCallback(
    async (roundIndex: number, pairingIndex: number) => {
      if (!identity || identity.isBypass || !identity.sessionId) return
      setBusy(`room-${roundIndex}-${pairingIndex}`)
      setActionError(null)
      try {
        const res = await callCreateTournamentRoom({
          normalizedName: identity.normalizedName,
          sessionId: identity.sessionId,
          roundIndex,
          pairingIndex,
        })
        navigate(`/r/${res.roomId}`)
      } catch (err) {
        setActionError(messageFor(err))
      } finally {
        setBusy(null)
      }
    },
    [identity, navigate],
  )

  const onReport = useCallback(
    async (roundIndex: number, pairingIndex: number, result: Exclude<PairingResult, 'bye-white'>) => {
      if (!identity || identity.isBypass || !identity.sessionId) return
      setBusy(`report-${roundIndex}-${pairingIndex}`)
      setActionError(null)
      try {
        const res = await callReportTournamentResult({
          normalizedName: identity.normalizedName,
          sessionId: identity.sessionId,
          roundIndex,
          pairingIndex,
          result,
        })
        setTournament(normalizeTournament(res.tournament))
      } catch (err) {
        setActionError(messageFor(err))
      } finally {
        setBusy(null)
      }
    },
    [identity],
  )

  const onDispute = useCallback(
    async (roundIndex: number, pairingIndex: number, reason?: string) => {
      if (!identity || identity.isBypass || !identity.sessionId) return
      setBusy(`dispute-${roundIndex}-${pairingIndex}`)
      setActionError(null)
      try {
        const res = await callDisputeTournamentResult({
          normalizedName: identity.normalizedName,
          sessionId: identity.sessionId,
          roundIndex,
          pairingIndex,
          ...(reason ? { reason } : {}),
        })
        setTournament(normalizeTournament(res.tournament))
      } catch (err) {
        setActionError(messageFor(err))
      } finally {
        setBusy(null)
      }
    },
    [identity],
  )

  const onOverride = useCallback(
    async (
      roundIndex: number,
      pairingIndex: number,
      result: Exclude<PairingResult, 'bye-white'>,
    ) => {
      if (!identity || identity.isBypass || !identity.sessionId) return
      setBusy(`override-${roundIndex}-${pairingIndex}`)
      setActionError(null)
      try {
        const res = await callOverrideTournamentResult({
          normalizedName: identity.normalizedName,
          sessionId: identity.sessionId,
          roundIndex,
          pairingIndex,
          result,
        })
        setTournament(normalizeTournament(res.tournament))
      } catch (err) {
        setActionError(messageFor(err))
      } finally {
        setBusy(null)
      }
    },
    [identity],
  )

  const onClose = useCallback(async () => {
    if (!identity || identity.isBypass || !identity.sessionId) return
    if (!confirm('Close the tournament now? The current leader will be crowned.')) {
      return
    }
    setBusy('close')
    setActionError(null)
    try {
      const res = await callCloseTournament({
        normalizedName: identity.normalizedName,
        sessionId: identity.sessionId,
      })
      setTournament(normalizeTournament(res.tournament))
      // If the caller won, the server pre-computed their new balance;
      // sync the local identity pill so the +100 shows up immediately.
      if (typeof res.yourCastlePoints === 'number') {
        setCastlePoints(res.yourCastlePoints)
      }
    } catch (err) {
      setActionError(messageFor(err))
    } finally {
      setBusy(null)
    }
  }, [identity, setCastlePoints])

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
            Sign up, pair, report results. Honour system — kids confirm
            each other’s wins.
          </p>
        </div>
      </header>

      <main className="puc-tour__main">
        {loading && <p className="puc-tour__loading">Opening the registration desk…</p>}
        {error && <p className="puc-tour__error">{error}</p>}

        {tournament && (
          <>
            <TournamentHeader tournament={tournament} />

            {tournament.status === 'closed' &&
              tournament.winnerName === identity?.displayName && (
                <section className="puc-tour__champion">
                  <div className="puc-tour__champion-crown" aria-hidden="true">
                    🏆
                  </div>
                  <div className="puc-tour__champion-body">
                    <h2 className="puc-tour__champion-title">
                      You won this week!
                    </h2>
                    <p className="puc-tour__champion-line">
                      +{TOURNAMENT_WINNER_REWARD_PTS} castle points landed in
                      your purse, and the champion crown sits on your
                      profile for the next 7 days.
                    </p>
                  </div>
                </section>
              )}

            {tournament.status === 'registration' && (
              <RegistrationPanel
                identity={identity}
                isRegistered={isRegistered}
                busy={busy === 'register'}
                unregistering={busy === 'unregister'}
                error={actionError}
                onRegister={onRegister}
                onUnregister={onUnregister}
              />
            )}

            {(tournament.status === 'active' || tournament.status === 'closed') && (
              <>
                <Standings tournament={tournament} scores={scores} />
                <Rounds
                  tournament={tournament}
                  identity={identity}
                  isAdmin={
                    !!identity &&
                    !identity.isBypass &&
                    identity.normalizedName === ADMIN_NORMALIZED_NAME
                  }
                  busy={busy}
                  onReport={onReport}
                  onOpenRoom={onOpenRoom}
                  onDispute={onDispute}
                  onOverride={onOverride}
                />
              </>
            )}

            {tournament.status === 'active' && isRegistered && (
              <ActiveActions
                tournament={tournament}
                busy={busy}
                onStartRound={onStartRound}
                onClose={onClose}
              />
            )}

            {actionError && (
              <p className="puc-tour__error puc-tour__error--inline">
                {actionError}
              </p>
            )}

            <ParticipantList tournament={tournament} identity={identity} />
          </>
        )}

      </main>
    </div>
  )
}

function TournamentHeader({ tournament }: { tournament: TournamentDoc }) {
  return (
    <section className="puc-tour__card">
      <div className="puc-tour__card-head">
        <div>
          <p className="puc-tour__week-label">Tournament</p>
          <h2 className="puc-tour__week">{tournament.weekKey}</h2>
        </div>
        <span
          className={'puc-tour__status puc-tour__status--' + tournament.status}
        >
          {labelForStatus(tournament.status)}
        </span>
      </div>
      <p className="puc-tour__closes">
        {tournament.status === 'closed' ? (
          <>
            Closed <strong>{formatDate(tournament.closedAt ?? tournament.closesAt)}</strong>
            {tournament.winnerName && (
              <> · Winner: <strong>🏆 {tournament.winnerName}</strong></>
            )}
          </>
        ) : (
          <>Registration closes <strong>{formatDate(tournament.closesAt)}</strong></>
        )}
      </p>
      <p className="puc-tour__tz-hint">
        All tournament times are Pacific Time (Los Angeles); the week
        rolls over at Monday 00:00 PT.
      </p>
    </section>
  )
}

function RegistrationPanel({
  identity,
  isRegistered,
  busy,
  unregistering,
  error,
  onRegister,
  onUnregister,
}: {
  identity: ReturnType<typeof useCastle>['identity']
  isRegistered: boolean
  busy: boolean
  unregistering: boolean
  error: string | null
  onRegister: () => void
  onUnregister: () => void
}) {
  if (!identity) return <p className="puc-tour__hint">Sign in to register.</p>
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
      <div className="puc-tour__register">
        <p className="puc-tour__registered">
          ✓ You&apos;re registered for this week.
        </p>
        <button
          type="button"
          className="puc-tour__btn puc-tour__btn--ghost"
          onClick={onUnregister}
          disabled={unregistering}
        >
          {unregistering ? 'Cancelling…' : 'Cancel registration'}
        </button>
        {error && <p className="puc-tour__error">{error}</p>}
      </div>
    )
  }
  return (
    <div className="puc-tour__register">
      <button
        type="button"
        className="puc-tour__btn puc-tour__btn--primary"
        onClick={onRegister}
        disabled={busy}
      >
        {busy ? 'Registering…' : 'Register me'}
      </button>
      {error && <p className="puc-tour__error">{error}</p>}
      <p className="puc-tour__hint">Beta gate: need at least 5 puzzles solved.</p>
    </div>
  )
}

function ActiveActions({
  tournament,
  busy,
  onStartRound,
  onClose,
}: {
  tournament: TournamentDoc
  busy: string | null
  onStartRound: () => void
  onClose: () => void
}) {
  const lastRound = tournament.rounds[tournament.rounds.length - 1]
  const lastRoundDone =
    !lastRound || lastRound.pairings.every((p) => p.result !== undefined)
  return (
    <div className="puc-tour__actions">
      <button
        type="button"
        className="puc-tour__btn puc-tour__btn--primary"
        onClick={onStartRound}
        disabled={busy === 'round' || !lastRoundDone}
        title={
          !lastRoundDone
            ? 'Finish reporting the current round first'
            : undefined
        }
      >
        {busy === 'round'
          ? 'Pairing…'
          : tournament.rounds.length === 0
            ? 'Start round 1'
            : `Start round ${tournament.rounds.length + 1}`}
      </button>
      <button
        type="button"
        className="puc-tour__btn"
        onClick={onClose}
        disabled={busy === 'close' || !lastRoundDone}
      >
        {busy === 'close' ? 'Closing…' : 'Close tournament'}
      </button>
    </div>
  )
}

function Standings({
  tournament,
  scores,
}: {
  tournament: TournamentDoc
  scores: Map<string, number>
}) {
  const rows = [...tournament.participants]
    .map((p) => ({ ...p, score: scores.get(p.normalizedName) ?? 0 }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score
      return a.registeredAt - b.registeredAt
    })
  return (
    <section className="puc-tour__standings">
      <h3 className="puc-tour__standings-title">Standings</h3>
      <ol className="puc-tour__standings-list">
        {rows.map((r, i) => (
          <li key={r.normalizedName} className="puc-tour__standings-row">
            <span className="puc-tour__standings-rank">#{i + 1}</span>
            <span className="puc-tour__standings-name">
              <NameLink
                normalizedName={r.normalizedName}
                displayName={r.displayName}
                className="puc-tour__name-link"
              />
              {tournament.winnerName === r.displayName && ' 🏆'}
            </span>
            <span className="puc-tour__standings-score">{formatScore(r.score)}</span>
          </li>
        ))}
      </ol>
    </section>
  )
}

function Rounds({
  tournament,
  identity,
  isAdmin,
  busy,
  onReport,
  onOpenRoom,
  onDispute,
  onOverride,
}: {
  tournament: TournamentDoc
  identity: ReturnType<typeof useCastle>['identity']
  isAdmin: boolean
  busy: string | null
  onReport: (r: number, p: number, result: Exclude<PairingResult, 'bye-white'>) => void
  onOpenRoom: (r: number, p: number) => void
  onDispute: (r: number, p: number, reason?: string) => void
  onOverride: (r: number, p: number, result: Exclude<PairingResult, 'bye-white'>) => void
}) {
  if (tournament.rounds.length === 0) {
    return (
      <p className="puc-tour__hint">
        No rounds paired yet. A registered participant can press
        “Start round 1”.
      </p>
    )
  }
  const me = identity?.normalizedName ?? ''
  const nameMap = new Map(
    tournament.participants.map((p) => [p.normalizedName, p.displayName]),
  )
  return (
    <div className="puc-tour__rounds">
      {tournament.rounds.map((round) => (
        <RoundCard
          key={round.index}
          round={round}
          me={me}
          isAdmin={isAdmin}
          nameMap={nameMap}
          busy={busy}
          onReport={onReport}
          onOpenRoom={onOpenRoom}
          onDispute={onDispute}
          onOverride={onOverride}
          locked={tournament.status === 'closed'}
        />
      ))}
    </div>
  )
}

function RoundCard({
  round,
  me,
  isAdmin,
  nameMap,
  busy,
  onReport,
  onOpenRoom,
  onDispute,
  onOverride,
  locked,
}: {
  round: TournamentRound
  me: string
  isAdmin: boolean
  nameMap: Map<string, string>
  busy: string | null
  onReport: (r: number, p: number, result: Exclude<PairingResult, 'bye-white'>) => void
  onOpenRoom: (r: number, p: number) => void
  onDispute: (r: number, p: number, reason?: string) => void
  onOverride: (r: number, p: number, result: Exclude<PairingResult, 'bye-white'>) => void
  locked: boolean
}) {
  return (
    <section className="puc-tour__round">
      <h3 className="puc-tour__round-title">Round {round.index + 1}</h3>
      <ul className="puc-tour__pairings">
        {round.pairings.map((p) => (
          <PairingRow
            key={p.index}
            roundIndex={round.index}
            pairing={p}
            me={me}
            isAdmin={isAdmin}
            nameMap={nameMap}
            busy={busy}
            onReport={onReport}
            onOpenRoom={onOpenRoom}
            onDispute={onDispute}
            onOverride={onOverride}
            locked={locked}
          />
        ))}
      </ul>
    </section>
  )
}

function PairingRow({
  roundIndex,
  pairing,
  me,
  isAdmin,
  nameMap,
  busy,
  onReport,
  onOpenRoom,
  onDispute,
  onOverride,
  locked,
}: {
  roundIndex: number
  pairing: Pairing
  me: string
  isAdmin: boolean
  nameMap: Map<string, string>
  busy: string | null
  onReport: (r: number, p: number, result: Exclude<PairingResult, 'bye-white'>) => void
  onOpenRoom: (r: number, p: number) => void
  onDispute: (r: number, p: number, reason?: string) => void
  onOverride: (r: number, p: number, result: Exclude<PairingResult, 'bye-white'>) => void
  locked: boolean
}) {
  const whiteName = nameMap.get(pairing.white) ?? pairing.white
  const blackName =
    pairing.black === BYE_OPPONENT ? 'bye' : nameMap.get(pairing.black) ?? pairing.black
  const mine = !locked && (pairing.white === me || pairing.black === me)
  const busyKey = `report-${roundIndex}-${pairing.index}`
  const roomBusyKey = `room-${roundIndex}-${pairing.index}`
  const disputeBusyKey = `dispute-${roundIndex}-${pairing.index}`
  const overrideBusyKey = `override-${roundIndex}-${pairing.index}`
  const isBye = pairing.black === BYE_OPPONENT
  const iAmWhite = mine && pairing.white === me
  const showRoomCta = mine && !isBye && !pairing.result
  // Whoever's posted result the viewer should be able to flag: must
  // be a participant, must not be the reporter, must not be bye, must
  // have a result, must not already be disputed or overridden, and
  // tournament must still be active (not locked).
  const canDispute =
    mine &&
    !isBye &&
    !!pairing.result &&
    !pairing.disputed &&
    !pairing.overriddenBy &&
    pairing.reportedBy &&
    pairing.reportedBy !== me
  return (
    <li
      className={
        'puc-tour__pairing ' +
        (mine ? 'puc-tour__pairing--mine ' : '') +
        (isBye ? 'puc-tour__pairing--bye ' : '') +
        (pairing.disputed ? 'puc-tour__pairing--disputed ' : '') +
        (pairing.overriddenBy ? 'puc-tour__pairing--overridden' : '')
      }
    >
      <div className="puc-tour__pairing-players">
        <span className="puc-tour__pairing-color">White</span>
        <span className="puc-tour__pairing-name">{whiteName}</span>
        <span className="puc-tour__pairing-vs">vs</span>
        <span className="puc-tour__pairing-color">Black</span>
        <span className="puc-tour__pairing-name">{blackName}</span>
      </div>
      {showRoomCta && (
        <div className="puc-tour__pairing-room">
          {pairing.roomId ? (
            <a
              href={`/r/${pairing.roomId}`}
              className="puc-tour__btn puc-tour__btn--tiny puc-tour__btn--primary"
            >
              {iAmWhite ? 'Open your game →' : 'Join your game →'}
            </a>
          ) : iAmWhite ? (
            <button
              type="button"
              className="puc-tour__btn puc-tour__btn--tiny puc-tour__btn--primary"
              onClick={() => onOpenRoom(roundIndex, pairing.index)}
              disabled={busy === roomBusyKey}
            >
              {busy === roomBusyKey ? 'Opening…' : 'Start game room'}
            </button>
          ) : (
            <span className="puc-tour__pairing-pending">
              waiting for {whiteName} to open the room…
            </span>
          )}
        </div>
      )}
      <div className="puc-tour__pairing-result">
        {pairing.result ? (
          <div className="puc-tour__pairing-result-line">
            <span className={`puc-tour__pairing-outcome puc-tour__pairing-outcome--${pairing.result}`}>
              {labelForResult(pairing.result, whiteName, blackName)}
            </span>
            {pairing.disputed && (
              <span
                className="puc-tour__pairing-flag"
                title={
                  pairing.disputed.reason
                    ? `Flagged by ${nameMap.get(pairing.disputed.byNormalizedName) ?? pairing.disputed.byNormalizedName}: "${pairing.disputed.reason}"`
                    : `Flagged by ${nameMap.get(pairing.disputed.byNormalizedName) ?? pairing.disputed.byNormalizedName}`
                }
              >
                🚩 Disputed
              </span>
            )}
            {pairing.overriddenBy && (
              <span className="puc-tour__pairing-flag puc-tour__pairing-flag--admin">
                ✓ Settled by admin
              </span>
            )}
            {canDispute && (
              <button
                type="button"
                className="puc-tour__btn puc-tour__btn--tiny puc-tour__btn--dispute"
                onClick={() => {
                  // Prompt — keeps the UI dead simple for a slice. A
                  // dedicated dialog is the obvious follow-up if kids
                  // start writing real essays here.
                  const reason = window.prompt(
                    'What actually happened? (optional, 140 chars)',
                  )
                  if (reason === null) return
                  onDispute(roundIndex, pairing.index, reason.trim() || undefined)
                }}
                disabled={busy === disputeBusyKey}
              >
                {busy === disputeBusyKey ? 'Flagging…' : '🚩 Dispute'}
              </button>
            )}
          </div>
        ) : isBye ? null : mine ? (
          <div className="puc-tour__report">
            <button
              type="button"
              className="puc-tour__btn puc-tour__btn--tiny"
              onClick={() => onReport(roundIndex, pairing.index, 'white-wins')}
              disabled={busy === busyKey}
            >
              {whiteName} won
            </button>
            <button
              type="button"
              className="puc-tour__btn puc-tour__btn--tiny"
              onClick={() => onReport(roundIndex, pairing.index, 'black-wins')}
              disabled={busy === busyKey}
            >
              {blackName} won
            </button>
            <button
              type="button"
              className="puc-tour__btn puc-tour__btn--tiny"
              onClick={() => onReport(roundIndex, pairing.index, 'draw')}
              disabled={busy === busyKey}
            >
              Draw
            </button>
          </div>
        ) : (
          <span className="puc-tour__pairing-pending">awaiting result…</span>
        )}
      </div>
      {isAdmin && !isBye && pairing.result && (
        <div className="puc-tour__pairing-admin">
          <span className="puc-tour__pairing-admin-label">Admin override:</span>
          <button
            type="button"
            className="puc-tour__btn puc-tour__btn--tiny"
            onClick={() => onOverride(roundIndex, pairing.index, 'white-wins')}
            disabled={busy === overrideBusyKey}
          >
            {whiteName} won
          </button>
          <button
            type="button"
            className="puc-tour__btn puc-tour__btn--tiny"
            onClick={() => onOverride(roundIndex, pairing.index, 'black-wins')}
            disabled={busy === overrideBusyKey}
          >
            {blackName} won
          </button>
          <button
            type="button"
            className="puc-tour__btn puc-tour__btn--tiny"
            onClick={() => onOverride(roundIndex, pairing.index, 'draw')}
            disabled={busy === overrideBusyKey}
          >
            Draw
          </button>
        </div>
      )}
    </li>
  )
}

function ParticipantList({
  tournament,
  identity,
}: {
  tournament: TournamentDoc
  identity: ReturnType<typeof useCastle>['identity']
}) {
  if (tournament.participants.length === 0) {
    return (
      <p className="puc-tour__hint puc-tour__hint--centered">
        No registrations yet — be the first!
      </p>
    )
  }
  if (tournament.status !== 'registration') {
    // Standings already lists participants once rounds start, no need
    // to duplicate the list.
    return null
  }
  return (
    <section className="puc-tour__list">
      <h3 className="puc-tour__list-title">
        Registered ({tournament.participants.length})
      </h3>
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
                <NameLink
                  normalizedName={p.normalizedName}
                  displayName={p.displayName}
                  className="puc-tour__name-link"
                />
              </span>
              <span className="puc-tour__list-time">{formatJoined(p.registeredAt)}</span>
            </li>
          ))}
      </ul>
    </section>
  )
}

/** Guards against missing array fields on docs created by an
 *  earlier slice (Slice 1 wrote tournament docs without `rounds`).
 *  Without this, the render path explodes on `.rounds.length` and
 *  the page blanks. */
function normalizeTournament(t: TournamentDoc): TournamentDoc {
  return {
    ...t,
    participants: t.participants ?? [],
    rounds: t.rounds ?? [],
  }
}

function computeScores(tournament: TournamentDoc): Map<string, number> {
  const scores = new Map<string, number>()
  for (const p of tournament.participants) scores.set(p.normalizedName, 0)
  for (const r of tournament.rounds) {
    for (const p of r.pairings) {
      switch (p.result) {
        case 'white-wins':
          scores.set(p.white, (scores.get(p.white) ?? 0) + 1)
          break
        case 'black-wins':
          scores.set(p.black, (scores.get(p.black) ?? 0) + 1)
          break
        case 'draw':
          scores.set(p.white, (scores.get(p.white) ?? 0) + 0.5)
          scores.set(p.black, (scores.get(p.black) ?? 0) + 0.5)
          break
        case 'bye-white':
          scores.set(p.white, (scores.get(p.white) ?? 0) + 1)
          break
      }
    }
  }
  return scores
}

function labelForStatus(status: TournamentDoc['status']): string {
  if (status === 'registration') return 'Registration open'
  if (status === 'active') return 'Rounds in play'
  return 'Closed'
}

function labelForResult(
  result: PairingResult,
  whiteName: string,
  blackName: string,
): string {
  if (result === 'white-wins') return `${whiteName} won`
  if (result === 'black-wins') return `${blackName} won`
  if (result === 'draw') return 'Draw'
  return `${whiteName} — bye (free point)`
}

function formatScore(s: number): string {
  return s % 1 === 0 ? `${s}` : `${s.toFixed(1)}`
}

/** Tournament weeks are keyed off America/Los_Angeles (see
 *  functions/src/tournament/weekKey.ts). Render every tournament
 *  timestamp in that zone — and let the formatter append PST/PDT —
 *  so all participants see the same canonical wall-clock regardless
 *  of where they're sitting. */
const TOURNAMENT_TZ = 'America/Los_Angeles'

function formatDate(epochMs: number): string {
  return new Date(epochMs).toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: TOURNAMENT_TZ,
    timeZoneName: 'short',
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
