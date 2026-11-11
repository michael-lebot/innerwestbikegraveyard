import { readFileSync } from 'node:fs'
import { expect, type Page, test } from '@playwright/test'
import { expectNoAxeViolations, resetDb, sql } from './support'

const MARION_ST = '5eed0000-0000-4000-8000-000000000002'
const LLEWELLYN_ST = '5eed0000-0000-4000-8000-000000000003'

/**
 * Zooms in a step, at once. An iPhone's map, short under the footer, draws pins over a kilometre apart within 44 px of
 * each other at the council-wide zoom, so a tap there opens a chooser; a step in, only Norton and Marion St overlap.
 */
async function zoomIn(page: Page) {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.getByRole('button', { name: 'Zoom in' }).click()
}

test.beforeEach(() => resetDb())

test('counts the live tags by operator, and drops one that expires at the next refresh', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: '14 bikes in the graveyard' })).toBeVisible()
  await expect(page.getByText('Tags disappear 48 hours after the last sighting.')).toBeVisible()
  await expect(page.getByRole('list', { name: 'Key' }).getByRole('listitem')).toHaveText([
    // After each pin's letter, which is hidden from screen readers.
    /Lime 7$/,
    /Hello 4$/,
    /Ario 3$/,
    /Not sure 0$/,
  ])
  await expect(page.getByRole('region', { name: 'Map', exact: true })).toHaveAccessibleDescription(
    'Map of the Inner West with 14 bikes tagged. A list view is available.',
  )

  await sql(`UPDATE tags SET expires_at = now() WHERE id = '${LLEWELLYN_ST}'`)
  await page.evaluate(() => window.dispatchEvent(new Event('focus')))
  await expect(page.getByRole('heading', { name: '13 bikes in the graveyard' })).toBeVisible()
  await expect(page.getByRole('list', { name: 'Key' }).getByRole('listitem').first()).toHaveText(/Lime 6$/)
})

test('keeps the newest tags when an older refresh answers last', async ({ page }) => {
  // The first request is answered with the 14 tags of that moment, but only after a newer one has come back.
  let seen: () => void
  const firstSeen = new Promise<void>((resolve) => (seen = resolve))
  let release: () => void
  const released = new Promise<void>((resolve) => (release = resolve))
  let calls = 0
  await page.route('**/api/tags', async (route) => {
    if (++calls > 1) return route.continue()
    const response = await route.fetch()
    seen()
    await released
    await route.fulfill({ response })
  })
  await page.goto('/')
  await firstSeen

  await sql(`UPDATE tags SET expires_at = now() WHERE id = '${LLEWELLYN_ST}'`)
  await page.evaluate(() => window.dispatchEvent(new Event('focus')))
  await expect(page.getByRole('heading', { name: '13 bikes in the graveyard' })).toBeVisible()

  const stale = page.waitForResponse('**/api/tags')
  release!()
  await stale
  // Nothing to wait for if the stale answer is dropped, so give it the time it would take to show.
  await page.waitForTimeout(500)
  await expect(page.getByRole('heading', { name: '13 bikes in the graveyard' })).toBeVisible()
})

test('fits the map screen to the viewport, so the page never scrolls while the map shows', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('[data-map-ready]')).toBeAttached()
  const [scrollHeight, clientHeight] = await page.evaluate(() => [
    document.documentElement.scrollHeight,
    document.documentElement.clientHeight,
  ])
  expect(scrollHeight).toBe(clientHeight)
  await expectNoAxeViolations(page)
})

test('offers the list when the tiles fail to load', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.route('**/*.pmtiles', (route) => route.abort())
  await page.goto('/')
  await expect(page.getByText("The map couldn't load.")).toHaveText("The map couldn't load. Use the list instead.")
  await expectNoAxeViolations(page)
  const list = page.getByRole('link', { name: 'Use the list instead.' })
  // axe allows a small link inside a sentence; our own rule is 44 px for every target (§10.5).
  expect((await list.boundingBox())!.height).toBeGreaterThanOrEqual(44)
  await list.click()
  await expect(page).toHaveURL('/list')
  await expect(page.getByRole('heading', { name: '14 bikes in the graveyard' })).toBeVisible()
  expect(errors).toEqual([])
})

