import { AppError } from '@iwb/shared'
import { beforeEach, expect, it } from 'vitest'
import { db } from './client'
import { type Action, checkLimits, countAction } from './limits'
import { visitorFrom, type Visitor } from './visitors'

const TAG = '5eed0000-0000-4000-8000-000000000001'
const OTHER_TAG = '5eed0000-0000-4000-8000-000000000002'
const alice: Visitor = { visitorHash: 'a'.repeat(64), ipHash: '1'.repeat(64) }

const count = (action: Action, visitor = alice, tagId?: string) =>
  db.$transaction((tx) => countAction(tx, action, visitor, tagId))

beforeEach(() => db.$executeRaw`TRUNCATE rate_counters, daily_salts`)

it('§5.5 two at once: seven simultaneous reports from one visitor give exactly five successes', async () => {
  const results = await Promise.allSettled(Array.from({ length: 7 }, () => count('report')))
  expect(results.map((result) => result.status).toSorted()).toEqual([
    'fulfilled',
    'fulfilled',
    'fulfilled',
    'fulfilled',
    'fulfilled',
    'rejected',
    'rejected',
  ])
  for (const result of results)
    if (result.status === 'rejected') expect(result.reason).toMatchObject({ code: 'rate_limited' })
})

it('applies the per-IP limit across different cookies', async () => {
  // Report allows 5 a day per visitor and 10 per IP.
  for (let i = 0; i < 10; i++) await count('report', { ...alice, visitorHash: `visitor-${i}` })
  await expect(count('report', { ...alice, visitorHash: 'visitor-10' })).rejects.toMatchObject({
    code: 'rate_limited',
  })
  await expect(count('report', { ...alice, ipHash: '2'.repeat(64), visitorHash: 'visitor-10' })).resolves.toBe(
    undefined,
  )
})

it('allows Still there once per tag per visitor in 12 hours', async () => {
  await count('still_there', alice, TAG)
  await expect(count('still_there', alice, TAG)).rejects.toMatchObject({ code: 'rate_limited' })
  await count('still_there', alice, OTHER_TAG)
  await count('still_there', { ...alice, visitorHash: 'b'.repeat(64) }, TAG)
})

it('leaves no count behind for a write that was refused', async () => {
  for (let i = 0; i < 5; i++) await count('report')
  await expect(count('report')).rejects.toThrow(AppError)
  const counts = await db.$queryRaw<{ count: number }[]>`SELECT count FROM rate_counters ORDER BY key`
  expect(counts.map((row) => row.count)).toEqual([5, 5])
})

it('says to retry when the window ends, in seconds', async () => {
  for (let i = 0; i < 5; i++) await count('report')
  const error = await count('report').catch((error: AppError) => error)
  // Report counts by the UTC day, so its window ends at the next UTC midnight.
  const [{ left }] = await db.$queryRaw<[{ left: number }]>`
    SELECT extract(epoch FROM date_trunc('day', now() AT TIME ZONE 'utc') + interval '1 day'
                              - (now() AT TIME ZONE 'utc'))::float8 AS left`
  expect(error).toMatchObject({ code: 'rate_limited' })
  expect((error as AppError).retryAfter).toBeGreaterThanOrEqual(Math.floor(left))
  expect((error as AppError).retryAfter).toBeLessThanOrEqual(Math.ceil(left) + 1)
})

it('keeps raw IP addresses and cookies out of the database', async () => {
  await count('report', await visitorFrom('the-cookie', '203.0.113.7'))
  const everything = JSON.stringify(
    await db.$queryRaw`SELECT (SELECT json_agg(r) FROM rate_counters r) AS counters,
                              (SELECT json_agg(s) FROM daily_salts s) AS salts`,
  )
  expect(everything).not.toMatch(/the-cookie|203\.0\.113\.7/)
})

it('checkLimits counts nothing, and refuses only once an action has reached a limit, with the wait', async () => {
  await checkLimits('report', alice)
  expect(await db.$queryRaw`SELECT key FROM rate_counters`).toEqual([])
  for (let i = 0; i < 4; i++) await count('report')
  await checkLimits('report', alice)
  await count('report')
  await expect(checkLimits('report', alice)).rejects.toMatchObject({
    code: 'rate_limited',
    retryAfter: expect.any(Number),
  })
  await checkLimits('report', { ...alice, visitorHash: 'b'.repeat(64) })
})
