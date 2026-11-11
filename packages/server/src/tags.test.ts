import { type NewTag, PROBLEMS, REPORT_REASONS } from '@iwb/shared'
import { where } from '@iwb/shared/geo'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from './client'
import { Problem, ReportReason } from './generated/prisma/enums'
import { takeDown } from './moderation'
import {
  confirmStillThere,
  createTag,
  getLiveTag,
  getTag,
  listLiveTags,
  listRecentRemovals,
  listRecentTags,
  listTagEvents,
  markRemoved,
  undoRemoval,
} from './tags'
import type { Visitor } from './visitors'

const LIVE = '5eed0000-0000-4000-8000-000000000001'
const REMOVED = '5eed0000-0000-4000-8000-000000000002'
const TAKEN_DOWN = '5eed0000-0000-4000-8000-000000000003'
const EXPIRED = '5eed0000-0000-4000-8000-000000000004'

const HOUR = 3600

function insertTag(id: string, status: string, secondsLeft: number) {
  return db.$executeRaw`
    INSERT INTO tags (id, lat, lng, suburb, street, operator, problem, status, expires_at)
    VALUES (${id}::uuid, -33.904497, 151.171932, 'Marrickville', 'Llewellyn St', 'lime', 'blocking_footpath',
            ${status}::tag_status, now() + ${secondsLeft} * interval '1 second')`
}

beforeEach(async () => {
  await db.$executeRaw`TRUNCATE tags, rate_counters CASCADE`
  await insertTag(LIVE, 'active', 5 * HOUR)
  await insertTag(REMOVED, 'removed', 5 * HOUR)
  await insertTag(TAKEN_DOWN, 'taken_down', 5 * HOUR)
  await insertTag(EXPIRED, 'active', -HOUR)
})

describe('listLiveTags', () => {
  it('leaves out removed, taken-down and expired tags', async () => {
    expect((await listLiveTags()).map((tag) => tag.id)).toEqual([LIVE])
  })

  it('returns the public fields only, with lat and lng as numbers', async () => {
    const [tag] = await listLiveTags()
    expect(tag).toEqual({
      id: LIVE,
      lat: -33.904497,
      lng: 151.171932,
      suburb: 'Marrickville',
      street: 'Llewellyn St',
      operator: 'lime',
      problem: 'blocking_footpath',
      lastConfirmedAt: expect.any(Date),
      expiresAt: expect.any(Date),
      photoId: null,
    })
  })
})

describe('getLiveTag', () => {
  it('returns a live tag', async () => {
    expect(await getLiveTag(LIVE)).toMatchObject({ id: LIVE })
  })

  it.each([REMOVED, TAKEN_DOWN, EXPIRED])('returns null for %s, which is not live', async (id) => {
    expect(await getLiveTag(id)).toBeNull()
  })
})

describe('listRecentTags', () => {
  it('lists tags in every state, saying which are live', async () => {
    const tags = await listRecentTags()
    expect(Object.fromEntries(tags.map((tag) => [tag.id, [tag.status, tag.live]]))).toEqual({
      [LIVE]: ['active', true],
      [REMOVED]: ['removed', false],
      [TAKEN_DOWN]: ['taken_down', false],
      [EXPIRED]: ['active', false],
    })
  })
})

describe('database enums', () => {
  it('Problem has the keys of PROBLEMS in config.ts', () => {
    expect(Object.values(Problem)).toEqual(Object.keys(PROBLEMS))
  })

  it('ReportReason has the keys of REPORT_REASONS in config.ts', () => {
    expect(Object.values(ReportReason)).toEqual(Object.keys(REPORT_REASONS))
  })
})

const alice: Visitor = { visitorHash: 'a'.repeat(64), ipHash: '1'.repeat(64) }
const bob: Visitor = { visitorHash: 'b'.repeat(64), ipHash: '2'.repeat(64) }
const NEW = '0a9e0000-0000-4000-8000-000000000001'
const LLEWELLYN_ST: NewTag = { id: NEW, lat: -33.904497, lng: 151.171932, operator: 'hello', problem: 'knocked_over' }

const row = async (id: string) =>
  (
    await db.$queryRaw<{ status: string; expiresAt: Date; removedAt: Date | null; confirmCount: number }[]>`
      SELECT status::text, expires_at AS "expiresAt", removed_at AS "removedAt", confirm_count AS "confirmCount"
      FROM tags WHERE id = ${id}::uuid`
  )[0]
