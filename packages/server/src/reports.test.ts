import { rm } from 'node:fs/promises'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { listFiles } from './blob'
import { db } from './client'
import { sendEmail } from './email'
import { env } from './env'
import { countAction } from './limits'
import {
  attachPhoto,
  deleteExpiredPhotos,
  deletePhoto,
  openPhoto,
  pauseUploads,
  restorePhoto,
  resumeUploads,
  uploadsPaused,
  uploadsSwitch,
} from './photos'
import { listReportedPhotos, reportPhoto, sendDigest } from './reports'
import { takeDown } from './moderation'
import { createTag, markRemoved, undoRemoval } from './tags'
import type { Visitor } from './visitors'

vi.mock('./email', () => ({ sendEmail: vi.fn(async () => {}) }))
// The real count, watched, so a test can act while a report's transaction is still open.
vi.mock('./limits', async (importOriginal) => {
  const limits = await importOriginal<typeof import('./limits')>()
  return { ...limits, countAction: vi.fn(limits.countAction) }
})
const { countAction: realCountAction } = await vi.importActual<typeof import('./limits')>('./limits')

const TAG = '5eed0000-0000-4000-8000-000000000001'
const alice: Visitor = { visitorHash: 'a'.repeat(64), ipHash: '1'.repeat(64) }
const bob: Visitor = { visitorHash: 'b'.repeat(64), ipHash: '2'.repeat(64) }

let photoId: string
/** Bob reports the photo, or `visitor` does, with a request id of its own unless one is given. */
const report = (visitor = bob, requestId = crypto.randomUUID()) =>
  reportPhoto({ photoId, requestId, reason: 'privacy', visitor })

const status = async () =>
  (await db.$queryRaw<{ status: string }[]>`SELECT status::text FROM photos WHERE id = ${photoId}::uuid`)[0]!.status
const reports = () =>
  db.$queryRaw<{ reason: string; resolution: string | null; resolved: boolean }[]>`
    SELECT reason::text, resolution::text, resolved_at IS NOT NULL AS resolved FROM photo_reports ORDER BY created_at`
const counts = async () =>
  (await db.$queryRaw<{ count: number }[]>`SELECT count FROM rate_counters WHERE key LIKE 'report:%'`).map(
    (counter) => counter.count,
  )
const shown = async () => !!(await openPhoto(photoId, 'thumb'))
/** The key Resend is given for a report's own alert, and for a digest: the same email always has the same key. */
const ALERT_KEY = expect.stringMatching(/^report-[0-9a-f-]{36}$/)
const DIGEST_KEY = expect.stringMatching(/^digest-[0-9a-f]{64}$/)
/** How many reports are marked as emailed. */
const notified = async () =>
  (await db.$queryRaw<{ n: number }[]>`SELECT count(notified_at)::int AS n FROM photo_reports`)[0]!.n
/** `n` reports from visitors of their own, so no rate limit meets. */
const reportMany = async (n: number) => {
  for (let i = 0; i < n; i++) await report({ visitorHash: `visitor-${i}`, ipHash: `ip-${i}` })
}

beforeEach(async () => {
  await db.$executeRaw`TRUNCATE tags, rate_counters CASCADE`
  await resumeUploads()
  await rm(env.LOCAL_BLOB_DIR, { recursive: true, force: true })
  await db.$executeRaw`
    INSERT INTO tags (id, lat, lng, suburb, street, operator, problem, expires_at)
    VALUES (${TAG}::uuid, -33.904497, 151.171932, 'Marrickville', 'Llewellyn St', 'lime', 'damaged',
            now() + interval '1 hour')`
  await db.$executeRaw`
    INSERT INTO tag_events (tag_id, type, request_id, visitor_hash, ip_hash)
    VALUES (${TAG}::uuid, 'created', ${TAG}::uuid, ${alice.visitorHash}, ${alice.ipHash})`
  const photo = { full: Buffer.from('full'), thumb: Buffer.from('thumb'), width: 1600, height: 1200 }
  photoId = (await attachPhoto({ tagId: TAG, visitor: alice, makePhoto: async () => photo })).tag!.photoId!
  vi.mocked(sendEmail).mockClear()
})

