# COPPA / child-safety self-check (draft)

**Status: DRAFT self-assessment, not legal advice.** 2026-07-01. Per
`DECISIONS.md`, a real COPPA review is required before any public,
child-facing release; this checklist is an engineering-side pre-read to make
that review faster. Owner: Jeff.

COPPA applies to operators of online services directed at children under 13 in
the US, and governs collection/use/disclosure of a child's **personal
information**. The core mitigations below.

| Area | Requirement (paraphrased) | Where we stand | Gap / action |
| --- | --- | --- | --- |
| **Data minimization** | Collect only what's needed | Display name + `sha256(magic word)` only; no real name/email/phone/DOB/password | ✅ strong. Keep resisting new PII fields |
| **No PII in free text** | Don't let kids leak PII | Chat scrubs email/phone patterns + profanity server-side | ✅ implemented; ⚠️ pattern-based, not perfect — periodic review |
| **Parental notice** | Clear privacy notice | `docs/PRIVACY.md` draft (parent-facing) | ⚠️ draft; finalize + surface in-app before public release |
| **Verifiable parental consent** | Required before collecting PII from under-13 (public release) | Not implemented — currently family/private testing | ❌ **needed before public release**; decide consent flow (or keep invite-only/family) |
| **Right to review/delete** | Parents can review & delete a child's data | `forgetMe` deletes account+data (server) + full local wipe; control on `/me` | ✅ deletion shipped; review = the plaque/profile view |
| **Data retention** | Don't keep longer than needed | Local-first; presence TTLs out; dormant-guest sweep exists | ⚠️ document a retention policy; confirm chat/audit retention |
| **No behavioral advertising** | No ad targeting of kids | No ads, no ad SDKs, no cross-site trackers | ✅ |
| **Third-party disclosure** | Limit sharing; vet processors | Only Google (Firebase + Gemini), server-side keys | ⚠️ confirm Google's child-data terms (Firebase COPPA guidance, Gemini data-use for API calls) cover our usage |
| **AI content to third party** | Sending kids' data to an AI | Game moves sent to Gemini for commentary; **opt-out shipped** (template-only hosts) | ⚠️ consider default-off or explicit parent opt-in for public release |
| **Security** | Reasonable safeguards | Anonymous Auth; server-authoritative validators; Firestore rules; magic word is **deliberately weak** (not protecting PII, since none collected) | ✅ for the data held; note the weak-auth stance in the review |
| **Public exposure of a child** | Minimize public profile | Display name only; leaderboards show display name; **ranking is automatic (no opt-in)** | ⚠️ consider leaderboard opt-in before public release |

## Before any public / non-family release
1. Finalize `PRIVACY.md` and surface it in-app (gate + footer).
2. Decide the consent model: stay invite-only/family, or build verifiable
   parental consent.
3. Confirm Google Firebase + Gemini terms for children's data.
4. Decide AI default (on vs. parent-opt-in) and leaderboard opt-in.
5. Write a short data-retention policy.
6. Record the outcome (dated sign-off or accepted-risk) in `DECISIONS.md`.
