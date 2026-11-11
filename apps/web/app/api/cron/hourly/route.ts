import { createHash, timingSafeEqual } from 'node:crypto'
import { runHourly } from '@iwb/server'
import { cronSecret } from '@/lib/env'

const NO_STORE = { 'Cache-Control': 'no-store' }
const sha256 = (text: string) => createHash('sha256').update(text).digest()

/**
 * The hourly job (§5.4), for Vercel Cron, which sends `Authorization: Bearer $CRON_SECRET`. Anything else gets 401
 * and runs nothing. No BotID: the caller isn't a browser. A failed step answers 500, so the cron log shows it.
 */
export async function GET(request: Request) {
  // Hashing both first gives timingSafeEqual two buffers of one length, whatever was sent.
  const sent = sha256(request.headers.get('authorization') ?? '')
  if (!timingSafeEqual(sent, sha256(`Bearer ${cronSecret()}`)))
    return new Response(null, { status: 401, headers: NO_STORE })
  const summary = await runHourly()
  return Response.json(summary, { status: summary.failed.length ? 500 : 200, headers: NO_STORE })
}
