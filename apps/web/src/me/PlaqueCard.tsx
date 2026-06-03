// Brass-plaque card body. Shared between the standalone /me page and
// the click-to-open UserCard popover so a guest sees the same engraved
// stats whether they're looking at themselves or someone else.

import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import type { GetPublicProfileResponse } from '../firebase/callables'
import { Piece } from '../board/Piece'
import { getPieceSet, isPieceSetId } from '../cosmetics/pieceSets'
import type { PieceSymbol } from '../chess/types'
import { useCastle } from '../castle/useCastle'
import './AdventurerPlaqueScreen.css'

const DASH = '—'
const PIECE_TYPES: PieceSymbol[] = ['k', 'q', 'r', 'b', 'n', 'p']

export function PlaqueCard({ profile }: { profile: GetPublicProfileResponse }) {
  const navigate = useNavigate()
  const { identity } = useCastle()
  const isSelf = !!identity && identity.normalizedName === profile.normalizedName
  const pieceSetId = profile.equippedPieceSet
  const set = isPieceSetId(pieceSetId ?? '') ? getPieceSet(pieceSetId!) : getPieceSet(undefined)
  // Pick a random piece type once per mount so the showcase changes
  // between visits but doesn't shuffle mid-view (e.g. on a focus
  // refetch). normalizedName seeds the choice loosely to keep it
  // stable for back-and-forth nav within a session.
  const showcasePiece = useMemo<PieceSymbol>(
    () => PIECE_TYPES[Math.floor(Math.random() * PIECE_TYPES.length)]!,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )
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

      <aside className="puc-plaque-card__equipment" aria-label="Equipment">
        <span className="puc-plaque-equipment__hero">
          <Piece piece={{ type: showcasePiece, color: 'w' }} pieceSetIdOverride={pieceSetId ?? undefined} />
        </span>
        <p className="puc-plaque-equipment__label">{set.label}</p>
        <button
          type="button"
          className="puc-plaque-equipment__btn"
          onClick={() => navigate('/shop')}
        >
          {isSelf ? '换装备' : 'Want this →'}
        </button>
      </aside>

      <div className="puc-plaque-card__stats">
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
          <Row label="Today's Five">
            <TodaysFive
              solved={profile.todaysFiveSolved}
              total={profile.todaysFiveTotal}
              done={profile.todaysFiveDone}
            />
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
      </div>
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

function TodaysFive({
  solved,
  total,
  done,
}: {
  solved: number | null
  total: number | null
  done: boolean
}) {
  if (total === null) return <>not started</>
  if (done) return <>✅ <b>{solved ?? 0}</b> / {total}</>
  return <><b>{solved ?? 0}</b> / {total} attempted</>
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
