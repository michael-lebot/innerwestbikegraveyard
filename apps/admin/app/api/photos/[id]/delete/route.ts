import { deletePhoto } from '@iwb/server'
import { PhotoParams } from '@iwb/shared'
import { action } from '@/lib/action'

/** Delete (§4.3): final. The photo and its files go, and its reports are closed. */
export const POST = action(async (params) => {
  const { id } = PhotoParams.parse(await params)
  await deletePhoto(id)
  return '/reports?notice=deleted'
})
