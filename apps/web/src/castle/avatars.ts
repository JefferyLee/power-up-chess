// Preset avatar IDs + lookup-only data. The actual SVG art lives in
// Avatar.tsx so react-refresh stays happy (component file exports only
// components; data file exports only data).

export type AvatarId =
  | 'fox' | 'owl' | 'wolf' | 'cat' | 'rabbit'
  | 'dragon' | 'unicorn' | 'pirate' | 'wizard'
  | 'knight' | 'queen' | 'star'

export interface AvatarMeta {
  id: AvatarId
  label: string
  bg: string
}

export const AVATAR_META: AvatarMeta[] = [
  { id: 'fox',     label: 'Fox',     bg: '#e87a3a' },
  { id: 'owl',     label: 'Owl',     bg: '#7a5a2a' },
  { id: 'wolf',    label: 'Wolf',    bg: '#6a6a8a' },
  { id: 'cat',     label: 'Cat',     bg: '#9a6ad8' },
  { id: 'rabbit',  label: 'Rabbit',  bg: '#f0c7d8' },
  { id: 'dragon',  label: 'Dragon',  bg: '#5e8a4a' },
  { id: 'unicorn', label: 'Unicorn', bg: '#e8b8e8' },
  { id: 'pirate',  label: 'Pirate',  bg: '#3a3a4a' },
  { id: 'wizard',  label: 'Wizard',  bg: '#5a4ac8' },
  { id: 'knight',  label: 'Knight',  bg: '#a8a8b8' },
  { id: 'queen',   label: 'Queen',   bg: '#caa14a' },
  { id: 'star',    label: 'Star',    bg: '#f1c34c' },
]

export const DEFAULT_AVATAR_ID: AvatarId = 'star'

export function avatarMeta(id: AvatarId): AvatarMeta {
  return AVATAR_META.find((a) => a.id === id) ?? AVATAR_META[AVATAR_META.length - 1]!
}
