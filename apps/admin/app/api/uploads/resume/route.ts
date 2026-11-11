import { resumeUploads } from '@iwb/server'
import { action, switchPage } from '@/lib/action'

/** Resume photo uploads (§4.6), the only way they start again. */
export const POST = action(async (_params, request) => {
  await resumeUploads()
  return switchPage(request)
})
