// Command-handler registry. Every slash command in the hidden text
// world plugs in here. `dispatchCommand` is the single entry point
// for the terminal's input — it handles slash commands, single-word
// Easter eggs, and falls back to "send as public chat" for anything
// else.
//
// Each entry declares:
//   • tier — basic / advanced / hidden (drives /help layering)
//   • description — one-liner shown in /help
//   • handle — async run with a CommandContext (push to private stream,
//              post to chat, navigate, etc).
//   • unlockedFor — optional gate; null means always available.

import { Chess } from 'chess.js'
import type { CastleIdentity } from '../identity'
import type { HostId } from '../../hosts/hosts'
import type { PresenceRow, ChatMessage, LocationTag } from '../useLobbyChat'
import type { NavigateFunction } from 'react-router-dom'
import { pushPrivate, clearPrivate } from './privateStream'
import { setClearedAtNow } from '../clearedAt'
import { renderAsciiBoard } from './asciiBoard'
import { loadPlayState, savePlayState, clearPlayState, DEFAULT_RATING } from './playState'
import { bestReplyUci, coachEval } from './playEngine'
import {
  ROOMS,
  describeExits,
  liveExits,
  markVisited,
  parseDirection,
  saveCurrentRoom,
  type Direction,
  type RoomId,
} from './world'
import {
  ITEMS,
  dropItem,
  findItemByName,
  isCarried,
  isCellarOpen,
  itemsInRoom,
  loadInventory,
  markCellarOpen,
  takeItem,
  type Item,
} from './items'
import {
  isCorrect,
  markSolvedToday,
  readSolvedToday,
  todaysMystery,
} from './mysteries'
import { LORE, findLore } from './lore'
import { loadVisited } from './world'

export type CommandTier = 'basic' | 'advanced' | 'hidden'

/** Snapshot of Hall state passed into every command handler. The
 *  terminal feeds this on each dispatch so commands stay pure-ish:
 *  no Firestore reads in handlers for V1. */
export interface WorldSnapshot {
  presence: PresenceRow[]
  hostOnDuty: HostId
  currentStoryTitle: string | null
  /** Last ~80 public Hall messages, oldest-first. Snapshot only —
   *  /read picks the tail; the terminal itself never renders these. */
  recentMessages: ChatMessage[]
  /** Where the kid is in the Castle Map right now. Drives /look and
   *  the per-room gating for /ask + /play. */
  currentRoom: RoomId
  /** Setter so navigation handlers (/go, /n, etc.) can update both
   *  state and persisted localStorage in one place. Re-renders the
   *  terminal so subsequent commands see the new room. */
  setCurrentRoom: (next: RoomId) => void
}

export interface CommandContext {
  identity: CastleIdentity | null
  navigate: NavigateFunction
  world: WorldSnapshot
  /** Post a public chat message via callPostChat. */
  postPublic: (text: string) => Promise<void>
  /** Close the terminal overlay (e.g. /exit). */
  exitTerminal: () => void
}

export interface CommandHandler {
  name: string
  tier: CommandTier
  description: string
  /** Optional milestone gate. Returns true when the kid has earned
   *  the right to see this command in /help and use it cleanly. */
  unlockedFor?: (identity: CastleIdentity | null) => boolean
  handle: (args: string, ctx: CommandContext) => Promise<void> | void
}

const handlers = new Map<string, CommandHandler>()

export function registerCommand(h: CommandHandler): void {
  handlers.set(h.name, h)
}

export function getCommand(name: string): CommandHandler | undefined {
  return handlers.get(name.toLowerCase())
}

export function listCommands(identity: CastleIdentity | null): CommandHandler[] {
  return [...handlers.values()].filter((h) => !h.unlockedFor || h.unlockedFor(identity))
}

/** Tier-bucketed listing for /help. Hidden commands ONLY surface to
 *  guests who already passed the unlockedFor gate (so /help itself
 *  doubles as discovery telemetry — see a new command appear once
 *  you've earned it). */
export function helpByTier(identity: CastleIdentity | null): Record<CommandTier, CommandHandler[]> {
  const out: Record<CommandTier, CommandHandler[]> = { basic: [], advanced: [], hidden: [] }
  for (const h of listCommands(identity)) {
    out[h.tier].push(h)
  }
  for (const tier of ['basic', 'advanced', 'hidden'] as const) {
    out[tier].sort((a, b) => a.name.localeCompare(b.name))
  }
  return out
}

// Easter eggs are matched on the WHOLE trimmed input (case-insensitive)
// — typing `xyzzy` is the egg; `xyzzy please` isn't.
const EASTER_EGGS: Record<string, (ctx: CommandContext) => string> = {
  xyzzy: () =>
    'Nothing happens. …Or does it? The torchlight wavers, just slightly.',
  whoami: (ctx) => {
    const id = ctx.identity
    if (!id) return 'You have no name here yet. Enter through the wicket first.'
    return `You are ${id.displayName} — ${id.castlePoints} castle point${id.castlePoints === 1 ? '' : 's'} in your pocket.`
  },
  time: () => {
    const d = new Date()
    const hh = String(d.getHours()).padStart(2, '0')
    const mm = String(d.getMinutes()).padStart(2, '0')
    return `The castle clock reads ${hh}:${mm}.`
  },
  chess: () =>
    'Chess is the slowest brawl in history. Pieces remember which squares you trust.',
  '42': () =>
    'The Castle nods. "The answer," it says, "but to which question?"',
  // "67" / "six seven" — the basketball/song meme that took over
  // playgrounds in 2025. The Castle is tired of it.
  '67': () =>
    'You yell "six… seven!" The Castle blinks. "You are old, friend. That was a 2025 thing."',
  'six seven': () =>
    'You yell "six… seven!" The Castle blinks. "You are old, friend. That was a 2025 thing."',
}

/** Parse + dispatch. Returns true when the input was handled by the
 *  terminal (slash command or Easter egg), false when it's plain text
 *  the caller should post to public chat. */
export async function dispatchCommand(
  raw: string,
  ctx: CommandContext,
): Promise<boolean> {
  const trimmed = raw.trim()
  if (!trimmed) return false

  // Easter eggs — single-token plain input, no slash.
  if (!trimmed.startsWith('/')) {
    const eggKey = trimmed.toLowerCase()
    const egg = EASTER_EGGS[eggKey]
    if (egg) {
      pushPrivate('echo', trimmed)
      pushPrivate('reply', egg(ctx))
      return true
    }
    return false
  }

  const m = /^\/(\S+)\s*(.*)$/.exec(trimmed)
  if (!m) return false
  const name = m[1]!.toLowerCase()
  const args = m[2] ?? ''

  const handler = handlers.get(name)
  if (!handler) {
    pushPrivate('whisper', `You mumble "/${name}". The Castle doesn't recognise it. Type /help if you're lost.`)
    return true
  }
  if (handler.unlockedFor && !handler.unlockedFor(ctx.identity)) {
    pushPrivate('whisper', `"/${name}" feels just out of reach. Maybe later, adventurer.`)
    return true
  }
  // Echo so the private stream reads like a session.
  pushPrivate('echo', trimmed)
  try {
    await handler.handle(args, ctx)
  } catch (err) {
    pushPrivate('reply', err instanceof Error ? err.message : String(err))
  }
  return true
}

// Unlock gates — for V1, simple castle-point thresholds. Tunable
// later; the key thing is /help only shows what the kid has actually
// earned, so the world keeps unfolding.
const ADVANCED_UNLOCK_CP = 50
const HIDDEN_UNLOCK_CP = 100

const isAdvancedUnlocked = (id: CastleIdentity | null) =>
  !!id && !id.isBypass && id.castlePoints >= ADVANCED_UNLOCK_CP
const isHiddenUnlocked = (id: CastleIdentity | null) =>
  !!id && !id.isBypass && id.castlePoints >= HIDDEN_UNLOCK_CP

// ─── Basic: /clear ──────────────────────────────────────────────────

registerCommand({
  name: 'clear',
  tier: 'basic',
  description: 'Wipe your own view of the chat. (Nobody else sees a change.)',
  handle: () => {
    setClearedAtNow()
    clearPrivate()
    pushPrivate('reply', 'The chat fades. A fresh page for your eyes only.')
  },
})

// ─── Basic: /exit ──────────────────────────────────────────────────

registerCommand({
  name: 'exit',
  tier: 'basic',
  description: 'Leave the terminal and return to the Hall.',
  handle: (_args, ctx) => { ctx.exitTerminal() },
})

