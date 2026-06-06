// Brass-plaque card body. Shared between the standalone /me page and
// the click-to-open UserCard popover so a guest sees the same engraved
// stats whether they're looking at themselves or someone else.

import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { GetPublicProfileResponse } from '../firebase/callables'
import { Piece } from '../board/Piece'
import { getPieceSet, isPieceSetId } from '../cosmetics/pieceSets'
import type { PieceSymbol } from '../chess/types'
import { useCastle } from '../castle/useCastle'
import { TeamBadge as TeamBadgeView } from '../teams/TeamBadge'
import {
  countryFlag,
  formatJoinedMonth,
  shortenIpHash,
  statusBadge,
} from './origin'
import './AdventurerPlaqueScreen.css'

const DASH = '—'
const PIECE_TYPES: PieceSymbol[] = ['k', 'q', 'r', 'b', 'n', 'p']

export function PlaqueCard({ profile }: { profile: GetPublicProfileResponse }) {
  const navigate = useNavigate()
  const { identity } = useCastle()
  const isSelf = !!identity && identity.normalizedName === profile.normalizedName
  const [originExpanded, setOriginExpanded] = useState(false)
  // Server guarantees a concrete piece-set id (defaults to 'classic') —
  // see GetPublicProfileResponse.equippedPieceSet. Critical for the
  // <Piece pieceSetIdOverride> below: passing undefined would make it
  // render the VIEWER's set, not the profile owner's.
  const pieceSetId = profile.equippedPieceSet
  const set = isPieceSetId(pieceSetId) ? getPieceSet(pieceSetId) : getPieceSet(undefined)
  // Pick a random piece type once per mount so the showcase changes
  // between visits but doesn't shuffle mid-view (e.g. on a focus
  // refetch). normalizedName seeds the choice loosely to keep it
  // stable for back-and-forth nav within a session.
  const showcasePiece = useMemo<PieceSymbol>(
    () => PIECE_TYPES[Math.floor(Math.random() * PIECE_TYPES.length)]!,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )
  // Equipment brightness ramp — 50% when no Today's Five attempts yet,
  // +10% per attempted slot up to full brightness at 5/5. Encourages
  // the kid to clear today's set: their piece literally lights up as
  // they go. Mirrors the HP-bar segments inside the Puzzles section.
  const todaysResults = profile.todaysFiveResults
  const attempted = todaysResults
    ? todaysResults.filter((r) => r !== null).length
    : 0
  const brightnessPct = 50 + attempted * 10  // 50, 60, 70, 80, 90, 100
  const allDone = attempted === 5
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
          <OriginPill
            profile={profile}
            expanded={originExpanded}
            onToggle={() => setOriginExpanded((v) => !v)}
          />
          {originExpanded && <OriginDetail profile={profile} />}
        </div>
      </header>

      <aside className="puc-plaque-card__equipment" aria-label="Equipment">
        <span
          className={
            'puc-plaque-equipment__hero' +
            (allDone ? ' puc-plaque-equipment__hero--lit' : '')
          }
          style={{ ['--hero-brightness' as string]: `${brightnessPct}%` }}
          title={
            todaysResults
              ? `Today's Five: ${attempted}/5 attempted`
              : "Today's Five not started — finish it to brighten your gear"
          }
        >
          <Piece piece={{ type: showcasePiece, color: 'w' }} pieceSetIdOverride={pieceSetId} />
        </span>
        <p className="puc-plaque-equipment__label">{set.label}</p>
        <button
          type="button"
          className="puc-plaque-equipment__btn"
          onClick={() => navigate('/shop')}
        >
          {isSelf ? 'Change Equipment' : 'Want this →'}
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
            <TodaysFiveBar results={todaysResults} />
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

        {profile.teams.length > 0 && (
          <Section title="Teams">
            <PlaqueTeamsRow teams={profile.teams} />
          </Section>
        )}
      </div>
    </div>
  )
}

