// Gate + privacy smoke (Phase 3.6). Read-only against the live dev site.

import { test, expect } from '@playwright/test'

test('castle gate renders and the wicket opens on knock', async ({ page }) => {
  await page.goto('/')
  const door = page.getByRole('button', { name: /knock on the castle gate/i })
  await expect(door).toBeVisible({ timeout: 15_000 })
  await door.click()
  // The wicket dialog asks for the visitor's name.
  await expect(page.getByPlaceholder('e.g. Ada')).toBeVisible({ timeout: 15_000 })
})

test('privacy note is reachable before sign-in', async ({ page }) => {
  await page.goto('/privacy')
  await expect(page.getByRole('heading', { name: /handles your data/i })).toBeVisible()
  await expect(page.getByText(/private-link only/i)).toBeVisible()
})

// TODO(3.6 full path): bypass/table-test identity → Hall → Daily Five one
// puzzle → local game one move → resign. Blocked on a disposable-identity
// strategy so weekly CI runs don't accumulate production guests.