// ─── Basic: /look ──────────────────────────────────────────────────

registerCommand({
  name: 'look',
  tier: 'basic',
  description: 'Look around your current room.',
  handle: (_args, ctx) => {
    const room = ROOMS[ctx.world.currentRoom]
    const lines = [`── ${room.name} ──`, room.description]
    if (room.occupant) lines.push(room.occupant)
    // Hall-only flavour: who else is around + the live story.
    if (room.id === 'hall') {
      const hallCount = ctx.world.presence.filter(
        (p) => !p.location || p.location.kind === 'hall',
      ).length
      if (hallCount > 0) {
        lines.push(`${hallCount} adventurer${hallCount === 1 ? '' : 's'} mill about. (Type /who to see who.)`)
      }
      if (ctx.world.currentStoryTitle) {
        lines.push(`On the lectern lies a tale: "${ctx.world.currentStoryTitle}".`)
      }
    }
    // Items lying here.
    const here = itemsInRoom(room.id)
    if (here.length > 0) {
      lines.push(`You can see: ${here.map((it) => it.longName).join(', ')}.`)
    }
    lines.push(`Exits: ${describeExits(room, isCellarOpen())}`)
    pushPrivate('reply', lines.join('\n'))
  },
})

// ─── Basic: /go + n/s/e/w/up/down shortcuts ───────────────────────

function move(direction: Direction, ctx: CommandContext): void {
  const room = ROOMS[ctx.world.currentRoom]
  const cellarOpen = isCellarOpen()
  const exits = liveExits(room, cellarOpen)
  const nextId = exits[direction]
  if (!nextId) {
    pushPrivate('reply', `No exit ${directionWord(direction)} from here.`)
    return
  }
  const next = ROOMS[nextId]
  ctx.world.setCurrentRoom(nextId)
  saveCurrentRoom(nextId)
  pushPrivate('reply', `You go ${directionWord(direction)}.`)
  const isFirst = markVisited(nextId)
  if (isFirst && next.firstVisit) {
    pushPrivate('reply', next.firstVisit)
  }
  // Auto-look on arrival so the kid doesn't have to type /look every step.
  const lines = [`── ${next.name} ──`, next.description]
  if (next.occupant) lines.push(next.occupant)
  const here = itemsInRoom(next.id)
  if (here.length > 0) {
    lines.push(`You can see: ${here.map((it) => it.longName).join(', ')}.`)
  }
  lines.push(`Exits: ${describeExits(next, cellarOpen)}`)
  pushPrivate('reply', lines.join('\n'))
}

function directionWord(d: Direction): string {
  switch (d) {
    case 'n': return 'north'
    case 's': return 'south'
    case 'e': return 'east'
    case 'w': return 'west'
    case 'up': return 'up'
    case 'down': return 'down'
  }
}

registerCommand({
  name: 'go',
  tier: 'basic',
  description: 'Walk to a connected room: /go north (or /n /s /e /w /up /down).',
  handle: (args, ctx) => {
    const word = args.trim().split(/\s+/)[0]
    const dir = word ? parseDirection(word) : null
    if (!dir) {
      pushPrivate('reply', 'Use /go followed by a direction, e.g. /go north. Or just /n /s /e /w /up /down.')
      return
    }
    move(dir, ctx)
  },
})

for (const dir of ['n', 's', 'e', 'w', 'up', 'down'] as const) {
  registerCommand({
    name: dir,
    tier: 'basic',
    description: `Walk ${directionWord(dir)}.`,
    handle: (_args, ctx) => { move(dir, ctx) },
  })
}

// ─── Basic: /who ───────────────────────────────────────────────────

registerCommand({
  name: 'who',
  tier: 'basic',
  description: 'See who else is in the Hall right now.',
  handle: (_args, ctx) => {
    const inHall = ctx.world.presence.filter(
      (p) => !p.location || p.location.kind === 'hall',
    )
    if (inHall.length === 0) {
      pushPrivate('reply', 'You are alone in the Hall. The hearth keeps you company.')
      return
    }
    const names = inHall.slice(0, 12).map((p) => p.displayName)
    const extra = inHall.length > 12 ? ` …and ${inHall.length - 12} more` : ''
    pushPrivate('reply', `Around you: ${names.join(', ')}${extra}.`)
  },
})

// ─── Basic: /games — active chess + wizard duels ──────────────────

/** Aggregate live games from presence: anyone in a chess/wizard
 *  room implies a game exists there. Cheap (no extra Firestore reads)
 *  and good enough — rooms with zero presence are effectively dead. */
function liveGames(
  presence: PresenceRow[],
): Array<{ kind: 'chess' | 'wizard'; roomId: string; players: string[] }> {
  const map = new Map<string, { kind: 'chess' | 'wizard'; roomId: string; players: Set<string> }>()
  for (const p of presence) {
    const loc = p.location
    if (!loc || (loc.kind !== 'chess' && loc.kind !== 'wizard')) continue
    const key = `${loc.kind}:${loc.roomId}`
    let row = map.get(key)
    if (!row) {
      row = { kind: loc.kind, roomId: loc.roomId, players: new Set() }
      map.set(key, row)
    }
    row.players.add(p.displayName)
  }
  return [...map.values()].map((r) => ({ ...r, players: [...r.players] }))
}

registerCommand({
  name: 'games',
  tier: 'basic',
  description: 'List active chess + wizard duels in the castle.',
  handle: (_args, ctx) => {
    const games = liveGames(ctx.world.presence)
    if (games.length === 0) {
      pushPrivate('reply', 'No active games right now. The boards are quiet.')
      return
    }
    const lines = [`── ACTIVE GAMES · ${games.length} ──`]
    for (const g of games) {
      const kindTag = g.kind === 'wizard' ? 'wizard' : 'chess '
      const who = g.players.length === 1
        ? `${g.players[0]} (alone — open to a challenger)`
        : g.players.join(' vs ')
      lines.push(`  ${kindTag}  ${g.roomId}  ${who}`)
    }
    lines.push('')
    lines.push('Use /watch <roomId> to spectate one.')
    pushPrivate('reply', lines.join('\n'))
  },
})

// ─── Basic: /team — list teams or show a single team ─────────────

interface TeamMemberLite {
  normalizedName: string
  displayName: string
  joinedAt: number
}

interface TeamLite {
  teamId: string
  name: string
  normalizedName: string
  motto?: string
  captainDisplayName: string
  captainNormalizedName: string
  memberCount: number
  members: TeamMemberLite[]
  createdAt: number
  lastChangeAt: number
}

/** Friendly relative-time, kid-shaped. Never goes past "1 month ago".
 *  Good enough for a roster display; pings the eye but doesn't lie. */
function ago(ms: number): string {
  const delta = Date.now() - ms
  if (delta < 60_000) return 'just now'
  if (delta < 3_600_000) return `${Math.floor(delta / 60_000)} min ago`
  if (delta < 86_400_000) return `${Math.floor(delta / 3_600_000)}h ago`
  const days = Math.floor(delta / 86_400_000)
  if (days < 14) return `${days} day${days === 1 ? '' : 's'} ago`
  if (days < 60) return `${Math.floor(days / 7)} week${Math.floor(days / 7) === 1 ? '' : 's'} ago`
  return '1+ month ago'
}

const TEAMS_PAGE_SIZE = 15
const TEAMS_FETCH_CAP = 120

/** Look up a team by its case-insensitive name. Returns null if no
 *  match. Used by /team <name>, /team apply, /team join. */
async function findTeamByName(name: string): Promise<TeamLite | null> {
  const { db } = await import('../../firebase/app')
  const { collection, getDocs, query, where, limit } = await import('firebase/firestore')
  const slug = name.trim().toLowerCase()
  const snap = await getDocs(
    query(collection(db, 'teams'), where('normalizedName', '==', slug), limit(1)),
  )
  if (snap.empty) return null
  return snap.docs[0]!.data() as TeamLite
}

