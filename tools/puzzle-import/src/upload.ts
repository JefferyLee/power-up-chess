// Stage 6 — upload data/puzzles/lichess.json into Firestore at puzzles/{id}.
//
// Uses firebase-admin's Application Default Credentials. Before running:
//
//   gcloud auth application-default login
//   gcloud config set project power-up-chess-dev    # or your target project
//
// or set GOOGLE_APPLICATION_CREDENTIALS to a service-account key file.
// Project id can also be overridden via FIREBASE_PROJECT_ID.

import { readFile } from 'node:fs/promises'
import { applicationDefault, initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { LICHESS_OUT } from './paths.js'
import type { OutPuzzle } from './types.js'

const BATCH_SIZE = 400  // Firestore's hard cap is 500 writes/batch; leave headroom.

export async function runUpload(): Promise<void> {
  const projectId =
    process.env.FIREBASE_PROJECT_ID ??
    process.env.GCLOUD_PROJECT ??
    'power-up-chess-dev'

  console.log(`Uploading to Firestore project: ${projectId}`)
  initializeApp({ credential: applicationDefault(), projectId })
  const db = getFirestore()

  const puzzles: OutPuzzle[] = JSON.parse(await readFile(LICHESS_OUT, 'utf8'))
  console.log(`Loaded ${puzzles.length} puzzles from ${LICHESS_OUT}`)

  let written = 0
  for (let i = 0; i < puzzles.length; i += BATCH_SIZE) {
    const slice = puzzles.slice(i, i + BATCH_SIZE)
    const batch = db.batch()
    for (const p of slice) {
      batch.set(db.doc(`puzzles/${p.id}`), p)
    }
    await batch.commit()
    written += slice.length
    process.stdout.write(`  ${written}/${puzzles.length}\r`)
  }
  console.log(`\nWrote ${written} puzzle docs to Firestore.`)
}