test('keeps the preview framed in the outside grey, with the loading bike over it, while the map loads behind it', async ({
  page,
}) => {
  let release!: () => void
  const held = new Promise<void>((resolve) => (release = resolve))
  await page.route('**/*.pmtiles', async (route) => {
    await held
    await route.continue()
  })
  await page.goto('/')
  const loading = page.getByRole('region', { name: 'Map' }).getByRole('status')
  await expect(loading.getByText('Map loading')).toBeVisible()
  await expect(loading.getByText('Turn on JavaScript')).toBeHidden()
  // MapLibre has started drawing (its water-blue background) under the preview.
  await expect(page.locator('.maplibregl-canvas')).toBeAttached()
  const corner = await page.evaluate(() => {
    const map = document.querySelector('[aria-label="Map"]')!.getBoundingClientRect()
    const top = document.elementFromPoint(map.left + 1, map.bottom - 1)!
    return [top.tagName, getComputedStyle(top).backgroundColor]
  })
  expect(corner).toEqual(['IMG', 'rgb(110, 110, 122)'])
  await expectNoAxeViolations(page)
  // The bike turns on its rear hub: paused halfway through each of its 12 steps, the hub's pixel, part of the
  // outline, is still in the middle of the square. The dots are drawn in turn.
  const bike = loading.locator('svg > g')
  const dots = loading.locator('p [aria-hidden]')
  await expect(bike).toHaveCSS('animation-name', 'wheelie')
  await expect(dots).toHaveCSS('animation-name', 'ellipsis')
  const hubs = await bike.evaluate((group: SVGGElement) => {
    const square = group.ownerSVGElement!.getBoundingClientRect()
    group.style.animationPlayState = 'paused'
    return Array.from({ length: 12 }, (_, step) => {
      group.style.animationDelay = `${-(step + 0.5) * 150}ms`
      const middle = document.elementFromPoint(square.x + square.width / 2, square.y + square.height / 2)
      return middle === group.querySelector('path')
    })
  })
  expect(hubs).toEqual(Array(12).fill(true))
  // Both stand still for reduced motion, the bike in the middle of its square.
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await expect(bike).toHaveCSS('animation-name', 'none')
  await expect(dots).toHaveCSS('animation-name', 'none')
  const [x, y] = await bike.evaluate((group: SVGGElement) => {
    const [art, square] = [group.getBoundingClientRect(), group.ownerSVGElement!.getBoundingClientRect()]
    return [art.x + art.width / 2 - square.x - square.width / 2, art.y + art.height / 2 - square.y - square.height / 2]
  })
  expect(x).toBeCloseTo(0, 0)
  expect(y).toBeCloseTo(0, 0)
  release()
  await expect(page.locator('[data-map-ready]')).toBeAttached()
  await expect(loading).toHaveCount(0)
})

test('leaves the map for another page without a script error', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/')
  await expect(page.locator('[data-map-ready]')).toBeAttached()
  await page.getByRole('contentinfo').getByRole('link', { name: 'Why this page exists' }).click()
  await expect(page).toHaveURL('/why')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  expect(errors).toEqual([])
})

// The tallest map the layouts make, then the widest and the shortest: phones held sideways get the side panel too.
for (const viewport of [
  { width: 768, height: 800 },
  { width: 863, height: 360 },
  { width: 750, height: 342 },
]) {
  test.describe(`at ${viewport.width} × ${viewport.height}`, () => {
    test.use({ viewport })

    test('shows the whole council once the map is ready', async ({ page }) => {
      const { bbox } = JSON.parse(
        readFileSync(new URL('../packages/shared/data/council.json', import.meta.url), 'utf8'),
      ) as { bbox: [number, number, number, number] }
      const [west, south, east, north] = bbox
      const edges = [
        ['West', west, (south + north) / 2],
        ['East', east, (south + north) / 2],
        ['North', (west + east) / 2, north],
        ['South', (west + east) / 2, south],
      ] as const
      // A pin at the middle of each side of the council's box.
      await sql(`
        INSERT INTO tags (id, lat, lng, suburb, street, operator, problem, last_confirmed_at, expires_at)
        VALUES ${edges
          .map(
            ([side, lng, lat]) =>
              `(gen_random_uuid(), ${lat}, ${lng}, 'Edge', '${side} St', 'lime', 'damaged', now(), now() + interval '1 day')`,
          )
          .join(', ')}`)
      await page.goto('/')
      await expect(page.locator('[data-map-ready]')).toBeAttached()

      const map = (await page.getByRole('region', { name: 'Map', exact: true }).boundingBox())!
      for (const [side] of edges) {
        const pin = (await page.getByRole('button', { name: new RegExp(`${side} St, Edge`) }).boundingBox())!
        // A pin's base is the middle of its bottom edge.
        const [x, y] = [pin.x + pin.width / 2, pin.y + pin.height]
        expect([x >= map.x, x <= map.x + map.width, y >= map.y, y <= map.y + map.height], side).toEqual([
          true,
          true,
          true,
          true,
        ])
      }
    })
  })
}

