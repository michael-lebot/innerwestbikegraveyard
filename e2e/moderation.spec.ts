import { expect, type Page, test } from '@playwright/test'
import { addPhoto, chip, expectNoAxeViolations, openFormOnList, resetDb, sql, undoInAdmin } from './support'

test.beforeEach(() => resetDb())
test.use({ reducedMotion: 'reduce' })

// The seeded Lime e-bike on Llewellyn St, Marrickville, blocking the footpath.
const LLEWELLYN_ST = '5eed0000-0000-4000-8000-000000000003'
const ALT = 'Photo of a Lime e-bike reported as blocking footpath'
const HIDDEN = 'Photo hidden while we check it'

const dialog = (page: Page) => page.getByRole('dialog')
const announced = (page: Page) => page.locator('#announcer')
const reportLink = (page: Page) => page.getByRole('button', { name: 'Report this photo' })
const thumbnail = (page: Page) => page.getByRole('img', { name: ALT })
/** Waits for the thumbnail to load: addPhoto's picture is 32 px wide. */
const thumbnailLoaded = (page: Page) =>
  expect.poll(() => thumbnail(page).evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(32)
const reports = () => sql('SELECT reason::text FROM photo_reports')

/** Opens a tag's card on the map from its pin, as the keyboard does, once its photo has loaded. */
async function openCard(page: Page, id: string) {
  await page.goto('/')
  await expect(page.locator('[data-map-ready]')).toBeAttached()
  await page.locator(`[data-tag="${id}"] button`).focus()
  await page.keyboard.press('Enter')
  await thumbnailLoaded(page)
}

/** The admin app beside the public site, as Michael has it (§4.6). */
async function openAdmin(page: Page, path: string) {
  const admin = await page.context().newPage()
  await admin.goto(`http://localhost:3001${path}`)
  return admin
}

/** Reports the photo the page shows, for `reason`. */
async function report(page: Page, reason: string) {
  await reportLink(page).click()
  await chip(page, reason).click()
  await dialog(page).getByRole('button', { name: 'Report', exact: true }).click()
  await expect(dialog(page)).toBeHidden()
}

test('reports a photo from its card: text takes its place at once, the same size, and its URL is 404', async ({
  page,
}) => {
  const photoId = await addPhoto(LLEWELLYN_ST)
  await openCard(page, LLEWELLYN_ST)
  const { width, height } = (await thumbnail(page).boundingBox())!
  expect((await reportLink(page).boundingBox())?.height).toBeGreaterThanOrEqual(44)

  await reportLink(page).click()
  await expect(dialog(page).getByRole('heading', { name: 'Report this photo' })).toBeFocused()
  // Sent with no reason, the form says what is missing and focuses the first reason.
  await dialog(page).getByRole('button', { name: 'Report', exact: true }).click()
  await expect(dialog(page).getByText('Choose why you are reporting it.')).toBeVisible()
  await expect(dialog(page).getByRole('radio', { name: 'Not a share bike' })).toBeFocused()
  await expectNoAxeViolations(page)
  await chip(page, 'Shows a person, face or number plate').click()
  await dialog(page).getByRole('button', { name: 'Report', exact: true }).click()

  await expect(dialog(page)).toBeHidden()
  await expect(announced(page)).toHaveText('Photo reported and hidden')
  // The link has gone with the photo, so the card's heading has the focus.
  await expect(page.locator('#card-heading')).toBeFocused()
  await expect(reportLink(page)).toHaveCount(0)
  // The same size as the thumbnail, so nothing in the card moves.
  expect(await page.getByText(HIDDEN).boundingBox()).toMatchObject({ width, height })
  expect(await reports()).toEqual([{ reason: 'privacy' }])
  for (const path of [`/photo/${photoId}`, `/photo/${photoId}/thumb`])
    expect((await page.request.get(path)).status(), path).toBe(404)
  await expectNoAxeViolations(page)
})

test('Cancel and Esc close the report form and give the focus back to the link, reporting nothing', async ({
  page,
}) => {
  await addPhoto(LLEWELLYN_ST)
  await openCard(page, LLEWELLYN_ST)
  await reportLink(page).click()
  await dialog(page).getByRole('button', { name: 'Cancel' }).first().click()
  await expect(dialog(page)).toBeHidden()
  await expect(reportLink(page)).toBeFocused()
  await reportLink(page).click()
  await expect(dialog(page)).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(dialog(page)).toBeHidden()
  await expect(reportLink(page)).toBeFocused()
  expect(await reports()).toEqual([])
})

test("reports a photo from its tag's page, which then gives the focus to its heading", async ({ page }) => {
  await addPhoto(LLEWELLYN_ST)
  await page.goto(`/tag/${LLEWELLYN_ST}`)
  await report(page, 'Not a share bike')
  await expect(page.getByText(HIDDEN)).toBeVisible()
  await expect(page.getByRole('heading', { level: 1 })).toBeFocused()
  await expect(announced(page)).toHaveText('Photo reported and hidden')
  // Drawn again from the server, the page shows no photo: its tag no longer has one to show.
  await page.reload()
  await expect(thumbnail(page)).toHaveCount(0)
  await expect(reportLink(page)).toHaveCount(0)
  await expectNoAxeViolations(page)
})

test('a photo Michael restores shows again, and a later report reaches him but leaves it up', async ({ page }) => {
  const photoId = await addPhoto(LLEWELLYN_ST)
  await page.goto(`/tag/${LLEWELLYN_ST}`)
  await report(page, 'Offensive or inappropriate')
  await expect(page.getByText(HIDDEN)).toBeVisible()
  expect((await page.request.get(`/photo/${photoId}`)).status()).toBe(404)

  const admin = await openAdmin(page, '/reports')
  await admin.getByRole('button', { name: 'Restore' }).click()
  await expect(admin.getByText('No reported photos.')).toBeVisible()
  await page.reload()
  await thumbnailLoaded(page)

  await report(page, 'Other')
  await expect(announced(page)).toHaveText('Photo reported. It was checked before, so it stays up.')
  await expect(reportLink(page)).toBeFocused()
  await expect(thumbnail(page)).toBeVisible()
  expect((await page.request.get(`/photo/${photoId}`)).status()).toBe(200)
  await admin.reload()
  await expect(admin.getByText('Shown: you restored it before, so reports no longer hide it')).toBeVisible()
  await admin.close()
})

test('a photo restored after it was reported shows again on a page left and come back to, with no reload', async ({
  page,
}) => {
  await addPhoto(LLEWELLYN_ST)
  await page.goto(`/tag/${LLEWELLYN_ST}`)
  await report(page, 'Not a share bike')
  await expect(page.getByText(HIDDEN)).toBeVisible()
  const admin = await openAdmin(page, '/reports')
  await admin.getByRole('button', { name: 'Restore' }).click()
  await expect(admin.getByText('No reported photos.')).toBeVisible()
  await admin.close()

  // Away and back inside the site, so the page's code stays loaded.
  await page.getByRole('link', { name: 'Terms' }).click()
  await expect(page).toHaveURL('/terms')
  await page.goBack()
  await thumbnailLoaded(page)
  await expect(reportLink(page)).toBeVisible()
})

test('§5.5 photo and tag together: report → remove → admin undo leaves the photo hidden', async ({ page }) => {
  const photoId = await addPhoto(LLEWELLYN_ST)
  await page.goto(`/tag/${LLEWELLYN_ST}`)
  await report(page, 'Not a share bike')
  await page.getByRole('button', { name: 'Removed' }).click()
  await expect(page.getByText('Removed.')).toBeVisible()
  await undoInAdmin(page, LLEWELLYN_ST)
  await page.goto(`/tag/${LLEWELLYN_ST}`)
  // Live again, with no photo to show.
  await expect(page.getByRole('heading', { level: 1, name: 'Lime e-bike', exact: true })).toBeVisible()
  await expect(thumbnail(page)).toHaveCount(0)
  expect((await page.request.get(`/photo/${photoId}`)).status()).toBe(404)
})

test('Michael pauses photo uploads, and the form says photos are off until he resumes them', async ({ page }) => {
  const admin = await openAdmin(page, '/tags')
  await admin.getByRole('button', { name: 'Pause uploads' }).click()
  await openFormOnList(page)
  await expect(dialog(page).getByText('Photos are switched off for now.')).toBeVisible()
  await expect(dialog(page).getByLabel('Add a photo (optional)')).toHaveCount(0)

  await admin.getByRole('button', { name: 'Resume uploads' }).click()
  await expect(admin.getByRole('button', { name: 'Pause uploads' })).toBeVisible()
  await admin.close()
  await openFormOnList(page)
  await expect(dialog(page).getByLabel('Add a photo (optional)')).toBeAttached()
})

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false })

  test('says reporting a photo needs it, in place of a link that would do nothing', async ({ page }) => {
    await addPhoto(LLEWELLYN_ST)
    await page.goto(`/tag/${LLEWELLYN_ST}`)
    await expect(thumbnail(page)).toBeVisible()
    await expect(reportLink(page)).toHaveCount(0)
    await expect(page.getByText('Turn on JavaScript to report this photo.')).toBeVisible()
  })
})
