// Lesson registry. Add new lessons here in order.

import type { Lesson } from './lessonTypes'
import { LESSON_1 } from './lesson1'
import { LESSON_2 } from './lesson2'
import { LESSON_3 } from './lesson3'
import { LESSON_4 } from './lesson4'
import { LESSON_5 } from './lesson5'

export const LESSONS: ReadonlyArray<Lesson> = [
  LESSON_1,
  LESSON_2,
  LESSON_3,
  LESSON_4,
  LESSON_5,
]

export function lessonById(id: string): Lesson | null {
  return LESSONS.find((l) => l.id === id) ?? null
}
