// Canonical paths for the pipeline. Resolved relative to this package.

import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
export const PKG_ROOT = resolve(here, '..')
export const REPO_ROOT = resolve(PKG_ROOT, '../..')

export const WORK_DIR = resolve(PKG_ROOT, 'work')
export const RAW_ZST = resolve(WORK_DIR, 'lichess_db_puzzle.csv.zst')
export const FILTERED_JSONL = resolve(WORK_DIR, 'filtered.jsonl')
export const SELECTION_JSON = resolve(WORK_DIR, 'selection.json')
export const EXPLAIN_CACHE = resolve(WORK_DIR, 'explain-cache.json')
export const EXPLAINED_JSON = resolve(WORK_DIR, 'explained.json')

export const OUTPUT_DIR = resolve(REPO_ROOT, 'data/puzzles')
export const LICHESS_OUT = resolve(OUTPUT_DIR, 'lichess.json')
export const LICHESS_README = resolve(OUTPUT_DIR, 'LICHESS.md')

export const DUMP_URL = 'https://database.lichess.org/lichess_db_puzzle.csv.zst'
