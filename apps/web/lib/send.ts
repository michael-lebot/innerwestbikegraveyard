import { ERRORS, type ErrorCode, SEND_FAILED } from '@iwb/shared'

/** The waits before the second and the third try (§5.3). */
const BACKOFF_MS = [500, 1500]
/** A 429 is tried again only when its limit's window ends this soon (assumption 7). */
const MAX_RETRY_AFTER_SECONDS = 30

export type SendError = { code: ErrorCode | 'failed'; message: string }
export type Sent<T> = { ok: true; data: T } | { ok: false; error: SendError }

/**
 * POSTs one action's body, made once with its request id, and tries again only what could still succeed (§5.3): a
 * dropped connection, a success whose body never arrives, a server error, or a 429 whose window ends within 30
 * seconds. Three tries at most; any other answer comes back at once. The server answers a repeat with the current
 * state and does nothing new, so a retry can't act twice. A form, as a photo is sent, goes as it is: the browser marks
 * it multipart, and its tag's one photo is what makes a repeat one.
 */
export async function send<T>(path: string, body: object): Promise<Sent<T>> {
  const init =
    body instanceof FormData
      ? { method: 'POST', body }
      : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
  for (let tries = 1; ; tries++) {
    let response = await fetch(path, init).catch(() => null)
    if (response?.ok) {
      // JSON is never undefined, so undefined means the body was lost on the way: a dropped connection.
      const data: T | undefined = await response.json().catch(() => undefined)
      if (data !== undefined) return { ok: true, data }
      response = null
    }
    const retryAfter = Number(response?.headers.get('Retry-After') ?? Infinity)
    let wait: number | undefined
    if (!response || response.status >= 500) wait = BACKOFF_MS[tries - 1]
    else if (response.status === 429 && retryAfter <= MAX_RETRY_AFTER_SECONDS) wait = retryAfter * 1000
    if (wait === undefined || tries === 3) return { ok: false, error: await failure(response) }
    await new Promise((resolve) => setTimeout(resolve, wait))
  }
}

/** Whether trying again later could succeed: only for what `send` itself tries again, a failed send or a limit. */
export const canRetry = (error: SendError) => error.code === 'failed' || error.code === 'rate_limited'

/** Our own error, or "Couldn't send…" for anything else; the firewall's 429 has no body of ours (§6). */
async function failure(response: Response | null): Promise<SendError> {
  const body = response && response.status < 500 ? await response.json().catch(() => null) : null
  if (body?.error) return body.error
  if (response?.status === 429) return { code: 'rate_limited', message: ERRORS.rate_limited.message }
  return { code: 'failed', message: SEND_FAILED }
}
