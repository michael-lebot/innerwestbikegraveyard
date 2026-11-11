import { PHOTO_MAX_BYTES } from '@iwb/shared'
import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import { processPhoto } from './image'

/** A photo-sized picture of one colour, as sharp encodes it. */
const picture = (width = 2400, height = 1800) =>
  sharp({ create: { width, height, channels: 3, background: '#5cbf4a' }, limitInputPixels: false })
const file = (bytes: Uint8Array, type = 'image/jpeg') => new File([Buffer.from(bytes)], 'photo', { type })
const refusal = (bytes: Uint8Array, type?: string) =>
  processPhoto(file(bytes, type)).then(
    () => 'accepted',
    (error) => error.code,
  )

describe('processPhoto', () => {
  it('keeps a JPEG as a WebP of at most 1600 px and a 320 px thumbnail, with no EXIF or GPS left', async () => {
    const jpeg = await picture()
      .jpeg()
      .withExif({ IFD3: { GPSLatitudeRef: 'S', GPSLatitude: '33/1 54/1 16/1' } })
      .toBuffer()
    expect((await sharp(jpeg).metadata()).exif).toBeDefined()

    const photo = await processPhoto(file(jpeg))
    expect(photo).toMatchObject({ width: 1600, height: 1200 })
    const [full, thumb] = await Promise.all([sharp(photo.full).metadata(), sharp(photo.thumb).metadata()])
    expect(full).toMatchObject({ format: 'webp', width: 1600, height: 1200 })
    expect(thumb).toMatchObject({ format: 'webp', width: 320, height: 240 })
    expect(full.exif).toBeUndefined()
    expect(thumb.exif).toBeUndefined()
  })

  it('turns a photo the way its EXIF says, before the EXIF is dropped', async () => {
    const sideways = await picture().jpeg().withMetadata({ orientation: 6 }).toBuffer()
    expect(await processPhoto(file(sideways))).toMatchObject({ width: 1200, height: 1600 })
  })

  it.each(['png', 'webp'] as const)('accepts a whole %s, and never enlarges a small one', async (format) => {
    const bytes = await picture(800, 600).toFormat(format).toBuffer()
    // The declared type counts for nothing.
    expect(await processPhoto(file(bytes, 'text/plain'))).toMatchObject({ width: 800, height: 600 })
  })

  describe('§5.5 bad images', () => {
    it('refuses a file over 4 MB as too large', async () => {
      expect(await refusal(new Uint8Array(PHOTO_MAX_BYTES + 1))).toBe('too_large')
    })

    it('refuses wrong magic bytes, whatever type the file claims', async () => {
      const gif = await picture(80, 60).gif().toBuffer()
      expect(await refusal(gif)).toBe('bad_image')
      expect(await refusal(new TextEncoder().encode('<html><script>alert(1)</script></html>'))).toBe('bad_image')
    })

    it('refuses a truncated JPEG and a truncated PNG', async () => {
      for (const format of ['jpeg', 'png'] as const) {
        const bytes = await picture(800, 600).toFormat(format).toBuffer()
        expect(await refusal(bytes.subarray(0, bytes.length / 2)), format).toBe('bad_image')
      }
    })

    it('refuses a decompression bomb: a 1 MB PNG of 20,000 × 20,000 pixels', async () => {
      const bomb = await picture(20_000, 20_000).png({ compressionLevel: 9 }).toBuffer()
      expect(bomb.length).toBeLessThan(PHOTO_MAX_BYTES)
      expect(await refusal(bomb, 'image/png')).toBe('bad_image')
    })

    it('refuses polyglots: a JPEG with a ZIP or a web page after its end', async () => {
      const jpeg = await picture(800, 600).jpeg().toBuffer()
      const zip = Buffer.from('504b0304140000000800', 'hex')
      const html = new TextEncoder().encode('<html><script>alert(1)</script></html>')
      expect(await refusal(Buffer.concat([jpeg, zip]))).toBe('bad_image')
      expect(await refusal(Buffer.concat([jpeg, html]))).toBe('bad_image')
    })
  })
})
