// Slash-command parser for the Hall chat input.
//
// Recognised commands (slice 1):
//   /clear   — wipe my own client-side chat view (localStorage flag)
// Reserved for later slices:
//   /skill <name> [@target]
//   /shout @user <text>
//   /define <name> <template>
//   /undefine <name>
//   /commands
//
// Anything that doesn't match a reserved name OR a user-defined macro
// is treated as a plain message and posted as-is. That keeps the chat
// resilient — a typo like `/hi` doesn't fail the send, it just posts
// "/hi" as text.

export const RESERVED_COMMANDS = new Set([
  'clear', 'skill', 'shout', 'define', 'undefine', 'commands', 'help',
])

export type ParsedCommand =
  | { kind: 'message'; text: string }
  | { kind: 'clear' }
  | { kind: 'skill'; skillId: string; target?: string }
  | { kind: 'shout'; target: string; text: string }
  | { kind: 'define'; name: string; template: string }
  | { kind: 'undefine'; name: string }
  | { kind: 'commands' }
  | { kind: 'macro'; name: string; arg: string }
  | { kind: 'error'; message: string }

/** Strip leading slash + lowercase the command name. */
function splitSlash(raw: string): { name: string; rest: string } | null {
  const m = /^\/(\S+)\s*(.*)$/.exec(raw.trim())
  if (!m) return null
  return { name: m[1]!.toLowerCase(), rest: m[2] ?? '' }
}

/** Strip an @ off a token if present + return the bare name. */
export function stripAt(token: string): string {
  return token.startsWith('@') ? token.slice(1) : token
}

/** Parse a chat input string. Pass the signed-in user's macro map so
 *  `/<custom>` names can dispatch correctly. Returns a discriminated
 *  union that the chat handler then acts on. */
export function parseChat(
  raw: string,
  userMacros: Record<string, string> = {},
): ParsedCommand {
  if (!raw.startsWith('/')) return { kind: 'message', text: raw }

  const split = splitSlash(raw)
  if (!split) return { kind: 'message', text: raw }
  const { name, rest } = split

  // Built-ins.
  if (name === 'clear') return { kind: 'clear' }
  if (name === 'commands') return { kind: 'commands' }

  if (name === 'skill') {
    const [skillId, target] = rest.split(/\s+/, 2)
    if (!skillId) return { kind: 'error', message: 'Use /skill <name>, e.g. /skill firework' }
    return {
      kind: 'skill',
      skillId: skillId.toLowerCase(),
      ...(target ? { target: stripAt(target) } : {}),
    }
  }

  if (name === 'shout') {
    const m = /^@?(\S+)\s*(.*)$/.exec(rest)
    if (!m) return { kind: 'error', message: 'Use /shout @username your text here' }
    return { kind: 'shout', target: m[1]!, text: m[2] ?? '' }
  }

  if (name === 'define') {
    const m = /^(\S+)\s+(.+)$/.exec(rest)
    if (!m) return { kind: 'error', message: 'Use /define <name> <template>' }
    return { kind: 'define', name: m[1]!.toLowerCase(), template: m[2]! }
  }

  if (name === 'undefine') {
    if (!rest.trim()) return { kind: 'error', message: 'Use /undefine <name>' }
    return { kind: 'undefine', name: rest.trim().toLowerCase() }
  }

  // User-defined macro? Expand here so the rest of the pipeline (post
  // to chat, render mentions, etc) sees plain text.
  const macro = userMacros[name]
  if (macro) {
    return { kind: 'macro', name, arg: rest.trim() }
  }

  // Unknown command — post as literal text. Better than failing the
  // send; preserves the kid's typing.
  return { kind: 'message', text: raw }
}

/** Apply a macro template to the user's argument. `@` in the template
 *  is replaced with the arg (or 'everyone' if no arg given). */
export function expandMacro(template: string, arg: string): string {
  const target = arg || 'everyone'
  return template.replace(/@/g, `@${target}`)
}
