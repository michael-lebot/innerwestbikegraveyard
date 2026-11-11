import { servePhoto } from '@/lib/serve-photo'

/** A photo's 320 px thumbnail, shown on the tag's card and page. */
export const GET = servePhoto('thumb')
