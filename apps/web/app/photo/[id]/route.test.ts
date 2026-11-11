import { attachPhoto, createTag, markRemoved, type Visitor } from '@iwb/server'
import sharp from 'sharp'
import { beforeAll, describe, expect, it } from 'vitest'
import { processPhoto } from '@/lib/image'
import { GET as full } from './route'
import { GET as thumb } from './thumb/route'

let jpeg: Buffer
beforeAll(async () => {
  jpeg = await sharp({ create: { width: 2400, height: 1800, channels: 3, background: '#5cbf4a' } })
    .jpeg()
    .toBuffer()
})

/** A new tag on Llewellyn St with a photo, from a visitor of its own, so rate limits never meet. */
async function tagWithPhoto() {
  const visitor: Visitor = { visitorHash: crypto.randomUUID(), ipHash: crypto.randomUUID() }
  const id = crypto.randomUUID()
  await createTag({ tag: { id, lat: -33.904497, lng: 151.171932, operator: 'lime', problem: 'damaged' }, visitor })
  const { tag } = await attachPhoto({
    tagId: id,
    visitor,
    makePhoto: () => processPhoto(new File([Buffer.from(jpeg)], 'photo.jpg')),
  })
  return { id, visitor, photoId: tag!.photoId! }
}

const get = (route: typeof full, id: string) =>
  route(new Request(`http://localhost:3000/photo/${id}`), { params: Promise.resolve({ id }) })

describe('GET /photo/[id] and /photo/[id]/thumb', () => {
  it('stream the photo and its thumbnail as WebP, private and checked again on every load', async () => {
    const { photoId } = await tagWithPhoto()
    for (const [route, width] of [
      [full, 1600],
      [thumb, 320],
    ] as const) {
      const response = await get(route, photoId)
      expect(response.status).toBe(200)
      expect(Object.fromEntries(response.headers)).toMatchObject({
        'content-type': 'image/webp',
        'cache-control': 'private, no-cache',
        'x-content-type-options': 'nosniff',
      })
      expect(await sharp(Buffer.from(await response.arrayBuffer())).metadata()).toMatchObject({ format: 'webp', width })
    }
  })

  it('answer 404 once the tag is removed', async () => {
    const { id, visitor, photoId } = await tagWithPhoto()
    await markRemoved({ tagId: id, requestId: crypto.randomUUID(), visitor })
    for (const route of [full, thumb]) {
      const response = await get(route, photoId)
      expect(response.status).toBe(404)
      expect(response.headers.get('cache-control')).toBe('private, no-cache')
    }
  })

  it('answer 404 for an id no photo has, or one that is not an id', async () => {
    for (const route of [full, thumb])
      for (const id of [crypto.randomUUID(), 'not-a-uuid']) expect((await get(route, id)).status).toBe(404)
  })
})
