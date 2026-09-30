# Deploying

Phase 1 of `REVIEW_2026-09.md`: production deploys run from GitHub Actions, not a
laptop. Laptop deploys remain possible (see the end).

## How a deploy happens

- **Automatic:** every push to `main` runs the `CI` workflow. When it finishes
  green, `.github/workflows/deploy.yml` starts (`workflow_run`), checks out the
  exact commit CI validated and deploys, in order: Firestore rules + indexes →
  Cloud Functions → Hosting (app + landing). A red CI never deploys.
- **Manual:** GitHub → Actions → *Deploy* → *Run workflow* → pick a target:
  `all`, `hosting`, `functions` or `rules` (rules = `firestore:rules` +
  `firestore:indexes`).
- Deploys are serialised (`concurrency: deploy`, never cancelled mid-way).
- `functions` deploys with `--force`: a function removed from `functions/src`
  is **deleted** in production on the next deploy (without `--force` the CLI
  aborts in CI). Indexes are deployed without `--force`, so indexes that exist
  only in the console are never deleted.
- The CLI is the `firebase-tools` version from the root `package.json`, run via
  `pnpm exec firebase`, with the `predeploy` hooks in `firebase.json` doing the
  web and functions builds.

## One-time setup (Jeff)

### 1. Service account

Create a deploy-only service account in `power-up-chess-dev` and grant it the
roles below (from a machine with `gcloud` logged in as an owner):

```bash
PROJECT=power-up-chess-dev
SA=github-deploy@$PROJECT.iam.gserviceaccount.com

gcloud iam service-accounts create github-deploy --project "$PROJECT" \
  --display-name "GitHub Actions deploy"

for role in \
  roles/firebasehosting.admin \
  roles/firebaserules.admin \
  roles/datastore.indexAdmin \
  roles/cloudfunctions.developer \
  roles/iam.serviceAccountUser \
  roles/cloudscheduler.admin \
  roles/secretmanager.viewer \
  roles/artifactregistry.reader \
  roles/serviceusage.apiKeysViewer \
  roles/serviceusage.serviceUsageViewer
do
  gcloud projects add-iam-policy-binding "$PROJECT" \
    --member "serviceAccount:$SA" --role "$role" --condition None
done

gcloud iam service-accounts keys create key.json --iam-account "$SA"
gh secret set GCP_SA_KEY < key.json && rm key.json
```

| Role | Why the deploy needs it |
| --- | --- |
| Firebase Hosting Admin (`roles/firebasehosting.admin`) | `hosting` — releases to the `app` and `landing` sites |
| Firebase Rules Admin (`roles/firebaserules.admin`) | `firestore:rules` — creates rulesets and releases |
| Cloud Datastore Index Admin (`roles/datastore.indexAdmin`) | `firestore:indexes` — lists/creates composite indexes |
| Cloud Functions Developer (`roles/cloudfunctions.developer`) | create/update/delete 2nd-gen functions, their Cloud Run services and the public-invoker policy on callables |
| Service Account User (`roles/iam.serviceAccountUser`) | deploying acts as the runtime service account (`<project-number>-compute@developer.gserviceaccount.com`); Cloud Scheduler jobs also run as it. Project-level is what the Cloud Functions docs describe; the narrower form is binding this role on that one service account instead |
| Cloud Scheduler Admin (`roles/cloudscheduler.admin`) | the 11 `onSchedule` functions are Cloud Scheduler jobs created/updated on every deploy |
| Secret Manager Viewer (`roles/secretmanager.viewer`) | `GEMINI_API_KEY` is a `defineSecret`; the CLI verifies the latest version and that the runtime SA already has `secretAccessor` on it |
| Artifact Registry Reader (`roles/artifactregistry.reader`) | the CLI reads the `gcf-artifacts` repository to check its image cleanup policy |
| API Keys Viewer (`roles/serviceusage.apiKeysViewer`) | listed by the Firebase IAM docs as required to deploy via the CLI |
| Service Usage Viewer (`roles/serviceusage.serviceUsageViewer`) | the CLI checks the required Google APIs are enabled before deploying |

