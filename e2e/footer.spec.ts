import { expect, type Page, test } from '@playwright/test'
import { expectNoAxeViolations, menu, menuButton, resetDb, siteLinks } from './support'

const LLEWELLYN_ST = '5eed0000-0000-4000-8000-000000000003'
const ADDRESS = 'hello@innerwestbikegraveyard.com'
const REPO = 'https://github.com/michael-lebot/innerwestbikegraveyard'
const PAGES = ['/', '/list', `/tag/${LLEWELLYN_ST}`, '/why', '/privacy', '/accessibility', '/terms']

const footer = (page: Page) => page.getByRole('contentinfo')
/** The Reduce motion switch, in the footer or, on a phone, in the header's menu, which this opens. */
const toggle = async (page: Page) => (await siteLinks(page)).getByRole('button', { name: 'Reduce motion' })
const box = async (page: Page, name: string) => (await page.getByRole('button', { name, exact: true }).boundingBox())!
/** The loading bike over the preview, which turns until the map is ready. */
const bike = (page: Page) => page.getByRole('region', { name: 'Map' }).getByRole('status').locator('svg > g')
/** Keeps the map loading, and its bike on screen, for up to its 15 s. */
const holdMap = (page: Page) => page.route('**/*.pmtiles', () => {})

test.beforeEach(() => resetDb())

test('stays at the foot of the screen on every page, covering none of the page', async ({ page, isMobile }) => {
  test.skip(isMobile, 'a phone held upright has the menu instead')
  // And both 404s: the site's, and a tag's.
  for (const path of [...PAGES, '/nope', '/tag/not-a-uuid']) {
    await page.goto(path)
    for (const scrolled of [false, true]) {
      if (scrolled) await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight))
      const foot = (await footer(page).boundingBox())!
      expect(foot.y + foot.height, path).toBeCloseTo(page.viewportSize()!.height, 0)
      // Scrolled to its end, the page's last line is above it.
      const main = (await page.getByRole('main').boundingBox())!
      if (scrolled) expect(main.y + main.height, path).toBeLessThanOrEqual(foot.y + 1)
    }
    for (const name of ['Why this page exists', 'Privacy', 'Accessibility', 'Terms'])
      await expect(footer(page).getByRole('link', { name, exact: true }), path).toBeVisible()
    await expect(footer(page).getByRole('link', { name: 'Source code on GitHub' }), path).toHaveAttribute('href', REPO)
    await expect(await toggle(page), path).toBeVisible()
    await expect(menuButton(page), path).toBeHidden()
  }
  await expectNoAxeViolations(page)
})

test.describe('on a phone held upright', () => {
  test.skip(({ isMobile }) => !isMobile, 'phones only')

  test('has no footer: a menu in the header holds the same links on every page', async ({ page }) => {
    for (const path of [...PAGES, '/nope', '/tag/not-a-uuid']) {
      await page.goto(path)
      await expect(footer(page), path).toBeHidden()
      const links = await siteLinks(page)
      for (const name of ['Why this page exists', 'Privacy', 'Accessibility', 'Terms'])
        await expect(links.getByRole('link', { name, exact: true }), path).toBeVisible()
      await expect(links.getByRole('link', { name: 'Source code on GitHub' }), path).toHaveAttribute('href', REPO)
      await expect(await toggle(page), path).toBeVisible()
    }
    await expectNoAxeViolations(page)
  })

  test('opens from a 44 px button that reports its state, takes the focus in, and gives it back on Esc', async ({
    page,
  }) => {
    await page.goto('/')
    const button = menuButton(page)
    await expect(button).toHaveAttribute('aria-controls', 'menu')
    await expect(button).toHaveAttribute('aria-expanded', 'false')
    const { width, height } = (await button.boundingBox())!
    expect(Math.min(width, height)).toBeGreaterThanOrEqual(44)
    await expect(menu(page)).toBeHidden()

    await button.click()
    await expect(button).toHaveAttribute('aria-expanded', 'true')
    await expect(menu(page).getByRole('link', { name: `Feedback: ${ADDRESS}` })).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(menu(page)).toBeHidden()
    await expect(button).toHaveAttribute('aria-expanded', 'false')
    await expect(button).toBeFocused()

    // The button closes it too, and so does a tap outside it.
    await button.click()
    await button.click()
    await expect(menu(page)).toBeHidden()
    await button.click()
    await page.mouse.click(200, page.viewportSize()!.height - 20)
    await expect(menu(page)).toBeHidden()

    // A page picked from it opens with the menu closed.
    await button.click()
    await menu(page).getByRole('link', { name: 'Privacy' }).click()
    await expect(page).toHaveURL('/privacy')
    await expect(menu(page)).toBeHidden()
    await expect(button).toHaveAttribute('aria-expanded', 'false')
  })
})

