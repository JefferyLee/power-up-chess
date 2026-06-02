// Lesson registry. Add new lessons here in order.

import type { Lesson } from './lessonTypes'
import { LESSON_1 } from './lesson1'

export const LESSONS: ReadonlyArray<Lesson> = [
  LESSON_1,
  // LESSON_2..5 land in later commits.
]

export function lessonById(id: string): Lesson | null {
  return LESSONS.find((l) => l.id === id) ?? null
}
