// SiegeGame — one run: the R3F scene in a full-viewport container with
// the HUD overlaid. Owns the placement / selection / spell interaction
// state, turns sim events into sounds + achievements, and records the
// outcome into progress before showing Results.
//
// HUD → sim call map:
//   Shop card → held type; cell tap → sim.build
//   tower tap → select; TowerPanel → sim.upgrade / chooseBranch /
//     promote / setTargeting / sell
//   SpellBar → spell mode; cell tap → sim.castSpell (skewer: + row/col
//     toggle; castling: two tower taps)
//   Hud → sim.startWave / setSpeed / setPaused / skipIntro
import { useEffect, useRef, useState } from 'react'
import type { CastleIdentity } from '../../../castle/identity'
import type { SubmitSiegeScoreRequest } from '../../../firebase/callables'
import { useSound } from '../../../sound/useSound'
import type { SoundName } from '../../../sound/synth'
import { endlessWaveGenerator } from '../content'
import { SPELL_DEFS, TOWER_DEFS } from '../sim/defs'
import { createSim } from '../sim/sim'
import type { Cell, MapDef, Modifier, Sim, SimEvent, SpellId, TowerType } from '../sim/types'
import { SiegeScene } from '../view/SiegeScene'
import { Hud, type HudToast } from './Hud'
import {
  ACHIEVEMENTS,
  totalStars,
  unlockedSpells,
  withAchievement,
  withCampaignResult,
  withDailyResult,
  withEndlessResult,
  type AchievementId,
  type SiegeProgress,
} from './progress'
import { Results, type Outcome, type RunMode } from './Results'
import { Shop } from './Shop'
import { SpellBar } from './SpellBar'
import { TowerPanel } from './TowerPanel'
import { useSimSnapshot } from './useSimSnapshot'

export interface RunConfig {
  mode: RunMode
  map: MapDef
  seed: number
  /** Extra modifiers on top of the map's (daily challenge). */
  modifiers: Modifier[]
  dateKey?: string
}

interface Props {
  run: RunConfig
  campaign: ReadonlyArray<MapDef>
  progress: SiegeProgress
  onProgress: (next: SiegeProgress) => void
  identity: CastleIdentity | null
  hasNext: boolean
  onNext: () => void
  onReplay: () => void
  onEndless: () => void
  onExit: () => void
}

type Interaction =
  | { kind: 'idle' }
  | { kind: 'place'; type: TowerType }
  | { kind: 'select'; towerId: number; cell: Cell }
  | { kind: 'spell'; spell: 'fork' }
  | { kind: 'spell'; spell: 'pin' }
  | { kind: 'spell'; spell: 'skewer'; cell: Cell | null }
  | { kind: 'spell'; spell: 'castling'; a: { id: number; cell: Cell } | null }

const IDLE: Interaction = { kind: 'idle' }
const TOAST_MS = 2600
/** The last campaign map — winning it is "checkmate". */
const FINAL_MAP_ID = 'dark-throne'
const FINAL_MAP_ORDER = 12

function makeSim(run: RunConfig, progress: SiegeProgress, campaign: ReadonlyArray<MapDef>): Sim {
  const spells = unlockedSpells(progress, campaign)
  const endless = run.mode !== 'campaign'
  return createSim({
    map: run.map,
    seed: run.seed,
    unlockedSpells: spells,
    ...(endless ? { endless: true, waveGenerator: endlessWaveGenerator(run.map, run.seed) } : {}),
    ...(run.modifiers.length > 0 ? { modifiers: run.modifiers } : {}),
  })
}

function copyCell(cell: Cell): Cell {
  return { c: cell.c, r: cell.r }
}

function cellsInSquare(center: Cell, radius: number, cols: number, rows: number): Cell[] {
  const out: Cell[] = []
  for (let r = center.r - radius; r <= center.r + radius; r++) {
    for (let c = center.c - radius; c <= center.c + radius; c++) {
      if (c >= 0 && r >= 0 && c < cols && r < rows) out.push({ c, r })
    }
  }
  return out
}

function lineCells(cell: Cell, orientation: 'row' | 'col' | 'both', cols: number, rows: number): Cell[] {
  const out: Cell[] = []
  if (orientation !== 'col') for (let c = 0; c < cols; c++) out.push({ c, r: cell.r })
  if (orientation !== 'row') for (let r = 0; r < rows; r++) if (orientation === 'col' || r !== cell.r) out.push({ c: cell.c, r })
  return out
}