const events = async (id: string) =>
  (
    await db.$queryRaw<{ type: string }[]>`SELECT type::text FROM tag_events WHERE tag_id = ${id}::uuid ORDER BY at`
  ).map((event) => event.type)
/** Each rate counter's count: one action counts once against each of its limits. */
const counts = async () =>
  (await db.$queryRaw<{ count: number }[]>`SELECT count FROM rate_counters`).map((counter) => counter.count)
/** How long the tag has left by the database's clock, in hours. */
const hoursLeft = async (id: string) =>
  (
    await db.$queryRaw<[{ hours: number }]>`
    SELECT extract(epoch FROM expires_at - now())::float8 / 3600 AS hours FROM tags WHERE id = ${id}::uuid`
  )[0].hours

describe('createTag', () => {
  it('adds a live tag for 48 hours, named from where(), with its created event', async () => {
    const { tag } = await createTag({ tag: LLEWELLYN_ST, visitor: alice })
    expect(tag).toMatchObject({ id: NEW, suburb: 'Marrickville', street: 'Llewellyn St', operator: 'hello' })
    expect(await hoursLeft(NEW)).toBeCloseTo(48, 3)
    expect(await db.$queryRaw`SELECT type::text, request_id::text, visitor_hash, ip_hash FROM tag_events`).toEqual([
      { type: 'created', request_id: NEW, visitor_hash: alice.visitorHash, ip_hash: alice.ipHash },
    ])
  })

  it('refuses a spot outside the council and its 20 m strip, and stores nothing', async () => {
    await expect(
      createTag({ tag: { ...LLEWELLYN_ST, lat: -33.896976, lng: 151.180046 }, visitor: alice }),
    ).rejects.toMatchObject({
      code: 'outside_area',
    })
    expect(await row(NEW)).toBeUndefined()
    expect(await counts()).toEqual([])
  })

  it('§5.5 repeats: creating again with the same id returns the first tag, with one event and one count', async () => {
    const first = await createTag({ tag: LLEWELLYN_ST, visitor: alice })
    const again = await createTag({ tag: LLEWELLYN_ST, visitor: alice })
    expect(again).toEqual(first)
    expect(await events(NEW)).toEqual(['created'])
    expect(await counts()).toEqual([1, 1, 1])
  })

  it('refuses the same id from another visitor', async () => {
    await createTag({ tag: LLEWELLYN_ST, visitor: alice })
    await expect(createTag({ tag: LLEWELLYN_ST, visitor: bob })).rejects.toMatchObject({ code: 'conflict' })
  })

  describe('with the street picked by name (§10.3)', () => {
    // 106 Albion St, Annandale, where the nearest named street is the lane behind the house.
    const ALBION_ST: NewTag = { id: NEW, lat: -33.88727, lng: 151.16679, operator: 'lime', problem: 'damaged' }

    it('keeps a picked street within 60 m of the spot, where the nearest street is another', async () => {
      expect(where(ALBION_ST.lat, ALBION_ST.lng).street).toBe('Albion La')
      const { tag } = await createTag({ tag: { ...ALBION_ST, street: 'Albion St' }, visitor: alice })
      expect(tag).toMatchObject({ suburb: 'Annandale', street: 'Albion St' })
    })

    it.each([
      ['a street further away', 'King St'],
      ['a name no street has', 'Nowhere Rd'],
    ])('names the nearest street instead of %s', async (_, street) => {
      const { tag } = await createTag({ tag: { ...ALBION_ST, street }, visitor: alice })
      expect(tag).toMatchObject({ suburb: 'Annandale', street: 'Albion La' })
    })
  })

  it('stops at the limit, keeping nothing of the refused tag', async () => {
    for (let i = 0; i < 5; i++) await createTag({ tag: { ...LLEWELLYN_ST, id: crypto.randomUUID() }, visitor: alice })
    await expect(createTag({ tag: LLEWELLYN_ST, visitor: alice })).rejects.toMatchObject({ code: 'rate_limited' })
    expect(await row(NEW)).toBeUndefined()
  })
})