test('sends feedback by email to the site address, named in full for screen readers', async ({ page }) => {
  await page.goto('/privacy')
  const feedback = (await siteLinks(page)).getByRole('link', { name: `Feedback: ${ADDRESS}`, exact: true })
  await expect(feedback).toHaveAttribute('href', `mailto:${ADDRESS}`)
  // A desktop has the room to show the address too; a phone shows "Feedback".
  const shown = feedback.getByText(ADDRESS)
  await (page.viewportSize()!.width >= 1024 ? expect(shown).toBeVisible() : expect(shown).toBeHidden())
})

test('sits under the map screen, leaving the sheet whole and every map control in the map', async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, 'a phone held upright has no footer')
  await page.goto('/')
  await expect(page.locator('[data-map-ready]')).toBeAttached()
  const foot = (await footer(page).boundingBox())!
  const map = (await page.getByRole('region', { name: 'Map', exact: true }).boundingBox())!
  const sheet = (await page.locator('#sheet').boundingBox())!
  for (const part of [map, sheet]) expect(part.y + part.height).toBeLessThanOrEqual(foot.y + 1)
  for (const name of ['Zoom in', 'Zoom out', 'Move map', 'About this map']) {
    const control = await box(page, name)
    expect(control.y + control.height, name).toBeLessThanOrEqual(map.y + map.height)
  }
})

/** Its height in rows of 44 px controls, 8 px apart, with 5 px above and below and its 1 px border. */
const rows = (n: number) => n * 44 + (n - 1) * 8 + 2 * 5 + 1

test('keeps to one row at 768 px wide, and to a fifth of the screen at twice the text size', async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 1024 })
  await page.goto('/')
  expect((await footer(page).boundingBox())!.height).toBeCloseTo(rows(1), 0)
  await page.addStyleTag({ content: ':root { font-size: 200% }' })
  const foot = (await footer(page).boundingBox())!
  expect(foot.height).toBeLessThanOrEqual(1024 / 5 + 1)
  // What doesn't fit scrolls inside it.
  const switcher = await toggle(page)
  await switcher.scrollIntoViewIfNeeded()
  const last = (await switcher.boundingBox())!
  expect(last.y + last.height).toBeLessThanOrEqual(foot.y + foot.height + 1)
})

test.describe('on a phone held sideways', () => {
  test.use({ viewport: { width: 750, height: 342 } })

  test('takes one row, so the map keeps room for its controls', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('[data-map-ready]')).toBeAttached()
    expect((await footer(page).boundingBox())!.height).toBeLessThanOrEqual(rows(1))
    const map = (await page.getByRole('region', { name: 'Map', exact: true }).boundingBox())!
    const about = await box(page, 'About this map')
    expect(about.y + about.height).toBeLessThanOrEqual(map.y + map.height)
  })
})

test('leaves room inside it for the focus ring, which its scrolling would otherwise clip', async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, 'a phone held upright has no footer')
  await page.goto('/privacy')
  const foot = (await footer(page).boundingBox())!
  for (const control of await footer(page).locator('a, button').all()) {
    const { y, height } = (await control.boundingBox())!
    // theme.css: a 3 px ring, 2 px out. The footer's own border is above it.
    expect(y - 5).toBeGreaterThanOrEqual(foot.y + 1 - 0.5)
    expect(y + height + 5).toBeLessThanOrEqual(foot.y + foot.height + 0.5)
  }
})

test('scrolls whatever has the focus clear of it', async ({ page, browserName, isMobile }) => {
  test.skip(browserName === 'webkit', 'Safari tabs to links only with a setting turned on')
  test.skip(isMobile, 'a phone held upright has no footer')
  await page.goto('/list')
  const foot = (await footer(page).boundingBox())!
  for (let i = 0; i < 100; i++) {
    await page.keyboard.press('Tab')
    const [bottom, inFooter] = await page.evaluate(() => [
      document.activeElement!.getBoundingClientRect().bottom,
      !!document.activeElement!.closest('footer'),
    ])
    if (inFooter) return
    expect(bottom).toBeLessThanOrEqual(foot.y)
  }
  throw new Error('Tab never reached the footer')
})

