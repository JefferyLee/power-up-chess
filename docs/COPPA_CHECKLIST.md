# COPPA / child-safety self-check

**Status: engineering self-assessment, not legal advice.** Updated 2026-09-29
(privacy fixes; previous 2026-07-03, Path B Phase 4.6). Owner: Jeff.

Paths (per `AUDIT_AND_PLAN.md`): **B** = friends-and-family testing (current);
**C** = public child-facing release (future). Each row is tagged with the path
that requires it.

| Area | Requirement (paraphrased) | Where we stand | Path |
| --- | --- | --- | --- |
| Data minimization | Collect only what's needed | ✅ display name + sha256(magic word) + anonymous uids + HMAC(IP) for abuse tracing; no real name/email/phone/DOB. Raw IP writes removed 2026-09-29; the ip-api.com country/city lookup stays (Jeff's call: keep the origin, never the address) | B ✅ |
| No PII in free text | Kids can't leak contact info | ✅ email/phone scrub + two-tier profanity (severe → reject, evasion-normalised); unit-tested | B ✅ |
| No private channels | No unsupervised 1:1 contact | ✅ standard games chat-free; Hall single moderated stream; Wizard chat mirrors to Hall; no-DM audit 2026-07-03 | B ✅ |
| Reporting & moderation | Users can report; action follows | ✅ report → auto-hide at 3 flags (cascades to Wizard source); admin `setUserBan` | B ✅ |
| Identity integrity | No impersonation | ✅ display names server-bound (presence/chat/seats); profane names rejected at registration | B ✅ |
| Right to review/delete | Parents can erase a child's data | ✅ `forgetMe` (server + full local wipe), control on `/me`; 2026-09-29 also purges audit rows, invitations, team applications and the Auth users. ⚠️ rooms / wizard_rooms / games records still name the player (Phase 1 anonymisation) | B ✅ |
| AI data flow + opt-out | Child data to an LLM is controlled | ✅ Gemini server-side only, strictest safetySettings, LLM output scrubbed; **template-only toggle** in Settings | B ✅ |
| Public exposure | Minimize a child's public footprint | ✅ leaderboard **opt-out** (`hideFromLeaderboards`) covers gate top-5 / puzzle boards / search | B ✅ |
| Parental notice | Clear privacy statement | ✅ in-app `/privacy` (gate + Settings) synced with `PRIVACY.md` draft | B ✅ (C: legal-reviewed final) |
| Abuse hardening | Bots/scripts can't farm the API | ✅ per-uid + per-name rate limits; ⚠️ **App Check monitor-only** — enforcement (2026-07-03) 401'd the custom domain and was reverted (cf50b86). Single switch: `APP_CHECK_ENFORCE=1` in `functions/.env` (`functions/src/callableOptions.ts`), only after the reCAPTCHA key allowlists `app.powerupcastle.app` + `power-up-chess-dev.web.app` and verified tokens show in the console | B ✅ |
| No behavioral ads | No ad targeting of kids | ✅ no ads/ad SDKs; analytics hashed-uid product metrics only | B ✅ |
| **Verifiable parental consent** | Required before collecting PII from under-13s at scale | ❌ not implemented — Path B stays invite/family | **C 必需** |
| **Third-party terms review** | Firebase + Gemini children's-data terms confirmed | ⚠️ not formally reviewed | **C 必需** |
| **Data-retention policy** | Written retention schedule | ⚠️ TTLs + dormant-guest sweep exist; no written policy | **C 必需** |
| **Legal COPPA sign-off** | Counsel review, dated | ❌ | **C 必需** |
| Wizard voice STT moderation | Transcribe + filter voice clips | ⚠️ Path B mitigation = Hall mirror notice + limits + report; full STT pipeline | **C 必需** |

## Path B verdict (2026-07-03)

Every Path-B row is ✅. Remaining human steps before inviting families:
Jeff walks the report→hide and forget-me flows once on production, allowlists
the custom domain on the reCAPTCHA key, and flips `APP_CHECK_ENFORCE=1` after a
clean monitor window.

## Before Path C (public release)

1. Verifiable parental consent flow (or stay invite-only).
2. Legal review: COPPA + Google (Firebase/Gemini) children's-data terms.
3. Written data-retention policy.
4. Wizard voice STT moderation pipeline.
5. Final, legal-reviewed privacy statement replacing the draft.
