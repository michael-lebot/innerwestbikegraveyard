import { expect, type Locator, type Page, test } from '@playwright/test'
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

const OUTSIDE = 'That spot is outside the Inner West. Tap inside the gold line.'

test.beforeEach(() => resetDb())
// Instant camera moves, so each tap lands on the map as it will stay.
test.use({ reducedMotion: 'reduce' })

/** Where a pin is: the middle of its headstone's base, the bottom edge of its drawing. */
async function base(pin: Locator) {
  const box = (await pin.locator('svg').boundingBox())!
  return { x: box.x + box.width / 2, y: box.y + box.height }
}

/** Presses Tab, or Shift+Tab, until `target` has the focus. */
async function tabTo(page: Page, target: Locator, key = 'Tab') {
  for (let i = 0; i < 40 && !(await target.evaluate((element) => element === document.activeElement)); i++)
    await page.keyboard.press(key)
  await expect(target).toBeFocused()
}

/** Places the pin a little way from the map's middle, where no tag is within 25 m. */
async function placeAwayFromTags(page: Page, isMobile: boolean) {
  const map = await mapBox(page)
  await tap(page, isMobile, { x: map.x + map.width / 2 - 120, y: map.y + map.height / 2 + 120 })
  await expect(bar(page)).toHaveText(/^Pin on /)
}

/** Places the pin about 12 m from the seeded tag on Llewellyn St: zoomed out, a tap on its pin zooms in there. */
async function placeBesideLlewellynSt(page: Page, isMobile: boolean) {
  for (let i = 0; i < 4; i++) await page.getByRole('button', { name: 'Zoom out' }).click()
  const pin = page.getByRole('button', { name: /Llewellyn St, Marrickville/ })
  await tap(page, isMobile, await base(pin))
  const at = await base(pin)
  await tap(page, isMobile, { x: at.x + 6, y: at.y })
  await expect(bar(page)).toHaveText('Pin on Llewellyn St, Marrickville')
}

const dialog = (page: Page) => page.getByRole('dialog')
/** The green primary buttons and links showing: §9 allows one a screen. */
const greenButtons = (page: Page) =>
  page.evaluate(
    () =>
      [...document.querySelectorAll('button, a')].filter(
        (element) => element.checkVisibility() && getComputedStyle(element).backgroundColor === 'rgb(29, 107, 42)',
      ).length,
  )