describe('confirmStillThere', () => {
  const still = (tagId: string, visitor = alice, requestId = crypto.randomUUID()) =>
    confirmStillThere({ tagId, requestId, visitor })

  it('§5.5 expiry: Still there one second before expires_at restarts the 48 hours', async () => {
    await insertTag(NEW, 'active', 1)
    const { tag } = await still(NEW)
    expect(tag).toMatchObject({ id: NEW })
    expect(await hoursLeft(NEW)).toBeCloseTo(48, 3)
    expect(await row(NEW)).toMatchObject({ confirmCount: 1 })
    expect(await events(NEW)).toEqual(['still_there'])
  })

  it('§5.5 expiry: Still there one second after expires_at changes nothing', async () => {
    await insertTag(NEW, 'active', -1)
    const before = await row(NEW)
    await expect(still(NEW)).rejects.toMatchObject({ code: 'tag_gone' })
    expect(await row(NEW)).toEqual(before)
    expect(await events(NEW)).toEqual([])
    expect(await counts()).toEqual([])
  })

  it('restarts the 48 hours from now and never adds time on top', async () => {
    await insertTag(NEW, 'active', 47 * HOUR)
    await still(NEW)
    expect(await hoursLeft(NEW)).toBeCloseTo(48, 3)
  })

  it('§5.5 repeats: Still there again with the same request id returns the current state, with one event and one count', async () => {
    await insertTag(NEW, 'active', HOUR)
    const requestId = crypto.randomUUID()
    const first = await still(NEW, alice, requestId)
    const again = await still(NEW, alice, requestId)
    expect(again).toEqual(first)
    expect(await events(NEW)).toEqual(['still_there'])
    expect(await row(NEW)).toMatchObject({ confirmCount: 1 })
    expect(await counts()).toEqual([1, 1, 1])
  })

  it('§5.3 repeats: a repeat after the tag has gone says so, rather than giving the tag back as it was', async () => {
    const requestId = crypto.randomUUID()
    await still(LIVE, alice, requestId)
    await markRemoved({ tagId: LIVE, requestId: crypto.randomUUID(), visitor: bob })
    expect(await still(LIVE, alice, requestId)).toEqual({ tag: null })
    expect(await events(LIVE)).toEqual(['still_there', 'removed'])
  })

  it('refuses a request id already used by another visitor, or for something else', async () => {
    const requestId = crypto.randomUUID()
    await still(LIVE, alice, requestId)
    await expect(still(LIVE, bob, requestId)).rejects.toMatchObject({ code: 'conflict' })
    await expect(markRemoved({ tagId: LIVE, requestId, visitor: alice })).rejects.toMatchObject({ code: 'conflict' })
  })

  it.each([REMOVED, TAKEN_DOWN, '00000000-0000-4000-8000-000000000000'])('says %s has gone', async (id) => {
    await expect(still(id)).rejects.toMatchObject({ code: 'tag_gone' })
  })
})

describe('markRemoved', () => {
  const remove = (tagId: string, visitor = alice, requestId = crypto.randomUUID()) =>
    markRemoved({ tagId, requestId, visitor })

  it('§5.5 expiry: Removed one second before expires_at removes the tag and leaves its time alone', async () => {
    await insertTag(NEW, 'active', 1)
    const { expiresAt } = (await row(NEW))!
    expect(await remove(NEW)).toEqual({ tag: null })
    expect(await row(NEW)).toMatchObject({ status: 'removed', expiresAt, removedAt: expect.any(Date) })
    expect(await events(NEW)).toEqual(['removed'])
  })

  it('§5.5 expiry: Removed one second after expires_at changes nothing', async () => {
    await insertTag(NEW, 'active', -1)
    const before = await row(NEW)
    await expect(remove(NEW)).rejects.toMatchObject({ code: 'tag_gone' })
    expect(await row(NEW)).toEqual(before)
    expect(await events(NEW)).toEqual([])
    expect(await counts()).toEqual([])
  })

  it('§5.5 two at once: two simultaneous Removed write one removal', async () => {
    const results = await Promise.allSettled([remove(LIVE, alice), remove(LIVE, bob)])
    expect(results.map((result) => result.status).toSorted()).toEqual(['fulfilled', 'rejected'])
    expect(results.find((result) => result.status === 'rejected')).toMatchObject({ reason: { code: 'tag_gone' } })
    expect(await events(LIVE)).toEqual(['removed'])
  })

  it('§5.5 repeats: Removed again with the same request id returns the current state, with one event and one count', async () => {
    const requestId = crypto.randomUUID()
    expect(await remove(LIVE, alice, requestId)).toEqual({ tag: null })
    expect(await remove(LIVE, alice, requestId)).toEqual({ tag: null })
    expect(await events(LIVE)).toEqual(['removed'])
    expect(await counts()).toEqual([1, 1])
  })
})

