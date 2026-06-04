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
import type { PresenceRow } from '../useLobbyChat'
import type { NavigateFunction } from 'react-router-dom'
import { pushPrivate, clearPrivate } from './privateStream'
import { setClearedAtNow } from '../clearedAt'
import { renderAsciiBoard } from './asciiBoard'
import { loadPlayState, savePlayState, clearPlayState, DEFAULT_RATING } from './playState'
import { bestReplyUci } from './playEngine'

export type CommandTier = 'basic' | 'advanced' | 'hidden'

/** Snapshot of Hall state passed into every command handler. The
 *  terminal feeds this on each dispatch so commands stay pure-ish:
 *  no Firestore reads in handlers for V1. */
export interface WorldSnapshot {
  presence: PresenceRow[]
  hostOnDuty: HostId
  currentStoryTitle: string | null
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
  description: 'Look around the Great Hall.',
  handle: (_args, ctx) => {
    const hostName = ctx.world.hostOnDuty === 'lucy' ? 'Lucy' : 'Luca'
    const hallCount = ctx.world.presence.filter(
      (p) => !p.location || p.location.kind === 'hall',
    ).length
    const lines = [
      'You stand in the Great Hall. Tall windows. A hearth that never quite goes out.',
      `${hostName} keeps watch behind the host's lectern, half-smiling at no one in particular.`,
      hallCount === 0
        ? 'The Hall is empty just now — only the candles whisper.'
        : `${hallCount} adventurer${hallCount === 1 ? '' : 's'} mill about. (Type /who to see who.)`,
    ]
    if (ctx.world.currentStoryTitle) {
      lines.push(`On the lectern lies a tale: "${ctx.world.currentStoryTitle}".`)
    }
    lines.push("Doors lead to the puzzle garden, the wizard's tower, and the forest beyond.")
    pushPrivate('reply', lines.join('\n'))
  },
})

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

// ─── Basic: /help ──────────────────────────────────────────────────

registerCommand({
  name: 'help',
  tier: 'basic',
  description: 'Show available commands.',
  handle: (_args, ctx) => {
    const buckets = helpByTier(ctx.identity)
    const lines: string[] = []
    lines.push('── COMMANDS ──')
    for (const h of buckets.basic) {
      lines.push(`  /${h.name.padEnd(8)} ${h.description}`)
    }
    if (buckets.advanced.length > 0) {
      lines.push('')
      lines.push('── ADVANCED (you have earned these) ──')
      for (const h of buckets.advanced) {
        lines.push(`  /${h.name.padEnd(8)} ${h.description}`)
      }
    } else {
      lines.push('')
      lines.push(`More commands wait at ${ADVANCED_UNLOCK_CP} castle points.`)
    }
    if (buckets.hidden.length > 0) {
      lines.push('')
      lines.push('── HIDDEN ──')
      for (const h of buckets.hidden) {
        lines.push(`  /${h.name.padEnd(8)} ${h.description}`)
      }
    } else if (isAdvancedUnlocked(ctx.identity)) {
      lines.push('')
      lines.push(`Deeper secrets unlock at ${HIDDEN_UNLOCK_CP} castle points.`)
    }
    lines.push('')
    lines.push('Tip: some words work without a slash. Try typing them.')
    pushPrivate('reply', lines.join('\n'))
  },
})

// ─── Advanced: /play vs the Castle ────────────────────────────────

registerCommand({
  name: 'play',
  tier: 'advanced',
  description: 'Play vs the Castle. /play 1200 to start at rating, /play e4 to move, /play board, /play new, /play resign.',
  unlockedFor: isAdvancedUnlocked,
  handle: async (args) => {
    const sub = args.trim()
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
  handle: async (args) => {
    const m = /^(lucy|luca)\s+(.+)$/i.exec(args.trim())
    if (!m) {
      pushPrivate('reply', 'Use /ask Lucy <question> or /ask Luca <question>.')
      return
    }
    const host = m[1]!.toLowerCase() === 'lucy' ? 'lucy' : 'luca'
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
