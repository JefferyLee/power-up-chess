// SiegeScreen — the route component for /arcade/tower-defense. Switches
// between the map select, the leaderboard and a run. Progress lives in
// localStorage; the leaderboard only hears from signed-in (non-bypass)
// guests. The global <FloatingBack/> is the way back to the Hall.
import { useEffect, useRef, useState } from 'react'
import { useCastle } from '../../../castle/useCastle'
import { CAMPAIGN } from '../content'
import type { MapDef } from '../sim/types'
import { Leaderboard } from './Leaderboard'
import { MapSelect, type DailyInfo } from './MapSelect'
import { loadProgress, saveProgress } from './progress'
import { SiegeGame, type RunConfig } from './SiegeGame'
import './siege.css'

type View = { kind: 'menu' } | { kind: 'board' } | { kind: 'play'; run: RunConfig; runNo: number }

function freshSeed(): number {
  return Math.floor(Math.random() * 0x7fffffff)
}

export function SiegeScreen() {
  const { identity } = useCastle()
  const [progress, setProgress] = useState(loadProgress)
  const [view, setView] = useState<View>({ kind: 'menu' })
  const runSeqRef = useRef(0)

  useEffect(() => {
    saveProgress(progress)
  }, [progress])

  function start(run: RunConfig) {
    runSeqRef.current += 1
    setView({ kind: 'play', run, runNo: runSeqRef.current })
  }
  const startCampaign = (map: MapDef) => start({ mode: 'campaign', map, seed: freshSeed(), modifiers: [] })
  const startEndless = (map: MapDef) => start({ mode: 'endless', map, seed: freshSeed(), modifiers: [] })
  const startDaily = (d: DailyInfo) => start({ mode: 'daily', map: d.map, seed: d.seed, modifiers: d.modifiers, dateKey: d.dateKey })
  const toMenu = () => setView({ kind: 'menu' })

  if (view.kind === 'board') {
    return <Leaderboard myName={identity?.displayName ?? ''} onBack={toMenu} />
  }

  if (view.kind === 'play') {
    const { run } = view
    const index = CAMPAIGN.findIndex((m) => m.id === run.map.id)
    const next = index >= 0 ? CAMPAIGN[index + 1] : undefined
    return (
      <SiegeGame
        key={view.runNo}
        run={run}
        campaign={CAMPAIGN}
        progress={progress}
        onProgress={setProgress}
        identity={identity}
        hasNext={run.mode === 'campaign' && next !== undefined}
        onNext={() => {
          if (next) startCampaign(next)
        }}
        onReplay={() => start({ ...run, seed: run.mode === 'daily' ? run.seed : freshSeed() })}
        onEndless={() => startEndless(run.map)}
        onExit={toMenu}
      />
    )
  }

  return (
    <MapSelect
      campaign={CAMPAIGN}
      progress={progress}
      onPlay={startCampaign}
      onEndless={startEndless}
      onDaily={startDaily}
      onLeaderboard={() => setView({ kind: 'board' })}
    />
  )
}

export default SiegeScreen
