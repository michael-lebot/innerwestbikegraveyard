import { expect, type Page, type Response, test } from '@playwright/test'
import {
  bar,
  chip,
  expectNoAxeViolations,
  mapBox,
  newPin,
  newTagId,
  resetDb,
  sql,
  startTagging,
  tagEvents,
  tap,
  undoInAdmin,
} from './support'

test.beforeEach(() => resetDb())
// Instant camera moves, so the map has settled when it is looked at.
test.use({ reducedMotion: 'reduce' })

const dialog = (page: Page) => page.getByRole('dialog')
const announced = (page: Page) => page.locator('#announcer')
// Number 12 Llewellyn St, Marrickville, for Use my location.
const LLEWELLYN_ST = { latitude: -33.90512, longitude: 151.17288 }

/** Choose by street as far as its second step: the street found by typing and picked. */
async function pickStreet(page: Page, typed: string, street: string) {
  await page.getByRole('button', { name: 'Choose by street' }).click()
  await expect(dialog(page).getByRole('heading', { name: 'Choose by street' })).toBeFocused()
  await dialog(page).getByRole('searchbox', { name: 'Street' }).fill(typed)
  await dialog(page).getByRole('button', { name: street, exact: true }).click()
  await expect(dialog(page).getByRole('heading', { name: street })).toBeFocused()
}

async function findNumber(page: Page, number: string) {
  await dialog(page).getByRole('textbox', { name: 'House number' }).fill(number)
  await dialog(page).getByRole('button', { name: 'Find' }).click()
}

