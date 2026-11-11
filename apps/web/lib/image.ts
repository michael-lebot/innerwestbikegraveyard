// The photo pipeline (§4.3). What was uploaded is never stored: the bytes are checked, decoded within a pixel budget,
// and only fresh WebP encodings of the pixels are kept, which carry no EXIF, no GPS and nothing hidden.
import { AppError, PHOTO_MAX_BYTES } from '@iwb/shared'
import sharp from 'sharp'

/** The longer side of the stored photo and of its thumbnail (§4.3). */
const FULL_PX = 1600
const THUMB_PX = 320
/** Decoding stops past this many pixels, so a small file can't unpack into gigabytes: a decompression bomb. */
const MAX_INPUT_PIXELS = 50e6

/**
 * Whether the bytes are one whole JPEG, PNG or WebP, judged by their signature: the declared type counts for nothing.
 * Anything after the image's end is refused, as a polyglot hides a second file there. The browser re-encodes every
 * photo it sends, so a real one never has any (assumption 24).
 */
function isWholeImage(bytes: Buffer) {
  const has = (hex: string, at: number) => bytes.subarray(at, at + hex.length / 2).equals(Buffer.from(hex, 'hex'))
  const endsWith = (hex: string) => has(hex, bytes.length - hex.length / 2)
  // JPEG: from its start-of-image marker to its end-of-image marker.
  if (has('ffd8ff', 0)) return endsWith('ffd9')
  // PNG: from its signature to its empty IEND chunk.
  if (has('89504e470d0a1a0a', 0)) return endsWith('0000000049454e44ae426082')
  // WebP: "RIFF", the length of the rest, "WEBP", and exactly that length.
  if (has('52494646', 0) && has('57454250', 8)) return bytes.readUInt32LE(4) + 8 === bytes.length
  return false
}

/** The photo to store, at most 1600 px, and its 320 px thumbnail, both WebP; or `too_large` or `bad_image`. */
export async function processPhoto(file: File) {
  if (file.size > PHOTO_MAX_BYTES) throw new AppError('too_large')
  const bytes = Buffer.from(await file.arrayBuffer())
  if (!isWholeImage(bytes)) throw new AppError('bad_image')
  // A warning, such as for truncated data, fails it too. The pixels are turned as the EXIF says before it is dropped.
  const image = sharp(bytes, { limitInputPixels: MAX_INPUT_PIXELS, failOn: 'warning', autoOrient: true })
  const within = (px: number) => image.clone().resize(px, px, { fit: 'inside', withoutEnlargement: true })
  try {
    const [full, thumb] = await Promise.all([
      within(FULL_PX).webp({ quality: 75 }).toBuffer({ resolveWithObject: true }),
      within(THUMB_PX).webp().toBuffer(),
    ])
    return { full: full.data, thumb, width: full.info.width, height: full.info.height }
  } catch {
    throw new AppError('bad_image')
  }
}