function renderTeamDetail(t: TeamLite): string {
  const lines = [`── ${t.name} ──`]
  if (t.motto) lines.push(`"${t.motto}"`)
  lines.push(`Captain: ${t.captainDisplayName}`)
  lines.push(`Born ${ago(t.createdAt)} · last change ${ago(t.lastChangeAt)}`)
  lines.push('')
  lines.push(`Members (${t.memberCount} of 20):`)
  const captainName = t.captainNormalizedName
  const sortedMembers = [...t.members].sort((a, b) => {
    if (a.normalizedName === captainName) return -1
    if (b.normalizedName === captainName) return 1
    return b.joinedAt - a.joinedAt
  })
  for (const m of sortedMembers) {
    const star = m.normalizedName === captainName ? ' ★' : ''
    lines.push(`  ${m.displayName}${star}  · joined ${ago(m.joinedAt)}`)
  }
  return lines.join('\n')
}

/** Page of the full team list. Fetches once (capped at TEAMS_FETCH_CAP)
 *  and slices client-side; the castle isn't expected to outgrow that
 *  cap any time soon and offset-based UX is easier to reason about
 *  than Firestore cursors for a kid scrolling through pages. */
async function listTeamsPage(page: number): Promise<string> {
  const { db } = await import('../../firebase/app')
  const { collection, getDocs, orderBy, query, limit } = await import('firebase/firestore')
  const snap = await getDocs(
    query(collection(db, 'teams'), orderBy('memberCount', 'desc'), limit(TEAMS_FETCH_CAP)),
  )
  if (snap.empty) {
    return 'No teams yet. The castle is wide open — start one from the Hall.'
  }
  const docs = snap.docs
  const totalPages = Math.max(1, Math.ceil(docs.length / TEAMS_PAGE_SIZE))
  const clamped = Math.max(1, Math.min(totalPages, page))
  const start = (clamped - 1) * TEAMS_PAGE_SIZE
  const slice = docs.slice(start, start + TEAMS_PAGE_SIZE)
  const nameWidth = Math.min(
    24,
    Math.max(...slice.map((d) => (d.data() as TeamLite).name.length), 4),
  )
  const lines = [`── TEAMS · page ${clamped}/${totalPages} · ${docs.length}${docs.length === TEAMS_FETCH_CAP ? '+' : ''} total ──`]
  for (const d of slice) {
    const t = d.data() as TeamLite
    const name = t.name.length > nameWidth ? t.name.slice(0, nameWidth - 1) + '…' : t.name
    lines.push(`  ${name.padEnd(nameWidth)}  ${String(t.memberCount).padStart(3)} / 20 · captain ${t.captainDisplayName}`)
  }
  lines.push('')
  if (clamped < totalPages) {
    lines.push(`/teams ${clamped + 1} for the next page.`)
  }
  lines.push('Use /team <name> for the full roster, or /team join <name> to apply.')
  return lines.join('\n')
}

/** Apply / join sugar. Looks the team up by name, then calls the
 *  existing applyToTeam callable with its teamId. */
async function applyToTeamByName(
  name: string,
  pitch: string | undefined,
  identity: CastleIdentity | null,
): Promise<string> {
  if (!identity || identity.isBypass) {
    return 'Sign in with a magic word first — visitors cannot apply to teams.'
  }
  const team = await findTeamByName(name)
  if (!team) return `No team called "${name}". Try /teams to see what is around.`
  if (team.members.some((m) => m.normalizedName === identity.normalizedName)) {
    return `You're already a member of ${team.name}.`
  }
  const { callApplyToTeam } = await import('../../firebase/callables')
  try {
    await callApplyToTeam({
      teamId: team.teamId,
      ...(pitch ? { pitch } : {}),
    })
    return `Application sent to ${team.name}. Captain ${team.captainDisplayName} will see it in their inbox.`
  } catch (err) {
    return err instanceof Error
      ? err.message.replace(/^FirebaseError: /, '')
      : 'Could not send the application.'
  }
}

/** /team mine / /myteam — show the kid's own team memberships via
 *  getPublicProfile (which already returns inlined team summaries). */
async function showMyTeams(identity: CastleIdentity | null): Promise<string> {
  if (!identity || identity.isBypass) {
    return "You haven't a name in the castle yet — sign in with a magic word first."
  }
  const { callGetPublicProfile } = await import('../../firebase/callables')
  try {
    const profile = await callGetPublicProfile({ normalizedName: identity.normalizedName })
    if (profile.teams.length === 0) {
      return "You're not on a team yet. Browse with /teams, then /team join <name>."
    }
    const lines = [`── YOUR TEAMS · ${profile.teams.length} ──`]
    for (const t of profile.teams) {
      const role = t.captain ? '★ captain' : 'member'
      lines.push(`  ${t.name}  · ${role}`)
    }
    lines.push('')
    lines.push('Use /team <name> to see a roster.')
    return lines.join('\n')
  } catch (err) {
    return err instanceof Error ? err.message : 'Could not load your teams.'
  }
}

registerCommand({
  name: 'teams',
  tier: 'basic',
  description: 'List teams in the castle. /teams 2 for the next page.',
  handle: async (args) => {
    const page = /^\d+$/.test(args.trim()) ? Number(args.trim()) : 1
    pushPrivate('reply', await listTeamsPage(page))
  },
})

registerCommand({
  name: 'team',
  tier: 'basic',
  description: 'Team details, applications, and your own teams. /team Wizards, /team join Wizards, /team mine. Use /teams to list them all.',
  handle: async (args, ctx) => {
    const trimmed = args.trim()
    if (!trimmed) {
      pushPrivate('reply', 'Use /team <name> for a roster, /team join <name> to apply, /team mine for your own teams. /teams lists every team in the castle.')
      return
    }

    // Subcommands: apply / join / mine. Everything else falls through
    // to "look up this team by name".
    const [head, ...rest] = trimmed.split(/\s+/)
    const sub = head!.toLowerCase()
    if (sub === 'mine') {
      pushPrivate('reply', await showMyTeams(ctx.identity))
      return
    }
    if (sub === 'apply' || sub === 'join') {
      if (rest.length === 0) {
        pushPrivate('reply', `Use /team ${sub} <name> [: optional pitch], e.g. /team join Wizards Guild : I love knight forks.`)
        return
      }
      // Team names can have spaces, so we can't just take the last
      // token as a pitch. Convention: a colon (or "--") separates the
      // name from an optional pitch. Without a separator, the whole
      // tail is the name and no pitch is sent.
      const tail = rest.join(' ')
      const sepMatch = /\s*(?::|--)\s*/.exec(tail)
      const name = sepMatch ? tail.slice(0, sepMatch.index).trim() : tail
      const pitch = sepMatch ? tail.slice(sepMatch.index + sepMatch[0].length).trim() : ''
      if (!name) {
        pushPrivate('reply', `Use /team ${sub} <name> [: optional pitch].`)
        return
      }
      pushPrivate('reply', await applyToTeamByName(name, pitch || undefined, ctx.identity))
      return
    }

    // Bare /team <name> — look up by case-insensitive name.
    const team = await findTeamByName(trimmed)
    if (!team) {
      pushPrivate('reply', `No team called "${trimmed}". Try /teams to list them all.`)
      return
    }
    pushPrivate('reply', renderTeamDetail(team))
  },
})

// ─── Basic: /myteam — shortcut for /team mine ─────────────────────

registerCommand({
  name: 'myteam',
  tier: 'basic',
  description: 'Show your own team membership(s).',
  handle: async (_args, ctx) => {
    pushPrivate('reply', await showMyTeams(ctx.identity))
  },
})

// ─── Basic: /users — paginated list of everyone present ───────────

function describeLocation(loc: LocationTag | undefined): string {
  if (!loc) return 'in the Hall'
  switch (loc.kind) {
    case 'hall': return 'in the Hall'
    case 'chess': return `in chess room ${loc.roomId}`
    case 'wizard': return `in wizard room ${loc.roomId}`
    case 'puzzle-garden': return 'in the Puzzle Garden'
    case 'puzzle-plot': return `in the ${loc.plot} plot`
    case 'puzzle-daily': return "on today's Daily Five"
    case 'puzzle-legends': return 'in the Legends arena'
    case 'puzzle-calibration': return 'calibrating'
    case 'puzzle-leaderboard': return 'at the leaderboard'
    case 'practice': return 'practicing'
    case 'local': return 'at the local board'
    case 'forest': return 'in the Forest'
  }
}

const USERS_PAGE_SIZE = 12

/** Predicate for a /users filter token. Returns null if the token
 *  isn't recognised — caller can then decide whether to treat it as
 *  a roomId or reject. */