test('keeps every map control in sight and the count above the fold at twice the text size', async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== 'webkit', 'the iPhone project')
  await page.goto('/')
  await expect(page.locator('[data-map-ready]')).toBeAttached()
  // The largest text a phone's settings allow, which scales every rem.
  await page.addStyleTag({ content: ':root { font-size: 200% }' })
  await page.getByRole('button', { name: 'Move map' }).click()

  const map = (await page.getByRole('region', { name: 'Map', exact: true }).boundingBox())!
  const boxes = await Promise.all(
    ['Zoom in', 'Zoom out', 'Move map', 'About this map', 'Move up', 'Move left', 'Move right', 'Move down'].map(
      async (name) => (await page.getByRole('button', { name, exact: true }).boundingBox())!,
    ),
  )
  for (const [i, box] of boxes.entries()) {
    expect(box.x >= map.x && box.x + box.width <= map.x + map.width, `control ${i} across`).toBe(true)
    expect(box.y >= map.y && box.y + box.height <= map.y + map.height, `control ${i} down`).toBe(true)
    for (const other of boxes.slice(i + 1)) {
      const apart =
        box.x + box.width <= other.x ||
        other.x + other.width <= box.x ||
        box.y + box.height <= other.y ||
        other.y + other.height <= box.y
      expect(apart, `control ${i} overlaps another`).toBe(true)
    }
  }
  const sheet = (await page.locator('#sheet').boundingBox())!
  const count = (await page.getByRole('heading', { name: '14 bikes in the graveyard' }).boundingBox())!
  expect(count.y + count.height).toBeLessThanOrEqual(sheet.y + sheet.height)
  // The name wraps beside the headstone, which keeps its size.
  expect((await page.locator('header svg').boundingBox())!.width).toBe(24)
})

