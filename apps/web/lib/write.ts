// The one wrapper for the public writes (plan §1.4): BotID first, then a JSON or multipart body only, then the
// visitor, then the route's own parsing and its one call into @iwb/server. Every answer is JSON, never cached.
import { type Visitor, visitorFrom } from '@iwb/server'
import { AppError, ERRORS, SEND_FAILED, ZodError } from '@iwb/shared'
import type { NextRequest } from 'next/server'
import { VISITOR_COOKIE } from '@/proxy'
import { isBot } from './bot'

const NO_STORE = { 'Cache-Control': 'no-store' }

type WriteContext = { request: NextRequest; params: Promise<unknown>; visitor: Visitor }

export function write(run: (context: WriteContext) => Promise<object>) {
  return async (request: NextRequest, { params }: { params: Promise<unknown> }) => {
    try {
      if (await isBot()) throw new AppError('bot')
      // A form on another site can post JSON-shaped text as text/plain, but application/json needs CORS. It can post
      // multipart/form-data, which the JSON routes can't parse, and which the photo route takes only from the tag's
      // creator, whose SameSite=Lax cookie never comes with another site's post.
      const type = request.headers.get('content-type') ?? ''
      if (!type.startsWith('application/json') && !type.startsWith('multipart/form-data')) throw new AppError('invalid')
      const visitor = await identify(request)
      return Response.json(await run({ request, params, visitor }), { headers: NO_STORE })
    } catch (error) {
      return errorResponse(error)
    }
  }
}

/** The visitor's hashed cookie and IP. proxy.ts gives every request a cookie. */
function identify(request: NextRequest) {
  const cookie = request.cookies.get(VISITOR_COOKIE)?.value
  if (!cookie) throw new Error('No visitor cookie, which proxy.ts sets on every request')
  // Vercel sets it to the client's address, overwriting any the client sent. `next start` keeps a client's own, so
  // off Vercel the per-IP limits trust the client, which only the tests and local runs meet.
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? ''
  return visitorFrom(cookie, ip)
}

/** `{ error: { code, message } }` with the code's status (plan §1.6). */
function errorResponse(error: unknown) {
  // A body that isn't JSON, or a body or URL the schema refuses.
  if (error instanceof SyntaxError || error instanceof ZodError) error = new AppError('invalid')
  if (!(error instanceof AppError)) {
    console.error(error)
    return Response.json({ error: { code: 'internal', message: SEND_FAILED } }, { status: 500, headers: NO_STORE })
  }
  return Response.json(
    { error: { code: error.code, message: error.message } },
    {
      status: ERRORS[error.code].status,
      headers: error.retryAfter === undefined ? NO_STORE : { ...NO_STORE, 'Retry-After': String(error.retryAfter) },
    },
  )
}
