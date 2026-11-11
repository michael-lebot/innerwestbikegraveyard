import { expect, type Page, test } from '@playwright/test'
import { readdir } from 'node:fs/promises'
import { addPhoto, E2E_BLOB_DIR, expectNoAxeViolations, resetDb, sql } from './support'

test.use({ baseURL: 'http://localhost:3001' })

test.beforeEach(() => resetDb())

const LLEWELLYN = '5eed0000-0000-4000-8000-000000000003'

/** A seeded tag's status and time, read straight from the database. */
async function stored(id: string) {
  const [tag] = await sql(`SELECT status, expires_at FROM tags WHERE id = '${id}'`)
  return tag as { status: string; expires_at: Date }
}

const remove = (id: string, expiresAt = 'expires_at') =>
  sql(`UPDATE tags SET status = 'removed', removed_at = now(), expires_at = ${expiresAt} WHERE id = '${id}'`)

const region = (page: Page, name: string) => page.getByRole('region', { name })

/** Gives the Llewellyn St tag a photo that three reports have hidden, and returns the photo's id. */
async function reportedPhoto() {
  const photoId = await addPhoto(LLEWELLYN)
  await sql(`UPDATE photos SET status = 'hidden', hidden_at = now() WHERE id = '${photoId}'`)
  await sql(`INSERT INTO photo_reports (photo_id, reason, request_id)
             SELECT '${photoId}', reason::report_reason, gen_random_uuid()
             FROM unnest(ARRAY['privacy', 'privacy', 'other']) AS reason`)
  return photoId
}

const resolutions = async () =>
  (await sql('SELECT resolution::text FROM photo_reports')).map((report) => report.resolution as string | null)
const publicStatus = async (page: Page, photoId: string) =>
  (await page.request.get(`http://localhost:3000/photo/${photoId}/thumb`)).status()

test('lists the recent tags and passes axe on both screens', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveURL('/tags')
  await expect(page.getByText('No removed tags.')).toBeVisible()
  await expect(region(page, 'Recent tags').getByRole('row')).toHaveCount(1 + 14)
  for (const cell of ['Active', 'Yes'])
    await expect(page.getByRole('row', { name: /Llewellyn St/ })).toContainText(cell)
  await expectNoAxeViolations(page)

  await page.getByRole('link', { name: 'Reported photos' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Reported photos')
  await expectNoAxeViolations(page)
})

test('has 44 px nav links with room for the whole focus ring', async ({ page }) => {
  await page.goto('/tags')
  for (const name of ['Reported photos', 'Tags']) {
    const box = await page.getByRole('link', { name }).boundingBox()
    expect(box?.width, name).toBeGreaterThanOrEqual(44)
    expect(box?.height, name).toBeGreaterThanOrEqual(44)
    // The ring is 3 px wide and 2 px out from the link, so it needs 5 px clear above it.
    expect(box?.y, name).toBeGreaterThanOrEqual(5)
  }
})

test('scrolls the tables, not the page, on a 320 px screen, and passes axe there', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 })
  await remove(LLEWELLYN)
  await reportedPhoto()
  for (const path of ['/tags', `/tags/${LLEWELLYN}`, '/reports']) {
    await page.goto(path)
    expect(await page.evaluate(() => document.documentElement.scrollWidth), path).toBeLessThanOrEqual(320)
    await expectNoAxeViolations(page)
  }
})

