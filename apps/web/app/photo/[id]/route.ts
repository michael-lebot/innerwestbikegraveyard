import { servePhoto } from '@/lib/serve-photo'

/** A tag's photo, 1600 px at most, opened from its thumbnail. */
export const GET = servePhoto('full')
