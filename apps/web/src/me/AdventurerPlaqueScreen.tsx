// The Adventurer's Plaque — a personal-stats page styled as a single
// brass plaque with engraved sections (Chess / Puzzles / Library /
// Tournaments / Equipment). Reads from getPublicProfile against the
// signed-in user's own normalizedName, so it stays consistent with how
// other players see your card from the lobby.
//
// Fields whose write side hasn't landed yet (AI / local match counts,
// tournaments, library, quiz) render "—" so the section structure is
// already in place when the counters get wired up.

import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCastle } from '../castle/useCastle'
import { callGetPublicProfile, type GetPublicProfileResponse } from '../firebase/callables'
import { Piece } from '../board/Piece'
import { getPieceSet, isPieceSetId } from '../cosmetics/pieceSets'
import './AdventurerPlaqueScreen.css'

const DASH = '—'

type State =
  | { kind: 'loading' }
  | { kind: 'ready'; profile: GetPublicProfileResponse }
  | { kind: 'error'; message: string }

export function AdventurerPlaqueScreen() {
  const { identity } = useCastle()
  const navigate = useNavigate()
  const [state, setState] = useState<State>({ kind: 'loading' })

  useEffect(() => {
    if (!identity) {
      navigate('/', { replace: true })
      return
    }
    if (identity.isBypass) {
      setState({ kind: 'error', message: 'Sign in with a magic word to see your plaque.' })
      return
    }
    callGetPublicProfile({ normalizedName: identity.normalizedName })
      .then((profile) => setState({ kind: 'ready', profile }))
      .catch((err) => setState({ kind: 'error', message: err instanceof Error ? err.message : String(err) }))
  }, [identity, navigate])

  return (
    <div className="puc-plaque-page">
      <button
        type="button"
        className="puc-plaque-back"
        onClick={() => navigate('/')}
        aria-label="Back to the Hall"
      >
        ← Hall
      </button>

      {state.kind === 'loading' && <div className="puc-plaque-status">Fetching your plaque…</div>}
      {state.kind === 'error' && <div className="puc-plaque-status">{state.message}</div>}
      {state.kind === 'ready' && <PlaqueCard profile={state.profile} />}
    </div>
  )
}

function PlaqueCard({ profile }: { profile: GetPublicProfileResponse }) {
  const pieceSetId = profile.equippedPieceSet
  const set = isPieceSetId(pieceSetId ?? '') ? getPieceSet(pieceSetId!) : getPieceSet(undefined)
  const tournamentBest = profile.tournamentsBestPlacement
  const tournamentBestLabel =
    tournamentBest === null || tournamentBest === undefined
      ? DASH
      : tournamentBest === 1
        ? '🥇 1st'
        : tournamentBest === 2
          ? '🥈 2nd'
          : tournamentBest === 3
            ? '🥉 3rd'
            : `#${tournamentBest}`
  const ratingDelta = profile.chessRatingDelta
  return (
    <div className="puc-plaque-card">
      <header className="puc-plaque-card__head">
        <div className="puc-plaque-card__crest" aria-hidden="true">
          {profile.hasTournamentCrown ? '🏆' : profile.hasCrown ? '🔥' : profile.hasHalo ? '✨' : '⭐'}
        </div>
        <div className="puc-plaque-card__name">
          <h1>{profile.displayName}</h1>
          <p className="puc-plaque-card__subtitle">
            {profile.title?.label ?? 'Visitor'} · {profile.castlePoints.toLocaleString()} castle points
          </p>
        </div>
      </header>

      <Section title="Chess">
        <Row label="Rating">
          {profile.chessRating === null ? (
            DASH
          ) : (
            <>
              {profile.chessRating}
              {ratingDelta !== null && ratingDelta !== 0 && (
                <span
                  className={
                    'puc-plaque-delta ' +
                    (ratingDelta > 0 ? 'puc-plaque-delta--up' : 'puc-plaque-delta--down')
                  }
                >
                  {ratingDelta > 0 ? '↑' : '↓'}{Math.abs(ratingDelta)}
                </span>
              )}
            </>
          )}
        </Row>
        <Row label="Matches">
          <span className="puc-plaque-trio">
            <span><b>{profile.chessGames}</b> online</span>
            <span><b>{nullable(profile.matchesAi)}</b> AI</span>
            <span><b>{nullable(profile.matchesLocal)}</b> local</span>
          </span>
        </Row>
      </Section>

      <Section title="Puzzles">
        <Row label="Solved">
          <b>{profile.puzzlesSolved}</b>
          {profile.bestPuzzleRating !== null && (
            <span className="puc-plaque-aside"> · best rating <b>{profile.bestPuzzleRating}</b></span>
          )}
        </Row>
        <Row label="Plots">
          <PlotsRow ratings={profile.puzzleRatings} />
        </Row>
      </Section>

      <Section title="Library">
        <Row label="Books read"><b>{nullable(profile.booksRead)}</b></Row>
        <Row label="Quiz correct">
          {profile.quizCorrect === null && profile.quizAttempted === null
            ? DASH
            : <b>{profile.quizCorrect ?? 0} / {profile.quizAttempted ?? 0}</b>}
        </Row>
      </Section>

      <Section title="Tournaments">
        <Row label="Entered"><b>{nullable(profile.tournamentsEntered)}</b></Row>
        <Row label="Best">{tournamentBestLabel}</Row>
      </Section>

      <Section title="Equipment">
        <Row label="Pieces">
          <span className="puc-plaque-pieces">
            <span className="puc-plaque-pieces__row">
              <Piece piece={{ type: 'k', color: 'w' }} pieceSetIdOverride={pieceSetId ?? undefined} />
              <Piece piece={{ type: 'n', color: 'w' }} pieceSetIdOverride={pieceSetId ?? undefined} />
              <Piece piece={{ type: 'p', color: 'w' }} pieceSetIdOverride={pieceSetId ?? undefined} />
            </span>
            <span className="puc-plaque-pieces__label">{set.label}</span>
          </span>
        </Row>
      </Section>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="puc-plaque-section">
      <h2 className="puc-plaque-section__title">{title}</h2>
      <div className="puc-plaque-section__body">{children}</div>
    </section>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="puc-plaque-row">
      <span className="puc-plaque-row__label">{label}</span>
      <span className="puc-plaque-row__value">{children}</span>
    </div>
  )
}

function PlotsRow({ ratings }: { ratings: Record<string, number> }) {
  const plots: Array<{ id: string; label: string }> = [
    { id: 'mate', label: 'Mate' },
    { id: 'fork', label: 'Fork' },
    { id: 'pinSkewer', label: 'Pin' },
    { id: 'sacrifice', label: 'Sac' },
    { id: 'endgame', label: 'End' },
    { id: 'defense', label: 'Def' },
  ]
  return (
    <span className="puc-plaque-plots">
      {plots.map((p) => {
        const r = ratings[p.id]
        return (
          <span key={p.id} className={'puc-plaque-plot' + (r ? '' : ' puc-plaque-plot--empty')}>
            <span className="puc-plaque-plot__label">{p.label}</span>
            <span className="puc-plaque-plot__rating">{r ?? DASH}</span>
          </span>
        )
      })}
    </span>
  )
}

function nullable(n: number | null | undefined): string | number {
  return n === null || n === undefined ? DASH : n
}
