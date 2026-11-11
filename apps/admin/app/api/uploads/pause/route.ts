import { pauseUploads } from '@iwb/server'
import { action, switchPage } from '@/lib/action'

/** Pause photo uploads by hand (§4.6), until Resume. */
export const POST = action(async (_params, request) => {
  await pauseUploads('by_hand')
  return switchPage(request)
})
