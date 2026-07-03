# shared/ — single-source definitions used by BOTH the web app and Functions

Why it lives here: `firebase deploy` packages only the `functions/` directory,
so shared code must sit inside it. The web app imports these files through the
`@shared` alias (`apps/web/vite.config.ts` + `tsconfig.app.json`).

**Belongs here:** wire types (room docs, requests/responses), host personas,
game catalogues that both sides must agree on (wizard spells), pure helpers
with no runtime deps beyond TypeScript.

**Stays out:** anything importing firebase-admin / firebase-functions /
browser APIs; server-only tuning (e.g. wizard pricing lives in
`games/wizard/spells.ts`); client-only view helpers.

Never re-create a copy of these definitions on either side — import from here.
