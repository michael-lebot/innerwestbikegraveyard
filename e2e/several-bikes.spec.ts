import { expect, type Locator, type Page, test } from '@playwright/test'
import { bar, expectNoAxeViolations, mapBox, openFormOnList, resetDb, sql, startTagging, tap } from './support'

test.beforeEach(() => resetDb())
test.use({ reducedMotion: 'reduce' })

const dialog = (page: Page) => page.getByRole('dialog')
const announced = (page: Page) => page.locator('#announcer')
const bike = (page: Page, n: number) => dialog(page).getByRole('group', { name: `Bike ${n}`, exact: true })
const addBike = (page: Page) => dialog(page).getByRole('button', { name: 'Add another bike here' })
/** A chip's label inside `scope`, which is what a visitor taps; the radio inside it is visually hidden. */
const pick = (scope: Locator, name: string) => scope.getByRole('radio', { name }).locator('..').click()
/** The tags added in the test, oldest first, with their photos. */
const newTags = () =>
  sql(`SELECT t.id::text, operator, problem::text, lat::float, lng::float, count(p.id)::int AS photos
       FROM tags t LEFT JOIN photos p ON p.tag_id = t.id WHERE t.id::text NOT LIKE '5eed%'
       GROUP BY t.id ORDER BY t.created_at`)

/** A small JPEG drawn by the browser itself, as a camera would hand over. */
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

/** On the map, the form for a spot a little way from the map's middle, where no tag is within 25 m. */
async function openFormOnMap(page: Page, isMobile: boolean) {
  await startTagging(page)
  const map = await mapBox(page)
  await tap(page, isMobile, { x: map.x + map.width / 2 - 120, y: map.y + map.height / 2 + 120 })
  await expect(bar(page)).toHaveText(/^Pin on /)
  await page.getByRole('button', { name: 'Use this spot' }).click()
}

/** Three bikes: a damaged Lime, a damaged Hello and a Hello knocked over. */
async function describeThree(page: Page) {
  await pick(dialog(page), 'Lime')
  await pick(dialog(page), 'Damaged')
  await addBike(page).click()
  await pick(bike(page, 2), 'Hello')
  await addBike(page).click()
  await pick(bike(page, 3), 'Knocked over')
}

test('one bike: the form, its button and what it sends are as before', async ({ page }) => {
  await openFormOnList(page)
  await expect(dialog(page).getByRole('group', { name: /^Bike / })).toHaveCount(0)
  await expect(addBike(page)).toBeVisible()
  await page.getByRole('radio', { name: 'Ario' }).locator('..').click()
  await page.getByRole('radio', { name: 'In waterway' }).locator('..').click()
  const posts: string[] = []
  page.on('request', (request) => request.method() === 'POST' && posts.push(request.url()))
  await dialog(page).getByRole('button', { name: 'Add to the map', exact: true }).click()
  await expect(announced(page)).toHaveText('Tag added')
  expect(posts).toEqual(['http://localhost:3000/api/tags'])
  expect(await newTags()).toMatchObject([{ operator: 'ario', problem: 'in_waterway', photos: 0 }])
})

test('Add another bike here copies the bike above and takes the focus there; Remove gives it back; five is the most', async ({
  page,
}) => {
  await openFormOnList(page)
  await pick(dialog(page), 'Lime')
  await pick(dialog(page), 'Damaged')
  await addBike(page).click()
  await expect(bike(page, 2)).toBeFocused()
  await expect(announced(page)).toHaveText('Bike 2 added, the same as bike 1')
  await expect(bike(page, 1)).toBeVisible()
  await expect(bike(page, 1).getByRole('button', { name: /^Remove/ })).toHaveCount(0)
  await expect(bike(page, 2).getByRole('radio', { name: 'Lime' })).toBeChecked()
  await expect(bike(page, 2).getByRole('radio', { name: 'Damaged' })).toBeChecked()
  // Each bike's radios are its own: choosing for bike 2 leaves bike 1's answer.
  await pick(bike(page, 2), 'Hello')
  await expect(bike(page, 1).getByRole('radio', { name: 'Lime' })).toBeChecked()
  await expect(dialog(page).getByRole('button', { name: 'Add 2 bikes to the map' })).toBeVisible()

  await bike(page, 2).getByRole('button', { name: 'Remove bike 2' }).click()
  await expect(addBike(page)).toBeFocused()
  await expect(announced(page)).toHaveText('Bike 2 removed')
  await expect(dialog(page).getByRole('group', { name: /^Bike / })).toHaveCount(0)

  for (let n = 2; n <= 5; n++) await addBike(page).click()
  await expect(bike(page, 5)).toBeFocused()
  await expect(addBike(page)).toHaveCount(0)
  await expect(dialog(page).getByText("That's the most in one go.")).toBeVisible()
  await expect(dialog(page).getByRole('button', { name: 'Add 5 bikes to the map' })).toBeVisible()
})

