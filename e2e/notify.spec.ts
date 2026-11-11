import { expect, type Page, test } from '@playwright/test'
import { expectNoAxeViolations, resetDb, sql } from './support'

test.beforeEach(() => resetDb())

// The seeded Lime e-bike on Llewellyn St, Marrickville, blocking the footpath, and the Ario one on Marion St.
const LLEWELLYN_ST = '5eed0000-0000-4000-8000-000000000003'
const MARION_ST = '5eed0000-0000-4000-8000-000000000002'
const MESSAGE =
  'I am reporting that there is a Lime e-bike blocking the footpath near Llewellyn St, Marrickville.\n\n' +
  'Coordinates: -33.904497, 151.171932\n' +
  `Tagged on The Inner West E-bike Graveyard: http://localhost:3000/tag/${LLEWELLYN_ST}`
const HREF =
  'mailto:support-au@li.me?subject=Lime%20e-bike%2C%20blocking%20footpath%2C%20Llewellyn%20St%2C%20Marrickville' +
  `&body=${encodeURIComponent(MESSAGE.replaceAll('\n', '\r\n'))}`

const cta = (page: Page) => page.getByText('Notify the service provider?')
const emailLink = (page: Page, operator = 'Lime') => page.getByRole('link', { name: `Email ${operator}` })
const message = (page: Page) => page.getByRole('textbox', { name: 'Message' })
const copy = (page: Page) => page.getByRole('button', { name: 'Copy message' })

test.describe('Notify the service provider?', () => {
  test('opens on the tag page to an email to the operator, and the message to copy, read-only', async ({ page }) => {
    await page.goto(`/tag/${LLEWELLYN_ST}`)
    await expect(emailLink(page)).toBeHidden()
    await cta(page).click()
    await expect(emailLink(page)).toHaveAttribute('href', HREF)
    await expect(
      page.getByText('Opens your own email app, addressed to support-au@li.me. This site sends nothing.'),
    ).toBeVisible()
    await expect(message(page)).toHaveValue(MESSAGE)
    await expect(message(page)).not.toBeEditable()
    // It comes after the questions the page is for, so they keep their place at the top.
    const removed = await page.getByRole('button', { name: 'Removed' }).boundingBox()
    expect((await cta(page).boundingBox())!.y).toBeGreaterThan(removed!.y)
    await expectNoAxeViolations(page)
  })

  test('copies the message and says so', async ({ page, context, browserName }) => {
    // Only Chromium lets a test read the clipboard back; WebKit still has to copy and say so.
    if (browserName === 'chromium') await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    await page.goto(`/tag/${LLEWELLYN_ST}`)
    await cta(page).click()
    await copy(page).click()
    await expect(page.locator('#announcer')).toHaveText('Copied')
    await expect(page.getByRole('main').getByText('Copied', { exact: true })).toBeVisible()
    if (browserName === 'chromium') expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(MESSAGE)
  })

  test("says so when the browser won't copy, as the message can still be selected", async ({ page }) => {
    await page.addInitScript(() => (navigator.clipboard.writeText = () => Promise.reject(new Error('Not allowed'))))
    await page.goto(`/tag/${LLEWELLYN_ST}`)
    await cta(page).click()
    await copy(page).click()
    const refused = "Couldn't copy. Select the message and copy it."
    await expect(page.locator('#announcer')).toHaveText(refused)
    await expect(page.getByRole('main').getByText(refused)).toBeVisible()
  })

  test('links to the tag page at the address the visitor reached the site at', async ({ request }) => {
    // As Vercel forwards a request for a preview or the custom domain.
    const html = await (
      await request.get(`/tag/${LLEWELLYN_ST}`, { headers: { host: 'preview.example', 'x-forwarded-proto': 'https' } })
    ).text()
    expect(html).toContain(`Graveyard: https://preview.example/tag/${LLEWELLYN_ST}</textarea>`)
    expect(html).toContain(encodeURIComponent(`Graveyard: https://preview.example/tag/${LLEWELLYN_ST}`))
    expect(html).not.toContain('localhost')
  })

  test("is on a pin's card too, by keyboard, writing to that tag's operator", async ({ page, isMobile }) => {
    await page.goto('/')
    await expect(page.locator('[data-map-ready]')).toBeAttached()
    await page.locator(`[data-tag="${MARION_ST}"] button`).focus()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('heading', { name: 'Ario e-bike' })).toBeFocused()
    await cta(page).focus()
    await page.keyboard.press('Enter')
    await expect(emailLink(page, 'Ario')).toHaveAttribute(
      'href',
      /^mailto:feedback@ario\.com\?subject=Ario%20e-bike%2C%20in%20park%20or%20reserve%2C%20Marion%20St%2C%20Leichhardt&body=/,
    )
    await expect(message(page)).toHaveValue(
      'I am reporting that there is an Ario e-bike left in a park or reserve near Marion St, Leichhardt.\n\n' +
        'Coordinates: -33.883891, 151.155464\n' +
        `Tagged on The Inner West E-bike Graveyard: http://localhost:3000/tag/${MARION_ST}`,
    )
    // The message, then Copy, follow the link in the tab order of a desktop keyboard. (On a phone, WebKit's Tab skips
    // buttons and links.)
    if (!isMobile) {
      await emailLink(page, 'Ario').focus()
      await page.keyboard.press('Tab')
      await expect(message(page)).toBeFocused()
      await page.keyboard.press('Tab')
      await expect(copy(page)).toBeFocused()
    }
    await expectNoAxeViolations(page)
  })

  test('opens in the phone sheet at 320 px and twice the text size, each control in reach and 44 px or more', async ({
    page,
    browserName,
  }) => {
    test.skip(browserName !== 'webkit', 'the iPhone project')
    await page.setViewportSize({ width: 320, height: 568 })
    await page.goto('/')
    await expect(page.locator('[data-map-ready]')).toBeAttached()
    await page.addStyleTag({ content: 'html { font-size: 200% }' })
    await page.locator(`[data-tag="${LLEWELLYN_ST}"] button`).focus()
    await page.keyboard.press('Enter')
    await cta(page).scrollIntoViewIfNeeded()
    await cta(page).click()
    for (const control of [cta(page), emailLink(page), message(page), copy(page)]) {
      // The sheet is a small window at this size, so a control taller than it is only partly in view at a time.
      await control.scrollIntoViewIfNeeded()
      await expect(control).toBeInViewport()
      expect((await control.boundingBox())!.height).toBeGreaterThanOrEqual(44)
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320)
    // The address never breaks at its hyphen, which would leave half of it on each line.
    const address = page.getByText('support-au@li.me', { exact: true })
    expect(await address.evaluate((span) => span.getClientRects().length)).toBe(1)
  })

  test('is left out when the visitor was not sure whose bike it is', async ({ page }) => {
    await sql(`UPDATE tags SET operator = 'not_sure' WHERE id = '${LLEWELLYN_ST}'`)
    await page.goto(`/tag/${LLEWELLYN_ST}`)
    await expect(page.getByRole('heading', { name: 'Share e-bike' })).toBeVisible()
    await expect(cta(page)).toHaveCount(0)
  })

  test.describe('without JavaScript', () => {
    test.use({ javaScriptEnabled: false })

    test('still opens, with the link and the message to select, and no Copy button that would do nothing', async ({
      page,
    }) => {
      await page.goto(`/tag/${LLEWELLYN_ST}`)
      await cta(page).click()
      await expect(emailLink(page)).toHaveAttribute('href', HREF)
      await expect(message(page)).toHaveValue(MESSAGE)
      await expect(copy(page)).toBeHidden()
    })
  })
})
