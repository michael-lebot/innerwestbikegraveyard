import { expect, type Page, test } from '@playwright/test'
import { bar, chip, expectNoAxeViolations, mapBox, newTagId, resetDb, sql, startTagging, tap } from './support'

test.beforeEach(() => resetDb())
test.use({ reducedMotion: 'reduce' })

const dialog = (page: Page) => page.getByRole('dialog')
const announced = (page: Page) => page.locator('#announcer')
const camera = (page: Page) => page.getByLabel('Take a photo of a bike')
const GREEN = 'rgb(29, 107, 42)'
const FINDING = 'Got your photo. Finding where you are…'
// Number 12 Llewellyn St, Marrickville, 110 m from the live tag on that street.
const LLEWELLYN_ST = { latitude: -33.90512, longitude: 151.17288 }
// About 10 m from the live tag on Llewellyn St, nearest the lane behind it, Juliett St.
const BESIDE_LIVE_TAG = { latitude: -33.90458, longitude: 151.17193 }
// A rough position is used only once the page has listened for 10 seconds for a better one (§4.1).
const ROUGH = { timeout: 15_000 }

/** A small JPEG drawn by the browser itself, as the camera would hand over. */
async function cameraPhoto(page: Page) {
  const url = await page.evaluate(() => {
    const canvas = Object.assign(document.createElement('canvas'), { width: 400, height: 300 })
    const context = canvas.getContext('2d')!
    context.fillStyle = '#5cbf4a'
    context.fillRect(0, 0, 400, 300)
    return canvas.toDataURL('image/jpeg', 0.9)
  })
  return { name: 'bike.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(url.split(',')[1]!, 'base64') }
}

/** Opens `path` and takes a photo there. */
async function takePhoto(page: Page, path: '/' | '/list' = '/') {
  await page.goto(path)
  if (path === '/') await expect(page.locator('[data-map-ready]')).toBeAttached()
  await camera(page).setInputFiles(await cameraPhoto(page))
}

/** The form with the photo attached, at `street`: added as an Ario, damaged, and the new tag's id. */
async function addWithPhoto(page: Page, street: string) {
  await expect(dialog(page).getByRole('heading', { name: 'Tag a dumped bike' })).toBeFocused()
  await expect(dialog(page)).toContainText(`Pin on ${street}`)
  await expect(dialog(page).getByRole('img', { name: 'Your photo' })).toBeVisible()
  await chip(page, 'Ario').click()
  await chip(page, 'Damaged').click()
  await dialog(page).getByRole('button', { name: 'Add to the map' }).click()
  await expect(announced(page)).toHaveText('Tag added')
  const id = await newTagId()
  expect(await sql(`SELECT count(*)::int AS count FROM photos WHERE tag_id = '${id}'`)).toEqual([{ count: 1 }])
  return id
}

/** A tap away from the live tags, and the bar's line for it. */
async function placeSpot(page: Page) {
  const map = await mapBox(page)
  await tap(page, true, { x: map.x + map.width / 2 - 120, y: map.y + map.height / 2 + 120 })
  await expect(bar(page)).toHaveText(/^Pin on /)
  return (await bar(page).textContent())!
}

test('shows on phones only, as the green button, and not while uploads are paused', async ({ page, isMobile }) => {
  for (const path of ['/', '/list']) {
    await page.goto(path)
    await expect(camera(page)).toHaveAttribute('capture', 'environment')
    await expect(camera(page)).toHaveAttribute('accept', 'image/jpeg,image/png,image/webp')
    const label = page.locator('label', { hasText: 'Take a photo of a bike' })
    await expect(label).toBeVisible({ visible: isMobile })
    if (isMobile) await expect(label).toHaveCSS('background-color', GREEN)
    // Beside the camera button, the other way to tag says how it differs.
    const other = page.getByRole('button', {
      name: isMobile ? 'Tag without a photo' : 'Tag a dumped bike',
      exact: true,
    })
    await expect(other).toHaveCSS('background-color', isMobile ? 'rgba(0, 0, 0, 0)' : GREEN)
    const box = (await other.boundingBox())!
    // On /list the two sit side by side on a 390 px phone (§4.3).
    if (isMobile && path === '/list') expect((await label.boundingBox())!.y).toBe(box.y)
    // On the map screen, Map and List line up with the button on their row: the same top and the same height.
    if (isMobile && path === '/') {
      const map = (await page.getByRole('link', { name: 'Map', exact: true }).boundingBox())!
      expect([map.y, map.height]).toEqual([box.y, box.height])
    }
    await expectNoAxeViolations(page)
  }

  await sql('UPDATE site_state SET uploads_paused_at = now()')
  for (const path of ['/', '/list']) {
    await page.goto(path)
    await expect(camera(page)).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Tag a dumped bike' })).toHaveCSS('background-color', GREEN)
  }
})

test.describe('on a phone', () => {
  test.beforeEach(({ isMobile }) => test.skip(!isMobile, 'the phone projects'))

  test('a file that is not a photo is said under the button, and starts nothing', async ({ page }) => {
    await page.goto('/list')
    await camera(page).setInputFiles({ name: 'notes.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('notes') })
    await expect(page.getByText("That file isn't a photo we can use.")).toBeVisible()
    await expect(announced(page)).toHaveText("That file isn't a photo we can use.")
    await expect(page.getByRole('heading', { name: 'Tag a dumped bike' })).toHaveCount(0)
  })

  test.describe('with an accurate position', () => {
    test.use({ permissions: ['geolocation'], geolocation: { ...LLEWELLYN_ST, accuracy: 15 } })

    for (const path of ['/', '/list'] as const)
      test(`on ${path}, opens the form with the street and the photo, and adds the tag there with its photo`, async ({
        page,
      }) => {
        await takePhoto(page, path)
        const id = await addWithPhoto(page, 'Llewellyn St, Marrickville')
        expect(await sql(`SELECT lat::float, lng::float FROM tags WHERE id = '${id}'`)).toEqual([
          { lat: LLEWELLYN_ST.latitude, lng: LLEWELLYN_ST.longitude },
        ])
      })
  })

  test.describe('beside a live tag', () => {
    test.use({ permissions: ['geolocation'], geolocation: { ...BESIDE_LIVE_TAG, accuracy: 10 } })

    test('asks "Is it one of these?" first, and "No" reaches the form with the photo', async ({ page }) => {
      await takePhoto(page)
      await expect(dialog(page).getByRole('heading', { name: 'Is it one of these?' })).toBeFocused()
      await page.getByRole('button', { name: "No, it's another bike" }).click()
      await addWithPhoto(page, 'Juliett St, Marrickville')
    })
  })

  test.describe('with a rough position', () => {
    test.use({ permissions: ['geolocation'], geolocation: { ...LLEWELLYN_ST, accuracy: 80 } })

    test('says so after "Got your photo.", and a tap and Use this spot reach the form with the photo', async ({
      page,
    }) => {
      test.slow()
      await takePhoto(page)
      await expect(bar(page)).toHaveText(FINDING)
      const rough =
        'Got your photo. Your location is only accurate to about 80 m. Tap where the bike is, or choose a street.'
      await expect(bar(page)).toHaveText(rough, ROUGH)
      await expect(announced(page)).toHaveText(rough)
      // The rough position centred the map, where a tap places the pin.
      const map = await mapBox(page)
      await tap(page, true, { x: map.x + map.width / 2, y: map.y + map.height / 2 })
      await expect(bar(page)).toHaveText('Pin on Llewellyn St, Marrickville')
      await page.getByRole('button', { name: 'Use this spot' }).click()
      await addWithPhoto(page, 'Llewellyn St, Marrickville')
    })
  })

  test.describe('refused', () => {
    test.use({ permissions: [] })

    test('says so after "Got your photo.", and a tap and Use this spot reach the form with the photo', async ({
      page,
    }) => {
      await takePhoto(page)
      const refused = "Got your photo. Your browser didn't share your location. Tap the map or choose a street."
      await expect(bar(page)).toHaveText(refused)
      await expect(announced(page)).toHaveText(refused)
      const street = (await placeSpot(page)).replace('Pin on ', '')
      await page.getByRole('button', { name: 'Use this spot' }).click()
      await addWithPhoto(page, street)
    })
  })

  test.describe('when the location arrives late', () => {
    // The location arrives only when the test says, and the page says when it stops listening.
    test.beforeEach(({ page }) =>
      page.addInitScript(() => {
        const late = window as unknown as { arrive: () => void; stopped: boolean }
        navigator.geolocation.watchPosition = (success) => {
          late.stopped = false
          late.arrive = () =>
            success({ coords: { latitude: -33.90512, longitude: 151.17288, accuracy: 15 } } as GeolocationPosition)
          return 1
        }
        navigator.geolocation.clearWatch = () => (late.stopped = true)
      }),
    )

    /** The page has stopped listening, and then the location arrives anyway. */
    async function arriveAfterStopping(page: Page) {
      await expect.poll(() => page.evaluate(() => (window as unknown as { stopped: boolean }).stopped)).toBe(true)
      await page.evaluate(() => (window as unknown as { arrive: () => void }).arrive())
    }

    test('a spot tapped first is not replaced by it', async ({ page }) => {
      await takePhoto(page)
      await expect(bar(page)).toHaveText(FINDING)
      const placed = await placeSpot(page)
      await arriveAfterStopping(page)
      await expect(bar(page)).toHaveText(placed)
      await expect(dialog(page)).toHaveCount(0)
    })

    test('a spot tapped while Use my location is finding it is not replaced by it', async ({ page }) => {
      await startTagging(page)
      await page.getByRole('button', { name: 'Use my location' }).click()
      await expect(page.getByRole('button', { name: 'Finding you…' })).toBeVisible()
      const placed = await placeSpot(page)
      await arriveAfterStopping(page)
      await expect(bar(page)).toHaveText(placed)
      await expect(page.getByRole('button', { name: 'Use my location' })).toBeVisible()
    })

    test('the street picker, opened first, is left alone', async ({ page }) => {
      await takePhoto(page, '/list')
      await expect(bar(page)).toHaveText(FINDING)
      await page.getByRole('button', { name: 'Choose by street' }).click()
      await expect(dialog(page).getByRole('heading', { name: 'Choose by street' })).toBeFocused()
      await expect(bar(page)).not.toHaveText(FINDING)
      await arriveAfterStopping(page)
      await expect(dialog(page)).toHaveCount(1)
      await expect(dialog(page).getByRole('heading', { name: 'Choose by street' })).toBeFocused()
    })

    test('after Cancel, nothing comes back, and the focus is on the camera input', async ({ page }) => {
      await takePhoto(page)
      await expect(bar(page)).toHaveText(FINDING)
      await page.getByRole('button', { name: 'Cancel' }).click()
      await expect(camera(page)).toBeFocused()
      await arriveAfterStopping(page)
      await expect(page.getByRole('heading', { name: 'Tag a dumped bike' })).toHaveCount(0)
      await expect(dialog(page)).toHaveCount(0)
    })
  })
})
