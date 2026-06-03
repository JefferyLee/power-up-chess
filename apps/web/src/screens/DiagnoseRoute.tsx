// TEMP diagnostic page — hits debugInvites and dumps the result so
// the recipient device can prove why the InviteInbox isn't firing.
//
// Reachable at /diagnose. No nav from elsewhere — bookmark / type the
// URL. Remove with the debug callable when the bug is fixed.

import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthUid } from '../auth/useAuthUid'
import { callDebugInvites, type DebugInvitesResponse } from '../firebase/callables'

export function DiagnoseRoute() {
  const navigate = useNavigate()
  const auth = useAuthUid()
  const [state, setState] = useState<
    | { kind: 'loading' }
    | { kind: 'ready'; data: DebugInvitesResponse; localUid: string }
    | { kind: 'error'; message: string }
  >({ kind: 'loading' })

  useEffect(() => {
    if (auth.status !== 'ready') return
    callDebugInvites()
      .then((data) => setState({ kind: 'ready', data, localUid: auth.uid }))
      .catch((e) => setState({ kind: 'error', message: e instanceof Error ? e.message : String(e) }))
  }, [auth.status, auth.status === 'ready' ? auth.uid : null])

  return (
    <div style={{
      minHeight: '100vh',
      background: '#0c0820',
      color: '#e6e0f6',
      padding: '16px',
      fontFamily: 'system-ui, sans-serif',
      fontSize: '13px',
      lineHeight: 1.5,
    }}>
      <button
        type="button"
        onClick={() => navigate('/')}
        style={{
          background: 'transparent',
          border: '1px solid rgba(244,194,102,0.5)',
          color: '#f4c266',
          borderRadius: '999px',
          padding: '5px 12px',
          fontSize: '12px',
          marginBottom: '12px',
          cursor: 'pointer',
        }}
      >← Back</button>
      <h1 style={{ fontFamily: 'Cinzel, Georgia, serif', color: '#f4c266' }}>Invite Diagnostics</h1>
      {state.kind === 'loading' && <p>Loading…</p>}
      {state.kind === 'error' && <p style={{ color: '#f4b0a0' }}>Error: {state.message}</p>}
      {state.kind === 'ready' && (
        <>
          <p>This device's auth uid: <code>{state.localUid}</code></p>
          <p>Server confirms caller uid: <code>{state.data.authUid}</code></p>
          <p>Server resolved your guest record: <b>{state.data.guestNormalizedName ?? '(none)'}</b></p>
          <p>
            Your guest uids ({state.data.guestUids.length}):<br />
            {state.data.guestUids.length === 0
              ? <i>none — castleEnter never wrote your uid here</i>
              : state.data.guestUids.map((u) => (
                  <code key={u} style={{
                    display: 'inline-block',
                    margin: '2px 4px 2px 0',
                    padding: '2px 6px',
                    background: u === state.localUid ? 'rgba(130,209,138,0.3)' : 'rgba(255,255,255,0.06)',
                    borderRadius: '4px',
                  }}>{u}{u === state.localUid && ' ✓ this device'}</code>
                ))}
          </p>
          <p>This device's uid is in your guest record: <b style={{ color: state.data.guestUidsMatchAuth ? '#82d18a' : '#f4b0a0' }}>{state.data.guestUidsMatchAuth ? 'YES' : 'NO — this is the bug'}</b></p>

          <hr style={{ borderColor: 'rgba(255,255,255,0.1)', margin: '20px 0' }} />

          <h2 style={{ fontSize: '15px', color: '#f4c266' }}>Recent presence for this uid</h2>
          {state.data.recentPresenceForMe.length === 0
            ? <p><i>No presence rows — heartbeat isn't reaching the server.</i></p>
            : state.data.recentPresenceForMe.map((p) => (
                <p key={p.sessionId}>
                  session <code>{p.sessionId.slice(0, 12)}…</code> as <b>{p.normalizedName}</b>, last seen <b>{Math.round((Date.now() - p.lastSeenAt) / 1000)}s ago</b>
                </p>
              ))}

          <hr style={{ borderColor: 'rgba(255,255,255,0.1)', margin: '20px 0' }} />

          <h2 style={{ fontSize: '15px', color: '#f4c266' }}>Pending invites for this uid</h2>
          <p>By <code>toUids array-contains</code> = <b>{state.data.pendingInvitesByToUidsContains}</b></p>
          <p>By legacy <code>toUid ==</code> = <b>{state.data.pendingInvitesByToUidContains}</b></p>

          <h2 style={{ fontSize: '15px', color: '#f4c266', marginTop: '20px' }}>
            All pending invites to "{state.data.guestNormalizedName}"
          </h2>
          {state.data.pendingInvitesToMyNormalizedName.length === 0
            ? <p><i>No pending invites addressed to you.</i></p>
            : state.data.pendingInvitesToMyNormalizedName.map((inv) => (
                <div key={inv.inviteId} style={{
                  margin: '8px 0',
                  padding: '8px 12px',
                  background: 'rgba(255,255,255,0.04)',
                  borderRadius: '6px',
                  border: '1px solid ' + (inv.toUidsContainsMe ? 'rgba(130,209,138,0.5)' : 'rgba(220,90,90,0.5)'),
                }}>
                  <p>From <b>{inv.fromName}</b> · invite <code>{inv.inviteId.slice(0, 10)}…</code></p>
                  <p>toUid: <code>{inv.toUid}</code>{inv.toUidEqualsMe && ' ✓'}</p>
                  <p>toUids ({inv.toUids.length}): {inv.toUids.map((u) => (
                    <code key={u} style={{
                      display: 'inline-block',
                      margin: '2px 4px 2px 0',
                      padding: '2px 6px',
                      background: u === state.localUid ? 'rgba(130,209,138,0.3)' : 'rgba(255,255,255,0.06)',
                      borderRadius: '4px',
                      fontSize: '11px',
                    }}>{u}</code>
                  ))}</p>
                  <p>Should reach this device: <b style={{ color: inv.toUidsContainsMe ? '#82d18a' : '#f4b0a0' }}>{inv.toUidsContainsMe ? 'YES' : 'NO'}</b></p>
                </div>
              ))}
        </>
      )}
    </div>
  )
}