test.describe('placing the pin', () => {
  test("puts the pin's base where the map is tapped, and moves it with the next tap", async ({ page, isMobile }) => {
    await startTagging(page)
    await expect(bar(page)).toHaveText('Tap the map where the bike is.')
    await expect(page.getByRole('button', { name: 'Use this spot' })).toBeDisabled()
    const map = await mapBox(page)

    for (const spot of [
      { x: map.x + map.width / 2, y: map.y + map.height / 2 },
      { x: map.x + map.width / 2 - 60, y: map.y + map.height / 2 + 40 },
    ]) {
      await tap(page, isMobile, spot)
      await expect(bar(page)).toHaveText(/^Pin on [\w' ]+, [\w ]+$/)
      const at = await base(newPin(page))
      expect(Math.abs(at.x - spot.x)).toBeLessThanOrEqual(1)
      expect(Math.abs(at.y - spot.y)).toBeLessThanOrEqual(1)
    }
    await expect(page.locator('#announcer')).toHaveText(await bar(page).innerText())
    // The pin only shows the spot the bar reads back: a screen reader meets no button in it.
    await expect(newPin(page)).not.toHaveAttribute('role')
    await expect(newPin(page)).toHaveAccessibleName('')
    await expect(page.getByRole('button', { name: 'Use this spot' })).toBeEnabled()
    await expectNoAxeViolations(page)
  })

  test('zooms in from far out rather than placing, and refuses a spot past the gold line', async ({
    page,
    isMobile,
  }) => {
    await startTagging(page)
    for (let i = 0; i < 4; i++) await page.getByRole('button', { name: 'Zoom out' }).click()
    const kingSt = page.getByRole('button', { name: /King St, Newtown/ })

    // From far out, a tap only zooms in to street level around it (assumption 20).
    await tap(page, isMobile, await base(kingSt))
    await expect(newPin(page)).toHaveCount(0)
    await expect(bar(page)).toHaveText('Tap the map where the bike is.')

    // King St is the council's edge: its far side is in the City of Sydney.
    const onKingSt = await base(kingSt)
    await tap(page, isMobile, onKingSt)
    await expect(bar(page)).toHaveText('Pin on King St, Newtown')
    await tap(page, isMobile, { x: onKingSt.x + 60, y: onKingSt.y })
    await expect(bar(page)).toHaveText(OUTSIDE)
    await expect(page.locator('#announcer')).toHaveText(OUTSIDE)
    // The pin stays where it was accepted.
    expect(await base(newPin(page))).toEqual(onKingSt)
  })

  test.describe('with motion', () => {
    test.use({ reducedMotion: 'no-preference' })

    test('zooms from the council to street level, where a tap places the pin', async ({ page, isMobile }) => {
      await startTagging(page)
      // Two seeded tags about 210 m apart: a few pixels at the council's zoom, about 100 at street level.
      const apart = async () => {
        const [a, b] = [
          await base(page.getByRole('button', { name: /Norton St/ })),
          await base(page.getByRole('button', { name: /Marion St/ })),
        ]
        return Math.hypot(a.x - b.x, a.y - b.y)
      }
      // At street level, and still: a tap while the zoom is still running only zooms again (assumption 20), which a
      // slow runner's software WebGL can leave it doing after the pins are 80 px apart.
      let last = 0
      await expect
        .poll(async () => {
          const [before, now] = [last, (last = await apart())]
          return now > 80 && Math.abs(now - before) < 0.5
        })
        .toBe(true)
      const map = await mapBox(page)
      await tap(page, isMobile, { x: map.x + map.width / 2, y: map.y + map.height / 2 })
      await expect(bar(page)).toHaveText(/^Pin on /)
    })
  })

  test('Cancel ends it, with focus back on "Tag a dumped bike"', async ({ page, isMobile }) => {
    await startTagging(page)
    const map = await mapBox(page)
    await tap(page, isMobile, { x: map.x + map.width / 2, y: map.y + map.height / 2 })
    await page.getByRole('button', { name: 'Cancel' }).click()
    await expect(newPin(page)).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Tag a dumped bike' })).toBeFocused()
  })

  test.describe('by keyboard', () => {
    test.skip(({ isMobile }) => isMobile, 'the desktop project')

    test('moves the pin 10 m an arrow and 50 m with Shift, and Esc cancels', async ({ page }) => {
      await page.goto('/')
      await expect(page.locator('[data-map-ready]')).toBeAttached()
      await page.getByRole('button', { name: 'Tag a dumped bike' }).focus()
      await page.keyboard.press('Enter')
      await expect(page.getByRole('heading', { name: 'Tag a dumped bike' })).toBeFocused()
      // Back past the map's own buttons to the map. The pins are out of the way: past each, the map would pan to it.
      const pin = page.getByRole('button', { name: /Liverpool Rd, Ashfield/ })
      await expect(pin).toHaveAttribute('tabindex', '-1')
      for (const name of ['About this map', 'Move map', 'Zoom out', 'Zoom in']) {
        await page.keyboard.press('Shift+Tab')
        await expect(page.getByRole('button', { name, exact: true })).toBeFocused()
      }
      await page.keyboard.press('Shift+Tab')
      const canvas = page.locator('.maplibregl-canvas')
      await expect(canvas).toBeFocused()
      await expect(canvas).toHaveAccessibleName(/arrow keys move the pin/)
      await expect(page.getByText('Arrow keys move the pin 10 m, with Shift 50 m.')).toBeVisible()

      // Enter puts the pin at the crosshair, the middle of the map.
      await page.keyboard.press('Enter')
      const map = await mapBox(page)
      const start = await base(newPin(page))
      // MapLibre puts its markers on whole pixels.
      expect(start).toEqual({ x: Math.round(map.x + map.width / 2), y: Math.round(map.y + map.height / 2) })
      await expect(page.locator('#announcer')).toHaveText(/^Pin on /)

      // At street level a screen pixel is about 2 m, and the pin lands on the whole pixel nearest its spot.
      const moved = async (key: string, dx: number, dy: number) => {
        const before = await base(newPin(page))
        await page.keyboard.press(key)
        await expect
          .poll(async () => {
            const { x, y } = await base(newPin(page))
            return Math.max(Math.abs(x - before.x - dx), Math.abs(y - before.y - dy))
          })
          .toBeLessThanOrEqual(1)
      }
      await moved('ArrowRight', 5, 0)
      await moved('ArrowDown', 0, 5)
      await moved('Shift+ArrowLeft', -25, 0)
      await moved('Shift+ArrowUp', 0, -25)
      await expectNoAxeViolations(page)

      await page.keyboard.press('Escape')
      await expect(newPin(page)).toHaveCount(0)
      await expect(page.getByRole('button', { name: 'Tag a dumped bike' })).toBeFocused()
      await expect(pin).not.toHaveAttribute('tabindex')
    })
  })
})

test.describe('the dialogs', () => {
  test('ask "Is it one of these?" near a live tag, where "No" carries on to the form', async ({ page, isMobile }) => {
    await startTagging(page)
    await placeBesideLlewellynSt(page, isMobile)
    await page.getByRole('button', { name: 'Use this spot' }).click()
    await expect(dialog(page).getByRole('heading', { name: 'Is it one of these?' })).toBeFocused()
    await expect(dialog(page)).toContainText('Llewellyn St, Marrickville')
    await expectNoAxeViolations(page)

    await page.getByRole('button', { name: "No, it's another bike" }).click()
    await expect(dialog(page).getByRole('heading', { name: 'Tag a dumped bike' })).toBeFocused()
    await expect(dialog(page)).toContainText('Pin on Llewellyn St, Marrickville')
    await expectNoAxeViolations(page)
  })

  test('mark the nearby tag still there with "Yes, this bike"', async ({ page, isMobile }) => {
    await sql(`UPDATE tags SET expires_at = now() + interval '3 hours' WHERE street = 'Llewellyn St'`)
    await startTagging(page)
    await placeBesideLlewellynSt(page, isMobile)
    await page.getByRole('button', { name: 'Use this spot' }).click()
    await page.getByRole('button', { name: 'Yes, this bike' }).click()
    await expect(dialog(page)).toHaveCount(0)
    await expect(page.locator('#announcer')).toHaveText('Marked still there')
    await expect(page.getByRole('button', { name: 'Tag a dumped bike' })).toBeFocused()
    const [tag] = await sql(
      `SELECT expires_at - now() > interval '47 hours' AS reset FROM tags WHERE street = 'Llewellyn St'`,
    )
    expect(tag).toEqual({ reset: true })
    await expect(page.getByRole('heading', { name: '14 bikes in the graveyard' })).toBeVisible()
  })

  test('name what is missing, then add the tag: announced, on the map and counted', async ({ page, isMobile }) => {
    await startTagging(page)
    await placeAwayFromTags(page, isMobile)
    await page.getByRole('button', { name: 'Use this spot' }).click()
    await expect(dialog(page).getByRole('heading', { name: 'Tag a dumped bike' })).toBeFocused()

    await page.getByRole('button', { name: 'Add to the map' }).click()
    await expect(dialog(page)).toContainText('Choose whose bike it is.')
    await expect(dialog(page)).toContainText("Choose what's wrong.")
    await expect(page.getByRole('radio', { name: 'Lime' })).toBeFocused()
    await expect(page.getByRole('group', { name: 'Whose bike?' })).toHaveAccessibleDescription(
      'Choose whose bike it is.',
    )
    // Unlike the question above it: a "!" mark, and red.
    const error = dialog(page).getByText('Choose whose bike it is.')
    await expect(error).toContainText('!')
    await expect(error).toHaveCSS('color', 'rgb(180, 35, 24)')
    await expectNoAxeViolations(page)

    await chip(page, 'Hello').click()
    await chip(page, 'Knocked over').click()
    await expect(page.getByRole('radio', { name: 'Hello' })).toBeChecked()
    await page.getByRole('button', { name: 'Add to the map' }).click()
    await expect(dialog(page)).toHaveCount(0)
    await expect(page.locator('#announcer')).toHaveText('Tag added')
    await expect(page.getByRole('heading', { name: '15 bikes in the graveyard' })).toBeVisible()
    await expect(page.getByRole('button', { name: /^Hello e-bike, knocked over, / })).toHaveCount(2)
    await expect(page.getByRole('button', { name: 'Tag a dumped bike' })).toBeFocused()
  })

  test('keep the answers across Change location', async ({ page, isMobile }) => {
    await startTagging(page)
    await placeAwayFromTags(page, isMobile)
    await page.getByRole('button', { name: 'Use this spot' }).click()
    await chip(page, 'Lime').click()
    await chip(page, 'Blocking footpath').click()

    await page.getByRole('button', { name: 'Change location' }).click()
    await expect(dialog(page)).toHaveCount(0)
    await expect(page.getByRole('heading', { name: 'Tag a dumped bike' })).toBeFocused()
    const map = await mapBox(page)
    await tap(page, isMobile, { x: map.x + map.width / 2 + 40, y: map.y + map.height / 2 + 40 })
    await page.getByRole('button', { name: 'Use this spot' }).click()
    await expect(page.getByRole('radio', { name: 'Lime' })).toBeChecked()
    await expect(page.getByRole('radio', { name: 'Blocking footpath' })).toBeChecked()
  })

  test('at the largest text on an SE-sized phone, scroll to the buttons, each label on two lines at most', async ({
    page,
    isMobile,
  }) => {
    test.skip(!isMobile, 'the phone projects')
    await page.setViewportSize({ width: 375, height: 667 })
    await page.goto('/')
    await expect(page.locator('[data-map-ready]')).toBeAttached()
    await page.addStyleTag({ content: ':root { font-size: 200% }' })
    await page.getByRole('button', { name: 'Tag a dumped bike' }).click()
    const map = await mapBox(page)
    await tap(page, true, { x: map.x + map.width / 2 - 30, y: map.y + map.height / 2 + 20 })
    await page.getByRole('button', { name: 'Use this spot' }).click()
    await chip(page, 'Lime').click()
    await chip(page, 'Damaged').click()

    const form = dialog(page).locator('form')
    const lines = (name: string) =>
      form.getByRole('button', { name }).evaluate((button) => {
        const range = document.createRange()
        range.selectNodeContents(button)
        return new Set([...range.getClientRects()].map((line) => Math.round(line.top))).size
      })
    await form.getByRole('button', { name: 'Add to the map' }).scrollIntoViewIfNeeded()
    expect(await lines('Cancel')).toBeLessThanOrEqual(2)
    expect(await lines('Add to the map')).toBeLessThanOrEqual(2)
    await form.getByRole('button', { name: 'Add to the map' }).click()
    await expect(page.locator('#announcer')).toHaveText('Tag added')
  })

  test.describe('by keyboard', () => {
    test.skip(({ isMobile }) => isMobile, 'the desktop project')

    test('hold Tab inside, leave the rest untouchable, and give focus back on Esc', async ({ page }) => {
      await startTagging(page)
      await placeAwayFromTags(page, false)
      await page.getByRole('button', { name: 'Use this spot' }).click()
      await expect(dialog(page).getByRole('heading', { name: 'Tag a dumped bike' })).toBeFocused()

      // After the last control, focus visits the browser's own toolbar (the page sees body), then comes back.
      const visited = new Set<string>()
      for (let i = 0; i < 20; i++) {
        await page.keyboard.press('Tab')
        visited.add(
          await page.evaluate(() => {
            const at = document.activeElement
            return at === document.body ? 'browser' : at?.closest('dialog') ? 'dialog' : at!.outerHTML.slice(0, 80)
          }),
        )
      }
      expect([...visited].sort()).toEqual(['browser', 'dialog'])
      // A click on the dimmed map's zoom button does nothing.
      const pin = newPin(page)
      const before = await base(pin)
      const zoomIn = (await page.getByRole('button', { name: 'Zoom in', includeHidden: true }).boundingBox())!
      await page.mouse.click(zoomIn.x + zoomIn.width / 2, zoomIn.y + zoomIn.height / 2)
      await page.waitForTimeout(300)
      expect(await base(pin)).toEqual(before)

      await page.keyboard.press('Escape')
      await expect(dialog(page)).toHaveCount(0)
      await expect(page.getByRole('button', { name: 'Tag a dumped bike' })).toBeFocused()
    })
  })
})

test.describe('Still there and Removed', () => {
  const LLEWELLYN_ST = '5eed0000-0000-4000-8000-000000000003'
  const status = () => sql(`SELECT status FROM tags WHERE id = '${LLEWELLYN_ST}'`).then(([tag]) => tag.status)
  // Times are shown in whole hours, rounded down: just restarted, 48 hours read as 47.
  const RESTARTED = '47 h'
  const row = (page: Page, street: string) =>
    page.getByRole('listitem').filter({ has: page.getByRole('link', { name: new RegExp(street) }) })

  test('on the card: Still there restarts the 48 hours, and Removed takes the pin away', async ({
    page,
    browserName,
  }) => {
    await page.goto('/')
    await expect(page.locator('[data-map-ready]')).toBeAttached()
    // By keyboard, as on a phone this pin overlaps others and a tap opens the chooser.
    await page.getByRole('button', { name: /Llewellyn St, Marrickville/ }).focus()
    await page.keyboard.press('Enter')
    const card = page.getByRole('region', { name: 'Lime e-bike' })
    await expect(card).toContainText(/Disappears in (39|40) h/)
    expect(await greenButtons(page)).toBe(1)
    await expectNoAxeViolations(page)

    await card.getByRole('button', { name: 'Still there' }).click()
    await expect(page.locator('#announcer')).toHaveText('Marked still there')
    await expect(card).toContainText(`Disappears in ${RESTARTED}`)
    // Focus stays in the sheet: on the button, or, as Safari doesn't focus a tapped button, on the sheet around it.
    expect(await page.locator('#sheet').evaluate((sheet) => sheet.contains(document.activeElement))).toBe(true)

    await card.getByRole('button', { name: 'Removed' }).click()
    await expect(page.locator('#announcer')).toHaveText('Removed.')
    await expect(card).toHaveCount(0)
    await expect(page.getByRole('button', { name: /Llewellyn St, Marrickville/ })).toHaveCount(0)
    const count = page.getByRole('heading', { name: '13 bikes in the graveyard' })
    await expect(count).toBeVisible()
    // The count takes the focus the button had. Safari never gave it to the button, so it stays on the sheet.
    if (browserName !== 'webkit') await expect(count).toBeFocused()
    expect(await status()).toBe('removed')
  })

  test('on /list: each row has both, and the fourth removal of the day meets the limit', async ({ page }) => {
    await page.goto('/list')
    await row(page, 'Llewellyn St').getByRole('button', { name: 'Still there' }).click()
    await expect(page.locator('#announcer')).toHaveText('Marked still there')
    await expect(row(page, 'Llewellyn St').getByRole('link')).toContainText(`${RESTARTED} left`)
    // Every row has Still there, so none of theirs is the screen's one green button: Tag a dumped bike is.
    expect(await greenButtons(page)).toBe(1)
    await expectNoAxeViolations(page)

    for (const street of ['Llewellyn St', 'Norton St', 'Marion St']) {
      await row(page, street).getByRole('button', { name: 'Removed' }).click()
      await expect(row(page, street).getByText('Removed.')).toBeFocused()
    }
    await row(page, 'Illawarra Rd').getByRole('button', { name: 'Removed' }).click()
    await expect(row(page, 'Illawarra Rd')).toContainText("You've reached the limit for now. Try again later.")
    await expect(page.locator('#announcer')).toHaveText("You've reached the limit for now. Try again later.")
    await expectNoAxeViolations(page)

    await page.reload()
    await expect(page.getByRole('heading', { name: '11 bikes in the graveyard' })).toBeVisible()
    await expect(row(page, 'Illawarra Rd')).toHaveCount(1)
  })

  test("on a tag's page: Still there, then Removed", async ({ page }) => {
    await page.goto(`/tag/${LLEWELLYN_ST}`)
    expect(await greenButtons(page)).toBe(1)
    await page.getByRole('button', { name: 'Still there' }).click()
    await expect(page.getByText(`Disappears in ${RESTARTED}`)).toBeVisible()
    await page.getByRole('button', { name: 'Removed' }).click()
    await expect(page.getByText('Removed.')).toBeFocused()
    expect(await status()).toBe('removed')
    await page.reload()
    await expect(page.getByRole('heading', { name: 'This tag has gone' })).toBeVisible()
  })

  test('say so when the tag has already gone', async ({ page }) => {
    await page.goto(`/tag/${LLEWELLYN_ST}`)
    await sql(`UPDATE tags SET expires_at = now() WHERE id = '${LLEWELLYN_ST}'`)
    await page.getByRole('button', { name: 'Still there' }).click()
    await expect(page.getByText('This tag has already gone.')).toBeFocused()
    await expect(page.locator('#announcer')).toHaveText('This tag has already gone.')
  })
})

test.describe('a tag from start to end', () => {
  test('by touch: add it, mark it Still there and Removed, and undo the removal in the admin', async ({
    page,
    isMobile,
  }) => {
    test.skip(!isMobile, 'the phone projects')
    await startTagging(page)
    await placeAwayFromTags(page, true)
    await page.getByRole('button', { name: 'Use this spot' }).tap()
    await chip(page, 'Ario').tap()
    await chip(page, 'Damaged').tap()
    await page.getByRole('button', { name: 'Add to the map' }).tap()
    await expect(page.locator('#announcer')).toHaveText('Tag added')
    const id = await newTagId()

    await page.locator(`[data-tag="${id}"] button`).tap()
    const card = page.getByRole('region', { name: 'Ario e-bike' })
    await expect(card).toContainText('Damaged')
    await card.getByRole('button', { name: 'Still there' }).tap()
    await expect(page.locator('#announcer')).toHaveText('Marked still there')
    await card.getByRole('button', { name: 'Removed' }).tap()
    await expect(page.locator('#announcer')).toHaveText('Removed.')
    await expect(page.locator(`[data-tag="${id}"]`)).toHaveCount(0)
    await expect(page.getByRole('heading', { name: '14 bikes in the graveyard' })).toBeVisible()

    await undoInAdmin(page, id)
    await page.reload()
    await expect(page.locator(`[data-tag="${id}"]`)).toHaveCount(1)
    expect(await tagEvents(id)).toEqual(['created', 'still_there', 'removed', 'restored'])
  })

  test('by keyboard: add it, mark it Still there and Removed, and undo the removal in the admin', async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, 'the desktop project')
    await page.goto('/')
    await expect(page.locator('[data-map-ready]')).toBeAttached()
    await page.getByRole('button', { name: 'Tag a dumped bike' }).focus()
    await page.keyboard.press('Enter')
    await tabTo(page, page.locator('.maplibregl-canvas'), 'Shift+Tab')
    // Enter puts the pin at the crosshair, and Enter again uses it.
    await page.keyboard.press('Enter')
    // The middle of the map, with no live tag within 25 m, so the form comes next.
    await expect(bar(page)).toHaveText('Pin on Palace St, Petersham')
    await page.keyboard.press('Enter')
    await expect(dialog(page).getByRole('heading', { name: 'Tag a dumped bike' })).toBeFocused()

    await tabTo(page, page.getByRole('radio', { name: 'Lime' }))
    await page.keyboard.press('Space')
    await tabTo(page, page.getByRole('group', { name: "What's wrong?" }).getByRole('radio').first())
    await page.keyboard.press('Space')
    await tabTo(page, page.getByRole('button', { name: 'Add to the map' }))
    await page.keyboard.press('Enter')
    await expect(page.locator('#announcer')).toHaveText('Tag added')
    await expect(page.getByRole('button', { name: 'Tag a dumped bike' })).toBeFocused()
    const id = await newTagId()

    // A pin is a button in the map's tab order; this one is reached directly, as the order depends on where it is.
    await page.locator(`[data-tag="${id}"] button`).focus()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('heading', { name: 'Lime e-bike' })).toBeFocused()
    await tabTo(page, page.getByRole('button', { name: 'Still there' }))
    await page.keyboard.press('Enter')
    await expect(page.locator('#announcer')).toHaveText('Marked still there')
    await tabTo(page, page.getByRole('button', { name: 'Removed' }))
    await page.keyboard.press('Enter')
    await expect(page.locator('#announcer')).toHaveText('Removed.')
    await expect(page.getByRole('heading', { name: '14 bikes in the graveyard' })).toBeFocused()

    await undoInAdmin(page, id)
    await page.reload()
    await expect(page.locator(`[data-tag="${id}"]`)).toHaveCount(1)
    expect(await tagEvents(id)).toEqual(['created', 'still_there', 'removed', 'restored'])
  })

  test('when the tag is added but every answer is cut off, the form keeps its answers and sending again adds it once', async ({
    page,
    isMobile,
  }) => {
    await startTagging(page)
    await placeAwayFromTags(page, isMobile)
    await page.getByRole('button', { name: 'Use this spot' }).click()
    await chip(page, 'Lime').click()
    await chip(page, 'Knocked over').click()

    // The server makes the change each time; the browser gets only the start of its answer.
    let posts = 0
    await page.route('/api/tags', async (route) => {
      posts++
      await route.fulfill({ response: await route.fetch(), body: '{"tag":' })
    })
    const add = page.getByRole('button', { name: 'Add to the map' })
    await add.click()
    await expect(dialog(page)).toContainText("Couldn't send. Check your connection and try again.")
    expect(posts).toBe(3)
    await expect(add).toBeEnabled()
    await expect(page.getByRole('radio', { name: 'Lime' })).toBeChecked()
    await expect(page.getByRole('radio', { name: 'Knocked over' })).toBeChecked()

    await page.unroute('/api/tags')
    await add.click()
    await expect(page.locator('#announcer')).toHaveText('Tag added')
    expect(await sql(`SELECT count(*)::int AS tags FROM tags`)).toEqual([{ tags: 15 }])
  })

  test('offline, the form keeps its answers; back online, it adds the tag once', async ({
    page,
    context,
    isMobile,
  }) => {
    await startTagging(page)
    await placeAwayFromTags(page, isMobile)
    await page.getByRole('button', { name: 'Use this spot' }).click()
    await chip(page, 'Hello').click()
    await chip(page, 'In waterway').click()

    await context.setOffline(true)
    await page.getByRole('button', { name: 'Add to the map' }).click()
    await expect(dialog(page)).toContainText("Couldn't send. Check your connection and try again.")
    await expect(page.locator('#announcer')).toHaveText("Couldn't send. Check your connection and try again.")
    await expect(page.getByRole('radio', { name: 'Hello' })).toBeChecked()
    await expect(page.getByRole('radio', { name: 'In waterway' })).toBeChecked()

    await context.setOffline(false)
    await page.getByRole('button', { name: 'Add to the map' }).click()
    await expect(dialog(page)).toHaveCount(0)
    await expect(page.locator('#announcer')).toHaveText('Tag added')
    expect(await sql(`SELECT count(*)::int AS tags FROM tags`)).toEqual([{ tags: 15 }])
  })
})