function makeUsersFilter(filter: string): ((row: PresenceRow) => boolean) | null {
  const f = filter.toLowerCase()
  switch (f) {
    case 'hall':
      return (p) => !p.location || p.location.kind === 'hall'
    case 'chess':
      return (p) => p.location?.kind === 'chess'
    case 'wizard':
      return (p) => p.location?.kind === 'wizard'
    case 'playing':
      return (p) => p.location?.kind === 'chess' || p.location?.kind === 'wizard'
    case 'garden':
      return (p) =>
        p.location?.kind === 'puzzle-garden' ||
        p.location?.kind === 'puzzle-plot' ||
        p.location?.kind === 'puzzle-daily' ||
        p.location?.kind === 'puzzle-legends'
    case 'forest':
      return (p) => p.location?.kind === 'forest'
    case 'puzzle':
      return (p) =>
        p.location?.kind === 'puzzle-garden' ||
        p.location?.kind === 'puzzle-plot' ||
        p.location?.kind === 'puzzle-daily' ||
        p.location?.kind === 'puzzle-legends' ||
        p.location?.kind === 'puzzle-calibration' ||
        p.location?.kind === 'puzzle-leaderboard'
    case 'practice':
      return (p) => p.location?.kind === 'practice'
  }
  // Anything else — treat as an exact roomId match (chess or wizard).
  return (p) =>
    (p.location?.kind === 'chess' || p.location?.kind === 'wizard') &&
    p.location.roomId === filter
}

const KNOWN_FILTERS = ['hall', 'chess', 'wizard', 'playing', 'garden', 'forest', 'puzzle', 'practice']

registerCommand({
  name: 'users',
  tier: 'basic',
  description: 'List everyone in the castle. /users hall, /users playing, or /users ABC12 to filter; /users 2 for next page.',
  handle: (args, ctx) => {
    if (ctx.world.presence.length === 0) {
      pushPrivate('reply', 'No one is in the castle right now. Strange.')
      return
    }

    // Token order is forgiving: /users [filter] [page] in any order.
    // A bare integer is the page; anything else is the filter.
    const tokens = args.trim().split(/\s+/).filter(Boolean)
    let filterToken: string | null = null
    let pageToken: number | null = null
    for (const t of tokens) {
      if (/^\d+$/.test(t)) pageToken = Number(t)
      else if (filterToken === null) filterToken = t
    }

    const filter = filterToken ? makeUsersFilter(filterToken) : null
    const filtered = filter ? ctx.world.presence.filter(filter) : ctx.world.presence
    if (filtered.length === 0) {
      pushPrivate('reply',
        `No one matches "${filterToken}" right now. Try one of: ${KNOWN_FILTERS.join(', ')}, or a specific roomId.`,
      )
      return
    }

    const totalPages = Math.max(1, Math.ceil(filtered.length / USERS_PAGE_SIZE))
    const page = pageToken !== null ? Math.max(1, Math.min(totalPages, pageToken)) : 1
    const start = (page - 1) * USERS_PAGE_SIZE
    const slice = filtered.slice(start, start + USERS_PAGE_SIZE)
    const nameWidth = Math.max(...slice.map((p) => p.displayName.length), 4)

    const header = filterToken
      ? `── ADVENTURERS · ${filterToken} · page ${page}/${totalPages} · ${filtered.length} match${filtered.length === 1 ? '' : 'es'} ──`
      : `── ADVENTURERS · page ${page}/${totalPages} · ${ctx.world.presence.length} present ──`
    const lines = [header]
    for (const p of slice) {
      lines.push(`  ${p.displayName.padEnd(nameWidth)}  ${describeLocation(p.location)}`)
    }
    lines.push('')
    if (page < totalPages) {
      const nextHint = filterToken ? `/users ${filterToken} ${page + 1}` : `/users ${page + 1}`
      lines.push(`${nextHint} for the next page.`)
    } else if (totalPages > 1) {
      lines.push('(last page)')
    }
    pushPrivate('reply', lines.join('\n'))
  },
})

// ─── Basic: /find <name> — lookup a castle guest by name ──────────

registerCommand({
  name: 'find',
  tier: 'basic',
  description: 'Find a castle guest by name, e.g. /find Ada.',
  handle: async (args, ctx) => {
    const query = args.trim()
    if (query.length < 2) {
      pushPrivate('reply', 'Use /find <name>, e.g. /find Ada (at least 2 letters).')
      return
    }
    // Check live presence first — instant hit if they're online.
    const normalized = query.toLowerCase()
    const onlineMatch = ctx.world.presence.find(
      (p) => p.normalizedName === normalized || p.displayName.toLowerCase() === normalized,
    )
    if (onlineMatch) {
      pushPrivate('reply', [
        `${onlineMatch.displayName} — ${describeLocation(onlineMatch.location)} (online now)`,
        onlineMatch.location?.kind === 'chess' || onlineMatch.location?.kind === 'wizard'
          ? `Spectate with /watch ${onlineMatch.location.roomId}.`
          : `Invite them with /invite ${onlineMatch.displayName}.`,
      ].join('\n'))
      return
    }
    // Fall back to the server directory for offline / unknown names.
    try {
      const { callFindPlayer } = await import('../../firebase/callables')
      const { matches } = await callFindPlayer({ query: normalized })
      if (matches.length === 0) {
        pushPrivate('reply', `No castle guest called "${query}". Names are case-insensitive.`)
        return
      }
      const lines = matches.length === 1
        ? [`${matches[0]!.displayName} — registered, but offline right now.`]
        : [`${matches.length} matches:`, ...matches.map((m) => `  ${m.displayName}`)]
      lines.push(`Invite them with /invite ${matches[0]!.displayName} — the invitation waits up to a minute for them to come back online.`)
      pushPrivate('reply', lines.join('\n'))
    } catch (err) {
      pushPrivate('reply', err instanceof Error ? err.message : 'Could not search the directory.')
    }
  },
})

// ─── Basic: /watch <roomId> — go spectate a live game ─────────────

registerCommand({
  name: 'watch',
  tier: 'basic',
  description: 'Spectate a live game (/watch ABC123) or peek a guest profile (/watch Ada).',
  handle: async (args, ctx) => {
    const target = args.trim()
    if (!target) {
      pushPrivate('reply', 'Use /watch <roomId-or-name>. /games shows what is live; /find <name> looks up a guest.')
      return
    }
    // 1) Direct roomId match — anyone in this exact room.
    const inRoom = ctx.world.presence.find(
      (p) => (p.location?.kind === 'chess' || p.location?.kind === 'wizard') && p.location.roomId === target,
    )
    if (inRoom && (inRoom.location?.kind === 'chess' || inRoom.location?.kind === 'wizard')) {
      const path = inRoom.location.kind === 'wizard' ? `/wizard/${target}` : `/r/${target}`
      pushPrivate('reply', `Heading to ${inRoom.location.kind} room ${target}…`)
      ctx.exitTerminal()
      ctx.navigate(path)
      return
    }
    // 2) Name match — if online and in a game, route to that game.
    const normalized = target.toLowerCase()
    const onlineUser = ctx.world.presence.find(
      (p) => p.normalizedName === normalized || p.displayName.toLowerCase() === normalized,
    )
    if (onlineUser?.location?.kind === 'chess' || onlineUser?.location?.kind === 'wizard') {
      const loc = onlineUser.location
      const path = loc.kind === 'wizard' ? `/wizard/${loc.roomId}` : `/r/${loc.roomId}`
      pushPrivate('reply', `${onlineUser.displayName} is in ${loc.kind} room ${loc.roomId} — heading there…`)
      ctx.exitTerminal()
      ctx.navigate(path)
      return
    }
    // 3) Fall back to a profile preview. Try the live name first, then
    //    the directory; covers offline guests and slight spelling drift.
    let nameToFetch = onlineUser?.normalizedName ?? normalized
    if (!onlineUser) {
      try {
        const { callFindPlayer } = await import('../../firebase/callables')
        const { matches } = await callFindPlayer({ query: normalized })
        if (matches.length === 0) {
          pushPrivate('reply', `Nothing to watch by "${target}". No live game and no castle guest by that name.`)
          return
        }
        nameToFetch = matches[0]!.normalizedName
      } catch (err) {
        pushPrivate('reply', err instanceof Error ? err.message : 'Could not look that name up.')
        return
      }
    }
    try {
      const { callGetPublicProfile } = await import('../../firebase/callables')
      const profile = await callGetPublicProfile({ normalizedName: nameToFetch })
      pushPrivate('reply', formatProfilePreview(profile))
    } catch (err) {
      pushPrivate('reply', err instanceof Error ? err.message : 'Could not fetch that profile.')
    }
  },
})