test.describe('Choose by street', () => {
  test('on /list, finds a house by its number and tags it, sending the spot but never the number', async ({ page }) => {
    const scripts: Response[] = []
    page.on('response', (response) => response.request().resourceType() === 'script' && scripts.push(response))
    await startTagging(page, '/list')
    await page.getByRole('button', { name: 'Choose by street' }).click()
    const search = dialog(page).getByRole('searchbox', { name: 'Street' })
    await search.fill('llew')
    await expect(dialog(page).getByText('5 streets match.')).toBeVisible()
    await expect(announced(page)).toHaveText('5 streets match.')
    await expect(dialog(page).getByRole('list', { name: 'Streets' }).getByRole('button')).toHaveText([
      'Llewellyn La, Marrickville',
      'Llewellyn St, Balmain',
      'Llewellyn St, Marrickville',
      'Llewellyn St, Newtown',
      'Little Llewellyn St, Balmain',
    ])
    await expectNoAxeViolations(page)

    await dialog(page).getByRole('button', { name: 'Llewellyn St, Marrickville' }).click()
    await expect(dialog(page).getByRole('heading', { name: 'Llewellyn St, Marrickville' })).toBeFocused()
    await expect(dialog(page).getByRole('textbox', { name: 'House number' })).toHaveAttribute('inputmode', 'text')
    await findNumber(page, '9999')
    const unknown = "We don't have number 9999 on Llewellyn St. Try another number, or pick the nearest corner."
    await expect(dialog(page).getByRole('textbox', { name: 'House number' })).toHaveAccessibleDescription(unknown)
    await expect(announced(page)).toHaveText(unknown)
    await expectNoAxeViolations(page)

    await findNumber(page, '12')
    await expect(dialog(page).getByText('12 Llewellyn St, Marrickville')).toBeFocused()
    await expectNoAxeViolations(page)
    const posted = page.waitForRequest('/api/tags')
    await dialog(page).getByRole('button', { name: 'Use this spot' }).click()
    // About 110 m from the live tag on Llewellyn St, so the form comes straight away.
    await expect(dialog(page).getByRole('heading', { name: 'Tag a dumped bike' })).toBeFocused()
    await expect(dialog(page)).toContainText('Pin on Llewellyn St, Marrickville')
    await chip(page, 'Lime').click()
    await chip(page, 'Damaged').click()
    await dialog(page).getByRole('button', { name: 'Add to the map' }).click()
    await expect(announced(page)).toHaveText('Tag added')
    await expect(page.getByRole('heading', { name: '15 bikes in the graveyard' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Tag a dumped bike' })).toBeFocused()

    // The tag is the point and the street picked, which the server checks (§10.3); the number stays in the browser.
    const body = (await posted).postDataJSON()
    expect(Object.keys(body).sort()).toEqual(['id', 'lat', 'lng', 'operator', 'problem', 'street'])
    expect(body.street).toBe('Llewellyn St')
    expect(await sql(`SELECT suburb, street FROM tags WHERE id = '${body.id}'`)).toEqual([
      { suburb: 'Marrickville', street: 'Llewellyn St' },
    ])
    // And /list never loads the map (§10.3).
    for (const script of scripts) expect(await script.text()).not.toContain('maplibre')
  })

  test('on a street with no house numbers, leads with its corners and says it has none', async ({ page }) => {
    await startTagging(page, '/list')
    // The first street "llew" lists.
    await pickStreet(page, 'llew', 'Llewellyn La, Marrickville')
    await expect(dialog(page).getByRole('textbox', { name: 'House number' })).toHaveCount(0)
    const corners = dialog(page).getByRole('list', {
      name: "We don't have house numbers on Llewellyn La. Pick the nearest corner.",
    })
    await expect(corners.getByRole('button').first()).toBeVisible()
  })

  test('on /list, lists the corners in order along the street, and asks about a live tag at the one chosen', async ({
    page,
  }) => {
    await startTagging(page, '/list')
    await pickStreet(page, 'llewellyn st marr', 'Llewellyn St, Marrickville')
    await expect(dialog(page).getByRole('list', { name: 'Or the nearest corner' }).getByRole('button')).toHaveText([
      'near Enmore Rd',
      'near Scouller La',
      'near Black St',
      "near O'Connor La",
      'near Juliett St',
      'near Shelleys La',
      'near Lynch La',
    ])
    await dialog(page).getByRole('button', { name: 'near Juliett St' }).click()
    await expect(dialog(page).getByText('Near the corner of Llewellyn St and Juliett St, Marrickville')).toBeFocused()

    // Back to the street, then on again.
    await dialog(page).getByRole('button', { name: 'Back' }).click()
    await expect(dialog(page).getByRole('heading', { name: 'Llewellyn St, Marrickville' })).toBeFocused()
    await dialog(page).getByRole('button', { name: 'near Juliett St' }).click()
    await dialog(page).getByRole('button', { name: 'Use this spot' }).click()
    // The seeded tag on Llewellyn St is 3 m from the corner.
    await expect(dialog(page).getByRole('heading', { name: 'Is it one of these?' })).toBeFocused()
    await dialog(page).getByRole('button', { name: "No, it's another bike" }).click()
    // The street picked, though the cross street is nearer the corner (assumption 10).
    await expect(dialog(page)).toContainText('Pin on Llewellyn St, Marrickville')
  })

  test('stores the street picked, not the lane behind the house, so its card and /list say Albion St', async ({
    page,
  }) => {
    await startTagging(page)
    await pickStreet(page, 'albion st ann', 'Albion St, Annandale')
    await findNumber(page, '106')
    await dialog(page).getByRole('button', { name: 'Use this spot' }).click()
    // The nearest named street to 106 is Albion La, behind it.
    await expect(dialog(page)).toContainText('Pin on Albion St, Annandale')
    await chip(page, 'Lime').click()
    await chip(page, 'Damaged').click()
    await dialog(page).getByRole('button', { name: 'Add to the map' }).click()
    await expect(announced(page)).toHaveText('Tag added')
    const id = await newTagId()

    await page.locator(`[data-tag="${id}"] button`).focus()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('region', { name: 'Lime e-bike' })).toContainText('Albion St, Annandale')
    await page.goto('/list')
    await expect(page.locator(`a[href="/tag/${id}"]`)).toContainText('Albion St')
  })

  test('on the map, puts the pin there behind the form, where Change location lets a tap move it', async ({
    page,
    isMobile,
  }) => {
    await startTagging(page)
    await pickStreet(page, 'llew', 'Llewellyn St, Marrickville')
    await findNumber(page, '12')
    await dialog(page).getByRole('button', { name: 'Use this spot' }).click()
    await expect(dialog(page).getByRole('heading', { name: 'Tag a dumped bike' })).toBeFocused()
    // The map behind the form shows the pin: in the strip above it on a phone, beside the panel on the desktop.
    const map = await mapBox(page)
    const pin = (await newPin(page).boundingBox())!
    expect(pin.y).toBeGreaterThanOrEqual(map.y)
    expect(pin.x).toBeGreaterThanOrEqual(map.x)
    expect(pin.x + pin.width).toBeLessThanOrEqual(map.x + map.width)

    await dialog(page).getByRole('button', { name: 'Change location' }).click()
    await expect(page.getByRole('heading', { name: 'Tag a dumped bike' })).toBeFocused()
    await expect(bar(page)).toHaveText('Pin on Llewellyn St, Marrickville')
    const at = (await newPin(page).boundingBox())!
    await tap(page, isMobile, { x: at.x + at.width / 2 + 30, y: at.y + at.height })
    await expect.poll(async () => (await newPin(page).boundingBox())!.x).toBeCloseTo(at.x + 30, 0)
  })

  test('closes on Cancel or Esc, leaving the placement bar as it was', async ({ page }) => {
    await startTagging(page)
    for (const close of ['Cancel', 'Escape']) {
      await page.getByRole('button', { name: 'Choose by street' }).click()
      await expect(dialog(page).getByRole('heading', { name: 'Choose by street' })).toBeFocused()
      if (close === 'Cancel') await dialog(page).getByRole('button', { name: 'Cancel' }).click()
      else await page.keyboard.press('Escape')
      await expect(dialog(page)).toHaveCount(0)
      await expect(page.getByRole('button', { name: 'Choose by street' })).toBeFocused()
      await expect(bar(page)).toHaveText('Tap the map where the bike is.')
    }
  })

  test('keeps the search box and the streets above an on-screen keyboard', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'the phone projects')
    await startTagging(page, '/list')
    await page.getByRole('button', { name: 'Choose by street' }).click()
    await dialog(page).getByRole('searchbox', { name: 'Street' }).fill('llew')
    // An on-screen keyboard shrinks the visual viewport only, as it does on iOS and on Android.
    const keyboardTop = await page.evaluate(() => {
      const shown = innerHeight - 300
      Object.defineProperty(visualViewport, 'height', { get: () => shown })
      visualViewport!.dispatchEvent(new Event('resize'))
      return shown
    })
    const bottom = async () => {
      const box = (await dialog(page).boundingBox())!
      return box.y + box.height
    }
    await expect.poll(bottom).toBeCloseTo(keyboardTop, 0)
    for (const shown of [
      dialog(page).getByRole('searchbox', { name: 'Street' }),
      dialog(page).getByRole('button', { name: 'Llewellyn La, Marrickville' }),
    ]) {
      const box = (await shown.boundingBox())!
      expect(box.y + box.height).toBeLessThanOrEqual(keyboardTop)
    }
  })

  test("at the largest text on an SE-sized phone, reaches each step's buttons and cancels the form", async ({
    page,
    isMobile,
  }) => {
    test.skip(!isMobile, 'the phone projects')
    await page.setViewportSize({ width: 375, height: 667 })
    await page.goto('/list')
    await page.addStyleTag({ content: ':root { font-size: 200% }' })
    await page.getByRole('button', { name: 'Tag a dumped bike' }).click()
    // Each click below first scrolls its button into view, and fails if anything covers it. Sending the form at this
    // size is tested on the map screen (tag-map.spec.ts).
    await pickStreet(page, 'llew', 'Llewellyn St, Marrickville')
    await findNumber(page, '12')
    await dialog(page).getByRole('button', { name: 'Use this spot' }).click()
    await chip(page, 'Lime').click()
    await dialog(page).locator('form').getByRole('button', { name: 'Cancel' }).click()
    await expect(dialog(page)).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Tag a dumped bike' })).toBeFocused()
  })

  test.describe('by keyboard', () => {
    test.skip(({ isMobile }) => isMobile, 'the desktop project')

    test('types, Tabs to a street and a number, and uses the spot', async ({ page }) => {
      await page.goto('/list')
      await page.getByRole('button', { name: 'Tag a dumped bike' }).focus()
      await page.keyboard.press('Enter')
      await expect(page.getByRole('heading', { name: 'Tag a dumped bike' })).toBeFocused()
      await page.keyboard.press('Tab')
      await expect(page.getByRole('button', { name: 'Use my location' })).toBeFocused()
      await page.keyboard.press('Tab')
      await expect(page.getByRole('button', { name: 'Choose by street' })).toBeFocused()
      await page.keyboard.press('Enter')
      await expect(dialog(page).getByRole('heading', { name: 'Choose by street' })).toBeFocused()
      await page.keyboard.press('Tab')
      await page.keyboard.press('Tab')
      await expect(dialog(page).getByRole('searchbox', { name: 'Street' })).toBeFocused()
      await page.keyboard.type('llewellyn st marr')
      await page.keyboard.press('Tab')
      await expect(dialog(page).getByRole('button', { name: 'Llewellyn St, Marrickville' })).toBeFocused()
      await page.keyboard.press('Enter')
      await expect(dialog(page).getByRole('heading', { name: 'Llewellyn St, Marrickville' })).toBeFocused()
      await page.keyboard.press('Tab')
      await page.keyboard.press('Tab')
      await expect(dialog(page).getByRole('textbox', { name: 'House number' })).toBeFocused()
      await page.keyboard.type('12')
      await page.keyboard.press('Enter')
      await expect(dialog(page).getByText('12 Llewellyn St, Marrickville')).toBeFocused()
      await page.keyboard.press('Tab')
      await page.keyboard.press('Tab')
      await expect(dialog(page).getByRole('button', { name: 'Use this spot' })).toBeFocused()
      await page.keyboard.press('Enter')
      await expect(dialog(page).getByRole('heading', { name: 'Tag a dumped bike' })).toBeFocused()
    })
  })
})

