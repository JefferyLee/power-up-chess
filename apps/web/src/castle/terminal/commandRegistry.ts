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
import { bestReplyUci } from './playEngine'
import {
  ROOMS,
  describeExits,
  markVisited,
  parseDirection,
  saveCurrentRoom,
  type Direction,
  type RoomId,
} from './world'

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
const HIDDEN_UNLOCK_CP = 200

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
    lines.push(`Exits: ${describeExits(room)}`)
    pushPrivate('reply', lines.join('\n'))
  },
})

// ─── Basic: /go + n/s/e/w/up/down shortcuts ───────────────────────

function move(direction: Direction, ctx: CommandContext): void {
  const room = ROOMS[ctx.world.currentRoom]
  const nextId = room.exits[direction]
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
  lines.push(`Exits: ${describeExits(next)}`)
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

registerCommand({
  name: 'users',
  tier: 'basic',
  description: 'List everyone in the castle with their current status. /users 2 for next page.',
  handle: (args, ctx) => {
    const all = ctx.world.presence
    if (all.length === 0) {
      pushPrivate('reply', 'No one is in the castle right now. Strange.')
      return
    }
    const requested = Number.parseInt(args.trim(), 10)
    const totalPages = Math.max(1, Math.ceil(all.length / USERS_PAGE_SIZE))
    const page = Number.isFinite(requested)
      ? Math.max(1, Math.min(totalPages, requested))
      : 1
    const start = (page - 1) * USERS_PAGE_SIZE
    const slice = all.slice(start, start + USERS_PAGE_SIZE)
    // Even column width keeps the location chunk aligned.
    const nameWidth = Math.max(...slice.map((p) => p.displayName.length), 4)
    const lines = [`── ADVENTURERS · page ${page}/${totalPages} · ${all.length} present ──`]
    for (const p of slice) {
      lines.push(`  ${p.displayName.padEnd(nameWidth)}  ${describeLocation(p.location)}`)
    }
    lines.push('')
    if (page < totalPages) {
      lines.push(`/users ${page + 1} for the next page.`)
    } else if (totalPages > 1) {
      lines.push(`(last page — /users 1 to start over)`)
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
  description: 'Spectate a live game by room id, e.g. /watch ABC123.',
  handle: (args, ctx) => {
    const id = args.trim()
    if (!id) {
      pushPrivate('reply', 'Use /watch <roomId>, e.g. /watch ABC123. Type /games to see what is live.')
      return
    }
    // Disambiguate chess vs wizard from presence. Same roomId can't
    // collide across collections in practice but we still scan both.
    const target = ctx.world.presence.find(
      (p) => (p.location?.kind === 'chess' || p.location?.kind === 'wizard') && p.location.roomId === id,
    )
    if (!target || (target.location?.kind !== 'chess' && target.location?.kind !== 'wizard')) {
      pushPrivate('reply', `No live game called "${id}". Type /games to see active rooms.`)
      return
    }
    const path = target.location.kind === 'wizard' ? `/wizard/${id}` : `/r/${id}`
    pushPrivate('reply', `Heading to ${target.location.kind} room ${id}…`)
    ctx.exitTerminal()
    ctx.navigate(path)
  },
})

// ─── Basic: /invite <name> — invite an online guest to play ───────

registerCommand({
  name: 'invite',
  tier: 'basic',
  description: 'Invite a castle guest to a chess game, e.g. /invite Ada. Costs 5 castle points.',
  handle: async (args, ctx) => {
    const name = args.trim()
    if (!name) {
      pushPrivate('reply', 'Use /invite <name>, e.g. /invite Ada. Costs 5 castle points.')
      return
    }
    const me = ctx.identity
    if (!me || me.isBypass) {
      pushPrivate('reply', 'Sign in with a magic word first — visitors cannot send invitations.')
      return
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
        // Untimed by default — kids can use the Hall's normal invite UI
        // for time-control choices. Keeps the terminal command simple.
        timeControl: null,
        ...(me.cosmetics?.pieceSet ? { pieceSetId: me.cosmetics.pieceSet } : {}),
      })
      const minutes = Math.max(0, Math.round((res.expiresAt - Date.now()) / 60_000))
      pushPrivate('reply', `Invitation sent to ${name} (5 castle points spent). It will wait ${minutes} minute${minutes === 1 ? '' : 's'} for a reply.`)
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
  description: 'Check what you carry.',
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
    pushPrivate('reply', lines.join('\n'))
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
      pushPrivate(
        'reply',
        `A new board is set. You play White. The Castle plays at rating ~${clamped}.`,
      )
      pushPrivate('ascii', renderAsciiBoard(game))
      pushPrivate(
        'reply',
        'Make a move with /play e4 or /play Nf3. Try /play 800 or /play 1800 for a different opponent. /play resign to give up.',
      )
      return
    }

    if (!state) {
      pushPrivate('reply', 'No game in progress. Type /play to begin, or /play 1500 to pick the Castle\'s strength.')
      return
    }

    if (sub === 'board' || sub === '') {
      pushPrivate('ascii', renderAsciiBoard(state.game))
      if (state.status !== 'active') {
        pushPrivate('reply', `(Game over — ${describeStatus(state.status)}. /play new for another.)`)
      }
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
    pushPrivate('reply', `You play ${kidMove.san}.`)

    if (state.game.isCheckmate()) {
      savePlayState(state.game, state.kidSide, 'kid-won', state.rating)
      pushPrivate('ascii', renderAsciiBoard(state.game))
      pushPrivate('reply', 'Checkmate. You win. The hearth crackles approvingly.')
      return
    }
    if (state.game.isDraw() || state.game.isStalemate()) {
      savePlayState(state.game, state.kidSide, 'drawn', state.rating)
      pushPrivate('ascii', renderAsciiBoard(state.game))
      pushPrivate('reply', 'The game is drawn.')
      return
    }

    pushPrivate('reply', 'The Castle ponders…')
    let uci: string
    try {
      uci = await bestReplyUci(state.game.fen(), state.rating)
    } catch (err) {
      // Roll back the kid's move so they can try again rather than
      // losing tempo to an engine hiccup.
      state.game.undo()
      savePlayState(state.game, state.kidSide, 'active', state.rating)
      pushPrivate('reply', err instanceof Error
        ? `The Castle stumbled: ${err.message}. Your move was undone — try again.`
        : 'The Castle stumbled. Your move was undone — try again.')
      return
    }
    if (!uci || uci === '(none)') {
      savePlayState(state.game, state.kidSide, 'kid-won', state.rating)
      pushPrivate('reply', 'The Castle has no reply. You win!')
      return
    }
    const engineMove = state.game.move({
      from: uci.slice(0, 2),
      to: uci.slice(2, 4),
      promotion: uci.length === 5 ? uci[4]!.toLowerCase() : undefined,
    })
    pushPrivate('reply', `The Castle plays ${engineMove?.san ?? uci}.`)

    if (state.game.isCheckmate()) {
      savePlayState(state.game, state.kidSide, 'kid-lost', state.rating)
      pushPrivate('ascii', renderAsciiBoard(state.game))
      pushPrivate('reply', 'Checkmate. The Castle wins this round. /play new to try again.')
      return
    }
    if (state.game.isDraw() || state.game.isStalemate()) {
      savePlayState(state.game, state.kidSide, 'drawn', state.rating)
      pushPrivate('ascii', renderAsciiBoard(state.game))
      pushPrivate('reply', 'The game is drawn.')
      return
    }

    savePlayState(state.game, state.kidSide, 'active', state.rating)
    pushPrivate('ascii', renderAsciiBoard(state.game))
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
