/** The longer side of a photo as the browser sends it (§4.3): about 1 MB as a JPEG. */
const MAX_PX = 2048

/**
 * A chosen photo drawn again on a canvas, at most 2048 px on its longer side, and encoded as a JPEG (§4.3). Always,
 * even when it is smaller: only its pixels leave the phone, with no EXIF, no location and nothing after the image's
 * end, which the server refuses (assumption 24). It fails for a file the browser can't read as an image.
 */
export async function shrinkPhoto(file: File) {
  // Turned the way the photo's EXIF says, as createImageBitmap does by default.
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, MAX_PX / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('The photo could not be encoded'))),
      'image/jpeg',
      0.85,
    ),
  )
}
