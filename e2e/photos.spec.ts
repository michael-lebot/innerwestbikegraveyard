import { expect, type Page, test } from '@playwright/test'
import { chip, expectNoAxeViolations, newTagId, openFormOnList, resetDb, sql } from './support'

test.beforeEach(() => resetDb())
test.use({ reducedMotion: 'reduce' })

const dialog = (page: Page) => page.getByRole('dialog')
const announced = (page: Page) => page.locator('#announcer')
const FAILED = "Tag added, but the photo didn't upload."
const ALT = 'Photo of a Lime e-bike reported as damaged'

/** A 2000 × 1500 JPEG, as a phone's camera might give, drawn by the browser itself. */
async function cameraPhoto(page: Page) {
  const url = await page.evaluate(() => {
    const canvas = Object.assign(document.createElement('canvas'), { width: 2000, height: 1500 })
    const context = canvas.getContext('2d')!
    context.fillStyle = '#8ec5ff'
    context.fillRect(0, 0, 2000, 800)
    context.fillStyle = '#5cbf4a'
    context.fillRect(0, 800, 2000, 700)
    return canvas.toDataURL('image/jpeg', 0.9)
  })
  return { name: 'bike.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(url.split(',')[1]!, 'base64') }
}

const photoInput = (page: Page) => dialog(page).getByLabel('Add a photo (optional)')

/** The form filled in for a Lime e-bike, damaged, with a photo chosen. */
async function fillForm(page: Page) {
  await openFormOnList(page)
  await chip(page, 'Lime').click()
  await chip(page, 'Damaged').click()
  await photoInput(page).setInputFiles(await cameraPhoto(page))
  await expect(dialog(page).getByRole('img', { name: 'Your photo' })).toBeVisible()
}

/** Adds the tag with its photo, and gives the ids of both. */
async function tagWithPhoto(page: Page) {
  await fillForm(page)
  await dialog(page).getByRole('button', { name: 'Add to the map' }).click()
  await expect(announced(page)).toHaveText('Tag added')
  const id = await newTagId()
  const [photo] = await sql(`SELECT id FROM photos WHERE tag_id = '${id}'`)
  return { id, photoId: photo.id as string }
}

const photoCount = async () => (await sql('SELECT count(*)::int AS count FROM photos'))[0].count

test('adds a photo with a new tag, and its page shows the thumbnail, which opens the full size', async ({ page }) => {
  await openFormOnList(page)
  await expect(dialog(page).getByText('Photos are public. Leave out people, faces and number plates.')).toBeVisible()
  // A file the browser can't read as a picture is turned away there, and said.
  await photoInput(page).setInputFiles({ name: 'notes.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('notes') })
  await expect(dialog(page).getByText("That file isn't a photo we can use.")).toBeVisible()
  await expect(announced(page)).toHaveText("That file isn't a photo we can use.")

  await chip(page, 'Lime').click()
  await chip(page, 'Damaged').click()
  const photo = await cameraPhoto(page)
  await photoInput(page).setInputFiles(photo)
  await expect(dialog(page).getByRole('img', { name: 'Your photo' })).toBeVisible()
  await expect(dialog(page).getByText("That file isn't a photo we can use.")).toBeHidden()
  // Removed, the photo gives the focus back to the input, and the same one can be chosen again.
  await dialog(page).getByRole('button', { name: 'Remove photo' }).click()
  await expect(dialog(page).getByRole('img', { name: 'Your photo' })).toHaveCount(0)
  await expect(photoInput(page)).toBeFocused()
  await photoInput(page).setInputFiles(photo)
  await expect(dialog(page).getByRole('img', { name: 'Your photo' })).toBeVisible()
  await expectNoAxeViolations(page)
  await dialog(page).getByRole('button', { name: 'Add to the map' }).click()
  await expect(announced(page)).toHaveText('Tag added')
  const id = await newTagId()
  const [{ id: photoId }] = await sql(`SELECT id FROM photos WHERE tag_id = '${id}'`)

  await page.goto(`/tag/${id}`)
  const thumbnail = page.getByRole('img', { name: ALT })
  // Its box is fixed before it loads, so nothing moves when it does.
  expect(await thumbnail.boundingBox()).toMatchObject({ width: 96, height: 72 })
  await expect.poll(() => thumbnail.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(320)
  await expectNoAxeViolations(page)

  const [full] = await Promise.all([page.waitForEvent('popup'), thumbnail.click()])
  await expect(full).toHaveURL(`/photo/${photoId}`)
  const size = await full.evaluate(async () => {
    const image = Object.assign(new Image(), { src: location.href })
    await image.decode()
    return [image.naturalWidth, image.naturalHeight]
  })
  expect(size).toEqual([1600, 1200])

  // At 320 px with the largest text, the details go under the thumbnail: nothing to scroll sideways (1.4.10).
  await page.setViewportSize({ width: 320, height: 640 })
  await page.addStyleTag({ content: ':root { font-size: 200% }' })
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320)
})

test('at the largest text on an SE-sized phone, the chosen photo and Remove photo stay inside the form', async ({
  page,
  isMobile,
}) => {
  test.skip(!isMobile, 'the phone projects')
  await page.setViewportSize({ width: 375, height: 667 })
  await openFormOnList(page)
  await page.addStyleTag({ content: ':root { font-size: 200% }' })
  await photoInput(page).setInputFiles(await cameraPhoto(page))
  await expect(dialog(page).getByRole('img', { name: 'Your photo' })).toBeVisible()
  // Nothing sideways to scroll to (1.4.10): Remove photo goes under the photo when both don't fit.
  expect(await dialog(page).evaluate((form) => form.scrollWidth - form.clientWidth)).toBeLessThanOrEqual(0)
  const remove = (await dialog(page).getByRole('button', { name: 'Remove photo' }).boundingBox())!
  expect(remove.x + remove.width).toBeLessThanOrEqual(375)
})

test('when the photo fails, the tag stays added, and Try again sends only the photo, to the same tag', async ({
  page,
}) => {
  await fillForm(page)
  await page.route('**/api/tags/*/photo', (route) => route.abort())
  await dialog(page).getByRole('button', { name: 'Add to the map' }).click()
  await expect(dialog(page).getByText(FAILED)).toBeFocused()
  await expect(announced(page)).toContainText(FAILED)
  await expect(dialog(page).getByRole('button', { name: 'Skip' })).toBeVisible()
  await expectNoAxeViolations(page)
  const id = await newTagId()
  expect(await photoCount()).toBe(0)

  await page.unroute('**/api/tags/*/photo')
  const posted = page.waitForRequest((request) => request.url().endsWith('/photo'))
  await dialog(page).getByRole('button', { name: 'Try again' }).click()
  expect((await posted).url()).toBe(`http://localhost:3000/api/tags/${id}/photo`)
  await expect(announced(page)).toHaveText('Photo added')
  await expect(dialog(page)).toBeHidden()
  expect(await sql(`SELECT tag_id::text FROM photos`)).toEqual([{ tag_id: id }])
  expect(await newTagId()).toBe(id)
})

test('Skip leaves the tag added without its photo', async ({ page }) => {
  await fillForm(page)
  await page.route('**/api/tags/*/photo', (route) => route.abort())
  await dialog(page).getByRole('button', { name: 'Add to the map' }).click()
  await dialog(page).getByRole('button', { name: 'Skip' }).click()
  await expect(dialog(page)).toBeHidden()
  await expect(page.getByRole('heading', { name: '15 bikes in the graveyard' })).toBeVisible()
  expect(await photoCount()).toBe(0)
})

test('a refusal that would come again, as from uploads paused after the form opened, offers Skip alone', async ({
  page,
}) => {
  await fillForm(page)
  await sql('UPDATE site_state SET uploads_paused_at = now()')
  await dialog(page).getByRole('button', { name: 'Add to the map' }).click()
  await expect(dialog(page).getByText(FAILED)).toBeFocused()
  await expect(dialog(page).getByText('Photos are switched off for now. Your tag can still be added.')).toBeVisible()
  await expect(dialog(page).getByRole('button', { name: 'Try again' })).toHaveCount(0)
  await dialog(page).getByRole('button', { name: 'Skip' }).click()
  await expect(dialog(page)).toBeHidden()
  expect(await photoCount()).toBe(0)
})

test('a card shows its photo, and passes axe', async ({ page }) => {
  const { id } = await tagWithPhoto(page)
  await page.goto('/')
  await expect(page.locator('[data-map-ready]')).toBeAttached()
  await page.locator(`[data-tag="${id}"] button`).focus()
  await page.keyboard.press('Enter')
  const thumbnail = page.getByRole('img', { name: ALT })
  await expect.poll(() => thumbnail.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(320)
  await expectNoAxeViolations(page)
})

test('while uploads are paused, the form says so in place of the photo input, and passes axe', async ({ page }) => {
  await sql('UPDATE site_state SET uploads_paused_at = now()')
  await openFormOnList(page)
  await expect(dialog(page).getByText('Photos are switched off for now.')).toBeVisible()
  await expect(photoInput(page)).toHaveCount(0)
  await expectNoAxeViolations(page)
})

test('a card opened after its photo was hidden says so in its place, never showing a broken image', async ({
  page,
}) => {
  const { id, photoId } = await tagWithPhoto(page)
  await page.goto('/')
  await expect(page.locator('[data-map-ready]')).toBeAttached()
  // Hidden after the map had the live tags, so the card still asks for it.
  await sql(`UPDATE photos SET status = 'hidden' WHERE id = '${photoId}'`)
  await page.locator(`[data-tag="${id}"] button`).focus()
  await page.keyboard.press('Enter')
  await expect(page.getByText('Photo no longer shown')).toBeVisible()
  await expect(page.getByRole('img', { name: ALT })).toHaveCount(0)
  await expectNoAxeViolations(page)
})

test('§5.5 photo and tag together: the photo stops loading once its tag is Removed; the admin app shows it until Take down deletes it', async ({
  page,
}) => {
  const { id, photoId } = await tagWithPhoto(page)
  expect((await page.request.get(`/photo/${photoId}/thumb`)).status()).toBe(200)
  await page.goto(`/tag/${id}`)
  await page.getByRole('button', { name: 'Removed' }).click()
  await expect(page.getByText('Removed.')).toBeVisible()
  for (const path of [`/photo/${photoId}`, `/photo/${photoId}/thumb`])
    expect((await page.request.get(path)).status(), path).toBe(404)

  const admin = await page.context().newPage()
  await admin.goto(`http://localhost:3001/tags/${id}`)
  await expect(admin.getByText('Shown while the tag is live')).toBeVisible()
  const photo = admin.getByRole('img', { name: ALT })
  await expect.poll(() => photo.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(1600)
  const adminPhoto = await admin.request.get(`http://localhost:3001/photo/${photoId}`)
  expect(adminPhoto.headers()['cache-control']).toBe('private, no-store')

  await admin.getByRole('link', { name: 'Take down…' }).click()
  await admin.getByRole('button', { name: 'Take down' }).click()
  await expect(admin.getByText('Taken down. It is off the map for good.')).toBeVisible()
  await expect(admin.getByText('Deleted', { exact: true })).toBeVisible()
  await expect(photo).toHaveCount(0)
  expect((await admin.request.get(`http://localhost:3001/photo/${photoId}`)).status()).toBe(404)
  await admin.close()
})