interface ProfilePreview {
  displayName: string
  title: { label: string } | null
  chessRating: number | null
  chessRatingDelta: number | null
  chessGames: number
  bestPuzzleRating: number | null
  todaysFiveSolved: number | null
  todaysFiveTotal: number | null
  booksRead: number | null
  equippedPieceSet: string | null
  teams: Array<{ name: string; captain: boolean }>
  currentLocation: LocationTag | null
  inGame: boolean
}

function formatProfilePreview(p: ProfilePreview): string {
  const lines: string[] = []
  const titleSuffix = p.title ? ` · ${p.title.label}` : ''
  lines.push(`── ${p.displayName}${titleSuffix} ──`)
  if (p.chessRating != null) {
    const delta = p.chessRatingDelta != null
      ? ` (${p.chessRatingDelta >= 0 ? '+' : ''}${p.chessRatingDelta})`
      : ''
    lines.push(`Chess: ${p.chessRating}${delta} over ${p.chessGames} games`)
  } else {
    lines.push(`Chess: not yet rated`)
  }
  if (p.bestPuzzleRating != null) lines.push(`Puzzle best: ${p.bestPuzzleRating}`)
  if (p.todaysFiveSolved != null && p.todaysFiveTotal != null) {
    lines.push(`Today's Five: ${p.todaysFiveSolved}/${p.todaysFiveTotal}`)
  }
  if (typeof p.booksRead === 'number' && p.booksRead > 0) lines.push(`Books read: ${p.booksRead}`)
  if (p.equippedPieceSet) lines.push(`Pieces: ${p.equippedPieceSet}`)
  if (p.teams.length > 0) {
    const teamLabel = p.teams.map((t) => t.captain ? `${t.name} (captain)` : t.name).join(', ')
    lines.push(`Team: ${teamLabel}`)
  }
  lines.push('')
  if (p.inGame && p.currentLocation && (p.currentLocation.kind === 'chess' || p.currentLocation.kind === 'wizard')) {
    lines.push(`In a ${p.currentLocation.kind} game right now — /watch ${p.currentLocation.roomId} to spectate.`)
  } else if (p.currentLocation) {
    lines.push(`Online now — invite with /invite ${p.displayName}.`)
  } else {
    lines.push(`Offline. /invite ${p.displayName} will wait for them to return.`)
  }
  return lines.join('\n')
}

// ─── Basic: /invite <name> — invite an online guest to play ───────

/** Parse "5+3" / "10+0" / "5" → { initialMs, incrementMs }. Bare
 *  number is taken as minutes with 0 increment. Returns null on shapes
 *  the server wouldn't accept anyway (server clamps further). */
function parseTimeControl(raw: string): { initialMs: number; incrementMs: number } | null {
  const m = /^(\d{1,2})(?:\+(\d{1,2}))?$/.exec(raw)
  if (!m) return null
  const minutes = Number(m[1])
  const inc = m[2] ? Number(m[2]) : 0
  if (!Number.isFinite(minutes) || minutes <= 0) return null
  return { initialMs: minutes * 60_000, incrementMs: inc * 1_000 }
}

registerCommand({
  name: 'invite',
  tier: 'basic',
  description: 'Invite a castle guest to chess, e.g. /invite Ada or /invite Ada 5+3. Costs 5 castle points.',
  handle: async (args, ctx) => {
    const tokens = args.trim().split(/\s+/).filter(Boolean)
    if (tokens.length === 0) {
      pushPrivate('reply', 'Use /invite <name> [time], e.g. /invite Ada 5+3. Costs 5 castle points.')
      return
    }
    const me = ctx.identity
    if (!me || me.isBypass) {
      pushPrivate('reply', 'Sign in with a magic word first — visitors cannot send invitations.')
      return
    }

    // Optional second token can be a time-control like "5+3" or "10".
    let name = tokens[0]!
    let timeControl: { initialMs: number; incrementMs: number } | null = null
    if (tokens.length >= 2) {
      const tc = parseTimeControl(tokens[1]!)
      if (!tc) {
        pushPrivate('reply', `"${tokens[1]}" isn't a valid time control. Use minutes+seconds, e.g. 5+3 (or just 10 for 10 min no increment).`)
        return
      }
      timeControl = tc
    } else {
      // Maybe the user wrote `/invite ada5+3` with no space — best-effort split.
      const m = /^([A-Za-z][^\d+]*)(\d{1,2}(?:\+\d{1,2})?)$/.exec(name)
      if (m) {
        name = m[1]!
        timeControl = parseTimeControl(m[2]!)
      }
    }

    const normalized = name.toLowerCase()
    if (normalized === me.normalizedName) {
      pushPrivate('reply', "You can't invite yourself, adventurer.")
      return
    }
    // Resolve to a real guest. Prefer the live presence row (so spelling
    // forgives a slightly different display name), fall back to a server
    // directory lookup for offline-but-registered guests.
    let toNormalized = ctx.world.presence.find(
      (p) => p.normalizedName === normalized || p.displayName.toLowerCase() === normalized,
    )?.normalizedName
    if (!toNormalized) {
      try {
        const { callFindPlayer } = await import('../../firebase/callables')
        const { matches } = await callFindPlayer({ query: normalized })
        if (matches.length === 0) {
          pushPrivate('reply', `No castle guest called "${name}".`)
          return
        }
        toNormalized = matches[0]!.normalizedName
      } catch (err) {
        pushPrivate('reply', err instanceof Error ? err.message : 'Could not look that name up.')
        return
      }
    }
    try {
      const { callSendInvite } = await import('../../firebase/callables')
      const res = await callSendInvite({
        fromNormalizedName: me.normalizedName,
        toNormalizedName: toNormalized,
        timeControl,
        ...(me.cosmetics?.pieceSet ? { pieceSetId: me.cosmetics.pieceSet } : {}),
      })
      const minutes = Math.max(0, Math.round((res.expiresAt - Date.now()) / 60_000))
      const tcLabel = timeControl
        ? ` (${timeControl.initialMs / 60_000}+${timeControl.incrementMs / 1_000})`
        : ' (untimed)'
      pushPrivate('reply', `Invitation sent to ${name}${tcLabel} — 5 castle points spent. It will wait ${minutes} minute${minutes === 1 ? '' : 's'} for a reply.`)
    } catch (err) {
      const msg = err instanceof Error
        ? err.message.replace(/^FirebaseError: /, '')
        : 'Could not send the invitation.'
      pushPrivate('reply', msg)
    }
  },
})

// ─── Basic: /inv ───────────────────────────────────────────────────

registerCommand({
  name: 'inv',
  tier: 'basic',
  description: 'Check what you carry — identity, points, gear, and pocket items.',
  handle: (_args, ctx) => {
    const id = ctx.identity
    if (!id) {
      pushPrivate('reply', 'You carry nothing — you have no name here yet.')
      return
    }
    const lines = [
      `Name:    ${id.displayName}${id.isBypass ? ' (visitor)' : ''}`,
      `Points:  ${id.castlePoints} castle point${id.castlePoints === 1 ? '' : 's'}`,
    ]
    const pieceSet = id.cosmetics?.pieceSet ?? 'classic'
    lines.push(`Pieces:  ${pieceSet}`)
    if (id.cosmetics?.avatar) {
      lines.push(`Avatar:  a small heraldic badge of your own design`)
    }
    const carried = [...loadInventory()].map((iid) => ITEMS[iid].name)
    lines.push(`Pocket:  ${carried.length > 0 ? carried.join(', ') : '(empty)'}`)
    pushPrivate('reply', lines.join('\n'))
  },
})

// ─── Basic: /stats — explorer progress ────────────────────────────

