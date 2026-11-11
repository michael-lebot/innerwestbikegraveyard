import { rm } from 'node:fs/promises'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { deleteFiles, listFiles, putFile } from './blob'
import { db } from './client'
import { env } from './env'
import { attachPhoto, deleteExpiredPhotos, type NewPhoto, openAnyPhoto, openPhoto, uploadsPaused } from './photos'
import { takeDown } from './moderation'
import { getLiveTag, getTag, listLiveTags, markRemoved, undoRemoval } from './tags'
import type { Visitor } from './visitors'

// The real seam on the tests' own folder, watched, so a test can make it fail once.
vi.mock('./blob', async (importOriginal) => {
  const blob = await importOriginal<typeof import('./blob')>()
  return { ...blob, putFile: vi.fn(blob.putFile), deleteFiles: vi.fn(blob.deleteFiles) }
})
// The real read, watched, so a test can act while an attach's transaction is still open.
vi.mock('./tags', async (importOriginal) => {
  const tags = await importOriginal<typeof import('./tags')>()
  return { ...tags, getLiveTag: vi.fn(tags.getLiveTag) }
})
const { getLiveTag: realGetLiveTag } = await vi.importActual<typeof import('./tags')>('./tags')
const pause = () => new Promise((resolve) => setTimeout(resolve, 200))
const statuses = () => db.$queryRaw`SELECT status::text FROM photos`

const TAG = '5eed0000-0000-4000-8000-000000000001'
const alice: Visitor = { visitorHash: 'a'.repeat(64), ipHash: '1'.repeat(64) }
const bob: Visitor = { visitorHash: 'b'.repeat(64), ipHash: '2'.repeat(64) }
// The server never decodes what it is given here: processPhoto in the web app has done that.
const PHOTO: NewPhoto = { full: Buffer.from('full'), thumb: Buffer.from('thumb'), width: 1600, height: 1200 }

/** A tag Alice created, with `secondsLeft` to live. */
async function insertTag(id: string, status = 'active', secondsLeft = 3600) {
  await db.$executeRaw`
    INSERT INTO tags (id, lat, lng, suburb, street, operator, problem, status, expires_at)
    VALUES (${id}::uuid, -33.904497, 151.171932, 'Marrickville', 'Llewellyn St', 'lime', 'blocking_footpath',
            ${status}::tag_status, now() + ${secondsLeft} * interval '1 second')`
  await db.$executeRaw`
    INSERT INTO tag_events (tag_id, type, request_id, visitor_hash, ip_hash)
    VALUES (${id}::uuid, 'created', ${id}::uuid, ${alice.visitorHash}, ${alice.ipHash})`
}

// What the web app's processPhoto would make, watched: an attach that is refused never asks for it.
const makePhoto = vi.fn(async () => PHOTO)
const attach = (visitor = alice, tagId = TAG) => attachPhoto({ tagId, visitor, makePhoto })
/** Neither the costly image work nor the store was asked for anything. */
const expectNoWork = () => {
  expect(makePhoto).not.toHaveBeenCalled()
  expect(putFile).not.toHaveBeenCalled()
}
const photos = () =>
  db.$queryRaw<{ id: string; blobPath: string; thumbPath: string; width: number; height: number; bytes: number }[]>`
    SELECT id::text, blob_path AS "blobPath", thumb_path AS "thumbPath", width, height, bytes FROM photos`
const files = async () => (await listFiles()).map((file) => file.path).toSorted()
const counts = async () =>
  (await db.$queryRaw<{ count: number }[]>`SELECT count FROM rate_counters`).map((counter) => counter.count)

beforeEach(async () => {
  await db.$executeRaw`TRUNCATE tags, rate_counters CASCADE`
  await db.$executeRaw`UPDATE site_state SET uploads_paused_at = NULL, uploads_paused_reason = NULL`
  await rm(env.LOCAL_BLOB_DIR, { recursive: true, force: true })
  await insertTag(TAG)
  makePhoto.mockClear()
  vi.mocked(putFile).mockClear()
})

