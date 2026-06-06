// UserCardHost — single, stable mounting point for the player-profile
// modal (UserCard).
//
// Why this exists: any component that displays a player's name
// (NameLink, OnlineList row, FindPlayer result, ChatPanel message,
// tournament standings, …) needs to open that player's plaque on
// tap. The earlier shape was "each trigger renders its own
// <UserCard>", which tied the modal's lifetime to whatever node
// spawned it. When that node unmounted mid-interaction — FindPlayer's
// dropdown closing because the user tapped inside the open modal, a
// chat message scrolling out of view, a sidebar re-rendering — the
// UserCard vanished along with it.
//
// Now: the modal is mounted ONCE at the app root via this provider,
// keyed by an `activeNormalizedName` state. Triggers call
// useUserCard().open(name) and forget about it. The host owns the
// dismiss path. PlaqueCard contents are unchanged — only WHERE the
// outer UserCard lives moves.

import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'
import { useCastle } from '../castle/useCastle'
import { UserCard } from './UserCard'

interface UserCardController {
  /** Open the plaque for the given normalized name. No-op for
   *  bypass guests / signed-out viewers (UserCard needs auth). */
  open: (normalizedName: string) => void
  /** Force-close any open UserCard. Optional — clicking the backdrop
   *  or hitting Escape inside UserCard already calls this. */
  close: () => void
}

const Context = createContext<UserCardController | null>(null)

export function UserCardHost({ children }: { children: ReactNode }) {
  const { identity } = useCastle()
  const [active, setActive] = useState<string | null>(null)

  const controller = useMemo<UserCardController>(
    () => ({
      open: (normalizedName: string) => {
        if (!normalizedName) return
        setActive(normalizedName)
      },
      close: () => setActive(null),
    }),
    [],
  )

  // UserCard requires the viewer to be signed in (it calls the
  // getPublicProfile callable, which throws unauthenticated otherwise).
  // For bypass guests, hide the modal but keep the context API alive so
  // call sites don't need to special-case.
  const canRender = !!identity && !!active

  return (
    <Context.Provider value={controller}>
      {children}
      {canRender && (
        <UserCard
          normalizedName={active!}
          selfNormalizedName={identity!.normalizedName}
          selfCastlePoints={identity!.castlePoints ?? 0}
          onClose={() => setActive(null)}
        />
      )}
    </Context.Provider>
  )
}

/** Hook for any trigger (name link, presence row, chat bubble) to
 *  open someone's plaque. Always returns a controller — callers don't
 *  need to null-check.
 *
 *  Throws when used outside <UserCardHost>; failing fast is louder than
 *  a silent no-op when wiring goes wrong. */
export function useUserCard(): UserCardController {
  const ctx = useContext(Context)
  if (!ctx) {
    throw new Error('useUserCard must be used inside <UserCardHost>')
  }
  return ctx
}
