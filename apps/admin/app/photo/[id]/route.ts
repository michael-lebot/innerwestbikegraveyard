import { openAnyPhoto } from '@iwb/server'
import { PhotoParams } from '@iwb/shared'

// Never kept by a browser or a proxy, so a deleted photo is gone at once.
const HEADERS = { 'Cache-Control': 'private, no-store' }

/** A photo for Michael's screens (§4.6): in any state, whatever its tag's, until it is deleted. Otherwise 404. */
export async function GET(_request: Request, { params }: RouteContext<'/photo/[id]'>) {
  const parsed = PhotoParams.safeParse(await params)
  const file = parsed.success && (await openAnyPhoto(parsed.data.id))
  return file
    ? new Response(file, { headers: { ...HEADERS, 'Content-Type': 'image/webp' } })
    : new Response('Not found.', { status: 404, headers: HEADERS })
}
