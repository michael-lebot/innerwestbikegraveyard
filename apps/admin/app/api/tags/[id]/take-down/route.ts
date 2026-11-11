import { takeDown } from '@iwb/server'
import { TagParams } from '@iwb/shared'
import { action } from '@/lib/action'

/** Take down (§4.2): final. */
export const POST = action(async (params) => {
  const { id } = TagParams.parse(await params)
  return `/tags/${id}?notice=${(await takeDown(id)) ? 'taken_down' : 'already_down'}`
})
