// mockSim — a fake Sim whose state animates by itself, so the view can
// be developed and eyeballed without the real simulation: a fixed
// S-shaped road, enemies of every type walking it, six towers (every
// piece) firing arrows / jumps / beams / chain lightning, a boss with an
// intro, dash + EMP telegraphs, stuns, leaks and wave clears. Taps in
// the demo build pawns on plots, cast Fork on roads and castle towers.
import type {
  BossId,
  Cell,
  CellKind,
  EnemyState,
  EnemyType,
  MapDef,
  Offset,
  Sim,
  SimEvent,
  SimState,
  SpellId,
  SpellState,
  SpellTarget,
  TowerLevel,
  TowerState,
  TowerType,
  Vec2,
} from '../sim/types'

const CELLS = [
  '############',
  'S..........#',
  '#ppppppppp.#',
  '#ppppppppp.#',
  '#..........#',
  '#.ppppppppp#',
  '#.ppppppppp#',
  '#G##########',
]

export const MOCK_MAP: MapDef = {
  id: 'mock',
  order: 0,
  name: 'Mock Yard',
  subtitle: 'view test bench',
  theme: 'courtyard',
  cols: 12,
  rows: 8,
  cells: CELLS,
  waves: [],
  modifiers: [],
  startGold: 0,
  lives: 20,
  intro: '',
}

const PATH: Cell[] = []
for (let c = 0; c <= 10; c++) PATH.push({ c, r: 1 })
for (let r = 2; r <= 4; r++) PATH.push({ c: 10, r })
for (let c = 9; c >= 1; c--) PATH.push({ c, r: 4 })
for (let r = 5; r <= 7; r++) PATH.push({ c: 1, r })

const ENEMY: Record<EnemyType, { hp: number; speed: number; leak: number }> = {
  pawn: { hp: 60, speed: 1.0, leak: 1 },
  knight: { hp: 45, speed: 2.0, leak: 1 },
  bishop: { hp: 90, speed: 1.2, leak: 1 },
  rook: { hp: 420, speed: 0.7, leak: 2 },
  queen: { hp: 700, speed: 1.1, leak: 3 },
}
const SPAWN_ORDER: EnemyType[] = ['pawn', 'pawn', 'knight', 'bishop', 'pawn', 'rook', 'knight', 'queen']
const TOWER: Record<TowerType, { rate: number; damage: number }> = {
  pawn: { rate: 1.6, damage: 12 },
  knight: { rate: 0.9, damage: 34 },
  bishop: { rate: 1.1, damage: 26 },
  rook: { rate: 0.6, damage: 60 },
  queen: { rate: 0.9, damage: 45 },
  king: { rate: 0, damage: 0 },
}
const DIAG: Offset[] = [[1, 1], [1, -1], [-1, 1], [-1, -1]]
const ORTHO: Offset[] = [[1, 0], [-1, 0], [0, 1], [0, -1]]
const KNIGHT: Offset[] = [[1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]]
const BOSS: BossId = 'blackKnight'

function patternCells(type: TowerType, cell: Cell, level: TowerLevel, branch: string | null): Cell[] {
  const out: Cell[] = []
  const add = (dc: number, dr: number) => {
    const c = cell.c + dc
    const r = cell.r + dr
    if (c >= 0 && c < MOCK_MAP.cols && r >= 0 && r < MOCK_MAP.rows) out.push({ c, r })
  }
  const slide = (dirs: Offset[], len: number) => {
    for (const [dc, dr] of dirs) for (let i = 1; i <= len; i++) add(dc * i, dr * i)
  }
  switch (type) {
    case 'pawn':
      for (const [dc, dr] of branch === 'spear' ? [...DIAG, ...ORTHO] : DIAG) add(dc, dr)
      break
    case 'knight':
      for (const [dc, dr] of KNIGHT) add(dc, dr)
      break
    case 'bishop':
      slide(DIAG, level >= 2 ? 5 : 4)
      break
    case 'rook':
      slide(ORTHO, level >= 2 ? 6 : 5)
      break
    case 'queen':
      slide([...DIAG, ...ORTHO], level >= 2 ? 5 : 4)
      break
    case 'king':
      for (const [dc, dr] of [...DIAG, ...ORTHO]) add(dc, dr)
      break
  }
  return out
}

const centre = (cell: Cell): Vec2 => ({ x: cell.c + 0.5, y: cell.r + 0.5 })
const cellOf = (p: Vec2): Cell => ({ c: Math.floor(p.x), r: Math.floor(p.y) })
const spell = (): SpellState => ({ ready: true, cooldown: 0, unlocked: true })

