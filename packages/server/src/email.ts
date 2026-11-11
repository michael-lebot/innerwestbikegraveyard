// The email seam (plan §1.7): Michael's alerts go through Resend's API when there is a key, and otherwise to the
// console, which on Vercel is the function log, so the site can launch before Resend is set up. Nothing else knows
// which. An alert carries no visitor data and no photo, only a link to the queue.
import { env } from './env'

/** Resend gets this long to answer each try, so a report never waits on it for more than two. */
const TIMEOUT_MS = 5_000

/**
 * Emails Michael `text` under `subject`, with the link to Reported photos at the end (§4.6). `key` names the email to
 * Resend, which sends a key's email only once, so a try made again after a lost reply can't send it twice. Throws when
 * the email isn't accepted, or can't be sent, so the caller can release its claim for the next digest.
 */
export async function sendEmail(subject: string, text: string, key: string) {
  const { RESEND_API_KEY: apiKey, ALERT_EMAIL_TO: to, ALERT_EMAIL_FROM: from, ADMIN_URL: admin } = env
  const body = `${text}\n\nReported photos: ${admin}/reports`
  if (!apiKey) return console.info(`[email] ${subject}\n${body}`)
  if (!to || !admin) throw new Error('Set ALERT_EMAIL_TO and ADMIN_URL to send email')
  const post = () =>
    fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'Idempotency-Key': key },
      body: JSON.stringify({ from, to, subject, text: body }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  // No reply, as on a timeout, may mean Resend has it: one more try under the same key.
  const response = await post().catch(post)
  if (!response.ok) throw new Error(`Resend answered ${response.status}`)
}
