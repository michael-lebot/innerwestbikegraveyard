import { gzipSync } from 'node:zlib'
import { expect, type Page, type Request, type Response, test } from '@playwright/test'
import { resetDb, sql } from './support'

// SPEC.md §11.1, in compressed bytes as transferred by `next start` (gzip).
// The 120 KB JavaScript budget was reset at M0 (2026-11-09): Next 16.4.5 and React 19.3.1 alone transfer 138,644 B
// gzipped (118,598 B as Brotli, which Vercel serves) on a page with no client components. 150 KiB leaves about
// 15 KiB for the site's own code before the map.
const JS_BEFORE_MAP = 150 * 1024
const FONT_FILES = 2
const FONT_BYTES = 60_000
const TAGS_100_BYTES = 15_000
// Measured in task 2.9 (2026-11-09): 299,546 B, so the 300 KB budget stood, but CI's runner measured 300,560 B. PR 2's
// review left pmtiles' fflate out of the browser (map/no-fflate.ts): 290,377 B.
const MAP_BUNDLE_BYTES = 300_000
// §11.1 left 6 s to be set from M1 measurements. The time is in the network, so this gate leaves the CPU at full
// speed (see the test). In PR 2's review, its network log showed 960 KB moved before the map was ready: the page's
// 200 KB, the map chunk's 290 KB, the bold glyphs' 86 KB and the first view's 350 KB of tiles. That is 5.1 s of
// transfer at 1.47 Mbps, and the page, the map chunk, the tiles' header and the tiles each wait behind a 562 ms round
// trip. It measured 8.2 to 8.3 s on a laptop, so the gate is 14.5 s: the laptop's time is under 60% of it, which
// leaves room for a slower CI runner. Fewer tile or glyph bytes is what would bring it down.
const MAP_READY_MS = 14_500
const FIRST_VIEW_TILE_REQUESTS = 40
const FIRST_VIEW_TILE_BYTES = 1_500_000
// §11.1 says 200 ms. Headless Chromium draws WebGL in software and reads the map's canvas back to composite each
// frame the map takes part in: in a trace of opening a card with the CPU at full speed, 160 ms of the 215 ms frame
// is that read-back (GLES2::ReadPixels). With the GPU (--enable-gpu) the same steps measured 48 ms and 24 ms. With
// the CPU at full speed, opening a card measured 224 to 352 ms on a laptop and a zoom tap 88 to 168 ms, so the lab
// gate is 600 ms, keeping the laptop's time under 60% of it. The real-phone check at M1 (§11.4) holds the 200 ms.
const INTERACTION_MS = 600
// Opening the tag form gets INTERACTION_MS, for the card's reason: in the same frame the map pans the new pin into the
// strip above the dialog, and the runner's software WebGL reads that frame back. It measured 296 ms on GitHub's runner
// (PR 3's first CI run, pull request #4) and 72 to 104 ms on a laptop. Picking a chip moves no map and keeps §11.1's
// 200 ms: 16 to 24 ms on a laptop, under 60% of it.
const CHIP_MS = 200
// Choose by street's data (§11.1): every street with its corners, loaded when the picker opens, and one suburb's house
// numbers, loaded when a street in it is chosen. Marrickville's are the largest. Measured in task 4.6 (2026-11-10):
// 77,058 B and 30,684 B; the streets 78,677 B once each was marked for having house numbers or not.
const STREETS_BYTES = 100_000
const SUBURB_NUMBERS_BYTES = 40_000
// Typing in the street search and choosing a street move no map, so they keep §11.1's 200 ms: a letter measured 16 to
// 24 ms and choosing 16 ms on a laptop, under 60% of it.
const PICKER_MS = 200

const LLEWELLYN_ST = '5eed0000-0000-4000-8000-000000000003'

test.beforeEach(() => resetDb())

