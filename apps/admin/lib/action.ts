// The one wrapper for the admin app's form posts (plan §1.4). Its pages post plain HTML forms, so they need no client
// JavaScript; the answer is a 303 back to a page with a notice, so reloading it doesn't post again.
import { ZodError } from '@iwb/shared'

/**
 * Refuses a post from any other site, which could otherwise ride on Michael's Vercel sign-in, then runs `run` and
 * sends the browser to the page it returns. A URL whose id `run` refuses is a 404, as nothing has it. The admin forms
 * post no body, so there is none to refuse.
 */
export function action(run: (params: Promise<unknown>, request: Request) => Promise<string>) {
  return async (request: Request, { params }: { params: Promise<unknown> }) => {
    if (!ownOrigin(request)) return new Response("Only this site's own forms can post here.", { status: 403 })
    try {
      return new Response(null, { status: 303, headers: { Location: await run(params, request) } })
    } catch (error) {
      if (error instanceof ZodError) return new Response('Not found.', { status: 404 })
      throw error
    }
  }
}

/**
 * Whether the post came from this app's own pages: HTTPS on its host, as deployments serve only HTTPS, or HTTP on
 * localhost (`next start`). The scheme is the header's own, never what the app sees behind Vercel's proxy.
 */
function ownOrigin(request: Request) {
  const host = request.headers.get('host')
  const origin = request.headers.get('origin')
  return !!host && (origin === `https://${host}` || (origin === `http://${host}` && /^localhost(:\d+)?$/.test(host)))
}

/** The screen the uploads switch posted from, as its `?back=` says, to go back to: /tags, or else /reports. */
export const switchPage = (request: Request) =>
  new URL(request.url).searchParams.get('back') === '/tags' ? '/tags' : '/reports'
