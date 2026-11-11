import { expect, test, type Page } from '@playwright/test'

// The headstone's colours as a canvas reads them back: grey edge, grey face, green ground, and the cross in the
// header's night slate. Then a clear pixel.
const NIGHT = '31,42,54,255'
const HEADSTONE = ['154,165,177,255', '196,204,212,255', '60,154,58,255', NIGHT]
const CLEAR = '0,0,0,0'

/** The icons the page names, in order. */
const icons = (page: Page) =>
  page.locator('link[rel="icon"], link[rel="apple-touch-icon"]').evaluateAll((links) =>
    links.map((link) => ({
      rel: link.getAttribute('rel'),
      type: link.getAttribute('type'),
      sizes: link.getAttribute('sizes'),
      href: link.getAttribute('href')!,
    })),
  )

/** The image at `href` as the browser draws it at `size` × `size` px: each pixel's colour, row by row. */
const draw = (page: Page, href: string, size: number) =>
  page.evaluate(
    async ([href, size]) => {
      const image = new Image()
      image.src = href
      await image.decode()
      const context = new OffscreenCanvas(size, size).getContext('2d')!
      context.drawImage(image, 0, 0, size, size)
      const { data } = context.getImageData(0, 0, size, size)
      const pixel = (i: number) => data.slice(4 * i, 4 * i + 4).join()
      return Array.from({ length: size }, (_, y) => Array.from({ length: size }, (_, x) => pixel(y * size + x)))
    },
    [href, size] as const,
  )

/** `rows` with each pixel made a `factor` × `factor` square. */
const scale = (rows: string[][], factor: number): string[][] =>
  rows.flatMap((row) => Array(factor).fill(row.flatMap((pixel) => Array(factor).fill(pixel))))

// Every page has them; the list's is the lightest.
test.beforeEach(({ page }) => page.goto('/list'))

test('names the headstone SVG for tabs, favicon.ico for older browsers, and the home-screen icon', async ({
  page,
  request,
}) => {
  const links = await icons(page)
  expect(links.map(({ href, ...link }) => ({ ...link, path: href.split('?')[0] }))).toEqual([
    { rel: 'icon', type: 'image/x-icon', sizes: '32x32', path: '/favicon.ico' },
    { rel: 'icon', type: 'image/svg+xml', sizes: 'any', path: '/icon.svg' },
    { rel: 'apple-touch-icon', type: 'image/png', sizes: '180x180', path: '/apple-icon.png' },
  ])
  for (const { type, href } of links) {
    const response = await request.get(href)
    // They come through proxy.ts, so they carry its security headers too.
    expect(response.headers()).toMatchObject({ 'content-type': type, 'x-content-type-options': 'nosniff' })
  }
})

test("draws the header's headstone in the tab", async ({ page }) => {
  const [, svg] = await icons(page)
  // Every shape in each drawing: its kind, colour and outline.
  const [icon, header] = await page.evaluate(async (href) => {
    const icon = new DOMParser().parseFromString(await (await fetch(href)).text(), 'image/svg+xml').documentElement
    return [icon, document.querySelector('header svg')!].map((svg) =>
      [...svg.children].map((shape) => [shape.localName, shape.getAttribute('fill'), shape.getAttribute('d')]),
    )
  }, svg!.href)
  expect(icon).toHaveLength(4)
  expect(icon).toEqual(header)
})

test('draws every icon in whole pixels of the 16 px tab icon', async ({ page }) => {
  const [ico, svg, apple] = await icons(page)
  const tab = await draw(page, svg!.href, 16)
  // Only the headstone's colours and clear: no blended edges.
  expect(new Set(tab.flat())).toEqual(new Set([...HEADSTONE, CLEAR]))
  // Each pixel twice the size on a 2× screen, and in favicon.ico.
  expect(await draw(page, svg!.href, 32)).toEqual(scale(tab, 2))
  expect(await draw(page, ico!.href, 32)).toEqual(scale(tab, 2))
  // Ten times the size on an iPhone home screen, which shows no clear: on night slate, with a pixel of it all round.
  const onNight = (row: string[]) => [NIGHT, ...row.map((pixel) => (pixel === CLEAR ? NIGHT : pixel)), NIGHT]
  const edge = Array(16).fill(CLEAR)
  expect(await draw(page, apple!.href, 180)).toEqual(scale([edge, ...tab, edge].map(onNight), 10))
})
