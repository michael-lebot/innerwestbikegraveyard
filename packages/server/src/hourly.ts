// The hourly job (§5.4), run by GET /api/cron/hourly. It only calls the owners' cleanup steps, in the spec's order.
// Each step acts only on rows still in their "before" state, so two runs, in a row or at once, leave what one leaves.
import { deleteOldCounters } from './limits'
import { deleteExpiredPhotos, sweepOrphanFiles } from './photos'
import { sendDigest } from './reports'
import { clearOldHashes, deleteOldSalts } from './visitors'

const STEPS = { deleteExpiredPhotos, sweepOrphanFiles, clearOldHashes, deleteOldCounters, deleteOldSalts, sendDigest }

/** Runs every step, even after one fails, and returns how many rows each changed and which failed. */
export async function runHourly() {
  const done: Record<string, number> = {}
  const failed: string[] = []
  for (const [name, step] of Object.entries(STEPS)) {
    try {
      done[name] = await step()
    } catch (error) {
      console.error(`Hourly step ${name} failed`, error)
      failed.push(name)
    }
  }
  return { done, failed }
}
