import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { sendEmail } from './email'
import { env } from './env'

const fetch = vi.fn<typeof globalThis.fetch>(async () => new Response('{"id":"1"}'))
beforeEach(() => {
  vi.stubGlobal('fetch', fetch)
  fetch.mockClear()
})
afterEach(() => {
  vi.unstubAllGlobals()
  Object.assign(env, { RESEND_API_KEY: '', ALERT_EMAIL_TO: undefined })
})

describe('sendEmail', () => {
  it('writes the email to the console without a key, on Vercel too, ending with the link to the queue', async () => {
    const logged = vi.spyOn(console, 'info').mockImplementation(() => {})
    await sendEmail('A photo was reported', 'Reason: Other.', 'report-1')
    expect(logged).toHaveBeenCalledWith(
      '[email] A photo was reported\nReason: Other.\n\nReported photos: http://localhost:3001/reports',
    )
    expect(fetch).not.toHaveBeenCalled()
    logged.mockRestore()
  })

  it('writes it to the function log on Vercel too, with no key and no address, as before Resend is set up', async () => {
    vi.stubEnv('VERCEL', '1')
    vi.stubEnv('BLOB_READ_WRITE_TOKEN', 'token')
    vi.stubEnv('ADMIN_URL', 'https://admin.example.com')
    vi.resetModules()
    const { sendEmail: sendOnVercel } = await import('./email')
    const logged = vi.spyOn(console, 'info').mockImplementation(() => {})
    await sendOnVercel('A photo was reported', 'Reason: Other.', 'report-1')
    expect(logged).toHaveBeenCalledWith(
      '[email] A photo was reported\nReason: Other.\n\nReported photos: https://admin.example.com/reports',
    )
    expect(fetch).not.toHaveBeenCalled()
    logged.mockRestore()
    vi.unstubAllEnvs()
  })

  it('sends it to Michael through Resend with the key', async () => {
    Object.assign(env, { RESEND_API_KEY: 're_test', ALERT_EMAIL_TO: 'owner@example.com' })
    await sendEmail('A photo was reported', 'Reason: Other.', 'report-1')
    expect(fetch).toHaveBeenCalledExactlyOnceWith('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: 'Bearer re_test', 'Content-Type': 'application/json', 'Idempotency-Key': 'report-1' },
      body: JSON.stringify({
        from: 'onboarding@resend.dev',
        to: 'owner@example.com',
        subject: 'A photo was reported',
        text: 'Reason: Other.\n\nReported photos: http://localhost:3001/reports',
      }),
      signal: expect.any(AbortSignal),
    })
  })

  it('tries once more under the same key when no reply comes, so Resend, which may have it, sends it once', async () => {
    Object.assign(env, { RESEND_API_KEY: 're_test', ALERT_EMAIL_TO: 'owner@example.com' })
    fetch.mockRejectedValueOnce(new DOMException('The operation timed out.', 'TimeoutError'))
    await sendEmail('Subject', 'Text', 'report-1')
    const [first, again] = fetch.mock.calls.map(([, init]) => init?.headers)
    expect(first).toMatchObject({ 'Idempotency-Key': 'report-1' })
    expect(again).toEqual(first)
  })

  it('throws when Resend refuses it, or when there is no one to send it to', async () => {
    Object.assign(env, { RESEND_API_KEY: 're_test', ALERT_EMAIL_TO: 'owner@example.com' })
    fetch.mockResolvedValueOnce(new Response('{"message":"Invalid key"}', { status: 401 }))
    await expect(sendEmail('Subject', 'Text', 'report-1')).rejects.toThrow('Resend answered 401')
    Object.assign(env, { ALERT_EMAIL_TO: undefined })
    await expect(sendEmail('Subject', 'Text', 'report-1')).rejects.toThrow('ALERT_EMAIL_TO')
  })
})
