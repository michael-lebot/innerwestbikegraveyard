import { afterEach, beforeEach, expect, it, vi } from 'vitest'

// The browser runs this module first thing, and iOS Safari 16.4 to 16.6 (SPEC.md §12) has no URL.canParse.
const canParse = URL.canParse
beforeEach(() => {
  delete (URL as Partial<typeof URL>).canParse
  vi.resetModules()
})
afterEach(() => {
  URL.canParse = canParse
  vi.unstubAllEnvs()
})

it.each(['/tiles/inner-west.pmtiles', 'https://store.example/inner-west.pmtiles'])('accepts %s', async (url) => {
  vi.stubEnv('NEXT_PUBLIC_TILES_URL', url)
  expect((await import('./public-env')).TILES_URL).toBe(url)
})

it.each(['//store.example/inner-west.pmtiles', 'ftp://store.example/x', 'tiles.pmtiles'])('refuses %s', async (url) => {
  vi.stubEnv('NEXT_PUBLIC_TILES_URL', url)
  await expect(import('./public-env')).rejects.toThrow('NEXT_PUBLIC_TILES_URL must be a path')
})