test.describe('Reduce motion', () => {
  test('follows the OS setting until the visitor chooses', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto('/list')
    await expect(await toggle(page)).toHaveAttribute('aria-pressed', 'true')
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await expect(await toggle(page)).toHaveAttribute('aria-pressed', 'false')
  })

  for (const [os, reduce, turning] of [
    ['no-preference', 'true', 'none'],
    ['reduce', 'false', 'wheelie'],
  ] as const) {
    test(`overrides the OS's ${os} at once and after a reload, kept in this browser only`, async ({
      page,
      context,
    }) => {
      await page.emulateMedia({ reducedMotion: os })
      await holdMap(page)
      await page.goto('/')
      await (await toggle(page)).click()
      await expect(await toggle(page)).toHaveAttribute('aria-pressed', reduce)
      await expect(bike(page)).toHaveCSS('animation-name', turning)
      await expectNoAxeViolations(page)

      await page.reload()
      await expect(await toggle(page)).toHaveAttribute('aria-pressed', reduce)
      await expect(bike(page)).toHaveCSS('animation-name', turning)
      // In localStorage, never in a cookie, so the server never learns it.
      expect(await page.evaluate(() => localStorage.getItem('reduce-motion'))).toBe(reduce)
      expect((await context.cookies()).map(({ name }) => name)).toEqual(['iwb_v'])
    })
  }

  test("applies before the page's scripts run, so a stored choice never shows a frame of motion", async ({ page }) => {
    await page.goto('/list')
    await (await toggle(page)).click()
    await expect(await toggle(page)).toHaveAttribute('aria-pressed', 'true')
    // Without its scripts the page never hydrates: only the inline one in <head> runs, and as an inline script there
    // it runs before any of the page is drawn.
    await page.route('**/_next/static/chunks/**/*.js', (route) => route.abort())
    const html = await (await page.goto('/'))!.text()
    expect(html.slice(0, html.indexOf('</head>'))).toMatch(/<script nonce="[^"]+">try\{const c=localStorage/)
    await expect(bike(page)).toHaveCSS('animation-name', 'none')
    // The switch already looks pressed.
    await expect((await toggle(page)).locator('span').first()).toHaveCSS('background-color', 'rgb(29, 107, 42)')
  })

  test("reaches the map: its camera moves, a drag's glide and the picked pin", async ({ page, browserName }) => {
    test.slow(browserName === 'webkit', 'a flick that misses is tried again')
    for (const [os, reduce] of [
      ['no-preference', true],
      ['reduce', false],
    ] as const) {
      await page.emulateMedia({ reducedMotion: os })
      await page.goto('/')
      await expect(page.locator('[data-map-ready]')).toBeAttached()
      await (await toggle(page)).click()
      await expect(await toggle(page)).toHaveAttribute('aria-pressed', String(reduce))
      // A phone's menu, open over the map, closes.
      await page.keyboard.press('Escape')

      // Where a pin is just after Zoom in, at the next frame, and once any move has ended.
      const [next, end] = await page.evaluate(async () => {
        const pin = document.querySelector('[data-tag] button')!
        const at = () => [pin.getBoundingClientRect().x, pin.getBoundingClientRect().y]
        document.querySelector<HTMLButtonElement>('[aria-label="Zoom in"]')!.click()
        await new Promise(requestAnimationFrame)
        const next = at()
        await new Promise((resolve) => setTimeout(resolve, 1000))
        return [next, at()]
      })
      if (reduce) expect(next, os).toEqual(end)
      else expect(next, os).not.toEqual(end)

      // Where it is just after a flick with the mouse, and once any glide has ended: within the pixel the pins snap
      // to when the map stops, or far beyond it. Only in WebKit: headless Chromium draws the map too slowly for
      // MapLibre to see a flick, so it never glides there.
      if (browserName === 'webkit') {
        const map = (await page.getByRole('region', { name: 'Map', exact: true }).boundingBox())!
        const pinX = () => page.evaluate(() => document.querySelector('[data-tag] button')!.getBoundingClientRect().x)
        const flick = async () => {
          await page.mouse.move(map.x + 40, map.y + 60)
          await page.mouse.down()
          // A frame apart: MapLibre judges the glide from the moves it drew in the last 160 ms.
          for (let x = 70; x <= 160; x += 30) {
            await page.mouse.move(map.x + x, map.y + 60)
            await page.evaluate(() => new Promise(requestAnimationFrame))
          }
          await page.mouse.up()
          const released = await pinX()
          await page.waitForTimeout(2500)
          return Math.abs((await pinX()) - released)
        }
        if (reduce) expect(await flick(), os).toBeLessThan(1)
        // On a slow CI runner, frames can stretch until fewer than two moves fall in those 160 ms, and the flick
        // doesn't glide at all, so a flick that misses is tried again. Reduced motion gets one try, and must stay still.
        else await expect(async () => expect(await flick(), os).toBeGreaterThan(10)).toPass({ timeout: 20_000 })
      }

      const pin = page.getByRole('button', { name: /Liverpool Rd, Ashfield/ })
      await pin.focus()
      await page.keyboard.press('Enter')
      await expect(pin).toHaveAttribute('aria-expanded', 'true')
      await expect(pin, os).toHaveCSS('animation-name', reduce ? 'none' : 'bob')
    }
  })
})

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false })

  test('keeps its links working, in the menu too, and hides the switch, which needs it', async ({ page }) => {
    await page.goto('/')
    const links = await siteLinks(page)
    await expect(links.getByRole('link', { name: /^Feedback/ })).toBeVisible()
    await expect(links.getByRole('button', { name: 'Reduce motion' })).toHaveCount(0)
    await links.getByRole('link', { name: 'Privacy' }).click()
    await expect(page).toHaveURL('/privacy')
  })
})