describe('attachPhoto', () => {
  it('stores the two files under random names, then the row, and answers with the tag showing it', async () => {
    const { tag } = await attach()
    const [photo] = await photos()
    expect(photo).toMatchObject({ width: 1600, height: 1200, bytes: 4 })
    expect(photo!.blobPath).toMatch(/^[\da-f-]{36}\.webp$/)
    expect(await files()).toEqual([photo!.blobPath, photo!.thumbPath].toSorted())
    expect(tag).toMatchObject({ id: TAG, photoId: photo!.id })
    expect(await counts()).toEqual([1, 1])
  })

  it('§5.5 photo attach: refused for another visitor than the one who tagged the bike, before any image work', async () => {
    await expect(attach(bob)).rejects.toMatchObject({ code: 'not_allowed' })
    expectNoWork()
    expect(await photos()).toEqual([])
  })

  it.each([
    ['removed', 'removed', 3600],
    ['expired', 'active', -1],
  ])(
    '§5.5 photo attach: refused for a tag that is not live, before any image work: %s',
    async (_, status, secondsLeft) => {
      const id = '5eed0000-0000-4000-8000-000000000002'
      await insertTag(id, status, secondsLeft)
      await expect(attach(alice, id)).rejects.toMatchObject({ code: 'tag_gone' })
      await expect(attach(alice, '00000000-0000-4000-8000-000000000000')).rejects.toMatchObject({ code: 'tag_gone' })
      expectNoWork()
      expect(await photos()).toEqual([])
    },
  )

  it('§5.5 photo attach: refused for a second photo, so the tag keeps its first, with no image work', async () => {
    await attach()
    const [first] = await photos()
    const before = await files()
    makePhoto.mockClear()
    vi.mocked(putFile).mockClear()
    const { tag } = await attach()
    expect(tag).toMatchObject({ photoId: first!.id })
    expectNoWork()
    expect(await photos()).toEqual([first])
    expect(await files()).toEqual(before)
  })

  it('§5.5 photo attach: refused while uploads are paused', async () => {
    expect(await uploadsPaused()).toBe(false)
    await db.$executeRaw`UPDATE site_state SET uploads_paused_at = now(), uploads_paused_reason = 'by hand'`
    expect(await uploadsPaused()).toBe(true)
    await expect(attach()).rejects.toMatchObject({ code: 'uploads_paused' })
    expectNoWork()
    expect(await photos()).toEqual([])
  })

  it('§5.5 repeats: a repeated upload returns the photo already attached, with one count', async () => {
    const first = await attach()
    expect(await attach()).toEqual(first)
    expect(await photos()).toHaveLength(1)
    expect(await counts()).toEqual([1, 1])
  })

  it('attaches one photo when the same upload arrives twice at once, and answers both with it', async () => {
    const [one, two] = await Promise.all([attach(), attach()])
    expect(two).toEqual(one)
    const [photo] = await photos()
    expect(one.tag).toMatchObject({ photoId: photo!.id })
    expect(await files()).toEqual([photo!.blobPath, photo!.thumbPath].toSorted())
    expect(await counts()).toEqual([1, 1])
  })

  it('§5.5 outside failures: a Blob failure leaves the tag saved, with no photo row and no stray files', async () => {
    vi.mocked(putFile)
      .mockImplementationOnce(async () => {})
      .mockRejectedValueOnce(new Error('Blob is down'))
    await expect(attach()).rejects.toThrow('Blob is down')
    expect(await getLiveTag(TAG)).toMatchObject({ id: TAG, photoId: null })
    expect(await photos()).toEqual([])
    expect(await files()).toEqual([])
    expect(await counts()).toEqual([])
  })

  describe('at the daily limit of 10', () => {
    const ids = Array.from({ length: 11 }, (_, i) => `5eed0000-0000-4000-8000-1000000000${String(i).padStart(2, '0')}`)
    beforeEach(async () => {
      for (const id of ids) await insertTag(id)
      for (const id of ids.slice(0, 9)) await attach(alice, id)
    })

    it('refuses the 11th photo before any image work', async () => {
      await attach(alice, ids[9])
      makePhoto.mockClear()
      vi.mocked(putFile).mockClear()
      await expect(attach(alice, ids[10])).rejects.toMatchObject({ code: 'rate_limited' })
      expectNoWork()
      expect(await photos()).toHaveLength(10)
    })

    it('§5.5 photo attach: of two at once past the first look, one is refused in its transaction, deleting its files', async () => {
      // Each makes its photo only once both have passed the look at the limit.
      makePhoto.mockClear()
      let bothPassed = () => {}
      const passed = new Promise<void>((resolve) => (bothPassed = resolve))
      const afterBoth = async () => {
        if (makePhoto.mock.calls.length === 2) bothPassed()
        await passed
        return PHOTO
      }
      makePhoto.mockImplementationOnce(afterBoth).mockImplementationOnce(afterBoth)
      const results = await Promise.allSettled([attach(alice, ids[9]), attach(alice, ids[10])])
      expect(results.map((result) => result.status).toSorted()).toEqual(['fulfilled', 'rejected'])
      expect(results.find((result) => result.status === 'rejected')).toMatchObject({ reason: { code: 'rate_limited' } })
      const kept = await photos()
      expect(kept).toHaveLength(10)
      expect(await files()).toEqual(kept.flatMap((photo) => [photo.blobPath, photo.thumbPath]).toSorted())
    })
  })
})

describe('a live tag shows its photo', () => {
  it('only while the photo is visible', async () => {
    await attach()
    expect((await listLiveTags())[0]?.photoId).toEqual(expect.any(String))
    await db.$executeRaw`UPDATE photos SET status = 'hidden'`
    expect((await listLiveTags())[0]?.photoId).toBeNull()
  })
})