/** Every finished request and its compressed size, from now on. */
function recordRequests(page: Page) {
  const finished: Request[] = []
  page.on('requestfinished', (request) => finished.push(request))
  return async () =>
    Promise.all(
      finished.map(async (request) => ({
        url: new URL(request.url()),
        type: request.resourceType(),
        bytes: (await request.sizes()).responseBodySize,
      })),
    )
}

const sum = (rows: { bytes: number }[]) => rows.reduce((total, row) => total + row.bytes, 0)

/** Lighthouse's mobile preset through DevTools (§11): 4G, and with `cpu`, a mid-range phone's CPU (×4). */
async function throttle(page: Page, cpu: boolean) {
  const cdp = await page.context().newCDPSession(page)
  if (cpu) await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
  await cdp.send('Network.enable')
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 562.5,
    downloadThroughput: (1474.56 * 1024) / 8,
    uploadThroughput: (675 * 1024) / 8,
  })
}

for (const path of ['/', '/list', `/tag/${LLEWELLYN_ST}`]) {
  test(`${path} stays inside the JavaScript and font budgets`, async ({ page }) => {
    const requests = recordRequests(page)
    const html = await (await page.goto(path, { waitUntil: 'networkidle' }))!.text()
    const rows = await requests()

    // The page's own scripts are named in its HTML. Only the map screen loads more, after first paint, and the
    // other pages must never load the map: every script they run counts.
    const scripts = rows.filter((row) => row.type === 'script' && (path !== '/' || html.includes(row.url.pathname)))
    expect(sum(scripts), 'JavaScript bytes before the map').toBeLessThanOrEqual(JS_BEFORE_MAP)
    const fonts = rows.filter((row) => row.type === 'font')
    expect(fonts).toHaveLength(FONT_FILES)
    expect(sum(fonts), 'font bytes').toBeLessThanOrEqual(FONT_BYTES)
  })
}

// The two time gates leave the CPU at full speed. Headless Chromium already draws the map's WebGL in software on the
// CPU, which no phone does, and slowing that CPU fourfold too put both gates over on GitHub's runner (CI run
// 42586706684) for a reason a phone doesn't have. The byte and request gates keep the full profile.
test('the map is ready in time over 4G', async ({ page }) => {
  await throttle(page, false)
  await page.goto('/')
  await expect(page.locator('[data-map-ready]')).toBeAttached({ timeout: 30_000 })
  const ready = await page.evaluate(() => performance.getEntriesByName('map-ready')[0]!.startTime)
  test.info().annotations.push({ type: 'measured', description: `map ready ${Math.round(ready)} ms` })
  expect(ready, 'ms from navigation to map ready').toBeLessThanOrEqual(MAP_READY_MS)
})

test('a mid-range phone over 4G loads the map from a 300 KB bundle and 40 tiles', async ({ page }) => {
  await throttle(page, true)
  const requests = recordRequests(page)
  const html = await (await page.goto('/'))!.text()
  await expect(page.locator('[data-map-ready]')).toBeAttached({ timeout: 30_000 })
  const rows = await requests()

  // Every script after first paint is the map's: the browser loads nothing else then. MapLibre's worker is a blob:
  // inside the map's chunk, so its bytes are already counted.
  const map = rows.filter(
    (row) => row.type === 'script' && row.url.protocol !== 'blob:' && !html.includes(row.url.pathname),
  )

  // The tiles file's header, directories and tiles, all range requests on the one file.
  const tiles = rows.filter((row) => row.url.pathname.endsWith('.pmtiles'))
  test.info().annotations.push({
    type: 'measured',
    description: `map bundle ${sum(map)} B, first view ${tiles.length} tile requests ${sum(tiles)} B`,
  })
  expect(sum(map), 'map bundle bytes').toBeLessThanOrEqual(MAP_BUNDLE_BYTES)
  expect(tiles.length, 'first view tile requests').toBeLessThanOrEqual(FIRST_VIEW_TILE_REQUESTS)
  expect(sum(tiles), 'first view tile bytes').toBeLessThanOrEqual(FIRST_VIEW_TILE_BYTES)
})