test('three bikes with a photo are three tags at the spot, each with its answers and the photo, under one pin ×3', async ({
  page,
  isMobile,
}) => {
  await openFormOnMap(page, isMobile)
  await describeThree(page)
  await dialog(page)
    .getByLabel('Add a photo (optional)')
    .setInputFiles(await cameraPhoto(page))
  await expect(dialog(page).getByRole('img', { name: 'Your photo' })).toBeVisible()
  await dialog(page).getByRole('button', { name: 'Add 3 bikes to the map' }).click()
  await expect(announced(page)).toHaveText('3 bikes added')
  await expect(dialog(page)).toHaveCount(0)

  const tags = await newTags()
  expect(tags).toMatchObject([
    { operator: 'lime', problem: 'damaged', photos: 1 },
    { operator: 'hello', problem: 'damaged', photos: 1 },
    { operator: 'hello', problem: 'knocked_over', photos: 1 },
  ])
  expect(new Set(tags.map(({ lat, lng }) => `${lat},${lng}`)).size).toBe(1)
  await expect(page.locator('[data-tag]').filter({ hasText: '×3' })).toHaveCount(1)
  await expect(page.getByRole('heading', { name: '17 bikes in the graveyard' })).toBeVisible()
})

test('Change location keeps every bike', async ({ page, isMobile }) => {
  await openFormOnMap(page, isMobile)
  await describeThree(page)
  await dialog(page).getByRole('button', { name: 'Change location' }).click()
  await expect(dialog(page)).toHaveCount(0)
  const map = await mapBox(page)
  await tap(page, isMobile, { x: map.x + map.width / 2 + 40, y: map.y + map.height / 2 + 40 })
  await page.getByRole('button', { name: 'Use this spot' }).click()
  await expect(bike(page, 1).getByRole('radio', { name: 'Lime' })).toBeChecked()
  await expect(bike(page, 2).getByRole('radio', { name: 'Hello' })).toBeChecked()
  await expect(bike(page, 3).getByRole('radio', { name: 'Knocked over' })).toBeChecked()
})

test('the third tag failing leaves the first two added and fixed, at the spot; sending again adds only the third', async ({
  page,
}) => {
  await openFormOnList(page)
  await describeThree(page)
  // The first two bikes' tags go through; every try of the third is cut off.
  let creates = 0
  await page.route('/api/tags', (route) =>
    route.request().method() === 'POST' && ++creates > 2 ? route.abort() : route.continue(),
  )
  await dialog(page).getByRole('button', { name: 'Add 3 bikes to the map' }).click()
  await expect(dialog(page).getByText('2 of 3 bikes added.')).toBeVisible()
  await expect(announced(page)).toContainText('2 of 3 bikes added.')
  expect(await newTags()).toMatchObject([
    { operator: 'lime', problem: 'damaged' },
    { operator: 'hello', problem: 'damaged' },
  ])
  // Both added tags are at this spot, and neither turns the form into "Is it one of these?".
  await expect(page.getByRole('heading', { name: 'Is it one of these?' })).toHaveCount(0)
  await expect(dialog(page).getByRole('button', { name: 'Change location' })).toHaveCount(0)
  for (const n of [1, 2]) {
    const added = dialog(page).getByRole('group', { name: `Bike ${n}, added`, exact: true })
    await expect(added.getByRole('radio', { name: 'Hello' })).toBeDisabled()
    await expect(added.getByRole('button', { name: /^Remove/ })).toHaveCount(0)
  }
  await expect(bike(page, 3).getByRole('radio', { name: 'Knocked over' })).toBeChecked()
  await expect(bike(page, 3).getByRole('radio', { name: 'Ario' })).toBeEnabled()
  await expect(bike(page, 3).getByRole('button', { name: 'Remove bike 3' })).toBeVisible()
  await expect(addBike(page)).toBeVisible()

  await page.unroute('/api/tags')
  const sent: string[] = []
  page.on('request', (request) => request.method() === 'POST' && sent.push(request.postDataJSON().id))
  await dialog(page).getByRole('button', { name: 'Add 3 bikes to the map' }).click()
  await expect(announced(page)).toHaveText('3 bikes added')
  const tags = await newTags()
  expect(tags).toMatchObject([
    { operator: 'lime', problem: 'damaged' },
    { operator: 'hello', problem: 'damaged' },
    { operator: 'hello', problem: 'knocked_over' },
  ])
  expect(sent).toEqual([tags[2].id])
})

