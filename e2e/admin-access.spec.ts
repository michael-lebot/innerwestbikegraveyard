import { expect, test } from '@playwright/test'

// A deployed admin app (a preview or production URL), which Vercel Authentication must guard (§6).
const url = process.env.ADMIN_PREVIEW_URL

test.skip(!url, 'Set ADMIN_PREVIEW_URL to a deployed admin app to check it.')

test('refuses a request that is not signed in to Vercel', async ({ request }) => {
  // Vercel answers with its sign-in page (401) or a redirect to it, never the admin page.
  const response = await request.get(new URL('/tags', url).href, { maxRedirects: 0 })
  expect(response.ok()).toBe(false)
  expect(await response.text()).not.toContain('Recent tags')
})