/** Compact one-line origin summary that lives under the subtitle in
 *  the plaque header. Clickable: toggles the OriginDetail panel below.
 *  Always rendered so the chevron is discoverable even before any
 *  geo data exists for this guest (the dot + status still mean
 *  something on day one). */
function OriginPill({
  profile,
  expanded,
  onToggle,
}: {
  profile: GetPublicProfileResponse
  expanded: boolean
  onToggle: () => void
}) {
  const status = statusBadge(profile.onlineStatus)
  const firstFlag = countryFlag(profile.firstCountry)
  const recentFlag = countryFlag(profile.recentCountry)
  const sameOrSingleFlag = firstFlag && recentFlag
    ? (profile.firstCountry === profile.recentCountry ? firstFlag : null)
    : (firstFlag || recentFlag || null)
  return (
    <button
      type="button"
      className="puc-plaque-pill"
      onClick={onToggle}
      aria-expanded={expanded}
      aria-label={expanded ? 'Hide origin details' : 'Show origin details'}
      title={expanded ? 'Hide details' : 'Show origin details'}
    >
      {sameOrSingleFlag
        ? <span className="puc-plaque-pill__flag">{sameOrSingleFlag}</span>
        : firstFlag && recentFlag && (
          <>
            <span className="puc-plaque-pill__flag">{firstFlag}</span>
            <span className="puc-plaque-pill__arrow" aria-hidden="true">→</span>
            <span className="puc-plaque-pill__flag">{recentFlag}</span>
          </>
        )}
      <span className="puc-plaque-pill__dot" aria-hidden="true">{status.dot}</span>
      <span className="puc-plaque-pill__chevron" aria-hidden="true">
        {expanded ? '⌃' : '⌄'}
      </span>
    </button>
  )
}

/** Expanded origin panel — slides in below the header when the pill
 *  is tapped. Same content as before; tier filtering happens server-
 *  side so we just render whatever fields came back. */
function OriginDetail({ profile }: { profile: GetPublicProfileResponse }) {
  const status = statusBadge(profile.onlineStatus)
  const firstFlag = countryFlag(profile.firstCountry)
  const recentFlag = countryFlag(profile.recentCountry)
  const showJourney =
    !!profile.firstCountry
    && !!profile.recentCountry
    && profile.firstCountry !== profile.recentCountry
  const hasAnyCountry = !!profile.firstCountry || !!profile.recentCountry
  const tier = profile.viewerTier
  return (
    <div className="puc-plaque-origin-detail">
      {hasAnyCountry && (
        <DetailRow label={showJourney ? 'Journey' : 'From'}>
          <span className="puc-plaque-origin">
            <span className="puc-plaque-origin__leg">
              {firstFlag || DASH}
              {profile.firstCity && (
                <span className="puc-plaque-origin__city">{profile.firstCity}</span>
              )}
            </span>
            {showJourney && (
              <>
                <span className="puc-plaque-origin__arrow" aria-hidden="true">→</span>
                <span className="puc-plaque-origin__leg">
                  {recentFlag || DASH}
                  {profile.recentCity && (
                    <span className="puc-plaque-origin__city">{profile.recentCity}</span>
                  )}
                </span>
              </>
            )}
          </span>
        </DetailRow>
      )}
      <DetailRow label="Joined">
        <span>
          {formatJoinedMonth(profile.joinedMonth)}
          {profile.joinedAt !== null && (
            <span className="puc-plaque-aside">
              {' · '}{formatExactDate(profile.joinedAt)}
            </span>
          )}
        </span>
      </DetailRow>
      <DetailRow label="Status">
        <span title={status.title}>
          <span className="puc-plaque-origin__dot" aria-hidden="true">{status.dot}</span>
          {' '}{status.label}
          {profile.lastSeenAt !== null && profile.onlineStatus !== 'online' && (
            <span className="puc-plaque-aside">
              {' · last seen '}{formatExactDateTime(profile.lastSeenAt)}
            </span>
          )}
        </span>
      </DetailRow>
      {tier === 'admin' && (profile.firstIp || profile.recentIp) && (
        <>
          <DetailRow label="First IP">
            <code className="puc-plaque-iphash">{profile.firstIp ?? DASH}</code>
            {profile.firstIpHash && (
              <span className="puc-plaque-aside"> · {shortenIpHash(profile.firstIpHash)}</span>
            )}
          </DetailRow>
          <DetailRow label="Recent IP">
            <code className="puc-plaque-iphash">{profile.recentIp ?? DASH}</code>
            {profile.firstIpHash && profile.recentIpHash
              && profile.firstIpHash === profile.recentIpHash && (
              <span className="puc-plaque-aside"> · same source</span>
            )}
          </DetailRow>
        </>
      )}
      {tier !== 'public' && (
        <p className="puc-plaque-origin__hint">
          {tier === 'admin'
            ? 'IPs and city info are visible to admins.'
            : 'City info and exact times are visible only to you.'}
        </p>
      )}
    </div>
  )
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="puc-plaque-origin-detail__row">
      <span className="puc-plaque-origin-detail__label">{label}</span>
      <span className="puc-plaque-origin-detail__value">{children}</span>
    </div>
  )
}

