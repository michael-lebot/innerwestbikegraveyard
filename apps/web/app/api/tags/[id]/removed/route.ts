import { markRemoved } from '@iwb/server'
import { ActionBody, TagParams } from '@iwb/shared'
import { write } from '@/lib/write'

export const POST = write(async ({ request, params, visitor }) => {
  const { id } = TagParams.parse(await params)
  const { requestId } = ActionBody.parse(await request.json())
  return markRemoved({ tagId: id, requestId, visitor })
})
