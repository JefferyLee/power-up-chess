// Per-lesson completion state — kept in localStorage so the LearnRoute
// list can show checkmarks for finished lessons.
//
// The 50-pt all-lessons-done reward is server-authoritative
// (guests/{name}.learnedBasicsAt). This is only the per-lesson UX
// hint — a kid clearing localStorage just loses the checkmarks.

const STORAGE_KEY = 'puc:learn:done:v1'

function readSet(): Set<string> {
  if (typeof window === 'undefined') return new Set()
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return new Set()
    const arr = JSON.parse(raw) as unknown
    return Array.isArray(arr) ? new Set(arr.filter((x) => typeof x === 'string')) : new Set()
  } catch {
    return new Set()
  }
}

function writeSet(set: Set<string>): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(set)))
  } catch {
    // Quota / privacy mode — ignore.
  }
}

export function markLessonDone(lessonId: string): void {
  const set = readSet()
  set.add(lessonId)
  writeSet(set)
}

export function isLessonDone(lessonId: string): boolean {
  return readSet().has(lessonId)
}

export function lessonsDone(): ReadonlyArray<string> {
  return Array.from(readSet())
}
