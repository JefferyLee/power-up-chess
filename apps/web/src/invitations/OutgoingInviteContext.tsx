// Tracks the one outgoing invitation a sender currently has in flight.
//
// Why a context: SentInviteToast lives at the App root so the toast
// follows the sender across page navigations ("invite Adda from Hall →
// go check puzzles while waiting → see Adda accepted toast → land in
// the room"). InviteDialog sets the active id on send success and
// closes; the toast picks up from there.
//
// We only support ONE outgoing invite at a time. Simple matches the
// real use case — a kid doesn't multi-cast invites.

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

interface OutgoingInviteState {
  inviteId: string | null
  setInviteId: (id: string | null) => void
}

const Ctx = createContext<OutgoingInviteState | null>(null)

export function OutgoingInviteProvider({ children }: { children: ReactNode }) {
  const [inviteId, setInviteId] = useState<string | null>(null)
  const set = useCallback((id: string | null) => setInviteId(id), [])
  const value = useMemo<OutgoingInviteState>(
    () => ({ inviteId, setInviteId: set }),
    [inviteId, set],
  )
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useOutgoingInviteContext(): OutgoingInviteState {
  const v = useContext(Ctx)
  if (!v) throw new Error('useOutgoingInviteContext must be used inside <OutgoingInviteProvider>')
  return v
}