Not needed: **Cloud Build** roles (the Cloud Functions service runs the build
with the project's own build service account, already working from laptop
deploys) and **Artifact Registry Administrator** — unless you would rather let
CI create the container cleanup policy itself; the reader role is enough once
the policy exists, so set it once from your laptop:

```bash
pnpm exec firebase functions:artifacts:setpolicy --location us-central1   # keeps images 1 day
```

The first CI deploy is the real test of this list. A missing permission fails
with the exact `service.resource.verb` name; add the matching role and re-run
the *Deploy* workflow manually. The key is a long-lived credential: keep it only
in the GitHub secret (rotate with `gcloud iam service-accounts keys create` /
`delete`). Workload Identity Federation would remove the key entirely — not
done yet.

### 2. GitHub secrets and variables

Run from the repo root (`gh` picks up the repo):

| Kind | Name | Holds |
| --- | --- | --- |
| secret | `GCP_SA_KEY` | the whole `key.json` from step 1 |
| secret | `IP_HASH_SECRET` | the value in your local `functions/.env` — must stay the same or stored IP hashes stop matching |
| variable | `APP_CHECK_ENFORCE` | `0` or `1`; the App Check kill-switch (`functions/src/callableOptions.ts`). Unset = `0` |
| variable | `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_STORAGE_BUCKET`, `VITE_FIREBASE_MESSAGING_SENDER_ID`, `VITE_FIREBASE_APP_ID` | the public Firebase web config (`apps/web/.env.local`); the build fails fast if the API key is missing |
| variable | `VITE_FIREBASE_MEASUREMENT_ID`, `VITE_APPCHECK_SITE_KEY`, `VITE_FUNCTIONS_REGION` | optional; region defaults to `us-central1` |
| variable | `DEPLOY_ENABLED` | set to `true` LAST, once everything above exists: it turns on the automatic deploy after each green CI run. Until then the Deploy job is skipped (no failure e-mails). A manual *Run workflow* ignores it, so you can test the setup first. |

The same `VITE_FIREBASE_*` variables also unlock CI's `preview-smoke` job (`e2e/preview-smoke.mjs` against the production bundle on `vite preview`); until they exist the job is skipped.

```bash
gh secret set IP_HASH_SECRET --body "$(grep '^IP_HASH_SECRET=' functions/.env | cut -d= -f2-)"
gh variable set APP_CHECK_ENFORCE --body 0
grep -E '^VITE_' apps/web/.env.local | grep -v '^VITE_USE_EMULATORS=' \
  | while IFS='=' read -r k v; do gh variable set "$k" --body "$v"; done
```

The workflow writes `functions/.env` at deploy time from `IP_HASH_SECRET` and
`APP_CHECK_ENFORCE` (never echoed) and refuses to deploy functions without the
secret, so production never runs with the default hash key. `GEMINI_API_KEY`
lives in Secret Manager (`defineSecret`), not in GitHub.

## The functions lockfile rule

`functions/pnpm-lock.yaml` is a **standalone** lockfile: Cloud Build installs
`functions/` on its own with pnpm, so it cannot use the workspace lockfile at the
root. Whenever `functions/package.json` changes, regenerate it with

```bash
pnpm functions:lockfile
```

(copies `functions/package.json` + the current lockfile to a temp dir, runs
`pnpm install --lockfile-only --ignore-workspace` there, copies the result back).
CI runs the same command and fails with that instruction if the committed file
differs. Never regenerate it inside the workspace — you would get the root
lockfile instead.

## Local requirements

- `pnpm test:rules` (Firestore rules tests) starts the Firestore emulator, which
  needs **Java 21** on your PATH (`brew install --cask temurin@21`). CI installs
  it with `actions/setup-java`.
- Laptop deploys still work, with the same targets the workflow uses:

  ```bash
  pnpm deploy:web         # hosting (app + landing); builds apps/web first
  pnpm deploy:functions   # all functions; use `pnpm exec firebase deploy --only functions:name` for one
  pnpm deploy:rules       # firestore:rules + firestore:indexes
  ```

  They need `firebase login` as a project owner, `functions/.env` with
  `IP_HASH_SECRET`, and `apps/web/.env.local` (see `apps/web/.env.example`).
  Interactive prompts (deleting functions or indexes) are answered by you.
