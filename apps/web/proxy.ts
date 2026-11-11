// Security headers on every page and API response, with a fresh CSP nonce per request, and the visitor cookie (§6).
import { randomBytes } from 'node:crypto'
import { NextResponse, type NextRequest } from 'next/server'
import { isDev } from '@/lib/env'
import { TILES_URL } from '@/lib/public-env'

/** A random 128-bit id that write.ts hashes into the visitor's identity. Only its hash is ever stored (§6). */
export const VISITOR_COOKIE = 'iwb_v'
const YEAR_SECONDS = 365 * 24 * 3600

const tilesOrigin = URL.canParse(TILES_URL) ? new URL(TILES_URL).origin : ''

export function proxy(request: NextRequest) {
  // Set on the request as well as the response, so even a first visit's write has a visitor (assumption 8).
  const visitor = request.cookies.has(VISITOR_COOKIE) ? undefined : randomBytes(16).toString('base64url')
  if (visitor) request.cookies.set(VISITOR_COOKIE, visitor)

  const nonce = btoa(crypto.randomUUID())
  const csp = [
    "default-src 'self'",
    // React needs eval in development only, for its debugging tools.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    `connect-src 'self' ${tilesOrigin}`.trim(),
    // MapLibre runs its worker from a blob: URL.
    'worker-src blob:',
    'child-src blob:',
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join('; ')

  // Next reads the nonce from the request's CSP header and adds it to every script it renders.
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('Content-Security-Policy', csp)
  requestHeaders.set('x-nonce', nonce)
  const response = NextResponse.next({ request: { headers: requestHeaders } })

  response.headers.set('Content-Security-Policy', csp)
  response.headers.set('X-Content-Type-Options', 'nosniff')
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  response.headers.set('Permissions-Policy', 'geolocation=(self)')
  if (visitor)
    response.cookies.set(VISITOR_COOKIE, visitor, {
      httpOnly: true,
      // Always on Vercel. WebKit drops a Secure cookie sent over plain HTTP, as `next start` serves end-to-end tests.
      secure: request.nextUrl.protocol === 'https:',
      sameSite: 'lax',
      maxAge: YEAR_SECONDS,
      path: '/',
    })
  return response
}

export const config = {
  // BotID's paths (the long id) carry its own headers from withBotId, which let it frame itself.
  matcher: '/((?!_next/static|fonts|glyphs|tiles|preview.webp|149e9513-01fa-4fb0-aad4-566afd725d1b).*)',
}
