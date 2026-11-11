import { createTag, listLiveTags, uploadsPaused } from '@iwb/server'
import { CreateTagBody } from '@iwb/shared'
import { write } from '@/lib/write'

/**
 * Every live tag, for the map's count, key and pins (§5, §11.3), and whether photo uploads are paused, for the form
 * (§4.6). The page turns the tags' times back into dates with `parseTag`.
 * shortcut: uncached reads, add a CDN cache of a few seconds if traffic passes a few thousand visits a day.
 */
export async function GET() {
  const [tags, paused] = await Promise.all([listLiveTags(), uploadsPaused()])
  return Response.json({ tags, uploadsPaused: paused }, { headers: { 'Cache-Control': 'no-store' } })
}

/** A new tag, with the id the browser made for it (§5.3). */
export const POST = write(async ({ request, visitor }) =>
  createTag({ tag: CreateTagBody.parse(await request.json()), visitor }),
)
