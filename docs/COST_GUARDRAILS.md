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

## Layer 3: GCP Billing budget alerts — CONFIGURED (2026-07-03)

Verified live on billing account `0119DC-C09A0D-F85476`:

- **Budget**: "Firebase Project power-up-chess-dev"
  (`budgets/1be652f9-fe38-470a-b946-924a6c931324`)
- **Scope**: `power-up-chess-dev` project only, calendar month.
- **Amount**: **$25 USD / month** (per Jeff, 2026-07-03).
- **Threshold alerts**: 50% / 90% / 100% of current spend.
- **Notifications**: default rule → email to the Billing Account
  Admins/Users (zhipeng.li@gmail.com).

Console: Billing → Budgets & alerts. Optionally connect a Pub/Sub topic
later if a Cloud Function should programmatically disable user-facing
buttons at 100%. The dashboard alone won't surface a problem in real
time — the email alerts will.

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
