import { attachPhoto, createTag, type Visitor } from '@iwb/server'
import { ERRORS, type ErrorCode } from '@iwb/shared'
import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { isBot } from '@/lib/bot'
import { GET as thumb } from '@/app/photo/[id]/thumb/route'
import { POST as report } from './route'

vi.mock('@/lib/bot', () => ({ isBot: vi.fn(async () => false) }))
// Off Vercel, with no key, each report's email goes to the console: keep it out of the test output.
vi.spyOn(console, 'info').mockImplementation(() => {})

// Each test is a visitor of its own on an IP of its own, so their rate limits never meet and no table needs emptying.
let headers: Record<string, string>
beforeEach(() => {
  const id = crypto.randomUUID()
  headers = { cookie: `iwb_v=${id}`, 'x-forwarded-for': `2001:db8:${id.slice(0, 4)}:${id.slice(4, 8)}::1` }
})

/** A new tag on Llewellyn St with a photo, from a visitor of its own, and the photo's id. */
async function newPhoto() {
  const visitor: Visitor = { visitorHash: crypto.randomUUID(), ipHash: crypto.randomUUID() }
  const id = crypto.randomUUID()
  await createTag({ tag: { id, lat: -33.904497, lng: 151.171932, operator: 'lime', problem: 'damaged' }, visitor })
  const photo = { full: Buffer.from('full'), thumb: Buffer.from('thumb'), width: 1600, height: 1200 }
  return (await attachPhoto({ tagId: id, visitor, makePhoto: async () => photo })).tag!.photoId!
}

const post = (id: string, body: unknown = { requestId: crypto.randomUUID(), reason: 'offensive' }) =>
  report(
    new NextRequest(`http://localhost:3000/api/photos/${id}/report`, {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) },
  )
const thumbStatus = async (id: string) =>
  (await thumb(new Request(`http://localhost:3000/photo/${id}/thumb`), { params: Promise.resolve({ id }) })).status

async function expectError(response: Response, code: ErrorCode) {
  expect(response.status).toBe(ERRORS[code].status)
  expect(response.headers.get('Cache-Control')).toBe('no-store')
  expect(await response.json()).toEqual({ error: { code, message: ERRORS[code].message } })
}

describe('POST /api/photos/[id]/report', () => {
  it('hides the photo, which is 404 on the very next request, and answers so, never cached', async () => {
    const id = await newPhoto()
    expect(await thumbStatus(id)).toBe(200)
    const response = await post(id)
    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(await response.json()).toEqual({ hidden: true })
    expect(await thumbStatus(id)).toBe(404)
  })

  it('answers a repeat as the first time', async () => {
    const id = await newPhoto()
    const body = { requestId: crypto.randomUUID(), reason: 'privacy' }
    expect(await (await post(id, body)).json()).toEqual(await (await post(id, body)).json())
  })

  it('refuses a reason not on the list, or an id that is not a UUID, with 400', async () => {
    const id = await newPhoto()
    await expectError(await post(id, { requestId: crypto.randomUUID(), reason: 'ugly' }), 'invalid')
    await expectError(await post(id, { requestId: 'again', reason: 'other' }), 'invalid')
    await expectError(await post('not-a-uuid'), 'invalid')
  })

  it('says 410 for a photo no one has', async () => {
    await expectError(await post(crypto.randomUUID()), 'photo_gone')
  })

  it('refuses a bot with 403 before doing anything', async () => {
    const id = await newPhoto()
    vi.mocked(isBot).mockResolvedValueOnce(true)
    await expectError(await post(id), 'bot')
    expect(await thumbStatus(id)).toBe(200)
  })
})
