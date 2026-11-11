import { rm, utimes } from 'node:fs/promises'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { deleteFiles, listFiles, putFile } from './blob'
import { db } from './client'
import { sendEmail } from './email'
import { env } from './env'
import { runHourly } from './hourly'
import { clearOldHashes } from './visitors'

// The real steps and seam, watched, so a test can make them fail.
vi.mock('./visitors', async (importOriginal) => {
  const visitors = await importOriginal<typeof import('./visitors')>()
  return { ...visitors, clearOldHashes: vi.fn(visitors.clearOldHashes) }
})
vi.mock('./blob', async (importOriginal) => {
  const blob = await importOriginal<typeof import('./blob')>()
  return { ...blob, deleteFiles: vi.fn(blob.deleteFiles) }
})
vi.mock('./email', () => ({ sendEmail: vi.fn(async () => {}) }))

const TAG = '5eed0000-0000-4000-8000-000000000001'
const PHOTO = '5eed0000-0000-4000-8000-0000000000f1'
const EXPIRED_TAG = '5eed0000-0000-4000-8000-000000000002'
const EXPIRED_PHOTO = '5eed0000-0000-4000-8000-0000000000f2'
// Request ids name the rows: 0b… past 30 days with hashes, 0c… past 30 days already cleared, 0d… inside 30 days.
const OLD = '0b000000-0000-4000-8000-000000000000'
const CLEARED = '0c000000-0000-4000-8000-000000000000'
const RECENT = '0d000000-0000-4000-8000-000000000000'

/** Rows of every kind the job looks at, on both sides of each age it acts on. */
async function seed() {
  await db.$executeRaw`TRUNCATE tags, rate_counters, daily_salts CASCADE`
  await db.$executeRaw`
    INSERT INTO tags (id, lat, lng, suburb, street, operator, problem, status, expires_at)
    VALUES (${TAG}::uuid, -33.904497, 151.171932, 'Marrickville', 'Llewellyn St', 'lime', 'blocking_footpath',
            'active', now() + interval '1 hour'),
           (${EXPIRED_TAG}::uuid, -33.904497, 151.171932, 'Marrickville', 'Llewellyn St', 'lime', 'damaged',
            'removed', now() - interval '1 second')`
  await db.$executeRaw`
    INSERT INTO tag_events (tag_id, type, request_id, visitor_hash, ip_hash, at)
    VALUES (${TAG}::uuid, 'created', ${OLD}::uuid, 'visitor', 'ip', now() - interval '30 days 1 minute'),
           (${TAG}::uuid, 'still_there', ${CLEARED}::uuid, NULL, NULL, now() - interval '31 days'),
           (${TAG}::uuid, 'removed', ${RECENT}::uuid, 'visitor', 'ip', now() - interval '29 days 23 hours')`
  await db.$executeRaw`
    INSERT INTO photos (id, tag_id, blob_path, thumb_path, width, height, bytes)
    VALUES (${PHOTO}::uuid, ${TAG}::uuid, 'photo.webp', 'thumb.webp', 1600, 1200, 200000),
           (${EXPIRED_PHOTO}::uuid, ${EXPIRED_TAG}::uuid, 'expired.webp', 'expired-thumb.webp', 1600, 1200, 200000)`
  // The photos' files and one with no row are two hours old; a file whose row isn't in yet is new.
  await rm(env.LOCAL_BLOB_DIR, { recursive: true, force: true })
  const old = new Date(Date.now() - 2 * 3600 * 1000)
  for (const path of ['photo.webp', 'thumb.webp', 'expired.webp', 'expired-thumb.webp', 'orphan.webp', 'new.webp']) {
    await putFile(path, Buffer.from(path))
    if (path !== 'new.webp') await utimes(join(env.LOCAL_BLOB_DIR, path), old, old)
  }
  // The old report was emailed when it came; the recent one's email failed, so it waits for the digest.
  await db.$executeRaw`
    INSERT INTO photo_reports (photo_id, reason, request_id, visitor_hash, ip_hash, created_at, notified_at)
    VALUES (${PHOTO}::uuid, 'other', ${OLD}::uuid, 'visitor', 'ip', now() - interval '30 days 1 minute',
            now() - interval '30 days'),
           (${PHOTO}::uuid, 'other', ${RECENT}::uuid, 'visitor', 'ip', now() - interval '29 days 23 hours', NULL)`
  vi.mocked(sendEmail).mockClear()
  await db.$executeRaw`
    INSERT INTO rate_counters (key, count, window_start)
    VALUES ('old', 1, now() - interval '48 hours 1 minute'), ('recent', 1, now() - interval '47 hours 59 minutes')`
  // A salt's day starts at midnight UTC: two days back has started 48 hours ago or more, yesterday hasn't.
  await db.$executeRaw`
    INSERT INTO daily_salts (day, salt)
    SELECT (now() AT TIME ZONE 'utc')::date - back, 'salt' FROM generate_series(0, 3) AS back`
}