describe('reportPhoto', () => {
  it('hides the photo, so it stops loading on the very next request, and records the report', async () => {
    expect(await shown()).toBe(true)
    expect(await report()).toEqual({ hidden: true })
    expect(await shown()).toBe(false)
    expect(await status()).toBe('hidden')
    expect(await reports()).toEqual([{ reason: 'privacy', resolution: null, resolved: false }])
    expect(await counts()).toEqual([1, 1])
  })

  it('§5.5 repeats: a report sent again with the same id answers the current state, with one row and one count', async () => {
    const requestId = crypto.randomUUID()
    const first = await report(bob, requestId)
    expect(await report(bob, requestId)).toEqual(first)
    expect(await reports()).toHaveLength(1)
    expect(await counts()).toEqual([1, 1])
  })

  it('refuses the same id from another visitor', async () => {
    const requestId = crypto.randomUUID()
    await report(bob, requestId)
    await expect(report(alice, requestId)).rejects.toMatchObject({ code: 'conflict' })
  })

  it('records a report on a photo already hidden, changing nothing else (assumption 14)', async () => {
    await report()
    expect(await report(alice)).toEqual({ hidden: true })
    expect(await reports()).toHaveLength(2)
    expect(await status()).toBe('hidden')
  })

  it('says a deleted photo has gone, recording nothing, but answers a repeat of an earlier report', async () => {
    const requestId = crypto.randomUUID()
    await report(bob, requestId)
    await deletePhoto(photoId)
    await expect(report()).rejects.toMatchObject({ code: 'photo_gone' })
    expect(await report(bob, requestId)).toEqual({ hidden: true })
    expect(await reports()).toHaveLength(1)
    photoId = '00000000-0000-4000-8000-000000000000'
    await expect(report()).rejects.toMatchObject({ code: 'photo_gone' })
  })

  it('stops a visitor at 5 reports a day, keeping nothing of the refused one', async () => {
    for (let i = 0; i < 5; i++) await report()
    await expect(report()).rejects.toMatchObject({ code: 'rate_limited' })
    expect(await reports()).toHaveLength(5)
  })

  it('§5.5 photo and tag together: report → remove → undo leaves the photo hidden', async () => {
    await report()
    await markRemoved({ tagId: TAG, requestId: crypto.randomUUID(), visitor: bob })
    expect(await undoRemoval(TAG)).toBe('undone')
    expect(await status()).toBe('hidden')
    expect(await shown()).toBe(false)
  })

  it('§5.5 photo and tag together: a restored photo is not hidden by a later report, which is still recorded', async () => {
    await report()
    expect(await restorePhoto(photoId)).toBe(true)
    expect(await shown()).toBe(true)
    expect(await report(alice)).toEqual({ hidden: false })
    expect(await shown()).toBe(true)
    expect(await reports()).toEqual([
      { reason: 'privacy', resolution: 'restored', resolved: true },
      { reason: 'privacy', resolution: null, resolved: false },
    ])
  })
})

describe('restorePhoto', () => {
  it('shows a hidden photo again and closes its open reports as restored', async () => {
    await report()
    await report(alice)
    expect(await restorePhoto(photoId)).toBe(true)
    expect(await status()).toBe('visible')
    expect((await reports()).map((row) => row.resolution)).toEqual(['restored', 'restored'])
  })

  it('refuses a deleted photo, leaving its reports as they are', async () => {
    await report()
    await deletePhoto(photoId)
    expect(await restorePhoto(photoId)).toBe(false)
    expect(await status()).toBe('deleted')
    expect((await reports()).map((row) => row.resolution)).toEqual(['deleted'])
  })
})