registerCommand({
  name: 'stats',
  tier: 'basic',
  description: 'Show your exploration progress — rooms visited, items found, /play state.',
  handle: (_args, ctx) => {
    const id = ctx.identity
    const visitedCount = loadVisited().size
    // 7 = the rooms in ROOMS that are currently part of the map.
    const totalRooms = Object.keys(ROOMS).length
    const carried = [...loadInventory()]
    const itemsTotal = Object.keys(ITEMS).filter((iid) => ITEMS[iid as 'lantern'].takeable).length
    const itemsFound = carried.length
    const play = loadPlayState()
    const cellar = isCellarOpen()
    const solved = readSolvedToday()

    const lines = ['── YOUR PROGRESS ──']
    lines.push(`Rooms visited:   ${visitedCount} / ${totalRooms}${cellar ? ' (Cellar unlocked)' : ''}`)
    lines.push(`Items pocketed:  ${itemsFound} / ${itemsTotal}`)
    if (id) {
      lines.push(`Castle points:   ${id.castlePoints}`)
    }
    if (play) {
      const turnNumber = Math.floor(play.game.history().length / 2) + 1
      lines.push(`Current game:    ${play.status} · move ${turnNumber} · rating ~${play.rating}`)
    } else {
      lines.push(`Current game:    none`)
    }
    lines.push(`Today's mystery: ${solved ? 'solved ✓' : 'unsolved — try /daily'}`)

    pushPrivate('reply', lines.join('\n'))
  },
})

// ─── Basic: /take /drop /examine /use ─────────────────────────────

registerCommand({
  name: 'take',
  tier: 'basic',
  description: 'Pick up something from the room, e.g. /take lantern.',
  handle: (args, ctx) => {
    const name = args.trim()
    if (!name) { pushPrivate('reply', 'Use /take <thing>, e.g. /take lantern.'); return }
    const item = findItemByName(name)
    if (!item) {
      pushPrivate('reply', `There's no "${name}" here. /look to see what's around.`)
      return
    }
    const here = itemsInRoom(ctx.world.currentRoom).some((it) => it.id === item.id)
    if (!here) {
      pushPrivate('reply', `${item.longName} isn't here.`)
      return
    }
    if (!item.takeable) {
      pushPrivate('reply', `${item.longName} isn't yours to take.`)
      return
    }
    if (takeItem(item.id)) {
      pushPrivate('reply', `You pocket ${item.longName}.`)
    } else {
      pushPrivate('reply', `You already have ${item.longName}.`)
    }
  },
})

registerCommand({
  name: 'drop',
  tier: 'basic',
  description: 'Leave a pocketed item in the current room, e.g. /drop lantern.',
  handle: (args) => {
    const name = args.trim()
    if (!name) { pushPrivate('reply', 'Use /drop <thing>.'); return }
    const item = findItemByName(name)
    if (!item || !isCarried(item.id)) {
      pushPrivate('reply', `You aren't carrying any "${name}".`)
      return
    }
    dropItem(item.id)
    pushPrivate('reply', `You set ${item.longName} down.`)
  },
})

registerCommand({
  name: 'examine',
  tier: 'basic',
  description: 'Look closely at something, e.g. /examine compass.',
  handle: (args, ctx) => {
    const name = args.trim()
    if (!name) { pushPrivate('reply', 'Use /examine <thing>.'); return }
    const item = findItemByName(name)
    if (!item) {
      pushPrivate('reply', `You don't see any "${name}".`)
      return
    }
    const here = itemsInRoom(ctx.world.currentRoom).some((it) => it.id === item.id)
    if (!here && !isCarried(item.id)) {
      pushPrivate('reply', `${item.longName} isn't here.`)
      return
    }
    pushPrivate('reply', item.description)
  },
})

/** Use-effects. Lives outside the items registry because a use can
 *  mutate game state (unlocking the Cellar door). */
function useItem(item: Item, target: string, ctx: CommandContext): string {
  const room = ctx.world.currentRoom
  switch (item.id) {
    case 'lantern':
      if (room === 'tower-foot' && (target === '' || /door|south/.test(target))) {
        if (isCellarOpen()) {
          return 'You hold the lantern up. The south door is already open — the stair drops away into the dark.'
        }
        markCellarOpen()
        return 'You hold the lantern up to the south door. The lock clicks. The door swings inward — a stone stair drops away. (You can /s now.)'
      }
      return 'You strike a small flame. The lantern glows softly. Nothing here needs lighting.'
    case 'bookmark':
      if (room === 'nook') {
        return 'You hand the bookmark back to Lucy. "Oh — I was looking for that everywhere," she says, tucking it into her book.'
      }
      return 'A pressed-flower bookmark. Probably belongs somewhere reading happens.'
    case 'feather':
      if (room === 'study' && (target === '' || /chart|map|desk/.test(target))) {
        return 'You set the feather on Luca\'s charts. He picks it up, turns it over, and laughs softly. "From the night-bird. They only drop these on lucky nights."'
      }
      return 'You twirl the feather. It tickles your nose. You sneeze.'
    case 'compass':
      return 'You spin the dial. The needle drifts the long way around. It does not point to anything in particular.'
  }
}

registerCommand({
  name: 'use',
  tier: 'basic',
  description: 'Use an item. /use lantern, /use lantern on door, /use bookmark.',
  handle: (args, ctx) => {
    const trimmed = args.trim()
    if (!trimmed) {
      pushPrivate('reply', 'Use /use <thing> [on <target>].')
      return
    }
    // Split on "on" — natural English. /use lantern on door
    const m = /^(.+?)(?:\s+on\s+(.+))?$/i.exec(trimmed)
    const name = m?.[1]?.trim() ?? ''
    const target = m?.[2]?.trim() ?? ''
    const item = findItemByName(name)
    if (!item) {
      pushPrivate('reply', `You don't see a "${name}".`)
      return
    }
    // Have to be carrying it OR have it in the room (so the kid can
    // /use the compass without taking it).
    const here = itemsInRoom(ctx.world.currentRoom).some((it) => it.id === item.id)
    if (!here && !isCarried(item.id)) {
      pushPrivate('reply', `You don't have ${item.longName}.`)
      return
    }
    pushPrivate('reply', useItem(item, target.toLowerCase(), ctx))
  },
})

// ─── Basic: /me ────────────────────────────────────────────────────

registerCommand({
  name: 'me',
  tier: 'basic',
  description: 'Emote an action to the Hall, e.g. /me waves.',
  handle: async (args, ctx) => {
    const action = args.trim()
    if (!action) {
      pushPrivate('reply', 'Use /me followed by an action, e.g. /me bows deeply.')
      return
    }
    const id = ctx.identity
    if (!id || id.isBypass) {
      pushPrivate('reply', 'Sign in with a magic word first — visitors cannot emote in the Hall.')
      return
    }
    const text = `*${id.displayName} ${action}*`.slice(0, 200)
    try {
      await ctx.postPublic(text)
      pushPrivate('reply', `You ${action}.`)
    } catch (err) {
      pushPrivate('reply', err instanceof Error ? err.message : 'The Hall is quiet — your shout did not carry.')
    }
  },
})

// ─── Basic: /say ───────────────────────────────────────────────────

registerCommand({
  name: 'say',
  tier: 'basic',
  description: 'Send a message to the public Hall, e.g. /say hi everyone.',
  handle: async (args, ctx) => {
    const text = args.trim()
    if (!text) {
      pushPrivate('reply', 'Use /say followed by what you want to send, e.g. /say hello!')
      return
    }
    const id = ctx.identity
    if (!id || id.isBypass) {
      pushPrivate('reply', 'Sign in with a magic word first — visitors cannot post to the Hall.')
      return
    }
    try {
      await ctx.postPublic(text.slice(0, 200))
      pushPrivate('reply', `Posted to the Hall: "${text.slice(0, 200)}"`)
    } catch (err) {
      pushPrivate('reply', err instanceof Error ? err.message : 'The Hall did not hear you. Try again.')
    }
  },
})

// ─── Basic: /read ──────────────────────────────────────────────────

registerCommand({
  name: 'read',
  tier: 'basic',
  description: 'Peek the last few public Hall messages. /read 20 for more.',
  handle: (args, ctx) => {
    const requested = Number.parseInt(args.trim(), 10)
    const count = Number.isFinite(requested)
      ? Math.max(1, Math.min(40, requested))
      : 10
    const tail = ctx.world.recentMessages.slice(-count)
    if (tail.length === 0) {
      pushPrivate('reply', 'The Hall is quiet. Nothing has been said lately.')
      return
    }
    const lines: string[] = ['── HALL · last ' + tail.length + ' messages ──']
    for (const m of tail) {
      const hh = String(new Date(m.ts).getHours()).padStart(2, '0')
      const mm = String(new Date(m.ts).getMinutes()).padStart(2, '0')
      const tag = m.kind === 'host' ? ' (host)' : m.kind === 'system' ? ' (system)' : ''
      lines.push(`[${hh}:${mm}] ${m.name}${tag}: ${m.text}`)
    }
    lines.push('')
    lines.push('(Use /say to reply, /exit to return to the Hall.)')
    pushPrivate('reply', lines.join('\n'))
  },
})

