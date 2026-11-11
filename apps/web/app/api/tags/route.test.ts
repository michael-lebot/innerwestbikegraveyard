import { getLiveTag } from '@iwb/server'
import { ERRORS, type ErrorCode } from '@iwb/shared'
import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { isBot } from '@/lib/bot'
import { POST as removed } from './[id]/removed/route'
import { POST as stillThere } from './[id]/still-there/route'
import { POST as create, GET } from './route'

vi.mock('@/lib/bot', () => ({ isBot: vi.fn(async () => false) }))

const LLEWELLYN_ST = { lat: -33.904497, lng: 151.171932, operator: 'lime', problem: 'blocking_footpath' }

// Each test is a visitor of its own on an IP of its own, so their rate limits never meet and no table needs emptying.
let headers: Record<string, string>
beforeEach(() => {
  const id = crypto.randomUUID()
  headers = { cookie: `iwb_v=${id}`, 'x-forwarded-for': `2001:db8:${id.slice(0, 4)}:${id.slice(4, 8)}::1` }
})

const request = (path: string, body: unknown, type = 'application/json') =>
  new NextRequest(`http://localhost:3000${path}`, {
    method: 'POST',
    headers: { ...headers, 'content-type': type },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
const newTag = () => ({ id: crypto.randomUUID(), ...LLEWELLYN_ST })
const post = (body: unknown) => create(request('/api/tags', body), { params: Promise.resolve({}) })
const act = (route: typeof removed, id: string, body: unknown = { requestId: crypto.randomUUID() }) =>
  route(request(`/api/tags/${id}/x`, body), { params: Promise.resolve({ id }) })

async function expectError(response: Response, code: ErrorCode) {
  expect(response.status).toBe(ERRORS[code].status)
  expect(response.headers.get('Cache-Control')).toBe('no-store')
  expect(await response.json()).toEqual({ error: { code, message: ERRORS[code].message } })
}

describe('GET /api/tags', () => {
  it('lists the live tags, says whether photo uploads are paused, and is never cached', async () => {
    const response = await GET()
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(await response.json()).toEqual({ tags: expect.any(Array), uploadsPaused: false })
  })
})

describe('POST /api/tags', () => {
  it('adds the tag and answers with it, never cached', async () => {
    const tag = newTag()
    const response = await post(tag)
    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(await response.json()).toEqual({
      tag: {
        ...tag,
        suburb: 'Marrickville',
        street: 'Llewellyn St',
        lastConfirmedAt: expect.any(String),
        expiresAt: expect.any(String),
        photoId: null,
      },
    })
  })

  it('answers a repeat with the tag it made the first time', async () => {
    const tag = newTag()
    const first = await (await post(tag)).json()
    expect(await (await post(tag)).json()).toEqual(first)
  })

  it('refuses a bot with 403 before doing anything', async () => {
    vi.mocked(isBot).mockResolvedValueOnce(true)
    const tag = newTag()
    await expectError(await post(tag), 'bot')
    expect(await getLiveTag(tag.id)).toBeNull()
  })

  it('refuses a body that is not JSON with 400', async () => {
    await expectError(await post('{"id":'), 'invalid')
  })

  it('refuses JSON not sent as application/json with 400, as a form on another site can send it', async () => {
    const tag = newTag()
    await expectError(await create(request('/api/tags', tag, 'text/plain'), { params: Promise.resolve({}) }), 'invalid')
    expect(await getLiveTag(tag.id)).toBeNull()
  })

  it('refuses a form, which only the photo route reads, with 400', async () => {
    const body = new FormData()
    for (const [name, value] of Object.entries(newTag())) body.append(name, String(value))
    const response = await create(
      new NextRequest('http://localhost:3000/api/tags', { method: 'POST', headers, body }),
      { params: Promise.resolve({}) },
    )
    await expectError(response, 'invalid')
  })

  it.each([
    ['an id that is not a UUID', { id: '42' }],
    ['a latitude that is not a number', { lat: '-33.9' }],
    ['an operator it does not know', { operator: 'uber' }],
    ['a problem that is not on the list', { problem: 'ugly' }],
    ['no problem', { problem: undefined }],
  ])('refuses %s with 400', async (_, change) => {
    await expectError(await post({ ...newTag(), ...change }), 'invalid')
  })

  it('refuses a spot outside the council and its 20 m strip with 422', async () => {
    await expectError(await post({ ...newTag(), lat: -33.896976, lng: 151.180046 }), 'outside_area')
  })

  it('stops a visitor after 5 tags in an hour with 429, saying when to retry', async () => {
    for (let i = 0; i < 5; i++) expect((await post(newTag())).status).toBe(200)
    const response = await post(newTag())
    expect(Number(response.headers.get('Retry-After'))).toBeGreaterThan(0)
    await expectError(response, 'rate_limited')
  })
})

describe('POST /api/tags/[id]/still-there', () => {
  it('starts a live tag’s 48 hours again', async () => {
    const tag = newTag()
    const { tag: before } = await (await post(tag)).json()
    const response = await act(stillThere, tag.id)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    const { tag: after } = await response.json()
    expect(after).toMatchObject({ id: tag.id })
    expect(new Date(after.expiresAt).getTime()).toBeGreaterThanOrEqual(new Date(before.expiresAt).getTime())
  })

  it('says 410 for a tag that has gone', async () => {
    const tag = newTag()
    await post(tag)
    await act(removed, tag.id)
    await expectError(await act(stillThere, tag.id), 'tag_gone')
  })

  it('refuses a tag id or request id that is not a UUID with 400', async () => {
    await expectError(await act(stillThere, 'not-a-uuid'), 'invalid')
    await expectError(await act(stillThere, crypto.randomUUID(), { requestId: 'again' }), 'invalid')
  })
})

describe('POST /api/tags/[id]/removed', () => {
  it('takes a live tag away, answering that it is no longer live', async () => {
    const tag = newTag()
    await post(tag)
    const response = await act(removed, tag.id)
    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(await response.json()).toEqual({ tag: null })
    expect(await getLiveTag(tag.id)).toBeNull()
  })

  it('says 410 for a tag already removed', async () => {
    const tag = newTag()
    await post(tag)
    await act(removed, tag.id)
    await expectError(await act(removed, tag.id), 'tag_gone')
  })
})