/** Date-only formatter that still surfaces the viewer's timezone, so
 *  "Jun 5, 2026 PDT" vs "Jun 6, 2026 GMT+8" disambiguates a
 *  near-midnight join from across the date line. */
function formatExactDate(ms: number): string {
  return new Date(ms).toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
    timeZoneName: 'short',
  })
}

/** Date + time-of-day formatter — always include timeZoneName so a
 *  "last seen at 5:30 PM" is unambiguous when viewer and guest are
 *  in different timezones. */
function formatExactDateTime(ms: number): string {
  return new Date(ms).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
    timeZoneName: 'short',
  })
}

function PlaqueTeamsRow({ teams }: { teams: GetPublicProfileResponse['teams'] }) {
  const navigate = useNavigate()
  return (
    <span className="puc-plaque-teams">
      {teams.map((t) => (
        <button
          type="button"
          key={t.teamId}
          className="puc-plaque-team"
          onClick={() => navigate(`/team/${t.teamId}`)}
          title={t.captain ? `Captain of ${t.name}` : t.name}
        >
          <span className="puc-plaque-team__badge">
            <TeamBadgeView badge={t.badge} size={26} />
          </span>
          <span className="puc-plaque-team__name">{t.name}</span>
          {t.captain && <span className="puc-plaque-team__pip" aria-label="Captain">⚓</span>}
        </button>
      ))}
    </span>
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

function TodaysFiveBar({ results }: { results: Array<boolean | null> | null }) {
  // No set generated yet today — empty bar + "not started" hint.
  if (!results) {
    return (
      <span className="puc-plaque-tfbar puc-plaque-tfbar--idle">
        <span className="puc-plaque-tfbar__segments" aria-hidden="true">
          {Array.from({ length: 5 }).map((_, i) => (
            <span key={i} className="puc-plaque-tfbar__seg" />
          ))}
        </span>
        <span className="puc-plaque-tfbar__caption">not started</span>
      </span>
    )
  }
  const solved = results.filter((r) => r === true).length
  const attempted = results.filter((r) => r !== null).length
  const allDone = attempted === 5
  return (
    <span
      className={
        'puc-plaque-tfbar' +
        (allDone ? ' puc-plaque-tfbar--full' : '')
      }
    >
      <span className="puc-plaque-tfbar__segments" aria-hidden="true">
        {results.map((r, i) => (
          <span
            key={i}
            className={
              'puc-plaque-tfbar__seg ' +
              (r === true
                ? 'puc-plaque-tfbar__seg--hit'
                : r === false
                  ? 'puc-plaque-tfbar__seg--miss'
                  : 'puc-plaque-tfbar__seg--pending')
            }
          />
        ))}
      </span>
      <span className="puc-plaque-tfbar__caption">
        {allDone
          ? <>✅ <b>{solved}</b>/5 done</>
          : <><b>{solved}</b>/{attempted} of 5</>}
      </span>
    </span>
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