function hintFor(ix: Interaction): string | null {
  switch (ix.kind) {
    case 'place':
      return `Tap a plot to place the ${TOWER_DEFS[ix.type].name} — the green cells are where it strikes. Esc to put it back.`
    case 'spell':
      if (ix.spell === 'castling') return ix.a ? 'Now tap the piece to swap it with.' : 'Castling: tap the first piece to swap.'
      if (ix.spell === 'skewer') return ix.cell ? 'Along the row, or down the column?' : 'Skewer: tap any cell on the line you want to pierce.'
      return `Tap a cell to cast ${SPELL_DEFS[ix.spell].name}.`
    default:
      return null
  }
}

export function SiegeGame({ run, campaign, progress, onProgress, identity, hasNext, onNext, onReplay, onEndless, onExit }: Props) {
  const { play } = useSound()
  const [sim] = useState(() => makeSim(run, progress, campaign))
  const [ix, setIx] = useState<Interaction>(IDLE)
  const [hover, setHover] = useState<Cell | null>(null)
  const [outcome, setOutcome] = useState<Outcome | null>(null)
  const [toast, setToast] = useState<HudToast | null>(null)
  const [confirmQuit, setConfirmQuit] = useState(false)

  // Latest progress for event-time updates (the scene may hold an older
  // onEvents closure), plus per-run trackers that must not re-render.
  const progressRef = useRef(progress)
  const outcomeRef = useRef<Outcome | null>(null)
  const newlyRef = useRef<AchievementId[]>([])
  const toastSeqRef = useRef(0)
  const lastSfxRef = useRef<Partial<Record<SoundName, number>>>({})
  useEffect(() => {
    progressRef.current = progress
  }, [progress])

  const selectedTowerId = ix.kind === 'select' ? ix.towerId : null
  const snap = useSimSnapshot(sim, selectedTowerId)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIx(IDLE)
        setConfirmQuit(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    if (!toast) return
    const id = window.setTimeout(() => setToast(null), TOAST_MS)
    return () => window.clearTimeout(id)
  }, [toast])

  function commit(next: SiegeProgress) {
    progressRef.current = next
    onProgress(next)
  }

  function grant(id: AchievementId) {
    const p = progressRef.current
    if (p.achievements.includes(id)) return
    commit(withAchievement(p, id))
    newlyRef.current.push(id)
    toastSeqRef.current += 1
    const a = ACHIEVEMENTS.find((x) => x.id === id)
    setToast({ id: toastSeqRef.current, text: `✦ ${a?.name ?? id}` })
    play('badge-earned')
  }

  function finish(won: boolean, stars: 0 | 1 | 2 | 3, score: number, wave: number) {
    if (outcomeRef.current) return
    const p = progressRef.current
    const map = run.map
    const prevBest =
      run.mode === 'campaign'
        ? (p.best[map.id] ?? 0)
        : run.mode === 'endless'
          ? p.endlessBest.score
          : (run.dateKey ? (p.dailyBest[run.dateKey]?.score ?? 0) : 0)

    let next = p
    if (run.mode === 'campaign') {
      if (won) next = withCampaignResult(next, map.id, stars, score)
    } else if (run.mode === 'endless') {
      next = withEndlessResult(next, wave, score)
    } else if (run.dateKey) {
      next = withDailyResult(next, run.dateKey, wave, score)
    }
    const newly = [...newlyRef.current]
    const grantHere = (id: AchievementId) => {
      if (next.achievements.includes(id)) return
      next = withAchievement(next, id)
      newly.push(id)
    }
    if (won && stars === 3) grantHere('perfect')
    if (won && run.mode === 'campaign' && (map.id === FINAL_MAP_ID || map.order === FINAL_MAP_ORDER)) grantHere('checkmate')
    commit(next)

    let submit: SubmitSiegeScoreRequest | null = null
    if (identity && !identity.isBypass) {
      const normalizedName = identity.normalizedName
      if (run.mode === 'endless') submit = { normalizedName, mode: 'endless', score, wave }
      else if (run.mode === 'daily' && run.dateKey) submit = { normalizedName, mode: 'daily', score, wave, dateKey: run.dateKey }
      else if (run.mode === 'campaign' && won) submit = { normalizedName, mode: 'campaign', score, wave, stars: totalStars(next, campaign) }
    }

    const o: Outcome = { won, stars, score, wave, prevBest, newAchievements: newly, submit }
    outcomeRef.current = o
    setOutcome(o)
    setIx(IDLE)
    setConfirmQuit(false)
  }

  function handleEvents(events: SimEvent[]) {
    if (events.length === 0) return
    const now = performance.now()
    const sfx = (name: SoundName, minGapMs = 0) => {
      const last = lastSfxRef.current[name] ?? 0
      if (now - last < minGapMs) return
      lastSfxRef.current[name] = now
      play(name)
    }
    for (const ev of events) {
      switch (ev.kind) {
        case 'kill':
          sfx('capture', 90)
          grant('first-blood')
          break
        case 'leak':
          sfx('knight-hit', 150)
          break
        case 'waveClear':
          sfx('small-solve')
          break
        case 'waveStart':
          if (run.mode !== 'campaign' && ev.wave >= 20) grant('endless-20')
          break
        case 'bossSpawn':
        case 'bossPhase':
          sfx('check', 200)
          break
        case 'bossDefeat':
          sfx('big-solve')
          if (ev.boss === 'ironRook') grant('iron-breaker')
          else if (ev.boss === 'frostBishop') grant('frostbite')
          else if (ev.boss === 'shadowQueen') grant('shadow-seer')
          break
        case 'build':
          sfx('move')
          break
        case 'upgrade':
          sfx('level-up')
          break
        case 'promote':
          sfx('powerup-classic')
          grant('promotion')
          break
        case 'sell':
          sfx('shop-browse')
          break
        case 'spell':
          sfx('powerup-lightning')
          break
        case 'castling':
          sfx('duel-clash')
          break
        case 'combo':
          sfx('streak', 300)
          break
        case 'won':
          sfx('mate-win')
          finish(true, ev.stars, ev.score, sim.state.wave)
          break
        case 'lost':
          sfx('mate-loss')
          finish(false, 0, ev.score, ev.wave)
          break
        default:
          break
      }
    }
  }

  function handleHover(cell: Cell | null) {
    setHover((prev) => (prev && cell && prev.c === cell.c && prev.r === cell.r ? prev : cell ? copyCell(cell) : null))
  }

  function handleCellTap(cell: Cell) {
    if (outcome) return
    const tower = sim.towerAt(cell)
    switch (ix.kind) {
      case 'place': {
        if (tower) {
          setIx({ kind: 'select', towerId: tower.id, cell: copyCell(tower.cell) })
          return
        }
        if (sim.build(cell, ix.type)) setIx(IDLE)
        return
      }
      case 'spell': {
        if (ix.spell === 'fork' || ix.spell === 'pin') {
          const inReach = sim.state.enemies.length
          if (sim.castSpell(ix.spell, { kind: 'cell', cell })) {
            if (ix.spell === 'fork' && inReach >= 2) grant('fork-two')
            setIx(IDLE)
          }
          return
        }
        if (ix.spell === 'skewer') {
          setIx({ kind: 'spell', spell: 'skewer', cell: copyCell(cell) })
          return
        }
        if (!tower) return
        if (!ix.a) {
          setIx({ kind: 'spell', spell: 'castling', a: { id: tower.id, cell: copyCell(tower.cell) } })
          return
        }
        if (tower.id === ix.a.id) return
        if (sim.castSpell('castling', { kind: 'towers', a: ix.a.id, b: tower.id })) setIx(IDLE)
        return
      }
      default:
        setIx(tower ? { kind: 'select', towerId: tower.id, cell: copyCell(tower.cell) } : IDLE)
    }
  }

  function handleShopPick(type: TowerType) {
    setIx(ix.kind === 'place' && ix.type === type ? IDLE : { kind: 'place', type })
  }

  function handleSpellPick(id: SpellId) {
    if (ix.kind === 'spell' && ix.spell === id) {
      setIx(IDLE)
      return
    }
    const st = snap.spells[id]
    if (!st.unlocked || !st.ready) return
    if (id === 'skewer') setIx({ kind: 'spell', spell: 'skewer', cell: null })
    else if (id === 'castling') setIx({ kind: 'spell', spell: 'castling', a: null })
    else setIx({ kind: 'spell', spell: id })
  }

  function castSkewer(orientation: 'row' | 'col') {
    if (ix.kind !== 'spell' || ix.spell !== 'skewer' || !ix.cell) return
    if (sim.castSpell('skewer', { kind: 'line', cell: ix.cell, orientation })) setIx(IDLE)
  }

  function askQuit() {
    sim.setPaused(true)
    setConfirmQuit(true)
  }

  function cancelQuit() {
    setConfirmQuit(false)
    sim.setPaused(false)
  }

  // ── Derived scene props ─────────────────────────────────────────────
  const { cols, rows } = run.map
  const panelTower = ix.kind === 'select' && snap.selectedTower?.id === ix.towerId ? snap.selectedTower : null
  const held = ix.kind === 'place' ? ix.type : null
  const activeSpell = ix.kind === 'spell' ? ix.spell : null

  let highlightCells: Cell[] = []
  let ghost: { type: TowerType; cell: Cell; ok: boolean } | null = null
  let selectedCell: Cell | null = null
  if (ix.kind === 'place' && hover) {
    highlightCells = sim.attackCells(ix.type, hover, 1, null)
    ghost = { type: ix.type, cell: hover, ok: sim.canBuild(hover, ix.type).ok }
  } else if (ix.kind === 'select') {
    selectedCell = ix.cell
    if (panelTower) highlightCells = sim.attackCells(panelTower.type, panelTower.cell, panelTower.level, panelTower.branch)
  } else if (ix.kind === 'spell') {
    if (ix.spell === 'fork' && hover) highlightCells = cellsInSquare(hover, 2, cols, rows)
    else if (ix.spell === 'pin' && hover) highlightCells = cellsInSquare(hover, 1, cols, rows)
    else if (ix.spell === 'skewer') {
      const at = ix.cell ?? hover
      if (at) highlightCells = lineCells(at, 'both', cols, rows)
    } else if (ix.spell === 'castling' && ix.a) {
      selectedCell = ix.a.cell
    }
  }

  const modifiers: Modifier[] = [...run.map.modifiers, ...run.modifiers]
  const hint = outcome ? null : hintFor(ix)
  const running = snap.phase === 'build' || snap.phase === 'wave'
  const unlockMapName = (id: SpellId) => campaign.find((m) => m.unlocksSpell === id)?.name ?? 'the campaign map'

  return (
    <div className="puc-siege">
      <div className="puc-siege__scene">
        <SiegeScene
          sim={sim}
          onEvents={handleEvents}
          onCellTap={handleCellTap}
          onCellHover={handleHover}
          highlightCells={highlightCells}
          selectedCell={selectedCell}
          ghost={ghost}
          theme={run.map.theme}
        />
      </div>

      <div className="puc-siege__hud">
        <Hud
          snap={snap}
          mapName={run.mode === 'daily' ? `Today · ${run.map.name}` : run.mode === 'endless' ? `Endless · ${run.map.name}` : run.map.name}
          toast={toast}
          showPaused={snap.paused && running && !confirmQuit}
          onStartNow={() => sim.startWave()}
          onSpeed={(s) => sim.setSpeed(s)}
          onTogglePause={() => sim.setPaused(!snap.paused)}
          onQuit={askQuit}
          onSkipIntro={() => sim.skipIntro()}
        />

        {hint && <p className="puc-siege-hint" role="status">{hint}</p>}

        {ix.kind === 'spell' && ix.spell === 'skewer' && ix.cell && (
          <div className="puc-siege-chooser" role="group" aria-label="Skewer direction">
            <button type="button" className="puc-siege-btn puc-siege-btn--primary" onClick={() => castSkewer('row')}>
              ↔ Row
            </button>
            <button type="button" className="puc-siege-btn puc-siege-btn--primary" onClick={() => castSkewer('col')}>
              ↕ Column
            </button>
            <button type="button" className="puc-siege-btn" onClick={() => setIx(IDLE)}>
              Cancel
            </button>
          </div>
        )}

        {panelTower && (
          <TowerPanel
            sim={sim}
            tower={panelTower}
            gold={snap.gold}
            onClose={() => setIx(IDLE)}
            onSold={() => setIx(IDLE)}
            onPromoted={() => undefined}
          />
        )}

        <div className="puc-siege-bottom">
          <Shop gold={snap.gold} towerCount={snap.towerCount} hasKing={snap.hasKing} modifiers={modifiers} held={held} onPick={handleShopPick} />
          <SpellBar spells={snap.spells} active={activeSpell} unlockMapName={unlockMapName} onPick={handleSpellPick} />
        </div>

        {confirmQuit && !outcome && (
          <div className="puc-siege-overlay" role="dialog" aria-label="Leave the siege?">
            <div className="puc-siege-card">
              <h2 className="puc-siege-card__title">Leave the siege?</h2>
              <p className="puc-siege-card__text">This run won’t be saved. Your stars and achievements so far are safe.</p>
              <div className="puc-siege-card__actions">
                <button type="button" className="puc-siege-btn" onClick={cancelQuit}>
                  Keep defending
                </button>
                <button type="button" className="puc-siege-btn puc-siege-btn--primary" onClick={onExit}>
                  Leave
                </button>
              </div>
            </div>
          </div>
        )}

        {outcome && (
          <Results
            outcome={outcome}
            mode={run.mode}
            mapName={run.map.name}
            signedIn={!!identity && !identity.isBypass}
            hasNext={hasNext}
            onNext={onNext}
            onReplay={onReplay}
            onEndless={onEndless}
            onMenu={onExit}
          />
        )}
      </div>

      <p className="puc-siege-rotate">Turn your tablet sideways — the castle table is wide.</p>
    </div>
  )
}
