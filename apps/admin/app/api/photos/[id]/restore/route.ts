import { restorePhoto } from '@iwb/server'
import { PhotoParams } from '@iwb/shared'
import { action } from '@/lib/action'

/** Restore (§4.3): the photo shows again, and its reports are closed. */
export const POST = action(async (params) => {
  const { id } = PhotoParams.parse(await params)
  return `/reports?notice=${(await restorePhoto(id)) ? 'restored' : 'not_restored'}`
})
