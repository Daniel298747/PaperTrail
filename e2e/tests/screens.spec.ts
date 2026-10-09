import { mkdir } from 'node:fs/promises'

import { expect, test, type Page } from '@playwright/test'

/**
 * Visual pass: signs in as the demo household and captures key screens at desktop and phone widths into
 * e2e/.artifacts/ for review. Run after seeding demo data.
 */
const OUT = '.artifacts'
const EMAIL = process.env.E2E_EMAIL ?? 'demo@papertrail.local'
const PASSWORD = process.env.E2E_PASSWORD ?? 'paper-trail-demo'

async function signIn(page: Page) {
  await page.goto('/login')
  await page.getByLabel('Email').fill(EMAIL)
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByTestId('outstanding-balance')).toBeVisible()
}

async function settle(page: Page) {
  await page.waitForLoadState('networkidle')
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(250)
}

async function shot(page: Page, name: string) {
  await settle(page)
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true })
}

for (const viewport of [
  { label: 'desktop', width: 1440, height: 900 },
  { label: 'mobile', width: 390, height: 844 },
]) {
  test(`screens at ${viewport.label} width`, async ({ page }) => {
    await mkdir(OUT, { recursive: true })
    await page.setViewportSize({ width: viewport.width, height: viewport.height })
    const prefix = viewport.label

    await page.goto('/login')
    await shot(page, `${prefix}-01-login`)

    await signIn(page)
    await shot(page, `${prefix}-02-overview`)

    await page.goto('/bills')
    await expect(page.getByRole('heading', { level: 1, name: 'Bills' })).toBeVisible()
    await shot(page, `${prefix}-03-bills`)

    await page.goto('/documents?latest=1')
    await page.locator('tr', { hasText: 'v2 of 2' }).first().getByRole('link').click()
    await expect(page.getByText('Version 2', { exact: true })).toBeVisible()
    await shot(page, `${prefix}-04-bill-detail`)

    await page.getByRole('button', { name: 'Preview version 2' }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await page.waitForTimeout(800)
    await page.screenshot({ path: `${OUT}/${prefix}-05-preview.png` })
    await page.keyboard.press('Escape')

    await page.goto('/bills/new')
    await expect(page.getByRole('heading', { level: 1, name: 'Add a bill' })).toBeVisible()
    await page.getByRole('button', { name: 'Add bill' }).last().click()
    await shot(page, `${prefix}-06-bill-form-validation`)

    await page.goto('/recurring')
    await shot(page, `${prefix}-07-recurring`)

    await page.getByRole('link', { name: 'Monthly rent' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Monthly rent' })).toBeVisible()
    await shot(page, `${prefix}-08-recurring-detail`)

    await page.getByRole('link', { name: 'Edit' }).click()
    await expect(page.getByRole('heading', { name: 'Next due dates' })).toBeVisible()
    await shot(page, `${prefix}-09-recurring-form`)

    await page.goto('/documents')
    await shot(page, `${prefix}-10-documents`)

    await page.goto('/analytics')
    await expect(page.getByRole('heading', { name: 'Billed and paid by month' })).toBeVisible()
    await shot(page, `${prefix}-11-analytics`)

    await page.goto('/providers')
    await shot(page, `${prefix}-12-providers`)

    await page.getByRole('button', { name: 'Delete Electricity' }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await page.waitForTimeout(300)
    await page.screenshot({ path: `${OUT}/${prefix}-13-delete-reassign.png` })
    await page.keyboard.press('Escape')

    await page.goto('/notifications')
    await shot(page, `${prefix}-14-notifications`)

    await page.goto('/settings')
    await shot(page, `${prefix}-15-settings`)

    if (viewport.label === 'mobile') {
      await page.goto('/')
      await page.getByRole('button', { name: 'Menu' }).click()
      await page.waitForTimeout(300)
      await page.screenshot({ path: `${OUT}/${prefix}-16-menu.png` })
    }
  })
}
