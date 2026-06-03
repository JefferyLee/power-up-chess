# Cost guardrails

Power Up Chess has three potential cost amplifiers if a user (or runaway
client) goes wild:

1. **Gemini LLM** (`hostCommentary`, `gameRecap`) — paid per token.
2. **Edge-TTS audio synthesis** (`synthesizeStoryAudio`) — paid per character.
3. **Firestore reads/writes** — generous free tier, then per-op.

This doc lays out the *defensive* layers and the manual steps to set up
billing alerts on top.

## Layer 1: Code-level per-uid daily caps

Already enforced server-side via `functions/src/llm/rateLimit.ts`:

| Callable           | Collection             | Daily cap per uid |
|--------------------|------------------------|-------------------|
| `hostCommentary`   | `commentary_attempts`  | 200               |
| `gameRecap`        | `recap_attempts`       | 30                |
| `submitFeedback`   | `feedback_attempts`    | 8                 |

Caps fire *after* the cache lookup, so cache hits never count against the
quota. A user reviewing the same game twice only pays for the first
review. The cap message bubbles up as `HttpsError('resource-exhausted',
...)` and the client falls back to the template line for that move.

Numbers are deliberately generous: a typical full-game review uses 10-20
LLM calls, so 200/day is ~10 reviews — way above any real kid usage but
catches a stuck retry loop.

## Layer 2: Cache (already in place)

Every LLM result is cached by
`hash(host, classification, fenBefore, moveUci, playerName)`. Replaying
a position never re-calls the LLM. Same-shape positions (e.g. opening
positions) get especially cheap once warm.

## Layer 3: GCP Billing budget alerts (manual setup)

The CLI can't create a billing budget — set up in the Cloud Console.
Suggested config for the `power-up-chess-dev` project:

1. <https://console.cloud.google.com/billing/01D3F4-XXXXX-XXXXX/budgets>
   (Billing > Budgets & alerts > **Create budget**)
2. **Scope**: This billing account → `power-up-chess-dev` project only.
3. **Amount**: $20/month is a reasonable starting target.
4. **Threshold rules**:
   - 50% — informational ("watch this")
   - 90% — escalation ("act soon")
   - 100% — emergency
5. **Notification email**: zhipeng.li@gmail.com (the project owner).
6. Optionally connect a Pub/Sub topic if you want a Cloud Function to
   programmatically disable the user-facing buttons on 100%.

Run this once. The dashboard alone won't surface a problem in real time
— the email alerts will.

## Layer 4: What we're *not* doing (and why)

- **Per-IP rate limit at the HTTPS callable layer.** Anonymous Auth uids
  are stable per-device and harder to spoof than IPs; per-uid is already
  the right granularity.
- **Global daily cap across all uids.** Hard to implement correctly with
  Firestore transactions under load, and the per-uid cap × expected
  audience size keeps us within budget anyway.
- **Token-counting before each LLM call.** Gemini 3.5 Flash is cheap
  enough that policing exact token use isn't worth the code complexity.
  If unit costs spike, revisit.

## What to monitor

- `commentary_attempts/*` count for the day — if many uids are near the
  cap, the cache is missing too often (or someone is reviewing many
  unique games).
- Firestore reads on `feedback` (admin inbox snapshot listener is open
  while Jeff has the Hall page open — should be modest).
- `synthesizeStoryAudio` invocations — the 216 pre-generated mp3s mean
  this should be ~zero in steady state.
