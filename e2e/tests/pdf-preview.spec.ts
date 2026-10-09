import { expect, test } from '@playwright/test'

/**
 * The default headless shell has no PDF viewer, so inline PDF previews render blank there. This check runs
 * in full Chromium ("chromium" channel, new headless mode), which has the viewer, and confirms the signed
 * statement URL actually displays inside the preview frame under the production CSP.
 */
test.use({ channel: 'chromium' })

test('PDF statement preview renders inside the app', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/login')
  await page.getByLabel('Email').fill(process.env.E2E_EMAIL ?? 'demo@papertrail.local')
  await page.getByLabel('Password').fill(process.env.E2E_PASSWORD ?? 'paper-trail-demo')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByTestId('outstanding-balance')).toBeVisible()

  await page.goto('/documents?latest=1')
  await page.locator('tr', { hasText: 'v2 of 2' }).first().getByRole('link').click()
  await page.getByRole('button', { name: 'Preview version 2' }).click()
  const frame = page.locator('iframe.preview-frame')
  await expect(frame).toBeVisible()
  await expect.poll(async () => (await frame.getAttribute('src')) ?? '').toContain('X-Amz-Signature')
  await page.waitForTimeout(2500)
  await page.screenshot({ path: '.artifacts/desktop-05-preview-full-chromium.png' })
})
