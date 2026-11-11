import { ERRORS, type ErrorCode, PHOTO_MAX_BYTES } from '@iwb/shared'
import { NextRequest } from 'next/server'
import sharp from 'sharp'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { isBot } from '@/lib/bot'
import { POST as create } from '../../route'
import { POST as attach } from './route'

vi.mock('@/lib/bot', () => ({ isBot: vi.fn(async () => false) }))

let jpeg: Buffer
beforeAll(async () => {
  jpeg = await sharp({ create: { width: 1200, height: 900, channels: 3, background: '#5cbf4a' } })
    .jpeg()
    .toBuffer()
})

// Each test is a visitor of its own on an IP of its own, so their rate limits never meet.
let headers: Record<string, string>
const newVisitor = () => {
  const id = crypto.randomUUID()
  headers = { cookie: `iwb_v=${id}`, 'x-forwarded-for': `2001:db8:${id.slice(0, 4)}:${id.slice(4, 8)}::1` }
}
beforeEach(newVisitor)

/** Tags a bike on Llewellyn St as this test's visitor, and gives its id. */
async function tagBike() {
  const id = crypto.randomUUID()
  const body = JSON.stringify({ id, lat: -33.904497, lng: 151.171932, operator: 'lime', problem: 'blocking_footpath' })
  const request = new NextRequest('http://localhost:3000/api/tags', {
    method: 'POST',
    headers: { ...headers, 'content-type': 'application/json' },
    body,
  })
  expect((await create(request, { params: Promise.resolve({}) })).status).toBe(200)
  return id
}

const form = (bytes: Uint8Array, field = 'photo') => {
  const body = new FormData()
  body.append(field, new File([Buffer.from(bytes)], 'photo.jpg', { type: 'image/jpeg' }))
  return body
}
const post = (id: string, body: BodyInit, extra: Record<string, string> = {}) =>
  attach(
    new NextRequest(`http://localhost:3000/api/tags/${id}/photo`, {
      method: 'POST',
      headers: { ...headers, ...extra },
      body,
    }),
    { params: Promise.resolve({ id }) },
  )

async function expectError(response: Response, code: ErrorCode) {
  expect(response.status).toBe(ERRORS[code].status)
  expect(response.headers.get('Cache-Control')).toBe('no-store')
  expect(await response.json()).toEqual({ error: { code, message: ERRORS[code].message } })
}

describe('POST /api/tags/[id]/photo', () => {
  it("adds the photo to the visitor's own tag and answers with the tag showing it, never cached", async () => {
    const id = await tagBike()
    const response = await post(id, form(jpeg))
    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    const { tag } = await response.json()
    expect(tag).toMatchObject({ id, photoId: expect.stringMatching(/^[\da-f-]{36}$/) })
  })

  it('refuses another visitor with 403', async () => {
    const id = await tagBike()
    newVisitor()
    await expectError(await post(id, form(jpeg)), 'not_allowed')
  })

  it('says 410 for a tag that has gone', async () => {
    await expectError(await post(crypto.randomUUID(), form(jpeg)), 'tag_gone')
  })

  it('refuses a photo over 4 MB with 413', async () => {
    const id = await tagBike()
    await expectError(await post(id, form(new Uint8Array(PHOTO_MAX_BYTES + 1))), 'too_large')
  })

  it('refuses a file that is not a photo with 422', async () => {
    const id = await tagBike()
    await expectError(await post(id, form(new TextEncoder().encode('<html></html>'))), 'bad_image')
  })

  it('refuses a form without a photo, or a JSON body, with 400', async () => {
    const id = await tagBike()
    await expectError(await post(id, form(jpeg, 'picture')), 'invalid')
    await expectError(await post(id, '{"photo":"x"}', { 'content-type': 'application/json' }), 'invalid')
  })

  it('refuses a bot with 403 before doing anything', async () => {
    const id = await tagBike()
    vi.mocked(isBot).mockResolvedValueOnce(true)
    await expectError(await post(id, form(jpeg)), 'bot')
  })
})
