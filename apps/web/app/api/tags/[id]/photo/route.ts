import { attachPhoto } from '@iwb/server'
import { AppError, TagParams } from '@iwb/shared'
import { processPhoto } from '@/lib/image'
import { write } from '@/lib/write'

/** A tag's one photo (§4.3), sent as a form after the tag is added, and only ever stored re-encoded. */
export const POST = write(async ({ request, params, visitor }) => {
  const { id } = TagParams.parse(await params)
  // processPhoto holds the photo to 4 MB. The form is read whole first, bounded only by Vercel's 4.5 MB request cap.
  // shortcut: no limit of its own before the body is read, parse it as a stream if the app moves off Vercel.
  const photo = (await request.formData().catch(() => null))?.get('photo')
  if (!(photo instanceof File)) throw new AppError('invalid')
  return attachPhoto({ tagId: id, visitor, makePhoto: () => processPhoto(photo) })
})
