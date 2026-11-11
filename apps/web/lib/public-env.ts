// Settings the browser sees. Each is a literal process.env.NEXT_PUBLIC_* read, so Next inlines it at build time.
// next.config.ts imports this file, so a bad value fails the build and `next start` rather than the map.

/** The map tiles: a file on this site locally, the public Blob store in production. */
export const TILES_URL = process.env.NEXT_PUBLIC_TILES_URL || '/tiles/inner-west.pmtiles'

/** A whole URL's protocol, or '' for anything else. Not URL.canParse(), which iOS Safari 16 lacks (SPEC.md §12). */
function protocol(url: string) {
  try {
    return new URL(url).protocol
  } catch {
    return ''
  }
}

// A path on this site, or an http(s) URL whose origin the CSP can allow.
const isPath = TILES_URL.startsWith('/') && !TILES_URL.startsWith('//')
const isHttpUrl = ['http:', 'https:'].includes(protocol(TILES_URL))
if (!isPath && !isHttpUrl)
  throw new Error(`NEXT_PUBLIC_TILES_URL must be a path starting with / or an http(s) URL, not "${TILES_URL}"`)

/** Built on Vercel, where BotID runs (§6). Vercel sets it when the project exposes its system environment variables. */
export const ON_VERCEL = !!process.env.NEXT_PUBLIC_VERCEL_ENV