describe('a report still being written', () => {
  /** Runs `act` while Bob's report is written but not committed, and gives what it answers once both are done. */
  async function whileReporting<T>(act: () => Promise<T>) {
    let acting: Promise<T> | undefined
    vi.mocked(countAction).mockImplementationOnce(async (...args) => {
      acting = act()
      await new Promise((resolve) => setTimeout(resolve, 200))
      return realCountAction(...args)
    })
    await report()
    return acting!
  }

  it('is waited for by a Restore, which closes it with the rest', async () => {
    await report(alice)
    expect(await whileReporting(() => restorePhoto(photoId))).toBe(true)
    expect(await status()).toBe('visible')
    expect((await reports()).map((row) => row.resolution)).toEqual(['restored', 'restored'])
  })

  it('is waited for by a Delete, which closes it as deleted', async () => {
    expect(await whileReporting(() => deletePhoto(photoId))).toBe(1)
    expect(await reports()).toEqual([{ reason: 'privacy', resolution: 'deleted', resolved: true }])
  })

  it("is waited for by the hourly job's expiry deletion, which closes it as expired", async () => {
    await db.$executeRaw`UPDATE tags SET expires_at = now() WHERE id = ${TAG}::uuid`
    expect(await whileReporting(deleteExpiredPhotos)).toBe(1)
    expect((await reports()).map((row) => row.resolution)).toEqual(['expired'])
  })
})

describe('closing reports when a photo is deleted', () => {
  it('deletePhoto marks the photo deleted, closes its reports as deleted, then deletes its files', async () => {
    await report()
    expect(await deletePhoto(photoId)).toBe(1)
    expect(await status()).toBe('deleted')
    expect(await reports()).toEqual([{ reason: 'privacy', resolution: 'deleted', resolved: true }])
    expect(await listFiles()).toEqual([])
  })

  it('Take down closes them as deleted (assumption 15)', async () => {
    await report()
    await takeDown(TAG)
    expect((await reports()).map((row) => row.resolution)).toEqual(['deleted'])
  })

  it("the hourly job's expiry deletion closes them as expired, leaving reports already closed alone", async () => {
    await report()
    await restorePhoto(photoId)
    await report(alice)
    await db.$executeRaw`UPDATE tags SET expires_at = now() WHERE id = ${TAG}::uuid`
    expect(await deleteExpiredPhotos()).toBe(1)
    expect((await reports()).map((row) => row.resolution)).toEqual(['restored', 'expired'])
  })
})