export function createMockSim(): Sim {
  const state: SimState = {
    time: 0,
    speed: 1,
    paused: false,
    phase: 'wave',
    gold: 500,
    lives: 20,
    livesMax: 20,
    wave: 1,
    waveTotal: 0,
    countdown: 0,
    pending: 0,
    towers: [],
    enemies: [],
    projectiles: [],
    beams: [],
    telegraphs: [],
    spells: { fork: spell(), pin: spell(), skewer: spell(), castling: spell() },
    score: 0,
    kills: 0,
    leaks: 0,
    paths: [PATH],
    boss: null,
    bossIntro: 1,
    introBoss: null,
  }
  let nextId = 1
  /** Events accumulate between ticks (build / spells fire from clicks). */
  let events: SimEvent[] = []
  let spawnClock = 1
  let spawnIdx = 0
  let bossClock = 12
  let dashClock = 0
  let empClock = 0
  let dashAt = 0
  let empAt = 0
  const baseSpeed = new Map<number, number>()
  const towerCells = new Map<number, Cell[]>()
  const projInfo = new Map<number, { target: number; damage: number; chain: boolean }>()

  function addTower(type: TowerType, cell: Cell, level: TowerLevel, branch: string | null): TowerState {
    const t: TowerState = { id: nextId++, type, cell, level, branch, targeting: 'first', stunnedUntil: 0, kills: 0, spent: 0, buffed: false, cooldown: 0 }
    state.towers.push(t)
    towerCells.set(t.id, patternCells(type, cell, level, branch))
    return t
  }
  function refreshBuffs(): void {
    const kings = state.towers.filter((t) => t.type === 'king')
    for (const t of state.towers) {
      t.buffed = t.type !== 'king' && kings.some((k) => Math.abs(k.cell.c - t.cell.c) <= 1 && Math.abs(k.cell.r - t.cell.r) <= 1)
    }
  }
  addTower('rook', { c: 9, r: 2 }, 2, null)
  addTower('pawn', { c: 2, r: 5 }, 1, null)
  addTower('knight', { c: 5, r: 3 }, 3, 'storm')
  addTower('bishop', { c: 3, r: 2 }, 1, null)
  addTower('queen', { c: 7, r: 3 }, 1, null)
  addTower('king', { c: 8, r: 3 }, 1, null)
  refreshBuffs()

  function spawn(type: EnemyType | BossId, hp: number, speed: number, boss: boolean): EnemyState {
    const start = centre(PATH[0] ?? { c: 0, r: 0 })
    const e: EnemyState = {
      id: nextId++,
      type,
      boss,
      decoy: false,
      hp,
      maxHp: hp,
      armor: 0,
      pos: { ...start },
      dir: { x: 1, y: 0 },
      progress: 0,
      remaining: PATH.length - 1,
      speedMult: 1,
      slowUntil: 0,
      frozenUntil: 0,
      burnUntil: 0,
      burnDps: 0,
      shieldLayers: 0,
      phase: 0,
      spawnedAt: state.time,
      hitAt: -1,
    }
    baseSpeed.set(e.id, speed)
    state.enemies.push(e)
    events.push({ kind: 'spawn', enemyId: e.id, at: { ...start }, type })
    return e
  }
  function remove(e: EnemyState): void {
    const i = state.enemies.indexOf(e)
    if (i >= 0) state.enemies.splice(i, 1)
    baseSpeed.delete(e.id)
    if (state.boss === e) state.boss = null
  }
  function damage(e: EnemyState, amount: number): void {
    e.hp -= amount
    e.hitAt = state.time
    events.push({ kind: 'hit', enemyId: e.id, at: { ...e.pos }, damage: amount, crit: false })
    if (e.hp > 0) return
    remove(e)
    state.kills++
    events.push({ kind: 'kill', enemyId: e.id, at: { ...e.pos }, type: e.type, reward: 10 })
    if (e.boss) {
      events.push({ kind: 'bossDefeat', boss: BOSS, at: { ...e.pos } })
      events.push({ kind: 'waveClear', wave: state.wave, bonus: 20 + 8 * state.wave })
      state.wave++
      bossClock = 25
    }
  }
  function moveEnemies(dt: number): void {
    for (const e of [...state.enemies]) {
      const factor = e.frozenUntil > state.time ? 0 : e.slowUntil > state.time ? 0.55 : 1
      e.progress += (baseSpeed.get(e.id) ?? 1) * factor * dt
      const i = Math.floor(e.progress)
      const a = PATH[i]
      const b = PATH[i + 1]
      if (!a || !b) {
        remove(e)
        const lost = e.boss ? 5 : ENEMY[e.type as EnemyType].leak
        state.lives -= lost
        state.leaks++
        events.push({ kind: 'leak', enemyId: e.id, livesLost: lost })
        continue
      }
      const f = e.progress - i
      const ca = centre(a)
      const cb = centre(b)
      e.pos.x = ca.x + (cb.x - ca.x) * f
      e.pos.y = ca.y + (cb.y - ca.y) * f
      e.dir.x = Math.sign(cb.x - ca.x)
      e.dir.y = Math.sign(cb.y - ca.y)
      e.remaining = PATH.length - 1 - e.progress
    }
  }
  function fireTowers(dt: number): void {
    for (const t of state.towers) {
      const stats = TOWER[t.type]
      if (stats.rate === 0 || t.stunnedUntil > state.time) continue
      t.cooldown = Math.min(1, t.cooldown + stats.rate * (t.buffed ? 1.15 : 1) * dt)
      if (t.cooldown < 1) continue
      const cells = towerCells.get(t.id) ?? []
      const target = state.enemies.find((e) => cells.some((c) => c.c === Math.floor(e.pos.x) && c.r === Math.floor(e.pos.y)))
      if (!target) continue
      t.cooldown = 0
      const from = centre(t.cell)
      const to = { ...target.pos }
      events.push({ kind: 'shot', towerId: t.id, from, to, towerType: t.type })
      const dmg = stats.damage * (t.buffed ? 1.25 : 1)
      if (t.type === 'pawn' || t.type === 'knight') {
        const id = nextId++
        state.projectiles.push({ id, kind: t.type === 'pawn' ? 'arrow' : 'jump', from, to, t: 0 })
        projInfo.set(id, { target: target.id, damage: dmg, chain: t.branch === 'storm' })
      } else {
        state.beams.push({ id: nextId++, kind: t.type === 'king' ? 'queen' : t.type, from, to, ttl: 0.25, life: 0.25 })
        if (t.type === 'bishop') target.slowUntil = state.time + 1.5
        damage(target, dmg)
      }
    }
  }
  function flyProjectiles(dt: number): void {
    for (const p of [...state.projectiles]) {
      p.t += dt * 3.5
      if (p.t < 1) continue
      state.projectiles.splice(state.projectiles.indexOf(p), 1)
      const info = projInfo.get(p.id)
      projInfo.delete(p.id)
      const target = info ? state.enemies.find((e) => e.id === info.target) : undefined
      if (!info || !target) continue
      damage(target, info.damage)
      if (!info.chain) continue
      // Storm knight: the bolt arcs on to two neighbours.
      let from = target
      let hops = 0
      for (const e of [...state.enemies]) {
        if (hops >= 2) break
        if (e === target || Math.hypot(e.pos.x - from.pos.x, e.pos.y - from.pos.y) > 2.2) continue
        state.beams.push({ id: nextId++, kind: 'chain', from: { ...from.pos }, to: { ...e.pos }, ttl: 0.3, life: 0.3 })
        damage(e, info.damage * 0.6)
        from = e
        hops++
      }
    }
  }
  function bossTick(dt: number): void {
    const b = state.boss
    if (!b) {
      bossClock -= dt
      if (bossClock > 0) return
      bossClock = Infinity
      // Tougher than the real Black Knight so its EMP (stuns) gets seen.
      const boss = spawn(BOSS, 3600, 1.3, true)
      state.boss = boss
      state.bossIntro = 0
      state.introBoss = BOSS
      dashClock = 4
      empClock = 8
      events.push({ kind: 'bossSpawn', boss: BOSS, enemyId: boss.id })
      return
    }
    dashClock -= dt
    empClock -= dt
    if (dashClock <= 0) {
      const i = Math.floor(b.progress)
      state.telegraphs.push({ id: nextId++, kind: 'line', cells: PATH.slice(i, i + 4), ttl: 1.2, life: 1.2, ability: 'dash' })
      dashAt = state.time + 1.2
      dashClock = 6
    }
    if (dashAt > 0 && state.time >= dashAt) {
      dashAt = 0
      b.progress = Math.min(PATH.length - 1.001, b.progress + 3)
      events.push({ kind: 'bossAbility', boss: BOSS, ability: 'dash', at: { ...b.pos } })
    }
    if (empClock <= 0) {
      const bc = cellOf(b.pos)
      const cells = [bc, { c: bc.c + 2, r: bc.r }, { c: bc.c - 2, r: bc.r }, { c: bc.c, r: bc.r + 2 }, { c: bc.c, r: bc.r - 2 }]
      state.telegraphs.push({ id: nextId++, kind: 'ring', cells, ttl: 1.5, life: 1.5, ability: 'emp' })
      empAt = state.time + 1.5
      empClock = 10
    }
    if (empAt > 0 && state.time >= empAt) {
      empAt = 0
      const bc = cellOf(b.pos)
      for (const t of state.towers) {
        if (Math.abs(t.cell.c - bc.c) > 2 || Math.abs(t.cell.r - bc.r) > 2) continue
        t.stunnedUntil = state.time + 3
        events.push({ kind: 'stun', towerId: t.id, seconds: 3 })
      }
      events.push({ kind: 'bossAbility', boss: BOSS, ability: 'emp', at: { ...b.pos } })
    }
  }

  function tick(dt: number): SimEvent[] {
    const out = events
    events = []
    if (state.paused) return out
    let sdt = dt * state.speed
    if (state.bossIntro < 1) {
      state.bossIntro = Math.min(1, state.bossIntro + dt / 2.5)
      if (state.bossIntro >= 1) state.introBoss = null
      // The sim slows to 0.25× in the middle of the intro.
      sdt *= 1 - 0.75 * Math.sin(Math.PI * state.bossIntro)
    }
    state.time += sdt
    spawnClock -= sdt
    if (spawnClock <= 0 && state.enemies.length < 24) {
      spawnClock = 1.6
      const type = SPAWN_ORDER[spawnIdx++ % SPAWN_ORDER.length] ?? 'pawn'
      spawn(type, ENEMY[type].hp, ENEMY[type].speed, false)
    }
    moveEnemies(sdt)
    fireTowers(sdt)
    flyProjectiles(sdt)
    for (const b of state.beams) b.ttl -= sdt
    state.beams = state.beams.filter((b) => b.ttl > 0)
    for (const t of state.telegraphs) t.ttl -= sdt
    state.telegraphs = state.telegraphs.filter((t) => t.ttl > 0)
    bossTick(sdt)
    // Events raised during this tick go out with it.
    out.push(...events)
    events = []
    return out
  }

  const cellKind = (cell: Cell): CellKind | null => {
    const ch = CELLS[cell.r]?.[cell.c]
    if (ch === undefined) return null
    return ch === '#' ? 'wall' : ch === 'p' ? 'plot' : ch === 'o' ? 'open' : 'road'
  }
  const towerAt = (cell: Cell): TowerState | null => state.towers.find((t) => t.cell.c === cell.c && t.cell.r === cell.r) ?? null
  const canBuild = (cell: Cell) => (cellKind(cell) === 'plot' && !towerAt(cell) ? { ok: true } : { ok: false, reason: 'Not a free plot' })

  return {
    state,
    map: MOCK_MAP,
    tick,
    canBuild,
    build(cell, type) {
      if (!canBuild(cell).ok) return false
      const t = addTower(type, cell, 1, null)
      refreshBuffs()
      events.push({ kind: 'build', towerId: t.id, type, cell })
      return true
    },
    canUpgrade: () => ({ ok: false, cost: 0, reason: 'mock' }),
    upgrade: () => false,
    chooseBranch: () => false,
    canPromote: () => ({ ok: false, cost: 0, reason: 'mock' }),
    promote: () => false,
    sell(towerId) {
      const t = state.towers.find((x) => x.id === towerId)
      if (!t) return 0
      state.towers.splice(state.towers.indexOf(t), 1)
      towerCells.delete(towerId)
      refreshBuffs()
      events.push({ kind: 'sell', cell: t.cell, refund: 0 })
      return 0
    },
    setTargeting() {},
    castSpell(id: SpellId, target: SpellTarget) {
      if (target.kind === 'towers') {
        const a = state.towers.find((t) => t.id === target.a)
        const b = state.towers.find((t) => t.id === target.b)
        if (!a || !b) return false
        const cellA = a.cell
        a.cell = b.cell
        b.cell = cellA
        towerCells.set(a.id, patternCells(a.type, a.cell, a.level, a.branch))
        towerCells.set(b.id, patternCells(b.type, b.cell, b.level, b.branch))
        refreshBuffs()
        events.push({ kind: 'castling', a: a.cell, b: b.cell })
        return true
      }
      if (target.kind !== 'cell') return false
      const at = target.cell
      events.push({ kind: 'spell', spell: id, at })
      const near = (radius: number) => state.enemies.filter((e) => Math.abs(Math.floor(e.pos.x) - at.c) <= radius && Math.abs(Math.floor(e.pos.y) - at.r) <= radius)
      if (id === 'fork') {
        const cells: Cell[] = []
        for (let dc = -1; dc <= 1; dc++) for (let dr = -1; dr <= 1; dr++) cells.push({ c: at.c + dc, r: at.r + dr })
        state.telegraphs.push({ id: nextId++, kind: 'cells', cells, ttl: 0.5, life: 0.5, ability: 'spell' })
        for (const e of near(2).sort((p, q) => q.progress - p.progress).slice(0, 2)) damage(e, 120)
      } else if (id === 'pin') {
        for (const e of near(1)) e.frozenUntil = state.time + 3
      }
      return true
    },
    startWave() {},
    skipIntro() {
      if (state.bossIntro >= 1) return
      state.bossIntro = 1
      state.introBoss = null
    },
    setSpeed(speed) {
      state.speed = speed
    },
    setPaused(paused) {
      state.paused = paused
    },
    attackCells: patternCells,
    towerAt,
    cellKind,
  }
}