test.describe('pins', () => {
  const pins = (page: Page) =>
    page.getByRole('region', { name: 'Map', exact: true }).getByRole('button', { name: /e-bike/ })

  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('[data-map-ready]')).toBeAttached()
  })

  test('are one 44 px button per live tag, named in full, in suburb then street order', async ({ page }) => {
    await expect(pins(page)).toHaveCount(14)
    // axe spares the pins from target-size because they may overlap, so their size is checked here (§10.5).
    const sides = await pins(page).evaluateAll((buttons) =>
      buttons.flatMap((button) => [button.getBoundingClientRect().width, button.getBoundingClientRect().height]),
    )
    expect(Math.min(...sides)).toBeGreaterThanOrEqual(44)
    const names = await pins(page).evaluateAll((buttons) => buttons.map((button) => button.ariaLabel ?? ''))
    expect(names[0]).toMatch(
      /^Hello e-bike, blocking footpath, Liverpool Rd, Ashfield, disappears in 1 hour, at \d{1,2}:\d\d [ap]m \w+day$/,
    )
    const places = names.map((name) => name.split(', ').slice(2, 4).reverse().join(', '))
    expect(places).toEqual(places.toSorted())
  })

  test('select a lone pin on tap, and a focused pin on Enter even where pins overlap', async ({ page }) => {
    await zoomIn(page)
    const stanmore = page.getByRole('button', { name: /Percival Rd, Stanmore/ })
    await stanmore.click()
    await expect(stanmore).toHaveAttribute('aria-expanded', 'true')
    await expect(page.getByRole('heading', { name: /bikes here/ })).toHaveCount(0)

    const norton = page.getByRole('button', { name: /Norton St, Leichhardt/ })
    await norton.focus()
    await page.keyboard.press('Enter')
    await expect(norton).toHaveAttribute('aria-expanded', 'true')
    await expect(stanmore).toHaveAttribute('aria-expanded', 'false')
    await expect(page.getByRole('heading', { name: /bikes here/ })).toHaveCount(0)
  })

  test('bob twice when selected, and not at all under reduced motion', async ({ page }) => {
    const ashfield = page.getByRole('button', { name: /Liverpool Rd, Ashfield/ })
    // Enter, as a tap at the council-wide zoom may open a chooser (zoomIn).
    await ashfield.press('Enter')
    expect(await ashfield.evaluate((pin) => getComputedStyle(pin).animationIterationCount)).toBe('2')
    await page.emulateMedia({ reducedMotion: 'reduce' })
    expect(await ashfield.evaluate((pin) => getComputedStyle(pin).animationName)).toBe('none')
  })

  test('tapped where they overlap, offer "2 bikes here" to choose from', async ({ page }) => {
    await zoomIn(page)
    const norton = page.getByRole('button', { name: /Norton St, Leichhardt/ })
    // Marion St's pin covers part of Norton St's: the tap lands on whichever is on top.
    await norton.click({ force: true })
    const chooser = page.getByRole('heading', { name: '2 bikes here' })
    await expect(chooser).toBeFocused()
    await expectNoAxeViolations(page)
    await page.keyboard.press('Escape')
    await expect(chooser).toHaveCount(0)
    expect(await page.evaluate(() => document.activeElement?.ariaLabel)).toMatch(/Leichhardt/)

    // Not a dialog either: Esc closes it with focus back on the map.
    await norton.click({ force: true })
    await page.getByRole('button', { name: 'Zoom in' }).focus()
    await page.keyboard.press('Escape')
    await expect(chooser).toHaveCount(0)
    expect(await page.evaluate(() => document.activeElement?.ariaLabel)).toMatch(/Leichhardt/)

    await norton.click({ force: true })
    await page.getByRole('link', { name: /Marion St/ }).click()
    await expect(chooser).toHaveCount(0)
    await expect(page.getByRole('button', { name: /Marion St, Leichhardt/ })).toHaveAttribute('aria-expanded', 'true')
  })

  test('can be reached from off screen with Move map and the zoom buttons alone', async ({ page }) => {
    // Instant camera moves, so each tap has landed before the next.
    await page.emulateMedia({ reducedMotion: 'reduce' })
    for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Zoom in' }).click()
    const balmain = page.getByRole('button', { name: /Darling St, Balmain/ })
    await expect(balmain).not.toBeInViewport()

    await page.getByRole('button', { name: 'Move map' }).click()
    const map = (await page.getByRole('region', { name: 'Map', exact: true }).boundingBox())!
    const towardsPin = async () => {
      const pin = (await balmain.boundingBox())!
      if (pin.y < map.y) return 'Move up'
      if (pin.y + pin.height > map.y + map.height) return 'Move down'
      if (pin.x < map.x) return 'Move left'
      if (pin.x + pin.width > map.x + map.width) return 'Move right'
    }
    for (let i = 0, arrow = await towardsPin(); arrow && i < 20; i++, arrow = await towardsPin())
      await page.getByRole('button', { name: arrow, exact: true }).click()
    await expect(balmain).toBeInViewport()
  })

  test('pan into view when focused off screen, without scrolling the page', async ({ page }) => {
    for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Zoom in' }).click()
    const balmain = page.getByRole('button', { name: /Darling St, Balmain/ })
    await expect(balmain).not.toBeInViewport()
    await balmain.focus()
    await expect(balmain).toBeInViewport()
    expect(await page.evaluate(() => [scrollX, scrollY])).toEqual([0, 0])
  })
})