// ─── Basic: /help ──────────────────────────────────────────────────

registerCommand({
  name: 'help',
  tier: 'basic',
  description: 'Show available commands.',
  handle: (_args, ctx) => {
    const buckets = helpByTier(ctx.identity)
    const lines: string[] = []

    const renderSection = (title: string, items: typeof buckets.basic) => {
      lines.push(`── ${title} ──`)
      for (const h of items) {
        lines.push(`  /${h.name}`)
        lines.push(`      ${h.description}`)
      }
      lines.push('')
    }

    renderSection('BASIC', buckets.basic)

    if (buckets.advanced.length > 0) {
      renderSection('ADVANCED (you have earned these)', buckets.advanced)
    } else {
      lines.push(`More commands wait at ${ADVANCED_UNLOCK_CP} castle points.`)
      lines.push('')
    }

    if (buckets.hidden.length > 0) {
      renderSection('HIDDEN', buckets.hidden)
    } else if (isAdvancedUnlocked(ctx.identity)) {
      lines.push(`Deeper secrets unlock at ${HIDDEN_UNLOCK_CP} castle points.`)
      lines.push('')
    }

    lines.push('Tip: some words work without a slash. Try typing them.')
    pushPrivate('reply', lines.join('\n'))
  },
})

// ─── Basic: /daily — today's mystery riddle ───────────────────────

registerCommand({
  name: 'daily',
  tier: 'basic',
  description: "Today's mystery riddle. /daily to see it, /daily <answer> to try.",
  handle: async (args, ctx) => {
    const mystery = todaysMystery()
    const guess = args.trim()
    const already = readSolvedToday()

    if (!guess) {
      // Show the riddle — and note if it's already been solved today.
      const lines = ['── TODAY\'S MYSTERY ──', mystery.question]
      if (already && already.mysteryId === mystery.id) {
        lines.push('')
        lines.push('(You already solved this one today. Come back tomorrow.)')
      } else {
        lines.push('')
        lines.push(`Reward: ${5} castle points. Try /daily <your answer>.`)
      }
      pushPrivate('reply', lines.join('\n'))
      return
    }

    if (already && already.mysteryId === mystery.id) {
      pushPrivate('reply', `You already cracked today's mystery. The Castle remembers. Try again tomorrow.`)
      return
    }

    if (!isCorrect(mystery, guess)) {
      pushPrivate('reply', `"${guess}" isn't it. Try again — there's no penalty for guessing.`)
      return
    }

    // Right answer. Mark locally for instant UX, then claim CP server-side
    // (which has its own daily-cap dedupe so a wiped localStorage can't
    // re-claim).
    markSolvedToday(mystery.id)
    const id = ctx.identity
    let pointsLine = ''
    if (id && !id.isBypass) {
      try {
        const { callAwardCastlePoints } = await import('../../firebase/callables')
        const res = await callAwardCastlePoints({
          normalizedName: id.normalizedName,
          award: { source: 'mystery', mysteryId: mystery.id },
        })
        pointsLine = res.added > 0
          ? ` +${res.added} castle points (you now have ${res.castlePoints}).`
          : ' (The Castle had already noted your earlier solve today.)'
      } catch (err) {
        pointsLine = err instanceof Error ? ` (${err.message})` : ''
      }
    } else {
      pointsLine = ' (Visitors don\'t earn points — sign in with a magic word to start banking them.)'
    }

    const lines = [
      `Correct.${pointsLine}`,
      mystery.explain ? `📜 ${mystery.explain}` : '',
      '',
      'Come back tomorrow for a new mystery.',
    ].filter(Boolean)
    pushPrivate('reply', lines.join('\n'))
  },
})

// ─── Basic: /mute ──────────────────────────────────────────────────

registerCommand({
  name: 'mute',
  tier: 'basic',
  description: 'Toggle keyboard click sounds.',
  handle: async () => {
    // Lazy-import so the audio module doesn't tug at the rest of the
    // bundle for guests who never open the terminal.
    const { toggleMuted } = await import('./keyClick')
    const muted = toggleMuted()
    pushPrivate('reply', muted
      ? 'The keys go silent. Type /mute again to bring back the click.'
      : 'The keys click softly once more.')
  },
})

// ─── Advanced: /play vs the Castle ────────────────────────────────

/** Single helper for ALL board paints. Clears the private stream
 *  first so the board always lands at the top of a fresh viewport
 *  with at most one short intro line above it. This sidesteps the
 *  scroll-anchor problems on phones — there's simply nothing to
 *  scroll past.
 *
 *  Pass the chess.js `game` (post-last-move) and we'll auto-mark the
 *  most recent move's from/to squares in the rendered board. */
function showBoard(intro: string, game: Chess): void {
  clearPrivate()
  if (intro) pushPrivate('reply', intro)
  const last = game.history({ verbose: true }).at(-1)
  pushPrivate('ascii', renderAsciiBoard(game, {
    lastFrom: last?.from ?? null,
    lastTo: last?.to ?? null,
  }))
}

/** Coach label for a kid move, given the cp difference between the
 *  best continuation and what the kid actually played (both in the
 *  kid's POV). Returns null for "fine" moves — we only flag misses
 *  worth a friendly nudge. */
function coachLabel(cpLoss: number): string | null {
  if (cpLoss >= 400) return '?? Blunder'
  if (cpLoss >= 200) return '? Mistake'
  return null
}

/** Convert a white-POV eval into the kid's POV. mate magnitudes are
 *  already baked in by the stockfish wrapper as ±MATE_CP, so the
 *  flip works correctly on those too. */
function kidPOV(cpFromWhite: number, kidSide: 'w' | 'b'): number {
  return kidSide === 'w' ? cpFromWhite : -cpFromWhite
}

