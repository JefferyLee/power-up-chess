import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthUid } from '../auth/useAuthUid'
import { callCreateRoom } from '../firebase/callables'
import { loadProfile, pickRandomHost, saveProfile } from '../storage/profile'
import { presetById, TIME_CONTROL_PRESETS } from '../clock/timeControl'
import { DIFFICULTY_PRESETS, difficultyById, type DifficultyId } from '../ai/difficulty'
import { applyTheme, THEMES } from '../theme/themes'
import { CrownBadge } from '../powerups/CrownBadge'
import './StartScreen.css'

export function StartScreen() {
  const navigate = useNavigate()
  const initial = loadProfile()
  const [displayName, setDisplayName] = useState(initial.displayName)
  const [timeControlId, setTimeControlId] = useState<string>(initial.timeControlId)
  const [aiDifficultyId, setAiDifficultyId] = useState<DifficultyId>(initial.aiDifficultyId as DifficultyId)
  const [themeId, setThemeId] = useState<string>(initial.themeId)
  const [opponentName, setOpponentName] = useState('Friend')
  const [joinCode, setJoinCode] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const authState = useAuthUid()

  const timeControl = presetById(timeControlId).value

  const canStartLocal = displayName.trim().length > 0 && opponentName.trim().length > 0
  const canCreate = authState.status === 'ready' && displayName.trim().length > 0 && !creating
  const canJoin = /^[A-Za-z0-9]{4,12}$/.test(joinCode.trim())

  const persist = () => saveProfile({
    displayName: displayName.trim(),
    timeControlId,
    aiDifficultyId,
    themeId,
    crownCount: initial.crownCount, // preserve crowns earned across saves
  })

  const handleThemeChange = (next: string) => {
    setThemeId(next)
    applyTheme(next)
  }

  const onStartAi = () => {
    persist()
    navigate('/ai', {
      state: {
        hostId: pickRandomHost(),
        playerName: displayName.trim(),
        difficultyId: aiDifficultyId,
      },
    })
  }

  const onStartLocal = () => {
    persist()
    navigate('/local', {
      state: {
        hostId: pickRandomHost(),
        whiteName: displayName.trim(),
        blackName: opponentName.trim(),
        timeControl,
      },
    })
  }

  const onCreateRoom = async () => {
    if (!canCreate) return
    setCreating(true)
    setError(null)
    try {
      persist()
      // Online: the Cloud Function picks the host at random server-side
      // so both players see the same one and neither can influence it.
      const { roomId } = await callCreateRoom({
        displayName: displayName.trim(),
        timeControl,
      })
      navigate(`/r/${roomId}`)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(msg)
    } finally {
      setCreating(false)
    }
  }

  const onJoinRoom = () => {
    if (!canJoin) return
    persist()
    navigate(`/r/${joinCode.trim()}`)
  }

  return (
    <div className="puc-start">
      <div className="puc-start__inner">
        <header className="puc-start__hero">
          <h1 className="puc-start__title">Power Up Chess</h1>
          <p className="puc-start__subtitle">A brave little forest, a real chess board, and a host who is glad you came.</p>
          {initial.crownCount > 0 && (
            <p className="puc-start__crowns">
              <CrownBadge variant="large" />
              <span className="puc-start__crowns-label">earned across your games</span>
            </p>
          )}
        </header>

        <section className="puc-start__panel" aria-labelledby="puc-start-name">
          <h2 id="puc-start-name" className="puc-start__panel-title">Your name</h2>
          <input
            className="puc-start__big-input"
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            maxLength={24}
            autoComplete="off"
            aria-label="Your display name"
          />
        </section>

        <section className="puc-start__panel" aria-labelledby="puc-start-clock">
          <h2 id="puc-start-clock" className="puc-start__panel-title">Game clock</h2>
          <div className="puc-start__clocks">
            {TIME_CONTROL_PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                className={`puc-start__clock ${timeControlId === p.id ? 'puc-start__clock--selected' : ''}`}
                onClick={() => setTimeControlId(p.id)}
                aria-pressed={timeControlId === p.id}
              >
                <span className="puc-start__clock-short">{p.short}</span>
                <span className="puc-start__clock-label">{p.label}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="puc-start__panel" aria-labelledby="puc-start-online">
          <h2 id="puc-start-online" className="puc-start__panel-title">Play online</h2>
          <div className="puc-start__online">
            <button
              type="button"
              className="puc-start__cta"
              onClick={onCreateRoom}
              disabled={!canCreate}
            >
              {creating ? 'Creating room…' : 'Create private room'}
            </button>
            <div className="puc-start__join">
              <input
                className="puc-start__code-input"
                type="text"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value)}
                placeholder="Or paste a room code"
                aria-label="Room code"
                maxLength={12}
              />
              <button
                type="button"
                className="puc-start__cta puc-start__cta--ghost"
                onClick={onJoinRoom}
                disabled={!canJoin}
              >
                Join
              </button>
            </div>
            {error && <p className="puc-start__error">{error}</p>}
          </div>
        </section>

        <section className="puc-start__panel" aria-labelledby="puc-start-ai">
          <h2 id="puc-start-ai" className="puc-start__panel-title">Practice with AI</h2>
          <div className="puc-start__clocks puc-start__clocks--three">
            {DIFFICULTY_PRESETS.map((d) => (
              <button
                key={d.id}
                type="button"
                className={`puc-start__clock ${aiDifficultyId === d.id ? 'puc-start__clock--selected' : ''}`}
                onClick={() => setAiDifficultyId(d.id)}
                aria-pressed={aiDifficultyId === d.id}
                title={d.blurb}
              >
                <span className="puc-start__clock-short">{d.short}</span>
                <span className="puc-start__clock-label">{d.label}</span>
              </button>
            ))}
          </div>
          <p className="puc-start__hint">{difficultyById(aiDifficultyId).blurb}</p>
          <button
            type="button"
            className="puc-start__cta puc-start__cta--ghost"
            disabled={displayName.trim().length === 0}
            onClick={onStartAi}
          >
            Start practice game
          </button>
        </section>

        <section className="puc-start__panel" aria-labelledby="puc-start-local">
          <h2 id="puc-start-local" className="puc-start__panel-title">Play local</h2>
          <label className="puc-start__player">
            <span className="puc-start__player-label">Opponent name</span>
            <input
              type="text"
              value={opponentName}
              onChange={(e) => setOpponentName(e.target.value)}
              maxLength={24}
              autoComplete="off"
            />
          </label>
          <button
            type="button"
            className="puc-start__cta puc-start__cta--ghost"
            disabled={!canStartLocal}
            onClick={onStartLocal}
          >
            Start local game
          </button>
        </section>

        <section className="puc-start__panel" aria-labelledby="puc-start-theme">
          <h2 id="puc-start-theme" className="puc-start__panel-title">Theme</h2>
          <div className="puc-start__hosts">
            {THEMES.map((t) => (
              <button
                key={t.id}
                type="button"
                className={`puc-start__host ${themeId === t.id ? 'puc-start__host--selected' : ''}`}
                onClick={() => handleThemeChange(t.id)}
                aria-pressed={themeId === t.id}
              >
                <span className="puc-start__host-name">{t.name}</span>
                <span className="puc-start__host-blurb">{t.blurb}</span>
              </button>
            ))}
          </div>
        </section>

        <div className="puc-start__footer">
          <button
            type="button"
            className="puc-start__link"
            onClick={() => navigate('/puzzles')}
          >
            Puzzle garden
          </button>
          <button
            type="button"
            className="puc-start__link"
            onClick={() => navigate('/history')}
          >
            Match history
          </button>
        </div>

        <p className="puc-start__auth" aria-live="polite">
          {authState.status === 'loading' && 'Signing you in…'}
          {authState.status === 'ready' && `Signed in · ${authState.uid.slice(0, 8)}`}
          {authState.status === 'error' && `Auth error: ${authState.error.message}`}
        </p>
      </div>
    </div>
  )
}