/** Times each interaction from input to the next paint, with Event Timing, once the page (and any map) is ready. */
async function interactionTimer(page: Page, path = '/') {
  await page.goto(path)
  if (path === '/') await expect(page.locator('[data-map-ready]')).toBeAttached({ timeout: 30_000 })
  await page.evaluate(() => {
    const durations: number[] = ((window as unknown as { durations: number[] }).durations = [])
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as PerformanceEventTiming[])
        if (entry.interactionId) durations.push(entry.duration)
      // durationThreshold is missing from TypeScript's DOM types.
    }).observe({ type: 'event', durationThreshold: 16 } as PerformanceObserverInit)
  })

  /** The slowest event of an interaction, from input to the next paint. Under 16 ms, nothing is reported. */
  return async (act: () => Promise<void>) => {
    await page.evaluate(() => ((window as unknown as { durations: number[] }).durations.length = 0))
    await act()
    // Event Timing entries arrive after the paint they measure.
    await page.waitForTimeout(500)
    return page.evaluate(() => Math.max(0, ...(window as unknown as { durations: number[] }).durations))
  }
}

test('opening a card and tapping zoom each reach the next paint in time', async ({ page }) => {
  const timed = await interactionTimer(page)
  const openCard = await timed(async () => {
    await page.getByRole('button', { name: /Liverpool Rd, Ashfield/ }).click()
    await expect(page.getByRole('heading', { name: 'Hello e-bike' })).toBeVisible()
  })
  const zoom = await timed(() => page.getByRole('button', { name: 'Zoom in' }).click())
  test.info().annotations.push({ type: 'measured', description: `open a card ${openCard} ms, zoom tap ${zoom} ms` })
  expect(openCard, 'ms from tapping a pin to its card').toBeLessThanOrEqual(INTERACTION_MS)
  expect(zoom, 'ms from tapping + to the next paint').toBeLessThanOrEqual(INTERACTION_MS)
})

test('opening the tag form and picking a chip each reach the next paint in time', async ({ page }) => {
  const timed = await interactionTimer(page)
  // Instant camera moves, so the tap lands once the map has zoomed in for placing.
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.getByRole('button', { name: 'Tag a dumped bike' }).click()
  const map = (await page.getByRole('region', { name: 'Map', exact: true }).boundingBox())!
  await page.touchscreen.tap(map.x + map.width / 2 - 120, map.y + map.height / 2 + 120)
  await expect(page.getByRole('button', { name: 'Use this spot' })).toBeEnabled()

  const openForm = await timed(async () => {
    await page.getByRole('button', { name: 'Use this spot' }).click()
    await expect(page.getByRole('group', { name: "What's wrong?" })).toBeVisible()
  })
  const chip = await timed(() => page.getByRole('radio', { name: 'Lime' }).locator('..').click())
  test
    .info()
    .annotations.push({ type: 'measured', description: `open the form ${openForm} ms, pick a chip ${chip} ms` })
  expect(openForm, 'ms from Use this spot to the form').toBeLessThanOrEqual(INTERACTION_MS)
  expect(chip, 'ms from tapping a chip to its tick').toBeLessThanOrEqual(CHIP_MS)
})

test('on /list, typing a street and choosing it each reach the next paint in time', async ({ page }) => {
  const timed = await interactionTimer(page, '/list')
  await page.getByRole('button', { name: 'Tag a dumped bike' }).click()
  await page.getByRole('button', { name: 'Choose by street' }).click()
  await expect(page.getByText('Type part of its name.')).toBeVisible()
  const search = page.getByRole('searchbox', { name: 'Street' })
  // One letter at a time, and the slowest counts.
  let typing = 0
  for (const letter of 'llew') typing = Math.max(typing, await timed(() => search.press(letter)))
  const choose = await timed(async () => {
    await page.getByRole('button', { name: 'Llewellyn St, Marrickville' }).click()
    await expect(page.getByRole('heading', { name: 'Llewellyn St, Marrickville' })).toBeVisible()
  })
  test.info().annotations.push({ type: 'measured', description: `type a letter ${typing} ms, choose ${choose} ms` })
  expect(typing, 'ms from a key to the streets that match').toBeLessThanOrEqual(PICKER_MS)
  expect(choose, 'ms from choosing a street to its step').toBeLessThanOrEqual(PICKER_MS)
})

