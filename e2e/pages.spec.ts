import { expect, test } from '@playwright/test'
import { expectNoAxeViolations, resetDb, sql } from './support'

const LLEWELLYN_ST = '5eed0000-0000-4000-8000-000000000003'

// The production policy with the default local tiles, so no tile origin in connect-src.
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'nonce-NONCE' 'strict-dynamic'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self'",
  'worker-src blob:',
  'child-src blob:',
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join('; ')

test.beforeEach(() => resetDb())

test.describe('the map screen shell', () => {
  test('has the header, the map, the footer and, on phones, the Map | List toggle, with no CSP errors', async ({
    page,
    isMobile,
  }) => {
    const errors: string[] = []
    page.on('console', (message) => message.type() === 'error' && errors.push(message.text()))
    await page.goto('/')
    await expect(page.getByRole('banner').getByRole('link', { name: 'The Inner West E-bike Graveyard' })).toBeVisible()
    await expect(page.getByRole('contentinfo').getByRole('link', { name: 'Why this page exists' })).toBeVisible()
    await expect(page.getByRole('region', { name: 'Map', exact: true })).toBeVisible()
    const view = page.getByRole('navigation', { name: 'View' })
    // The side panel lists the tags itself, so it has no toggle (§13).
    if (isMobile) await expect(view.getByRole('link', { name: 'Map' })).toHaveAttribute('aria-current', 'page')
    else await expect(view).toBeHidden()
    await expectNoAxeViolations(page)
    expect(errors).toEqual([])
  })

  test('is sent with the full CSP, a fresh nonce on every script, and the security headers', async ({ request }) => {
    const nonces: string[] = []
    for (const response of [await request.get('/'), await request.get('/')]) {
      const headers = response.headers()
      const csp = headers['content-security-policy'] ?? ''
      const nonce = csp.match(/'nonce-([^']+)'/)?.[1] ?? ''
      expect(nonce).toBeTruthy()
      expect(csp.replace(nonce, 'NONCE')).toBe(CSP)
      expect(headers['x-content-type-options']).toBe('nosniff')
      expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin')
      expect(headers['permissions-policy']).toBe('geolocation=(self)')
      const scripts = (await response.text()).match(/<script[^>]*>/g) ?? []
      expect(scripts.length).toBeGreaterThan(0)
      for (const script of scripts) expect(script).toContain(`nonce="${nonce}"`)
      nonces.push(nonce)
    }
    expect(nonces[0]).not.toBe(nonces[1])
  })

  test('gives a new visitor a random cookie once, which only the server can read', async ({ page }) => {
    const first = await page.goto('/')
    // Over HTTPS, as on Vercel, it is Secure too (proxy.test.ts).
    expect(await first?.headerValue('set-cookie')).toMatch(
      /^iwb_v=[\w-]{22}; Path=\/; Expires=[^;]+; Max-Age=31536000; HttpOnly; SameSite=lax$/,
    )
    const [cookie] = await page.context().cookies()
    expect(cookie).toMatchObject({ name: 'iwb_v', httpOnly: true, sameSite: 'Lax' })
    const again = await page.goto('/list')
    expect(await again?.headerValue('set-cookie')).toBeNull()
  })

  test('shows a 3 px focus ring on the header link', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'Tab moves through links on desktop browsers')
    await page.goto('/')
    const home = page.getByRole('link', { name: 'The Inner West E-bike Graveyard' })
    while (!(await home.evaluate((link) => link === document.activeElement))) await page.keyboard.press('Tab')
    await expect(home).toHaveCSS('outline-width', '3px')
    await expect(home).toHaveCSS('outline-style', 'solid')
  })

  test('has a skip link that takes the focus past the map to the list', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('link', { name: 'Skip to the list' }).press('Enter')
    await expect(page.locator('#sheet')).toBeFocused()
  })
})

test('pages reflow at 320 px wide with no horizontal scroll, at twice the text size too', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 })
  for (const path of ['/', '/list', `/tag/${LLEWELLYN_ST}`, '/privacy', '/accessibility']) {
    await page.goto(path)
    for (const size of ['100%', '200%']) {
      await page.addStyleTag({ content: `:root { font-size: ${size} }` })
      const width = await page.evaluate(() => document.documentElement.scrollWidth)
      expect(width, `${path} at ${size}`).toBeLessThanOrEqual(320)
    }
  }
})

