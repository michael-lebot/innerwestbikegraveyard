// The public photo routes (§4.3): the files are streamed from the private store, so its URLs and paths never leave
// the server.
import { openPhoto } from '@iwb/server'
import { PhotoParams } from '@iwb/shared'

// A browser may keep a copy but must ask again before each use, and nothing between may keep one: a reported photo
// stops loading at the next request. Never read as anything but the image it says it is.
const HEADERS = { 'Cache-Control': 'private, no-cache', 'X-Content-Type-Options': 'nosniff' }

/** GET for a photo or its thumbnail: the WebP while the photo is visible and its tag is live, otherwise 404. */
export function servePhoto(size: 'full' | 'thumb') {
  return async (_request: Request, { params }: { params: Promise<unknown> }) => {
    const parsed = PhotoParams.safeParse(await params)
    const file = parsed.success && (await openPhoto(parsed.data.id, size))
    return file
      ? new Response(file, { headers: { ...HEADERS, 'Content-Type': 'image/webp' } })
      : new Response('Not found.', { status: 404, headers: HEADERS })
  }
}