describe('emails to Michael (§4.6)', () => {
  it('sends one for each of the first 10 reports of the day, with no visitor data, and leaves the rest for the digest', async () => {
    await report()
    expect(sendEmail).toHaveBeenCalledWith(
      'A photo was reported',
      'Reason: Shows a person, face or number plate.\nThe photo is hidden until you restore or delete it.',
      ALERT_KEY,
    )
    await reportMany(10)
    expect(sendEmail).toHaveBeenCalledTimes(10)
    expect(await notified()).toBe(10)
    expect(JSON.stringify(vi.mocked(sendEmail).mock.calls)).not.toMatch(/visitor-|b{64}/)
  })

  it('says when a restored photo stays up', async () => {
    await report()
    await restorePhoto(photoId)
    await report(alice)
    expect(sendEmail).toHaveBeenLastCalledWith(
      'A photo was reported',
      'Reason: Shows a person, face or number plate.\nYou restored it before, so it stays up.',
      ALERT_KEY,
    )
  })

  it('§5.5 repeats: a report sent again with the same id sends no second email', async () => {
    const requestId = crypto.randomUUID()
    await report(bob, requestId)
    await report(bob, requestId)
    expect(sendEmail).toHaveBeenCalledOnce()
  })

  it('§5.5 outside failures: a Resend failure leaves the report saved and unsent, and the next digest sends it', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(sendEmail).mockRejectedValueOnce(new Error('Resend is down'))
    expect(await report()).toEqual({ hidden: true })
    expect(await reports()).toHaveLength(1)
    expect(await notified()).toBe(0)
    expect(logged).toHaveBeenCalledWith('A report email failed; the hourly digest sends it', expect.any(Error))

    expect(await sendDigest()).toBe(1)
    expect(sendEmail).toHaveBeenLastCalledWith(
      '1 report to review',
      '1 report arrived since the last email.\nShows a person, face or number plate: 1',
      DIGEST_KEY,
    )
    expect(await notified()).toBe(1)
    logged.mockRestore()
  })

  it('the digest sends one email for every report not yet emailed, then nothing until there are more', async () => {
    await reportMany(13)
    vi.mocked(sendEmail).mockClear()
    expect(await sendDigest()).toBe(3)
    expect(sendEmail).toHaveBeenCalledExactlyOnceWith(
      '3 reports to review',
      '3 reports arrived since the last email.\nShows a person, face or number plate: 3',
      DIGEST_KEY,
    )
    expect(await sendDigest()).toBe(0)
    expect(sendEmail).toHaveBeenCalledOnce()
  })

  it('a digest that fails releases its reports for the next one, and throws so the hourly job says so', async () => {
    await reportMany(11)
    vi.mocked(sendEmail).mockRejectedValueOnce(new Error('Resend is down'))
    await expect(sendDigest()).rejects.toThrow('Resend is down')
    expect(await notified()).toBe(10)
    expect(await sendDigest()).toBe(1)
    expect(await notified()).toBe(11)
    // The same reports, so the same email under the same key: had Resend taken the first, it sends it only once.
    const [failed, sent] = vi.mocked(sendEmail).mock.calls.slice(-2)
    expect(sent).toEqual(failed)
  })

  it('an alert whose send never ended, as when the server stopped, goes in the digest once its claim is 10 minutes old', async () => {
    vi.mocked(sendEmail).mockImplementationOnce(() => new Promise(() => {}))
    void report()
    await vi.waitFor(() => expect(sendEmail).toHaveBeenCalledOnce())
    // Claimed a moment ago, so its sender may still be at it.
    expect(await sendDigest()).toBe(0)
    expect(await notified()).toBe(0)
    await db.$executeRaw`UPDATE photo_reports SET claimed_at = claimed_at - interval '10 minutes'`
    expect(await sendDigest()).toBe(1)
    expect(await notified()).toBe(1)
  })
})

