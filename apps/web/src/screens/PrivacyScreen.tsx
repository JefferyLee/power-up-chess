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
          A display name and a “magic word” — no real name, no email, no phone number, no birthday.
          The magic word is stored only as a one-way code (a hash), never the word itself.
          Sign-in runs on anonymous authentication: to Google, the child is a random ID with no
          personal details attached.
        </p>

        <h2>What we keep on our servers</h2>
        <ul>
          <li>The display name, the hashed magic word, and the anonymous sign-in IDs of the devices used.</li>
          <li>Castle points, cosmetics and unlock progress; finished-game records for the Hall of Games and
            review; team and tournament entries.</li>
          <li>Great Hall chat messages, and Wizard’s Duel room chat — text plus the short voice clips
            themselves (up to 15 seconds), kept with the duel room.</li>
          <li>A one-way hash of the device’s internet address, used only to spot abuse (for example one
            person farming points across many accounts), plus the approximate origin it points to — a
            country and city, looked up once at sign-in and shown on the plaque. The address itself is
            never stored.</li>
        </ul>
        <p>Match history, puzzle attempts and preferences stay on the child’s own device.</p>

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
            name, points and their ledger, games, chat messages and voice notices, invitations, team entries,
            progress and the anonymous sign-in IDs from this device and our servers. (Old game rooms you
            played in still carry the display name for now.)</li>
        </ul>

        <p className="puc-privacy__foot">
          Analytics are basic product metrics with a hashed user ID — no advertising, no cross-site tracking.
          Third parties: Google Firebase (hosting, database, sign-in, analytics), Google Gemini (host text,
          server-side only), Cloudflare (the network in front of app.powerupcastle.app — it sees connection
          data the way any web host does) and Microsoft’s text-to-speech, which reads our own story text
          aloud and never receives anything about the child. The country/city lookup uses ip-api.com,
          which receives the device’s internet address for that one lookup and nothing else.
          Questions or a deletion request: contact Jeff (the operator).
        </p>
      </main>
    </div>
  )
}