test('undo makes a removed tag live again with only the time it had left, and passes axe', async ({ page }) => {
  await remove(LLEWELLYN)
  const before = await stored(LLEWELLYN)
  await page.goto('/tags')
  await expect(region(page, 'Recent removals').getByRole('row', { name: /Llewellyn St/ })).toContainText('Removed')
  await region(page, 'Recent removals').getByRole('link', { name: 'Llewellyn St' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Llewellyn St, Marrickville')
  await expect(region(page, 'Events').getByRole('row')).toHaveCount(1 + 1)
  await expectNoAxeViolations(page)

  await page.getByRole('button', { name: 'Undo removal' }).click()
  await expect(page).toHaveURL(`/tags/${LLEWELLYN}?notice=undone`)
  await expect(page.getByText('Undone: the tag is live again, with the time it had left.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Undo removal' })).toHaveCount(0)
  await expect(region(page, 'Events').getByRole('row').last()).toContainText('Undone by admin')
  expect(await stored(LLEWELLYN)).toEqual({ ...before, status: 'active' })
})

test("shows an expired removal as one it can't undo", async ({ page }) => {
  await remove(LLEWELLYN, "now() - interval '1 minute'")
  await page.goto(`/tags/${LLEWELLYN}`)
  await expect(page.getByText("Expired, can't undo.")).toBeVisible()
  await expect(page.getByRole('button', { name: 'Undo removal' })).toHaveCount(0)
})

test('takes a tag down only after asking, and passes axe on the question', async ({ page }) => {
  await page.goto(`/tags/${LLEWELLYN}`)
  await page.getByRole('link', { name: 'Take down…' }).click()
  await expect(
    page.getByText('Take this tag down? It goes off the map for good, and nobody can undo it.'),
  ).toBeVisible()
  await expectNoAxeViolations(page)
  await page.getByRole('link', { name: 'Cancel' }).click()
  await expect(page).toHaveURL(`/tags/${LLEWELLYN}`)
  expect((await stored(LLEWELLYN)).status).toBe('active')

  await page.getByRole('link', { name: 'Take down…' }).click()
  await page.getByRole('button', { name: 'Take down' }).click()
  await expect(page).toHaveURL(`/tags/${LLEWELLYN}?notice=taken_down`)
  await expect(page.getByText('Taken down. It is off the map for good.')).toBeVisible()
  await expect(page.getByRole('definition').first()).toHaveText('Taken down')
  await expect(page.getByRole('link', { name: 'Take down…' })).toHaveCount(0)
  expect((await stored(LLEWELLYN)).status).toBe('taken_down')
})

test('refuses a post from another site, or with no origin, and changes nothing', async ({ request }) => {
  await remove(LLEWELLYN)
  const photoId = await reportedPhoto()
  const origins: Record<string, string>[] = [
    { origin: 'https://evil.example' },
    { origin: 'http://localhost:3000' },
    // The same host over plain HTTP is another origin, as on a deployment, which is HTTPS only.
    { origin: 'http://admin.example', host: 'admin.example' },
    {},
  ]
  for (const headers of origins) {
    for (const path of [
      `/api/tags/${LLEWELLYN}/undo`,
      `/api/tags/${LLEWELLYN}/take-down`,
      `/api/photos/${photoId}/restore`,
      `/api/photos/${photoId}/delete`,
      '/api/uploads/pause',
    ]) {
      const response = await request.post(path, { headers, maxRedirects: 0 })
      expect(response.status(), `${path} from ${headers.origin}`).toBe(403)
    }
  }
  expect((await stored(LLEWELLYN)).status).toBe('removed')
  expect(await resolutions()).toEqual([null, null, null])
  expect(await sql('SELECT uploads_paused_at FROM site_state')).toEqual([{ uploads_paused_at: null }])

  // Its own forms: over HTTPS behind Vercel's proxy, and over HTTP on localhost only, as here.
  const own: Record<string, string>[] = [
    { origin: 'https://admin.example', host: 'admin.example' },
    { origin: 'http://localhost:3001' },
  ]
  for (const headers of own) {
    await remove(LLEWELLYN)
    const response = await request.post(`/api/tags/${LLEWELLYN}/undo`, { headers, maxRedirects: 0 })
    expect(response.status(), headers.origin).toBe(303)
    expect(response.headers().location).toBe(`/tags/${LLEWELLYN}?notice=undone`)
  }
})

test('answers 404 to a post for an id that is not a tag or photo id', async ({ request }) => {
  for (const path of [
    '/api/tags/not-a-uuid/undo',
    '/api/tags/not-a-uuid/take-down',
    '/api/photos/not-a-uuid/restore',
    '/api/photos/not-a-uuid/delete',
  ]) {
    const response = await request.post(path, { headers: { origin: 'http://localhost:3001' }, maxRedirects: 0 })
    expect(response.status(), path).toBe(404)
  }
})

test('the queue shows a reported photo with its reasons and its tag; Restore shows it again and empties the queue', async ({
  page,
}) => {
  const photoId = await reportedPhoto()
  await page.goto('/reports')
  const queued = page.getByRole('region', { name: 'Llewellyn St, Marrickville' })
  await expect(queued.getByRole('img', { name: 'Photo of a Lime e-bike reported as blocking footpath' })).toBeVisible()
  for (const text of ['Hidden since it was reported', 'Shows a person, face or number plate: 2', 'Other: 1'])
    await expect(queued.getByText(text)).toBeVisible()
  await expect(queued.getByRole('definition').nth(1)).toHaveText('3')
  // Its link to the tag is a 44 px target, as every admin link is.
  const tagLink = (await queued.getByRole('link', { name: 'Active, live' }).boundingBox())!
  expect(tagLink.height).toBeGreaterThanOrEqual(44)
  await expect(region(page, 'Events of the tag on Llewellyn St').getByRole('row')).toHaveCount(1 + 1)
  await expectNoAxeViolations(page)
  expect(await publicStatus(page, photoId)).toBe(404)

  await queued.getByRole('button', { name: 'Restore' }).click()
  await expect(page).toHaveURL('/reports?notice=restored')
  await expect(
    page.getByText("Restored: the photo shows while its tag is live, and later reports won't hide it."),
  ).toBeVisible()
  await expect(page.getByText('No reported photos.')).toBeVisible()
  expect(await publicStatus(page, photoId)).toBe(200)
  expect(await resolutions()).toEqual(['restored', 'restored', 'restored'])
})

test('Delete asks first, then deletes the photo and its files and closes its reports', async ({ page }) => {
  const photoId = await reportedPhoto()
  await page.goto('/reports')
  await page.getByRole('link', { name: 'Delete…' }).click()
  await expect(
    page.getByText('Delete this photo? It and its files go for good, and nobody can bring them back.'),
  ).toBeVisible()
  await expectNoAxeViolations(page)
  await page.getByRole('link', { name: 'Cancel' }).click()
  await expect(page).toHaveURL('/reports')
  expect(await resolutions()).toEqual([null, null, null])

  await page.getByRole('link', { name: 'Delete…' }).click()
  await page.getByRole('button', { name: 'Delete', exact: true }).click()
  await expect(page).toHaveURL('/reports?notice=deleted')
  await expect(page.getByText('Deleted: the photo and its files are gone for good.')).toBeVisible()
  await expect(page.getByText('No reported photos.')).toBeVisible()
  expect(await resolutions()).toEqual(['deleted', 'deleted', 'deleted'])
  expect((await page.request.get(`/photo/${photoId}`)).status()).toBe(404)
  expect((await readdir(E2E_BLOB_DIR)).filter((file) => file.startsWith(photoId))).toEqual([])
})

test('the uploads switch pauses and resumes photo uploads from either screen, and passes axe', async ({ page }) => {
  const paused = async () => (await (await page.request.get('http://localhost:3000/api/tags')).json()).uploadsPaused
  const uploads = page.getByRole('region', { name: 'Photo uploads' })
  await page.goto('/tags')
  await expect(uploads).toContainText('On: visitors can add a photo to a tag.')
  await uploads.getByRole('button', { name: 'Pause uploads' }).click()
  await expect(page).toHaveURL('/tags')
  await expect(uploads).toContainText(
    /^Photo uploadsPaused by hand, on .+\. Tags without photos can still be added\.Resume uploads$/,
  )
  expect(await paused()).toBe(true)
  await expectNoAxeViolations(page)

  await page.goto('/reports')
  await expect(uploads).toContainText('Paused by hand')
  await uploads.getByRole('button', { name: 'Resume uploads' }).click()
  await expect(page).toHaveURL('/reports')
  await expect(uploads).toContainText('On: visitors can add a photo to a tag.')
  expect(await paused()).toBe(false)

  await sql(`UPDATE site_state SET uploads_paused_at = now(), uploads_paused_reason = 'circuit_breaker'`)
  await page.reload()
  await expect(uploads).toContainText('Paused by the circuit breaker, after more than 15 reports in an hour')
  await expectNoAxeViolations(page)
})

test("opens a tag from its id or public link, or its photo's, and says when there is no id", async ({ page }) => {
  await page.goto('/tags')
  const lookup = page.getByRole('textbox', { name: 'Tag or photo id, or link' })
  await lookup.fill(`https://graveyard.example/tag/${LLEWELLYN.toUpperCase()}`)
  await lookup.press('Enter')
  await expect(page).toHaveURL(`/tags/${LLEWELLYN}`)

  // A photo's link, as a complaint might give it, opens the photo's tag.
  const photoId = await addPhoto(LLEWELLYN)
  await page.goto('/tags')
  await lookup.fill(`https://graveyard.example/photo/${photoId}/thumb`)
  await lookup.press('Enter')
  await expect(page).toHaveURL(`/tags/${LLEWELLYN}`)

  await page.goto('/tags')
  await lookup.fill("Llewellyn St'; DROP TABLE photos; --")
  await page.getByRole('button', { name: 'Find' }).click()
  await expect(lookup).toHaveAccessibleDescription(/That has no tag or photo id in it/)
  await expect(lookup).toHaveAttribute('aria-invalid', 'true')
  await expectNoAxeViolations(page)

  expect((await page.goto('/tags/00000000-0000-4000-8000-000000000000'))?.status()).toBe(404)
})

test('is never indexed and sends its security headers', async ({ request }) => {
  const headers = (await request.get('/tags')).headers()
  expect(headers['x-robots-tag']).toBe('noindex, nofollow')
  expect(headers['content-security-policy']).toContain("frame-ancestors 'none'")
  expect(headers['x-content-type-options']).toBe('nosniff')
})