test.describe('Use my location', () => {
  // Sydney Town Hall, 3 km outside the council.
  const TOWN_HALL = { latitude: -33.8732, longitude: 151.2061 }
  test.use({ permissions: ['geolocation'], geolocation: { ...LLEWELLYN_ST, accuracy: 15 } })

  test('§5.5 Use my location: an accurate position inside the council proposes a pin there, and sends nothing', async ({
    page,
  }) => {
    const posts: string[] = []
    page.on('request', (request) => request.method() === 'POST' && posts.push(request.url()))
    await startTagging(page)
    await page.getByRole('button', { name: 'Use my location' }).click()
    const near = 'Near Llewellyn St, Marrickville, accurate to about 15 metres'
    await expect(bar(page)).toHaveText(near)
    await expect(announced(page)).toHaveText(near)
    // The map centres there, with the middle of the pin's base on the spot.
    const map = await mapBox(page)
    await expect
      .poll(async () => {
        const pin = (await newPin(page).boundingBox())!
        return Math.hypot(
          pin.x + pin.width / 2 - (map.x + map.width / 2),
          pin.y + pin.height - (map.y + map.height / 2),
        )
      })
      .toBeLessThan(2)
    await expect(page.getByRole('button', { name: 'Use this spot' })).toBeEnabled()
    await expectNoAxeViolations(page)
    expect(posts).toEqual([])
  })

  /** Use my location, then: no pin, the note said, and the other ways still there. */
  async function expectNoPin(page: Page, note: string) {
    await page.getByRole('button', { name: 'Use my location' }).click()
    await expect(bar(page)).toHaveText(note)
    await expect(announced(page)).toHaveText(note)
    await expectNoAxeViolations(page)
    await expect(newPin(page)).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Use this spot' })).toBeDisabled()
    await page.getByRole('button', { name: 'Choose by street' }).click()
    await expect(dialog(page).getByRole('heading', { name: 'Choose by street' })).toBeFocused()
    await page.keyboard.press('Escape')
  }

  test('§5.5 Use my location: a rough position and one outside the council leave no pin, and the other ways work', async ({
    page,
    context,
    isMobile,
  }) => {
    await startTagging(page)
    await context.setGeolocation({ ...TOWN_HALL, accuracy: 10 })
    await expectNoPin(page, "You're outside the Inner West. Tap the map or choose a street.")
    await context.setGeolocation({ ...LLEWELLYN_ST, accuracy: 80 })
    await expectNoPin(page, 'Your location is only accurate to about 80 m. Tap where the bike is, or choose a street.')

    // The rough position centred the map, where a tap places the pin.
    const map = await mapBox(page)
    await tap(page, isMobile, { x: map.x + map.width / 2, y: map.y + map.height / 2 })
    await expect(bar(page)).toHaveText('Pin on Llewellyn St, Marrickville')
  })

  test.describe('refused', () => {
    test.use({ permissions: [] })

    test('§5.5 Use my location: a refused permission leaves no pin, and the other ways work', async ({ page }) => {
      await startTagging(page)
      await expectNoPin(page, "Your browser didn't share your location. Tap the map or choose a street.")
    })
  })

  test('on /list, reads the spot back for Use this spot, which leads to the form, or says to choose a street', async ({
    page,
    context,
  }) => {
    await startTagging(page, '/list')
    await page.getByRole('button', { name: 'Use my location' }).click()
    await expect(bar(page)).toHaveText('Near Llewellyn St, Marrickville, accurate to about 15 metres')
    await expectNoAxeViolations(page)
    await page.getByRole('button', { name: 'Use this spot' }).click()
    await expect(dialog(page).getByRole('heading', { name: 'Tag a dumped bike' })).toBeFocused()
    await expect(dialog(page)).toContainText('Pin on Llewellyn St, Marrickville')

    await dialog(page).getByRole('button', { name: 'Change location' }).click()
    await context.setGeolocation({ ...LLEWELLYN_ST, accuracy: 80 })
    await page.getByRole('button', { name: 'Use my location' }).click()
    await expect(bar(page)).toHaveText('Your location is only accurate to about 80 m. Choose a street instead.')
    await expect(page.getByRole('button', { name: 'Use this spot' })).toBeDisabled()
  })
})