describe('takeDown', () => {
  it("deletes the tag's photo at once: the row is marked deleted, then the files go", async () => {
    await attach()
    expect(await takeDown(TAG)).toBe(true)
    expect(await statuses()).toEqual([{ status: 'deleted' }])
    expect(await files()).toEqual([])
  })

  it('§5.5 outside failures: a repeat finishes a Take down whose files the store failed to delete', async () => {
    await attach()
    vi.mocked(deleteFiles).mockRejectedValueOnce(new Error('Blob is down'))
    await expect(takeDown(TAG)).rejects.toThrow('Blob is down')
    expect(await statuses()).toEqual([{ status: 'deleted' }])
    expect(await files()).toHaveLength(2)
    expect(await takeDown(TAG)).toBe(false)
    expect(await files()).toEqual([])
  })

  it('waits for an attach in progress, then deletes the photo it attached', async () => {
    let takingDown: Promise<boolean> | undefined
    // The attach's last read, with its photo's row written but not committed.
    vi.mocked(getLiveTag).mockImplementationOnce(async (id, client) => {
      takingDown = takeDown(TAG)
      await pause()
      return realGetLiveTag(id, client)
    })
    await attach()
    expect(await takingDown).toBe(true)
    expect(await statuses()).toEqual([{ status: 'deleted' }])
    expect(await files()).toEqual([])
  })
})

describe('deleteExpiredPhotos', () => {
  it('waits for a Still there in progress, and keeps the photo of the tag it brings back', async () => {
    await attach()
    await db.$executeRaw`UPDATE tags SET expires_at = now() - interval '1 second' WHERE id = ${TAG}::uuid`
    let cleaning: Promise<number> | undefined
    // As a Still there whose transaction began a moment before the tag's time ran out, its new time not yet committed.
    await db.$transaction(async (tx) => {
      await tx.$executeRaw`UPDATE tags SET expires_at = now() + interval '48 hours' WHERE id = ${TAG}::uuid`
      cleaning = deleteExpiredPhotos()
      await pause()
    })
    expect(await cleaning).toBe(0)
    expect(await statuses()).toEqual([{ status: 'visible' }])
    expect(await files()).toHaveLength(2)
  })
})

describe('the admin app', () => {
  it('sees and opens the photo in any state, its tag live or not, until the photo is deleted', async () => {
    const photoId = (await attach()).tag!.photoId!
    const opened = async () => {
      const stream = await openAnyPhoto(photoId)
      return stream && new Response(stream).text()
    }
    await db.$executeRaw`UPDATE photos SET status = 'hidden'`
    await markRemoved({ tagId: TAG, requestId: crypto.randomUUID(), visitor: bob })
    expect(await getTag(TAG)).toMatchObject({ photo: { id: photoId, status: 'hidden' } })
    expect(await opened()).toBe('full')
    await takeDown(TAG)
    expect(await getTag(TAG)).toMatchObject({ photo: { id: photoId, status: 'deleted' } })
    expect(await opened()).toBeNull()
  })
})

describe('openPhoto', () => {
  /** What the public site would stream for the photo and its thumbnail, or null for each it may not see. */
  const opened = async (id: string) =>
    Promise.all(
      (['full', 'thumb'] as const).map(async (size) => {
        const stream = await openPhoto(id, size)
        return stream && new Response(stream).text()
      }),
    )
  let photoId: string
  beforeEach(async () => {
    photoId = (await attach()).tag!.photoId!
  })

  it('streams the photo and its thumbnail while the photo is visible and its tag live', async () => {
    expect(await opened(photoId)).toEqual(['full', 'thumb'])
    expect(await opened('00000000-0000-4000-8000-000000000000')).toEqual([null, null])
  })

  it('§5.5 photo and tag together: nothing once the tag is removed, and the photo again after an undo', async () => {
    await markRemoved({ tagId: TAG, requestId: crypto.randomUUID(), visitor: bob })
    expect(await opened(photoId)).toEqual([null, null])
    await undoRemoval(TAG)
    expect(await opened(photoId)).toEqual(['full', 'thumb'])
  })

  it('§5.5 photo and tag together: nothing once the tag has expired or is taken down', async () => {
    await db.$executeRaw`UPDATE tags SET expires_at = now() WHERE id = ${TAG}::uuid`
    expect(await opened(photoId)).toEqual([null, null])
    await db.$executeRaw`UPDATE tags SET expires_at = now() + interval '1 hour' WHERE id = ${TAG}::uuid`
    await takeDown(TAG)
    expect(await opened(photoId)).toEqual([null, null])
  })

  it('nothing while the photo is hidden, even on a live tag', async () => {
    await db.$executeRaw`UPDATE photos SET status = 'hidden'`
    expect(await opened(photoId)).toEqual([null, null])
  })
})