test.describe('the tag card', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('[data-map-ready]')).toBeAttached()
  })

  test('opens from a pin by keyboard with focus on its heading, and Esc gives focus back to the pin', async ({
    page,
  }) => {
    const pin = page.getByRole('button', { name: /Liverpool Rd, Ashfield/ })
    await pin.focus()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('heading', { name: 'Hello e-bike' })).toBeFocused()
    await expect(page.getByText('Liverpool Rd, Ashfield', { exact: true })).toBeVisible()
    await expect(page.getByText(/^Last seen \d+ h ago$/)).toBeVisible()
    await expectNoAxeViolations(page)
    await page.keyboard.press('Escape')
    await expect(page.getByRole('heading', { name: 'Hello e-bike' })).toHaveCount(0)
    await expect(pin).toBeFocused()
  })

  test('closes on Esc while focus is back on the map, as it is not a dialog', async ({ page }) => {
    const pin = page.getByRole('button', { name: /Liverpool Rd, Ashfield/ })
    await pin.focus()
    await page.keyboard.press('Enter')
    await page.getByRole('button', { name: 'Zoom in' }).focus()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('heading', { name: 'Hello e-bike' })).toHaveCount(0)
    await expect(pin).toBeFocused()
  })

  test('goes when a refresh takes its tag away, leaving focus on the count', async ({ page }) => {
    await page.getByRole('button', { name: /Llewellyn St, Marrickville/ }).focus()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('heading', { name: 'Lime e-bike' })).toBeFocused()
    await sql(`UPDATE tags SET expires_at = now() WHERE id = '${LLEWELLYN_ST}'`)
    await page.evaluate(() => window.dispatchEvent(new Event('focus')))
    await expect(page.getByRole('heading', { name: '13 bikes in the graveyard' })).toBeFocused()
  })

  test('keeps its heading whole and its handle full size at the largest text size', async ({ page, isMobile }) => {
    await page.addStyleTag({ content: 'html { font-size: 200% }' })
    await page.getByRole('button', { name: /Liverpool Rd, Ashfield/ }).focus()
    await page.keyboard.press('Enter')
    const heading = page.getByRole('heading', { name: 'Hello e-bike' })
    await expect(heading).toBeFocused()
    // Only the shrunk card's one line may end in an ellipsis.
    expect(await heading.locator('span').evaluate((name) => name.scrollWidth - name.clientWidth)).toBeLessThanOrEqual(0)
    // The card is taller than the sheet and scrolls; its handle still gets its 44 px.
    if (isMobile)
      expect((await page.getByRole('button', { name: 'Shrink card' }).boundingBox())!.height).toBeGreaterThanOrEqual(44)
  })

  test('opens from a chooser that a refresh has trimmed', async ({ page }) => {
    await zoomIn(page)
    await page.getByRole('button', { name: /Norton St, Leichhardt/ }).click({ force: true })
    await expect(page.getByRole('heading', { name: '2 bikes here' })).toBeVisible()
    await sql(`UPDATE tags SET expires_at = now() WHERE id = '${MARION_ST}'`)
    await page.evaluate(() => window.dispatchEvent(new Event('focus')))
    await expect(page.getByRole('heading', { name: '1 bike here' })).toBeVisible()
    await expect(page.getByRole('link', { name: /Marion St/ })).toHaveCount(0)
    await page.getByRole('link', { name: /Norton St/ }).click()
    await expect(page.getByRole('heading', { name: 'Lime e-bike' })).toBeFocused()
  })

  test.describe('on a phone', () => {
    test.skip(({ isMobile }) => !isMobile, 'phones only')
    // Each opens its pin with Enter, as a tap at the council-wide zoom may open a chooser (zoomIn).

    test('opens at half height, and shrinks to one line and back by tap and by flick', async ({ page }) => {
      await page.getByRole('button', { name: /Liverpool Rd, Ashfield/ }).press('Enter')
      const sheet = page.locator('#sheet')
      const viewport = page.viewportSize()!
      // Half the room between the header and the footer, or more where the map is down to its minimum.
      const map = (await page.getByRole('region', { name: 'Map', exact: true }).boundingBox())!
      expect((await sheet.boundingBox())!.height).toBeGreaterThanOrEqual(map.height)

      const handle = page.getByRole('button', { name: 'Shrink card' })
      await expect(handle).toHaveAttribute('aria-expanded', 'true')
      await handle.click()
      const expand = page.getByRole('button', { name: 'Expand card' })
      await expect(expand).toHaveAttribute('aria-expanded', 'false')
      await expect(page.getByRole('heading', { name: 'Hello e-bike · Blocking footpath · Liverpool Rd' })).toBeVisible()
      await expect(page.getByText(/^Last seen/)).toBeHidden()
      expect((await sheet.boundingBox())!.height).toBeLessThan(viewport.height * 0.25)
      await expand.click()
      await expect(page.getByText(/^Last seen/)).toBeVisible()

      // A flick on the handle switches when the finger lifts: down shrinks the card, up brings it back.
      const flick = async (name: string, dy: number) => {
        const box = (await page.getByRole('button', { name }).boundingBox())!
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
        await page.mouse.down()
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + dy, { steps: 4 })
        await page.mouse.up()
      }
      await flick('Shrink card', 40)
      await expect(expand).toBeVisible()
      await flick('Expand card', -40)
      await expect(handle).toBeVisible()

      // A drag on the card's content is left to scrolling, and never switches it.
      const details = (await page.getByText(/^Last seen/).boundingBox())!
      await page.mouse.move(details.x + 10, details.y + 5)
      await page.mouse.down()
      await page.mouse.move(details.x + 10, details.y + 65, { steps: 4 })
      await page.mouse.up()
      await expect(handle).toHaveAttribute('aria-expanded', 'true')
    })

    test('stays still under the header when the card shrinks at the council-wide zoom', async ({ page }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' })
      const pin = page.getByRole('button', { name: /Liverpool Rd, Ashfield/ })
      await pin.press('Enter')
      const top = async () => (await pin.boundingBox())!.y
      // Once the map has stopped moving for the card that just opened.
      let before = NaN
      await expect.poll(async () => before === (before = await top())).toBe(true)

      await page.getByRole('button', { name: 'Shrink card' }).click()
      await expect(page.getByRole('button', { name: 'Expand card' })).toBeVisible()
      let after = NaN
      await expect.poll(async () => after === (after = await top())).toBe(true)
      expect(Math.abs(after - before)).toBeLessThanOrEqual(3)
    })

    test('brings its pin back into view each time the card grows over it', async ({ page }) => {
      const pin = page.getByRole('button', { name: /Marrickville Rd, Dulwich Hill/ })
      await pin.press('Enter')
      // Growing the map moves it if its edges reach the bounds; growing the card again would then cover the pin.
      await page.getByRole('button', { name: 'Shrink card' }).click()
      await page.getByRole('button', { name: 'Expand card' }).click()
      const map = page.getByRole('region', { name: 'Map', exact: true })
      await expect
        .poll(async () => {
          const [area, box] = [(await map.boundingBox())!, (await pin.boundingBox())!]
          return box.y >= area.y && box.y + box.height <= area.y + area.height
        })
        .toBe(true)
    })
  })
})