test.describe('the list', () => {
  test('shows every live tag once, grouped by suburb, in order', async ({ page }) => {
    await page.goto('/list')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('14 bikes in the graveyard')
    const rows = page.getByRole('main').getByRole('listitem').getByRole('link')
    await expect(rows).toHaveCount(14)
    expect(new Set(await rows.evaluateAll((links) => links.map((link) => link.getAttribute('href')))).size).toBe(14)

    const groups = await page.getByRole('heading', { level: 2 }).allTextContents()
    expect(groups).toContain('Marrickville · 3')
    const suburbs = groups.map((group) => group.split(' · ')[0] ?? '')
    expect(suburbs).toEqual(suburbs.toSorted((a, b) => a.localeCompare(b)))
    const marrickville = page.getByRole('main').locator('section').filter({ hasText: 'Marrickville · 3' })
    await expect(marrickville.locator('b')).toHaveText(['Illawarra Rd', 'Llewellyn St', 'Sydenham Rd'])
    await expectNoAxeViolations(page)
  })

  test('opens a tag page from a row, and links to the text pages from its footer', async ({ page }) => {
    await page.goto('/list')
    await page.getByRole('link', { name: /Llewellyn St/ }).click()
    await expect(page).toHaveURL(`/tag/${LLEWELLYN_ST}`)
    await page.goBack()
    await page.getByRole('contentinfo').getByRole('link', { name: 'Privacy' }).click()
    await expect(page).toHaveURL('/privacy')
  })

  test('makes every link at least 44 × 44 px', async ({ page }) => {
    await page.goto('/list')
    const small = await page.getByRole('link').evaluateAll((links) =>
      links.flatMap((link) => {
        const { width, height } = link.getBoundingClientRect()
        return width < 44 || height < 44 ? [`${link.textContent}: ${width} × ${height}`] : []
      }),
    )
    expect(small).toEqual([])
  })

  test('shows the empty state when no tag is live', async ({ page }) => {
    await sql('TRUNCATE tags CASCADE')
    await page.goto('/list')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('No bikes in the graveyard right now.')
    await expectNoAxeViolations(page)
  })

  test.describe('without JavaScript', () => {
    test.use({ javaScriptEnabled: false })

    test('still lists every tag', async ({ page }) => {
      await page.goto('/list')
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('14 bikes in the graveyard')
      await expect(page.getByRole('main').getByRole('listitem')).toHaveCount(14)
    })

    test('says the map needs it, in place of a map that would never finish loading', async ({ page }) => {
      await page.goto('/')
      const status = page.getByRole('region', { name: 'Map' }).getByRole('status')
      await expect(status.getByText('Turn on JavaScript to see the map.')).toBeVisible()
      await expect(status.getByText('Map loading')).toBeHidden()
      await expect(status.locator('svg')).toBeHidden()
    })

    test('says Still there and Removed need it, in place of buttons that would do nothing', async ({ page }) => {
      for (const [path, rows] of [
        ['/list', 14],
        [`/tag/${LLEWELLYN_ST}`, 1],
      ] as const) {
        await page.goto(path)
        await expect(page.getByRole('button', { name: /^(Still there|Removed)$/ })).toHaveCount(0)
        await expect(page.getByText('Turn on JavaScript to mark it Still there or Removed.')).toHaveCount(rows)
        await expect(page.getByText('Turn on JavaScript to mark it Still there or Removed.').first()).toBeVisible()
      }
    })
  })
})

test.describe('the tag page', () => {
  test('shows a live tag', async ({ page }) => {
    await page.goto(`/tag/${LLEWELLYN_ST}`)
    // The accessible name leaves out the decorative pin and its letter.
    await expect(page.getByRole('heading', { level: 1, name: 'Lime e-bike', exact: true })).toBeVisible()
    await expect(page.getByRole('main')).toContainText('Blocking footpath')
    await expect(page.getByRole('main')).toContainText('Llewellyn St, Marrickville')
    await expect(page.getByRole('main')).toContainText(/Last seen \d+ h ago/)
    await expect(page.getByRole('main')).toContainText(/Disappears in \d+ h/)
    await expectNoAxeViolations(page)
  })

  test('is a 404 saying "This tag has gone" for a removed, unknown or malformed id', async ({ page }) => {
    await sql(`UPDATE tags SET status = 'removed' WHERE id = '${LLEWELLYN_ST}'`)
    for (const id of [LLEWELLYN_ST, '00000000-0000-4000-8000-000000000000', 'not-a-uuid']) {
      const response = await page.goto(`/tag/${id}`)
      expect(response?.status(), id).toBe(404)
      // Both the server's HTML and the hydrated page name it, not "Tagged bike".
      expect(await response?.text(), id).toContain('<title>This tag has gone')
      await expect(page).toHaveTitle(/^This tag has gone/)
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('This tag has gone')
    }
    await expectNoAxeViolations(page)
  })
})

test('the text pages each have one h1 and headings in order, and pass axe', async ({ page }) => {
  for (const path of ['/why', '/accessibility', '/privacy', '/terms']) {
    await page.goto(path)
    const levels = await page.locator('h1, h2, h3, h4').evaluateAll((headings) => headings.map((h) => +h.tagName[1]!))
    expect(levels[0], path).toBe(1)
    expect(
      levels.filter((level) => level === 1),
      path,
    ).toHaveLength(1)
    levels.forEach((level, i) => expect(level - (levels[i - 1] ?? 0), path).toBeLessThanOrEqual(1))
    await expectNoAxeViolations(page)
  }
  await page.goto('/why')
  await expect(page.getByRole('main')).toContainText(
    'This site exists to illustrate to our council the scale of the problem',
  )
})

test('an unknown address is a 404', async ({ page }) => {
  const response = await page.goto('/no-such-page')
  expect(response?.status()).toBe(404)
  await expect(page).toHaveTitle(/^Page not found/)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Page not found')
  await expectNoAxeViolations(page)
})