test('while the bikes are being sent, Esc, Cancel and Change location do nothing, and all are added', async ({
  page,
}) => {
  await openFormOnList(page)
  await describeThree(page)
  await page.route('/api/tags', async (route) => {
    if (route.request().method() === 'POST') await new Promise((resolve) => setTimeout(resolve, 1000))
    await route.continue()
  })
  await dialog(page).getByRole('button', { name: 'Add 3 bikes to the map' }).click()
  await expect(dialog(page).getByRole('button', { name: 'Adding…' })).toBeFocused()
  await expect(announced(page)).toHaveText('Adding 3 bikes…')
  await page.keyboard.press('Escape')
  for (const cancel of await dialog(page).getByRole('button', { name: 'Cancel' }).all())
    await expect(cancel).toBeDisabled()
  await dialog(page).getByRole('button', { name: 'Change location', includeHidden: true }).click({ force: true })
  await expect(dialog(page).getByRole('heading', { name: 'Tag a dumped bike' })).toBeVisible()
  await expect(dialog(page).getByRole('button', { name: 'Adding…' })).toBeVisible()

  await expect(announced(page)).toHaveText('3 bikes added', { timeout: 15_000 })
  await expect(dialog(page)).toHaveCount(0)
  expect(await newTags()).toHaveLength(3)
})

test('one photo failing leaves the tags, says how many it failed for, and Try again sends only that one', async ({
  page,
}) => {
  await openFormOnList(page)
  await describeThree(page)
  await dialog(page)
    .getByLabel('Add a photo (optional)')
    .setInputFiles(await cameraPhoto(page))
  // Every try of the first bike's photo is cut off; the others go through.
  let failing: string | undefined
  await page.route('**/api/tags/*/photo', (route) => {
    failing ??= route.request().url()
    return route.request().url() === failing ? route.abort() : route.continue()
  })
  await dialog(page).getByRole('button', { name: 'Add 3 bikes to the map' }).click()
  const failed = "Bikes added, but the photo didn't upload for 1 of them."
  await expect(dialog(page).getByText(failed)).toBeFocused()
  await expect(announced(page)).toContainText(failed)
  expect((await newTags()).map(({ photos }) => photos)).toEqual([0, 1, 1])

  await page.unroute('**/api/tags/*/photo')
  const photos: string[] = []
  page.on('request', (request) => request.url().endsWith('/photo') && photos.push(request.url()))
  await dialog(page).getByRole('button', { name: 'Try again' }).click()
  await expect(announced(page)).toHaveText('Photo added')
  await expect(dialog(page)).toBeHidden()
  expect(photos).toEqual([failing])
  expect((await newTags()).map(({ photos }) => photos)).toEqual([1, 1, 1])
})

test('passes axe with three bikes open', async ({ page }) => {
  await openFormOnList(page)
  await describeThree(page)
  await expectNoAxeViolations(page)
})

test('at the largest text on an SE-sized phone, three bikes can be added', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'the phone projects')
  await page.setViewportSize({ width: 375, height: 667 })
  await openFormOnList(page)
  await page.addStyleTag({ content: ':root { font-size: 200% }' })
  await describeThree(page)
  const add = dialog(page).getByRole('button', { name: 'Add 3 bikes to the map' })
  await add.scrollIntoViewIfNeeded()
  await add.click()
  await expect(announced(page)).toHaveText('3 bikes added')
})
