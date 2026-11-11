// Take down, the one change that acts on a tag and its photo together, so tags.ts needs nothing from photos.ts
// (plan §1.3).
import { deleteTagPhoto } from './photos'
import { markTakenDown } from './tags'

/**
 * Take down (admin, §4.2): final, whatever the tag's state, and its photo is deleted at once. False when it was
 * already down. A repeat deletes the photo too, in case the first time failed after the tag went down.
 */
export async function takeDown(tagId: string) {
  const taken = await markTakenDown(tagId)
  await deleteTagPhoto(tagId)
  return taken
}
