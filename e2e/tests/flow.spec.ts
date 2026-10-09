import { readFile } from 'node:fs/promises'

import { expect, test, type Page } from '@playwright/test'

/**
 * The core journey, end to end through the real stack:
 * log in -> create a bill -> upload two statement versions -> retrieve the first version ->
 * mark the bill paid -> confirm the outstanding balance changes.
 */
const EMAIL = process.env.E2E_EMAIL ?? 'demo@papertrail.local'
const PASSWORD = process.env.E2E_PASSWORD ?? 'paper-trail-demo'

function statement(label: string): Buffer {
  return Buffer.from(`%PDF-1.4\n% ${label}\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n`, 'latin1')
}

/** Reads the hero figure as cents (integer arithmetic, no float drift). */
async function outstandingCents(page: Page): Promise<number> {
  const text = await page.getByTestId('outstanding-balance').locator('.sr-only').textContent()
  const digits = (text ?? '').replace(/[^0-9]/g, '')
  if (!digits) throw new Error(`Could not read the outstanding balance from "${text}"`)
  return Number(digits)
}

test('bill lifecycle: create, two statement versions, retrieve v1, pay, balance moves', async ({ page }) => {
  const consoleErrors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text())
  })

  // 1. Log in
  await page.goto('/login')
  await page.getByLabel('Email').fill(EMAIL)
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByTestId('outstanding-balance')).toBeVisible()
  const before = await outstandingCents(page)

  // 2. Create a bill
  const title = `Water, E2E ${Date.now()}`
  await page.getByRole('link', { name: 'Add bill' }).first().click()
  await expect(page.getByRole('heading', { level: 1, name: 'Add a bill' })).toBeVisible()
  await page.getByLabel('Title').fill(title)
  await page.getByLabel('Provider').selectOption({ label: 'Riverbend Water' })
  await page.getByLabel('Category').selectOption({ label: 'Water' })
  await page.getByLabel('Amount').fill('123.45')
  await page.getByRole('button', { name: 'Add bill' }).click()
  await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible()
  const billUrl = page.url()

  // 3. Upload two statement versions
  const first = statement('first statement')
  const second = statement('corrected statement')
  const input = page.getByTestId('statement-input')
  await input.setInputFiles({ name: 'water-statement.pdf', mimeType: 'application/pdf', buffer: first })
  await expect(page.getByText('Version 1', { exact: true })).toBeVisible()
  await input.setInputFiles({ name: 'water-statement-corrected.pdf', mimeType: 'application/pdf', buffer: second })
  await expect(page.getByText('Version 2', { exact: true })).toBeVisible()
  await expect(page.getByText('2 versions kept, newest first.', { exact: false })).toBeVisible()

  // 4. Retrieve the first version through its short-lived signed URL and check the bytes
  const downloadStarted = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download version 1' }).click()
  const download = await downloadStarted
  expect(download.suggestedFilename()).toBe('water-statement.pdf')
  const downloadedPath = await download.path()
  expect(Buffer.compare(await readFile(downloadedPath), first)).toBe(0)

  // The overview balance now includes the new bill
  await page.getByRole('link', { name: 'Overview' }).first().click()
  await expect(page.getByTestId('outstanding-balance')).toBeVisible()
  await expect.poll(() => outstandingCents(page)).toBe(before + 12345)

  // 5. Mark the bill paid
  await page.goto(billUrl)
  await page.getByRole('button', { name: 'Mark paid' }).click()
  const dialog = page.getByRole('dialog', { name: 'Mark as paid' })
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: 'Mark paid' }).click()
  await expect(page.locator('.bill-status-line').getByText('Paid', { exact: true })).toBeVisible()

  // 6. The outstanding balance drops by exactly the bill amount
  await page.getByRole('link', { name: 'Overview' }).first().click()
  await expect.poll(() => outstandingCents(page)).toBe(before)

  // Clean up: delete the bill (its stored statements go with it) so reruns leave the household as found.
  await page.goto(billUrl)
  await page.getByRole('button', { name: 'Delete' }).click()
  const confirm = page.getByRole('dialog', { name: 'Delete this bill?' })
  await expect(confirm).toContainText('2 statement versions')
  await confirm.getByRole('button', { name: 'Delete bill' }).click()
  await expect(page).toHaveURL(/\/bills$/)
  await page.goto(billUrl)
  await expect(page.getByRole('heading', { name: 'Bill not found' })).toBeVisible()

  expect(consoleErrors.filter((error) => !error.includes('404')),
    `console errors:\n${consoleErrors.join('\n')}`).toEqual([])
})