test.describe('a tag from start to end', () => {
  /** The form after a spot is used: an Ario that is damaged, added. */
  async function addArio(page: Page) {
    await expect(dialog(page).getByRole('heading', { name: 'Tag a dumped bike' })).toBeFocused()
    await chip(page, 'Ario').click()
    await chip(page, 'Damaged').click()
    await dialog(page).getByRole('button', { name: 'Add to the map' }).click()
    await expect(announced(page)).toHaveText('Tag added')
    return newTagId()
  }

  for (const [way, choose] of [
    ['a house number', (page: Page) => findNumber(page, '12')],
    ['a corner', (page: Page) => dialog(page).getByRole('button', { name: 'near Lynch La' }).click()],
  ] as const)
    test(`by Choose by street on /list, with ${way}: add it, mark it Still there and Removed, and undo the removal in the admin`, async ({
      page,
    }) => {
      await startTagging(page, '/list')
      await pickStreet(page, 'llew', 'Llewellyn St, Marrickville')
      await choose(page)
      await dialog(page).getByRole('button', { name: 'Use this spot' }).click()
      const id = await addArio(page)

      const row = page.getByRole('listitem').filter({ has: page.locator(`a[href="/tag/${id}"]`) })
      await row.getByRole('button', { name: 'Still there' }).click()
      await expect(announced(page)).toHaveText('Marked still there')
      await row.getByRole('button', { name: 'Removed' }).click()
      await expect(row.getByText('Removed.')).toBeFocused()

      await undoInAdmin(page, id)
      await page.reload()
      await expect(page.getByRole('heading', { name: '15 bikes in the graveyard' })).toBeVisible()
      await expect(row).toHaveCount(1)
      expect(await tagEvents(id)).toEqual(['created', 'still_there', 'removed', 'restored'])
    })

  test.describe('by Use my location', () => {
    test.use({ permissions: ['geolocation'], geolocation: { ...LLEWELLYN_ST, accuracy: 15 } })

    test('on the map: add it, mark it Still there and Removed, and undo the removal in the admin', async ({ page }) => {
      await startTagging(page)
      await page.getByRole('button', { name: 'Use my location' }).click()
      await expect(bar(page)).toHaveText('Near Llewellyn St, Marrickville, accurate to about 15 metres')
      await page.getByRole('button', { name: 'Use this spot' }).click()
      const id = await addArio(page)

      await page.locator(`[data-tag="${id}"] button`).click()
      const card = page.getByRole('region', { name: 'Ario e-bike' })
      await card.getByRole('button', { name: 'Still there' }).click()
      await expect(announced(page)).toHaveText('Marked still there')
      await card.getByRole('button', { name: 'Removed' }).click()
      await expect(announced(page)).toHaveText('Removed.')
      await expect(page.locator(`[data-tag="${id}"]`)).toHaveCount(0)

      await undoInAdmin(page, id)
      await page.reload()
      await expect(page.locator(`[data-tag="${id}"]`)).toHaveCount(1)
      expect(await tagEvents(id)).toEqual(['created', 'still_there', 'removed', 'restored'])
    })
  })
})