registerCommand({
  name: 'play',
  tier: 'advanced',
  description: 'Play vs the Castle. /play 1200 to start at rating, /play e4 to move, /play board, /play new, /play resign.',
  unlockedFor: isAdvancedUnlocked,
  handle: async (args, ctx) => {
    // The duel board lives in the Wizard's Antechamber. Allow status
    // checks (/play board / /play resign) from anywhere so a kid who
    // wanders off mid-game can still take stock of it.
    const sub = args.trim()
    const statusOnly = sub === 'board' || sub === 'resign' || sub === ''
    if (!statusOnly && ctx.world.currentRoom !== 'wizard') {
      pushPrivate('reply', "The duelling board is in the Wizard's Antechamber. Go east from the Great Hall (/e) to reach it.")
      return
    }
    let state = loadPlayState()

    // /play <number> — start a new game at that rating.
    // /play new — start a new game at last rating (or default).
    // /play (no args, no game) — start a new game at default rating.
    const ratingMatch = /^(\d{3,4})$/.exec(sub)
    const wantsNew = sub === 'new' || ratingMatch !== null || (!state && sub === '')
    if (wantsNew) {
      const requestedRating = ratingMatch
        ? Number(ratingMatch[1])
        : state?.rating ?? DEFAULT_RATING
      const clamped = Math.max(300, Math.min(2800, requestedRating))
      const game = new Chess()
      savePlayState(game, 'w', 'active', clamped)
      showBoard(`New board at ~${clamped}. You play White. Move with /play e4.`, game)
      return
    }

    if (!state) {
      pushPrivate('reply', 'No game in progress. Type /play to begin, or /play 1500 to pick the Castle\'s strength.')
      return
    }

    if (sub === 'board' || sub === '') {
      const intro = state.status !== 'active'
        ? `Game over — ${describeStatus(state.status)}. /play new for another.`
        : ''
      showBoard(intro, state.game)
      return
    }

    if (sub === 'resign') {
      if (state.status !== 'active') {
        pushPrivate('reply', 'No game to resign — that one is already finished.')
        return
      }
      savePlayState(state.game, state.kidSide, 'resigned', state.rating)
      pushPrivate('reply', 'You tip your king. The Castle nods. Type /play new whenever you wish.')
      return
    }

    if (state.status !== 'active') {
      pushPrivate('reply', `The game is over (${describeStatus(state.status)}). Type /play new for a fresh board.`)
      return
    }
    if (state.game.turn() !== state.kidSide) {
      pushPrivate('reply', "It's not your move — the Castle is still thinking.")
      return
    }

    // Try the kid's move (SAN first, then UCI).
    const kidMove = tryUserMove(state.game, sub)
    if (!kidMove) {
      pushPrivate('reply', `"${sub}" is not a legal move here. Try e4, Nf3, or a UCI like e2e4.`)
      return
    }

    // Game-end on kid's move alone — no engine reply needed.
    if (state.game.isCheckmate()) {
      savePlayState(state.game, state.kidSide, 'kid-won', state.rating)
      showBoard(`Checkmate! You played ${kidMove.san}. You win.`, state.game)
      return
    }
    if (state.game.isDraw() || state.game.isStalemate()) {
      savePlayState(state.game, state.kidSide, 'drawn', state.rating)
      showBoard(`Drawn after ${kidMove.san}.`, state.game)
      return
    }

    // Show a brief intermediate line while the engine thinks. Gets
    // wiped along with everything else by the next showBoard call.
    pushPrivate('reply', `You played ${kidMove.san}. The Castle is thinking…`)

    // Coach pass: evaluate the position the kid landed in vs the
    // reference eval we stored at the start of their turn (i.e. the
    // engine's post-move eval from last round, or 0 at the very
    // start). Loss is in the kid's POV.
    let coachTag: string | null = null
    let evalAfterKid: number | null = null
    try {
      evalAfterKid = await coachEval(state.game.fen())
      const refEval = state.prevEvalCp ?? 0
      const cpLoss = Math.max(0, kidPOV(refEval, state.kidSide) - kidPOV(evalAfterKid, state.kidSide))
      coachTag = coachLabel(cpLoss)
    } catch {
      // Coach is best-effort — silent failure beats blocking the game.
    }

    let uci: string
    try {
      uci = await bestReplyUci(state.game.fen(), state.rating)
    } catch (err) {
      // Roll back the kid's move so they can try again rather than
      // losing tempo to an engine hiccup.
      state.game.undo()
      savePlayState(state.game, state.kidSide, 'active', state.rating, state.prevEvalCp)
      pushPrivate('reply', err instanceof Error
        ? `The Castle stumbled: ${err.message}. Your move was undone — try again.`
        : 'The Castle stumbled. Your move was undone — try again.')
      return
    }
    if (!uci || uci === '(none)') {
      savePlayState(state.game, state.kidSide, 'kid-won', state.rating)
      showBoard(`You: ${kidMove.san} · The Castle has no reply. You win!`, state.game)
      return
    }
    const engineMove = state.game.move({
      from: uci.slice(0, 2),
      to: uci.slice(2, 4),
      promotion: uci.length === 5 ? uci[4]!.toLowerCase() : undefined,
    })
    const kidPart = coachTag ? `You: ${kidMove.san} ${coachTag}` : `You: ${kidMove.san}`
    const exchange = `${kidPart}  ·  Castle: ${engineMove?.san ?? uci}`

    if (state.game.isCheckmate()) {
      savePlayState(state.game, state.kidSide, 'kid-lost', state.rating)
      showBoard(`${exchange}  ·  Checkmate! /play new to try again.`, state.game)
      return
    }
    if (state.game.isDraw() || state.game.isStalemate()) {
      savePlayState(state.game, state.kidSide, 'drawn', state.rating)
      showBoard(`${exchange}  ·  Drawn.`, state.game)
      return
    }

    // Refresh the reference eval for the NEXT coach pass. Best-effort
    // — if this fails, next turn just starts from the stale ref or 0.
    let newRef: number | null = evalAfterKid
    try { newRef = await coachEval(state.game.fen()) } catch { /* keep evalAfterKid */ }
    savePlayState(state.game, state.kidSide, 'active', state.rating, newRef)
    showBoard(exchange, state.game)
  },
})

function describeStatus(s: ReturnType<typeof loadPlayState> extends infer T
  ? T extends { status: infer S } ? S : never : never): string {
  switch (s) {
    case 'kid-won': return 'you won'
    case 'kid-lost': return 'the Castle won'
    case 'drawn': return 'drawn'
    case 'resigned': return 'you resigned'
    default: return 'active'
  }
}

function tryUserMove(game: Chess, input: string): { san: string } | null {
  // SAN first — chess.js v1 throws on illegal; catch.
  try {
    const m = game.move(input)
    if (m) return m
  } catch { /* fall through */ }
  // UCI fallback (e2e4, a7a8q).
  if (/^[a-h][1-8][a-h][1-8][qrbn]?$/i.test(input)) {
    try {
      const m = game.move({
        from: input.slice(0, 2).toLowerCase(),
        to: input.slice(2, 4).toLowerCase(),
        promotion: input.length === 5 ? input[4]!.toLowerCase() : undefined,
      })
      if (m) return m
    } catch { /* fall through */ }
  }
  return null
}

// ─── Hidden: /lore — hand-written castle + chess lore ────────────

registerCommand({
  name: 'lore',
  tier: 'hidden',
  description: 'Read a snippet of castle or chess lore, e.g. /lore knight. /lore alone lists topics.',
  unlockedFor: isHiddenUnlocked,
  handle: (args) => {
    const q = args.trim()
    if (!q) {
      const lines = ['── LORE TOPICS ──']
      for (const e of LORE) {
        lines.push(`  /lore ${e.key.padEnd(16)} ${e.title}`)
      }
      lines.push('')
      lines.push(`${LORE.length} entries. Lucy and Luca wrote them.`)
      pushPrivate('reply', lines.join('\n'))
      return
    }
    const entry = findLore(q)
    if (!entry) {
      pushPrivate('reply', `No lore on "${q}". Type /lore to see topics.`)
      return
    }
    const voice = entry.voice === 'lucy' ? 'Lucy' : 'Luca'
    pushPrivate('reply', `── ${entry.title} · ${voice} ──\n${entry.body}`)
  },
})

// ─── Hidden: /ask Lucy|Luca <question> ────────────────────────────
// Wires to a Cloud Function (gemini-3.5-flash) — see functions/src/castle/askHost.ts.

registerCommand({
  name: 'ask',
  tier: 'hidden',
  description: 'Ask Lucy or Luca a question, e.g. /ask Lucy why do knights move that way.',
  unlockedFor: isHiddenUnlocked,
  handle: async (args, ctx) => {
    const m = /^(lucy|luca)\s+(.+)$/i.exec(args.trim())
    if (!m) {
      pushPrivate('reply', 'Use /ask Lucy <question> or /ask Luca <question>.')
      return
    }
    const host = m[1]!.toLowerCase() === 'lucy' ? 'lucy' : 'luca'
    // Lucy listens in her Reading Nook (north from Hall). Luca listens
    // in his Study (south from Hall, then up the Tower).
    if (host === 'lucy' && ctx.world.currentRoom !== 'nook') {
      pushPrivate('reply', "Lucy is in her Reading Nook. Go north from the Great Hall (/n) to find her.")
      return
    }
    if (host === 'luca' && ctx.world.currentRoom !== 'study') {
      pushPrivate('reply', "Luca is in his Study, atop the Tower. Go south (/s), then up (/up).")
      return
    }
    const question = m[2]!.trim()
    if (question.length < 4) {
      pushPrivate('reply', 'Ask a real question — at least a few words.')
      return
    }
    pushPrivate('reply', `${host === 'lucy' ? 'Lucy' : 'Luca'} listens…`)
    try {
      // Lazy import so the askHost callable doesn't add to first paint.
      const { callAskHost } = await import('../../firebase/callables')
      const res = await callAskHost({ host, question })
      if (res.status === 'rate-limited') {
        pushPrivate('reply', `${host === 'lucy' ? 'Lucy' : 'Luca'} pats your shoulder: "We've talked plenty today. Try again tomorrow."`)
        return
      }
      if (res.status === 'too-long') {
        pushPrivate('reply', 'Make your question shorter, please.')
        return
      }
      if (res.status === 'blocked') {
        pushPrivate('reply', `${host === 'lucy' ? 'Lucy' : 'Luca'} smiles gently: "Let's stick to chess and castle matters."`)
        return
      }
      pushPrivate('reply', `${host === 'lucy' ? 'Lucy' : 'Luca'}: ${res.answer}`)
    } catch (err) {
      pushPrivate('reply', err instanceof Error ? err.message : 'No reply came back.')
    }
  },
})

// Avoid TS "unused" warning since the only reset path goes through
// /play new (which writes a fresh state directly, no clear needed).
void clearPlayState
