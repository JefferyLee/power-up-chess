// In-app privacy note (Phase 3.8) — a parent-readable summary kept in sync
// with docs/PRIVACY.md (the canonical draft). Reachable from the castle gate
// (before sign-in) and from /me → Settings.

import { useNavigate } from 'react-router-dom'
import './PrivacyScreen.css'

export function PrivacyScreen() {
  const navigate = useNavigate()
  return (
    <div className="puc-privacy">
      <header className="puc-privacy__header">
        <button type="button" className="puc-privacy__back" onClick={() => navigate(-1)} aria-label="Back">←</button>
        <h1>How Power Up Chess handles your data</h1>
      </header>
      <main className="puc-privacy__body">
        <p>Power Up Chess is a chess learning game for children. We collect as little as possible.</p>

        <h2>What we ask for</h2>
        <p>
          A display name and a “magic word” — nothing else. No real name, no email, no phone number,
          no birthday. The magic word is stored only as a one-way code (a hash), never the word itself.
          Sign-in runs on anonymous authentication.
        </p>

        <h2>Talking to other people</h2>
        <ul>
          <li>Games are <b>private-link only</b> — there is no public matchmaking.</li>
          <li>Standard chess games (online, local, AI practice) have <b>no chat at all</b>.</li>
          <li>The Great Hall has one shared, moderated chat: a two-tier profanity filter, automatic
            removal of anything that looks like an email or phone number, rate limits, and a report
            button that hides a message once three different people flag it. <b>No private messages.</b></li>
          <li>Wizard’s Duel room chat (text and short voice clips) is <b>never private</b> — every message
            also appears in the Great Hall feed under the same moderation.</li>
        </ul>

        <h2>The AI hosts</h2>
        <p>
          Lucy &amp; Luca’s commentary is generated server-side by Google’s Gemini with the strictest
          child-safety settings. Parents can switch to <b>template-only hosts</b> (Plaque → Settings),
          after which nothing about the child’s games is sent to the AI.
        </p>

        <h2>Your controls</h2>
        <ul>
          <li><b>Hide from leaderboards</b> — keep your name off all public boards (Plaque → Settings).</li>
          <li><b>Delete everything</b> — Plaque → “Delete my account &amp; data” irreversibly removes your
            name, points, games, chat messages and progress from this device and our servers.</li>
        </ul>

        <p className="puc-privacy__foot">
          Analytics are basic product metrics with a hashed user ID — no advertising, no cross-site tracking.
          Third parties: Google Firebase (hosting, database) and Google Gemini (host text, server-side only).
          Questions or a deletion request: contact Jeff (the operator).
        </p>
      </main>
    </div>
  )
}