/** Everything the job may change, in a fixed order. */
const rows = async () => ({
  photos: await db.$queryRaw`SELECT id::text, status::text FROM photos ORDER BY id`,
  files: (await listFiles()).map((file) => file.path).toSorted(),
  events: await db.$queryRaw`SELECT request_id::text, visitor_hash, ip_hash FROM tag_events ORDER BY request_id`,
  reports: await db.$queryRaw`
    SELECT request_id::text, visitor_hash, ip_hash, notified_at IS NOT NULL AS notified FROM photo_reports
    ORDER BY request_id`,
  counters: await db.$queryRaw`SELECT key FROM rate_counters ORDER BY key`,
  salts: await db.$queryRaw`SELECT (now() AT TIME ZONE 'utc')::date - day AS back FROM daily_salts ORDER BY back`,
})

beforeEach(seed)

describe('runHourly', () => {
  it('deletes expired photos and orphan files, clears hashes past 30 days, deletes counters and salts past 48 hours, and emails a digest of the reports not yet emailed, keeping the rest (§5.4)', async () => {
    expect(await runHourly()).toEqual({
      done: {
        deleteExpiredPhotos: 1,
        sweepOrphanFiles: 1,
        clearOldHashes: 2,
        deleteOldCounters: 1,
        deleteOldSalts: 2,
        sendDigest: 1,
      },
      failed: [],
    })
    expect(sendEmail).toHaveBeenCalledExactlyOnceWith('1 report to review', expect.any(String), expect.any(String))
    expect(await rows()).toEqual({
      photos: [
        { id: PHOTO, status: 'visible' },
        { id: EXPIRED_PHOTO, status: 'deleted' },
      ],
      files: ['new.webp', 'photo.webp', 'thumb.webp'],
      events: [
        { request_id: OLD, visitor_hash: null, ip_hash: null },
        { request_id: CLEARED, visitor_hash: null, ip_hash: null },
        { request_id: RECENT, visitor_hash: 'visitor', ip_hash: 'ip' },
      ],
      reports: [
        { request_id: OLD, visitor_hash: null, ip_hash: null, notified: true },
        { request_id: RECENT, visitor_hash: 'visitor', ip_hash: 'ip', notified: true },
      ],
      counters: [{ key: 'recent' }],
      salts: [{ back: 0 }, { back: 1 }],
    })
  })

  it('runs the steps after one that fails, and names it', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(clearOldHashes).mockRejectedValueOnce(new Error('connection lost'))
    expect(await runHourly()).toEqual({
      done: { deleteExpiredPhotos: 1, sweepOrphanFiles: 1, deleteOldCounters: 1, deleteOldSalts: 2, sendDigest: 1 },
      failed: ['clearOldHashes'],
    })
    expect(await rows()).toMatchObject({ counters: [{ key: 'recent' }], salts: [{ back: 0 }, { back: 1 }] })
    expect(logged).toHaveBeenCalledWith('Hourly step clearOldHashes failed', expect.any(Error))
    logged.mockRestore()
  })

  it('§5.5 hourly job twice: two runs in a row and two runs at once leave the same rows as one run, and send one digest', async () => {
    await runHourly()
    const once = await rows()

    await seed()
    await runHourly()
    expect(await runHourly()).toEqual({
      done: {
        deleteExpiredPhotos: 0,
        sweepOrphanFiles: 0,
        clearOldHashes: 0,
        deleteOldCounters: 0,
        deleteOldSalts: 0,
        sendDigest: 0,
      },
      failed: [],
    })
    expect(await rows()).toEqual(once)
    expect(sendEmail).toHaveBeenCalledOnce()

    await seed()
    await Promise.all([runHourly(), runHourly()])
    expect(await rows()).toEqual(once)
    expect(sendEmail).toHaveBeenCalledOnce()
  })

  it('§5.5 outside failures: a photo whose files the store fails to delete is gone from view, and its files go next run', async () => {
    // Attached moments before its tag's time ran out: its files are newer than the hour a file with no row waits.
    for (const path of ['expired.webp', 'expired-thumb.webp'])
      await utimes(join(env.LOCAL_BLOB_DIR, path), new Date(), new Date())
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    const down = new Error('Blob store down')
    vi.mocked(deleteFiles).mockRejectedValueOnce(down).mockRejectedValueOnce(down)
    expect(await runHourly()).toMatchObject({ failed: ['deleteExpiredPhotos', 'sweepOrphanFiles'] })
    expect(await rows()).toMatchObject({
      photos: [
        { id: PHOTO, status: 'visible' },
        { id: EXPIRED_PHOTO, status: 'deleted' },
      ],
      files: ['expired-thumb.webp', 'expired.webp', 'new.webp', 'orphan.webp', 'photo.webp', 'thumb.webp'],
    })

    expect(await runHourly()).toMatchObject({ done: { deleteExpiredPhotos: 0, sweepOrphanFiles: 3 }, failed: [] })
    expect(await rows()).toMatchObject({ files: ['new.webp', 'photo.webp', 'thumb.webp'] })
    logged.mockRestore()
  })
})
