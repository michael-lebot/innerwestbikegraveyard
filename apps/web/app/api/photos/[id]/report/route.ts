import { reportPhoto } from '@iwb/server'
import { PhotoParams, ReportBody } from '@iwb/shared'
import { write } from '@/lib/write'

/** A report on a photo (§4.3), with the id the browser made for it (§5.3). */
export const POST = write(async ({ request, params, visitor }) => {
  const { id } = PhotoParams.parse(await params)
  const { requestId, reason } = ReportBody.parse(await request.json())
  return reportPhoto({ photoId: id, requestId, reason, visitor })
})