describe('undoRemoval', () => {
  it('brings a removed tag back with only the time it had left', async () => {
    const before = await row(REMOVED)
    expect(await undoRemoval(REMOVED)).toBe('undone')
    expect(await row(REMOVED)).toMatchObject({ status: 'active', expiresAt: before!.expiresAt, removedAt: null })
    expect(await events(REMOVED)).toEqual(['restored'])
  })

  it('§5.5 expiry: undo is refused after expires_at', async () => {
    await insertTag(NEW, 'removed', -1)
    expect(await undoRemoval(NEW)).toBe('expired')
    expect(await row(NEW)).toMatchObject({ status: 'removed' })
    expect(await events(NEW)).toEqual([])
  })

  it.each([LIVE, TAKEN_DOWN])('refuses %s, which is not removed', async (id) => {
    expect(await undoRemoval(id)).toBe('not_removed')
  })
})

describe('takeDown', () => {
  it('is final: nothing brings the tag back', async () => {
    expect(await takeDown(LIVE)).toBe(true)
    expect(await row(LIVE)).toMatchObject({ status: 'taken_down' })
    expect(await takeDown(LIVE)).toBe(false)
    expect(await undoRemoval(LIVE)).toBe('not_removed')
    await expect(
      confirmStillThere({ tagId: LIVE, requestId: crypto.randomUUID(), visitor: alice }),
    ).rejects.toMatchObject({
      code: 'tag_gone',
    })
    expect(await events(LIVE)).toEqual(['taken_down'])
  })

  it('takes down a removed tag too', async () => {
    expect(await takeDown(REMOVED)).toBe(true)
    expect(await undoRemoval(REMOVED)).toBe('not_removed')
  })
})

describe('the admin reads', () => {
  it('getTag finds a tag in any state, with its removal and sightings, and null for no tag', async () => {
    await markRemoved({ tagId: LIVE, requestId: crypto.randomUUID(), visitor: alice })
    expect(await getTag(LIVE)).toMatchObject({
      id: LIVE,
      status: 'removed',
      live: false,
      removedAt: expect.any(Date),
      confirmCount: 0,
      photo: null,
    })
    expect(await getTag(TAKEN_DOWN)).toMatchObject({ status: 'taken_down', removedAt: null })
    expect(await getTag('00000000-0000-4000-8000-000000000000')).toBeNull()
  })

  it('listRecentRemovals lists the removed tags, the latest removal first', async () => {
    await markRemoved({ tagId: LIVE, requestId: crypto.randomUUID(), visitor: alice })
    expect((await listRecentRemovals()).map((tag) => tag.id)).toEqual([LIVE, REMOVED])
  })

  it('listTagEvents gives each event with the actions its visitor and its IP made that UTC day, on any tag', async () => {
    await db.$executeRaw`
      INSERT INTO tag_events (tag_id, type, request_id, visitor_hash, ip_hash, at)
      VALUES (${LIVE}::uuid, 'created', gen_random_uuid(), ${alice.visitorHash}, ${alice.ipHash}, '2026-11-09 01:00Z'),
             (${REMOVED}::uuid, 'still_there', gen_random_uuid(), ${alice.visitorHash}, ${alice.ipHash},
              '2026-11-09 23:59Z'),
             (${REMOVED}::uuid, 'removed', gen_random_uuid(), ${alice.visitorHash}, ${bob.ipHash}, '2026-11-08 23:59Z'),
             (${LIVE}::uuid, 'still_there', gen_random_uuid(), ${bob.visitorHash}, ${alice.ipHash}, '2026-11-09 12:00Z'),
             (${LIVE}::uuid, 'restored', gen_random_uuid(), NULL, NULL, '2026-11-09 13:00Z')`
    expect(await listTagEvents(LIVE)).toEqual([
      {
        type: 'created',
        at: new Date('2026-11-09T01:00Z'),
        visitorHash: alice.visitorHash,
        ipHash: alice.ipHash,
        visitorActions: 2,
        ipActions: 3,
      },
      {
        type: 'still_there',
        at: new Date('2026-11-09T12:00Z'),
        visitorHash: bob.visitorHash,
        ipHash: alice.ipHash,
        visitorActions: 1,
        ipActions: 3,
      },
      {
        type: 'restored',
        at: new Date('2026-11-09T13:00Z'),
        visitorHash: null,
        ipHash: null,
        visitorActions: 0,
        ipActions: 0,
      },
    ])
  })
})