describe('pausing photo uploads (§4.6)', () => {
  const subjects = () => vi.mocked(sendEmail).mock.calls.map(([subject]) => subject)

  it('the 16th report in an hour pauses uploads and goes out with one alert; the 17th sends no second one', async () => {
    await reportMany(15)
    expect(await uploadsPaused()).toBe(false)
    await reportMany(17)
    expect(await uploadsSwitch()).toEqual({ pausedAt: expect.any(Date), reason: 'circuit_breaker' })
    expect(subjects().filter((subject) => subject === 'Photo uploads paused')).toHaveLength(1)
    expect(sendEmail).toHaveBeenCalledWith(
      'Photo uploads paused',
      'More than 15 reports arrived in the last hour, so photo uploads are paused until you resume them. ' +
        'Tags without photos can still be added.\nThe latest reason: Shows a person, face or number plate.',
      ALERT_KEY,
    )
  })

  it('reports at once take turns: exactly 10 single alerts a day, and one pause and one alert at the 16th', async () => {
    await reportMany(8)
    const visitors = Array.from({ length: 8 }, (_, i) => ({ visitorHash: `at-once-${i}`, ipHash: `at-once-ip-${i}` }))
    await Promise.all(visitors.map((visitor) => report(visitor)))
    expect(subjects().filter((subject) => subject === 'A photo was reported')).toHaveLength(10)
    expect(subjects().filter((subject) => subject === 'Photo uploads paused')).toHaveLength(1)
    expect(await uploadsPaused()).toBe(true)
  })

  it('refuses photos while paused, never resumes by itself, and still takes tags without photos', async () => {
    await reportMany(16)
    await db.$executeRaw`UPDATE photo_reports SET created_at = created_at - interval '1 day'`
    await reportMany(1)
    expect(await uploadsPaused()).toBe(true)
    const tag = {
      id: crypto.randomUUID(),
      lat: -33.904497,
      lng: 151.171932,
      operator: 'lime',
      problem: 'damaged',
    } as const
    expect((await createTag({ tag, visitor: alice })).tag).toMatchObject({ id: tag.id })
    const makePhoto = vi.fn()
    await expect(attachPhoto({ tagId: tag.id, visitor: alice, makePhoto })).rejects.toMatchObject({
      code: 'uploads_paused',
    })
    await resumeUploads()
    expect(await uploadsSwitch()).toEqual({ pausedAt: null, reason: null })
  })

  it('a pause by hand keeps its reason, and the circuit breaker sends no alert while uploads are paused already', async () => {
    expect(await pauseUploads('by_hand')).toBe(true)
    expect(await pauseUploads('by_hand')).toBe(false)
    await reportMany(16)
    expect(subjects()).not.toContain('Photo uploads paused')
    expect(await uploadsSwitch()).toMatchObject({ reason: 'by_hand' })
  })

  it('a failed alert leaves uploads paused, and the digest sends its report and says uploads are paused', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    await reportMany(15)
    vi.mocked(sendEmail).mockRejectedValueOnce(new Error('Resend is down'))
    await reportMany(1)
    expect(await uploadsPaused()).toBe(true)
    vi.mocked(sendEmail).mockClear()
    expect(await sendDigest()).toBe(6)
    expect(sendEmail).toHaveBeenCalledExactlyOnceWith(
      '6 reports to review',
      '6 reports arrived since the last email.\nShows a person, face or number plate: 6\n' +
        'Photo uploads are paused until you resume them.',
      DIGEST_KEY,
    )
    logged.mockRestore()
  })
})

describe('listReportedPhotos', () => {
  it('lists each photo with open reports, the latest reported first, with its reasons, until it is dealt with', async () => {
    const first = photoId
    await report()
    await reportPhoto({ photoId, requestId: crypto.randomUUID(), reason: 'other', visitor: alice })
    const other = '5eed0000-0000-4000-8000-000000000002'
    await db.$executeRaw`
      INSERT INTO tags (id, lat, lng, suburb, street, operator, problem, expires_at)
      SELECT ${other}::uuid, lat, lng, suburb, street, operator, problem, expires_at FROM tags WHERE id = ${TAG}::uuid`
    await db.$executeRaw`
      INSERT INTO photos (id, tag_id, blob_path, thumb_path, width, height, bytes)
      VALUES (gen_random_uuid(), ${other}::uuid, 'other.webp', 'other-thumb.webp', 1600, 1200, 4)`
    photoId = (await db.$queryRaw<{ id: string }[]>`SELECT id::text FROM photos WHERE tag_id = ${other}::uuid`)[0]!.id
    await report()
    expect(await listReportedPhotos()).toEqual([
      {
        id: photoId,
        tagId: other,
        status: 'hidden',
        reports: 1,
        reasons: { privacy: 1 },
        reportedAt: expect.any(Date),
      },
      {
        id: first,
        tagId: TAG,
        status: 'hidden',
        reports: 2,
        reasons: { privacy: 1, other: 1 },
        reportedAt: expect.any(Date),
      },
    ])

    await deletePhoto(photoId)
    await restorePhoto(first)
    expect(await listReportedPhotos()).toEqual([])
    photoId = first
    await report()
    expect(await listReportedPhotos()).toMatchObject([{ id: first, status: 'visible', reports: 1 }])
  })
})
