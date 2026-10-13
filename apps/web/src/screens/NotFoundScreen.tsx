// Shown for a URL that matches no door (/bunker, /mud, a mistyped link).
// Until 2026-10-13 unknown routes bounced silently to the Hall; a kid
// following a bad link just saw the gate again with no idea why. The
// floating 🏰 button (nav/FloatingBack) is the way home, as everywhere.

import './NotFoundScreen.css'

export function NotFoundScreen() {
  return (
    <main className="puc-notfound">
      <h1>No door here</h1>
      <p>The corridor ends in bare stone. Nothing in the castle answers to this address.</p>
      <p>Tap 🏰 to go back to the Hall.</p>
    </main>
  )
}
