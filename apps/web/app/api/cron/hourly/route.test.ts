import { runHourly } from '@iwb/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GET } from './route'

// The real job runs, watched, so a test can tell whether it ran.
vi.mock('@iwb/server', async (importOriginal) => {
  const server = await importOriginal<typeof import('@iwb/server')>()
  return { ...server, runHourly: vi.fn(server.runHourly) }
})

beforeEach(() => vi.mocked(runHourly).mockClear())
// Off Vercel, with no key, the digest of other tests' reports goes to the console: keep it out of the test output.
vi.spyOn(console, 'info').mockImplementation(() => {})

const call = (authorization?: string) =>
  GET(new Request('http://localhost:3000/api/cron/hourly', { headers: authorization ? { authorization } : {} }))

describe('GET /api/cron/hourly', () => {
  it('§5.5 access: answers 401 without the token, or with a wrong one, and runs nothing', async () => {
    for (const authorization of [undefined, 'Bearer wrong', 'dev-cron-secret', 'Bearer dev-cron-secret2']) {
      const response = await call(authorization)
      expect(response.status, authorization).toBe(401)
      expect(response.headers.get('Cache-Control')).toBe('no-store')
    }
    expect(runHourly).not.toHaveBeenCalled()
  })

  it("runs the job once for Vercel Cron's token and answers with its summary, never cached", async () => {
    const response = await call('Bearer dev-cron-secret')
    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(await response.json()).toEqual({
      done: {
        deleteExpiredPhotos: expect.any(Number),
        sweepOrphanFiles: expect.any(Number),
        clearOldHashes: expect.any(Number),
        deleteOldCounters: expect.any(Number),
        deleteOldSalts: expect.any(Number),
        sendDigest: expect.any(Number),
      },
      failed: [],
    })
    expect(runHourly).toHaveBeenCalledOnce()
  })

  it('answers 500 with the summary when a step failed, so the cron log shows it', async () => {
    const summary = { done: { deleteOldCounters: 0, deleteOldSalts: 0 }, failed: ['clearOldHashes'] }
    vi.mocked(runHourly).mockResolvedValueOnce(summary)
    const response = await call('Bearer dev-cron-secret')
    expect(response.status).toBe(500)
    expect(await response.json()).toEqual(summary)
  })
})