test.describe('the desktop panel', () => {
  test.skip(({ isMobile }) => isMobile, 'desktop only')

  test("lists the tags beside the map, and opens a row's card in place, outlining its pin", async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('[data-map-ready]')).toBeAttached()
    const panel = page.locator('#sheet')
    expect((await panel.boundingBox())!).toMatchObject({ x: 0, width: 380 })
    await expect(page.getByRole('navigation', { name: 'View' })).toBeHidden()
    await expect(panel.getByRole('heading', { name: 'Ashfield, 1 bike' })).toBeVisible()

    await panel.getByRole('link', { name: /Liverpool Rd/ }).click()
    await expect(page.getByRole('heading', { name: 'Hello e-bike' })).toBeFocused()
    await expect(page.getByRole('button', { name: 'Shrink card' })).toBeHidden()
    const pin = page.getByRole('button', { name: /Liverpool Rd, Ashfield/ })
    await expect(pin).toHaveAttribute('aria-expanded', 'true')
    expect(await pin.evaluate((button) => getComputedStyle(button).outlineWidth)).toBe('3px')

    await page.getByRole('button', { name: 'Close' }).click()
    await expect(panel.getByRole('heading', { name: 'Ashfield, 1 bike' })).toBeVisible()
    await expect(pin).toBeFocused()
  })
})
