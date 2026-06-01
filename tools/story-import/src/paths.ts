// Canonical paths for the story-extraction pipeline.

import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
export const PKG_ROOT = resolve(here, '..')
export const REPO_ROOT = resolve(PKG_ROOT, '../..')

export const BOOKS_DIR = resolve(REPO_ROOT, 'docs/books_and_references')

export const WORK_DIR = resolve(PKG_ROOT, 'work')
export const RAW_DIR = resolve(WORK_DIR, 'raw')             // raw text per book
export const CHUNKS_DIR = resolve(WORK_DIR, 'chunks')       // chunked text per book
export const HARVEST_CACHE = resolve(WORK_DIR, 'harvest-cache.json')
export const VOICE_CACHE = resolve(WORK_DIR, 'voice-cache.json')
export const CANDIDATES_JSON = resolve(WORK_DIR, 'candidates.json')
export const VOICED_JSON = resolve(WORK_DIR, 'voiced.json')
export const VALIDATED_JSON = resolve(WORK_DIR, 'validated.json')

export const STORIES_OUT_DIR = resolve(REPO_ROOT, 'data/stories')
export const STORIES_MANIFEST = resolve(STORIES_OUT_DIR, 'manifest.json')
export const STORIES_README = resolve(STORIES_OUT_DIR, 'README.md')
