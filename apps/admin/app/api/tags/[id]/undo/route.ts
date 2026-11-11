import { undoRemoval } from '@iwb/server'
import { TagParams } from '@iwb/shared'
import { action } from '@/lib/action'

/** Undo removal (§4.2): live again with the time it had left, or the reason it can't be. */
export const POST = action(async (params) => {
  const { id } = TagParams.parse(await params)
  return `/tags/${id}?notice=${await undoRemoval(id)}`
})