test("/list loads the streets only when Choose by street opens, and a suburb's house numbers when a street is chosen", async ({
  page,
}) => {
  const scripts: Response[] = []
  page.on('response', (response) => response.request().resourceType() === 'script' && scripts.push(response))
  // The streets' file has each street's corners; a suburb's has, for each street, its first house at full precision.
  const isStreets = (text: string) => text.includes('"corners":[')
  const isNumbers = (text: string) => /\["\d[^"]*",-3\d{6},15\d{6}\]/.test(text)
  const loaded = async (is: (text: string) => boolean) =>
    (await Promise.all(scripts.map((script) => script.text()))).filter(is).length
  const next = (is: (text: string) => boolean) =>
    page.waitForResponse(
      async (response) => response.request().resourceType() === 'script' && is(await response.text()),
    )
  const bytes = async (response: Response) => (await response.request().sizes()).responseBodySize

  await page.goto('/list', { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: 'Tag a dumped bike' }).click()
  expect(await loaded(isStreets), 'streets before Choose by street').toBe(0)
  const streets = next(isStreets)
  await page.getByRole('button', { name: 'Choose by street' }).click()
  const streetsBytes = await bytes(await streets)
  expect(await loaded(isNumbers), 'house numbers before a street is chosen').toBe(0)

  const numbers = next(isNumbers)
  await page.getByRole('searchbox', { name: 'Street' }).fill('llew')
  await page.getByRole('button', { name: 'Llewellyn St, Marrickville' }).click()
  const numbersBytes = await bytes(await numbers)
  await page.waitForLoadState('networkidle')
  expect(await loaded(isNumbers), "suburbs' house numbers loaded").toBe(1)

  test.info().annotations.push({
    type: 'measured',
    description: `streets ${streetsBytes} B, Marrickville's house numbers ${numbersBytes} B`,
  })
  expect(streetsBytes, 'streets bytes').toBeLessThanOrEqual(STREETS_BYTES)
  expect(numbersBytes, "one suburb's house number bytes").toBeLessThanOrEqual(SUBURB_NUMBERS_BYTES)
})

test('/api/tags sends 100 live tags in 15 KB or less, gzipped', async ({ request }) => {
  // The 14 seeded tags, and 86 more copied from them with new ids, nearby points and their own times.
  await sql(`
    INSERT INTO tags (id, lat, lng, suburb, street, operator, problem, last_confirmed_at, expires_at)
    SELECT gen_random_uuid(), lat + random() / 1000, lng + random() / 1000, suburb, street, operator, problem,
           seen, seen + interval '48 hours'
    FROM (SELECT *, now() - random() * interval '47 hours' AS seen FROM tags, generate_series(1, 7)) AS copies
    LIMIT 86`)
  // Each with a photo, whose id is the most a tag sends.
  await sql(`
    INSERT INTO photos (tag_id, blob_path, thumb_path, width, height, bytes)
    SELECT id, gen_random_uuid() || '.webp', gen_random_uuid() || '.webp', 1600, 1200, 200000 FROM tags`)
  const response = await request.get('/api/tags')
  const { tags } = await response.json()
  expect(tags).toHaveLength(100)
  expect(tags.every((tag: { photoId: string | null }) => tag.photoId)).toBe(true)
  // next start doesn't compress route handlers (Vercel does), so the test gzips the body itself.
  expect(gzipSync(await response.body()).length, 'gzipped bytes').toBeLessThanOrEqual(TAGS_100_BYTES)
})
