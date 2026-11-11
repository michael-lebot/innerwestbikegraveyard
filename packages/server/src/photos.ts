// Photos (§4.3): attaching a tag's one photo, who may see it, hiding, restoring and deleting it, and whether uploads
// are paused (§4.6). Owns photos, site_state and the photo files. A photo's files are written before its row, and
// deleted again if the row isn't; its row is marked deleted before its files are deleted (plan §1.4). Restoring or
// deleting a photo locks its row first, as a report does, then closes its open reports in the same statement as the
// change, so this file needs nothing from reports.ts.
import { randomUUID } from 'node:crypto'
import { AppError, type PauseReason } from '@iwb/shared'
import { deleteFiles, getFile, listFiles, putFile } from './blob'
import { db } from './client'
import { Prisma } from './generated/prisma/client'
import { checkLimits, countAction } from './limits'
import { getLiveTag, LIVE } from './tags'
import type { Visitor } from './visitors'

/** A photo as the web app's processPhoto makes it: the WebP to keep, its thumbnail, and its size in pixels. */
export type NewPhoto = { full: Buffer; thumb: Buffer; width: number; height: number }

/** Photo uploads are paused (§4.6). */
const PAUSED = Prisma.sql`(SELECT uploads_paused_at IS NOT NULL FROM site_state)`
/** The visitor tagged this bike: only they may add its photo (§4.3). For a query on tags. */
const taggedBy = (visitor: Visitor) => Prisma.sql`
  EXISTS (SELECT 1 FROM tag_events
          WHERE tag_id = tags.id AND type = 'created' AND visitor_hash = ${visitor.visitorHash})`

/** Whether photo uploads are paused (§4.6). Tagging without a photo carries on as normal. */
export async function uploadsPaused() {
  const [state] = await db.$queryRaw<{ paused: boolean }[]>`SELECT ${PAUSED} AS paused`
  return state!.paused
}

/** For the admin app's switch: since when uploads are paused, and why, or nulls while they are on. */
export async function uploadsSwitch() {
  const [state] = await db.$queryRaw<{ pausedAt: Date | null; reason: PauseReason | null }[]>`
    SELECT uploads_paused_at AS "pausedAt", uploads_paused_reason AS reason FROM site_state`
  return state!
}

/**
 * Pauses photo uploads (§4.6) until Michael resumes them: nothing resumes them by itself. True when this call paused
 * them; one while they are paused already keeps the first time and reason, and is false.
 */
export async function pauseUploads(reason: PauseReason, client: Prisma.TransactionClient = db) {
  const paused = await client.$executeRaw`
    UPDATE site_state SET uploads_paused_at = now(), uploads_paused_reason = ${reason}
    WHERE uploads_paused_at IS NULL`
  return paused === 1
}

/** Resume (admin, §4.6): photos can be added again. */
export async function resumeUploads() {
  await db.$executeRaw`UPDATE site_state SET uploads_paused_at = NULL, uploads_paused_reason = NULL`
}

/**
 * Throws the reason an attach isn't allowed (§4.3), or says whether the tag has its photo already. A photo is checked
 * for before the tag's time, so a repeat after the tag has gone answers with the tag as it is now.
 */
async function hasPhoto(tagId: string, visitor: Visitor) {
  const [tag] = await db.$queryRaw<{ mine: boolean; hasPhoto: boolean; live: boolean; paused: boolean }[]>`
    SELECT ${taggedBy(visitor)} AS mine, EXISTS (SELECT 1 FROM photos WHERE tag_id = tags.id) AS "hasPhoto",
           (${LIVE}) AS live, ${PAUSED} AS paused
    FROM tags WHERE id = ${tagId}::uuid`
  if (!tag) throw new AppError('tag_gone')
  if (!tag.mine) throw new AppError('not_allowed')
  if (tag.hasPhoto) return true
  if (!tag.live) throw new AppError('tag_gone')
  if (tag.paused) throw new AppError('uploads_paused')
  return false
}

/**
 * Attach (§4.3): a live tag's one photo, from the visitor who tagged the bike, while uploads aren't paused, with no
 * deadline. The photo's id is its tag's (§5.3): a tag that has its photo already answers as it is now, so a repeat
 * does nothing new. `makePhoto` decodes and re-encodes the upload, the costly part, so it runs only once every rule
 * and the rate limits allow the photo. The files go next, under random names, then the row, in one statement that
 * tests every rule again; if anything fails, the files are deleted.
 */
export async function attachPhoto({
  tagId,
  visitor,
  makePhoto,
}: {
  tagId: string
  visitor: Visitor
  makePhoto: () => Promise<NewPhoto>
}) {
  if (await hasPhoto(tagId, visitor)) return { tag: await getLiveTag(tagId) }
  await checkLimits('photo', visitor)
  const photo = await makePhoto()
  const [full, thumb] = [`${randomUUID()}.webp`, `${randomUUID()}.webp`]
  try {
    await Promise.all([putFile(full, photo.full), putFile(thumb, photo.thumb)])
    return await db.$transaction(async (tx) => {
      await countAction(tx, 'photo', visitor)
      // The tag's row stays locked until the photo is committed, so a Take down waits for it, then deletes it.
      const attached = await tx.$executeRaw`
        INSERT INTO photos (tag_id, blob_path, thumb_path, width, height, bytes)
        SELECT id, ${full}, ${thumb}, ${photo.width}, ${photo.height}, ${photo.full.length} FROM tags
        WHERE id = ${tagId}::uuid AND ${LIVE} AND ${taggedBy(visitor)} AND NOT ${PAUSED}
        FOR UPDATE
        ON CONFLICT (tag_id) DO NOTHING`
      // Rolling back takes the count back too.
      if (!attached) throw new AppError('conflict')
      return { tag: await getLiveTag(tagId, tx) }
    })
  } catch (error) {
    await deleteFiles([full, thumb])
    // Something changed since the check: say what, or answer with the photo another request attached first.
    if (error instanceof AppError && error.code === 'conflict' && (await hasPhoto(tagId, visitor)))
      return { tag: await getLiveTag(tagId) }
    throw error
  }
}

/**
 * A photo's file, or its thumbnail's, as a stream, while the photo is visible and its tag is live (§4.3); otherwise
 * null. It is checked on every request, so a photo that is reported, or whose tag has gone, stops loading at once.
 */
export async function openPhoto(id: string, size: 'full' | 'thumb') {
  const [photo] = await db.$queryRaw<{ blobPath: string; thumbPath: string }[]>`
    SELECT blob_path AS "blobPath", thumb_path AS "thumbPath" FROM photos
    WHERE id = ${id}::uuid AND status = 'visible' AND tag_id IN (SELECT id FROM tags WHERE ${LIVE})`
  return photo ? getFile(size === 'full' ? photo.blobPath : photo.thumbPath) : null
}

/** For the admin app's lookup: the id of the tag whose photo has `id`, or undefined when no photo has it. */
export async function tagOfPhoto(id: string) {
  const [photo] = await db.$queryRaw<{ tagId: string }[]>`
    SELECT tag_id::text AS "tagId" FROM photos WHERE id = ${id}::uuid`
  return photo?.tagId
}

/** For the admin app: a photo's file whatever its state or its tag's, until it is deleted. */
export async function openAnyPhoto(id: string) {
  const [photo] = await db.$queryRaw<{ blobPath: string }[]>`
    SELECT blob_path AS "blobPath" FROM photos WHERE id = ${id}::uuid AND status <> 'deleted'`
  return photo ? getFile(photo.blobPath) : null
}

/** Reported: a visible photo is hidden, unless Michael restored it before, so one person can't keep hiding it (§4.3). */
export async function hidePhoto(tx: Prisma.TransactionClient, id: string) {
  await tx.$executeRaw`
    UPDATE photos SET status = 'hidden', hidden_at = now()
    WHERE id = ${id}::uuid AND status = 'visible'
      AND NOT EXISTS (SELECT 1 FROM photo_reports WHERE photo_id = photos.id AND resolution = 'restored')`
}

/**
 * A change to photos, which closes the open reports on each photo it changes as `resolution`, in the same statement.
 * It answers with the changed photos' files.
 */
const withReportsClosed = (resolution: 'restored' | 'deleted' | 'expired', change: Prisma.Sql) => Prisma.sql`
  WITH changed AS (${change} RETURNING id, blob_path, thumb_path),
    closed AS (UPDATE photo_reports SET resolved_at = now(), resolution = ${resolution}::report_resolution
               WHERE resolved_at IS NULL AND photo_id IN (SELECT id FROM changed))
  SELECT blob_path AS "blobPath", thumb_path AS "thumbPath" FROM changed`

/**
 * Locks the photos `which` picks, and gives their ids. A report holds its photo's row until it commits, so a change
 * made once this returns sees, and closes, every report made before it (plan §1.4).
 */
async function lockPhotos(tx: Prisma.TransactionClient, which: Prisma.Sql) {
  const locked = await tx.$queryRaw<{ id: string }[]>`SELECT id::text FROM photos WHERE ${which} FOR UPDATE`
  return locked.map((photo) => photo.id)
}

/**
 * Restore (admin, §4.3): the photo shows again while its tag is live, and its open reports are closed as restored, so
 * later reports reach Michael but no longer hide it. False when the photo has been deleted, which is final.
 */
export function restorePhoto(id: string) {
  return db.$transaction(async (tx) => {
    if (!(await lockPhotos(tx, Prisma.sql`id = ${id}::uuid AND status <> 'deleted'`)).length) return false
    await tx.$queryRaw(
      withReportsClosed('restored', Prisma.sql`UPDATE photos SET status = 'visible' WHERE id = ${id}::uuid`),
    )
    return true
  })
}

/**
 * Marks the photos `lock` locks deleted, closing their open reports as `resolution`, then deletes their files, so a
 * half-deleted photo is never served (§4.3).
 */
async function deletePhotos(
  lock: (tx: Prisma.TransactionClient) => Promise<string[]>,
  resolution: 'deleted' | 'expired',
) {
  const deleted = await db.$transaction(async (tx) => {
    const ids = await lock(tx)
    return tx.$queryRaw<{ blobPath: string; thumbPath: string }[]>(
      withReportsClosed(
        resolution,
        Prisma.sql`UPDATE photos SET status = 'deleted', deleted_at = coalesce(deleted_at, now())
                   WHERE id = ANY (${ids}::uuid[])`,
      ),
    )
  })
  await deleteFiles(deleted.flatMap((photo) => [photo.blobPath, photo.thumbPath]))
  return deleted.length
}

/** Delete (admin, §4.3): final, whatever the photo's state. One deleted already has its files deleted again. */
export const deletePhoto = (id: string) => deletePhotos((tx) => lockPhotos(tx, Prisma.sql`id = ${id}::uuid`), 'deleted')

/**
 * Take down (§4.2): the tag's photo goes at once, its reports closed as deleted (assumption 15). One deleted already
 * has its files deleted again, if that failed.
 */
export const deleteTagPhoto = (tagId: string) =>
  deletePhotos((tx) => lockPhotos(tx, Prisma.sql`tag_id = ${tagId}::uuid`), 'deleted')

/**
 * Hourly step 1 (§5.4): the photos of tags whose time has run out, whatever their state, as none can come back, with
 * their open reports closed as expired. Their tags are locked after them, so a Still there in progress is waited for,
 * and a tag it brought back keeps its photo.
 */
export const deleteExpiredPhotos = () =>
  deletePhotos(async (tx) => {
    const ids = await lockPhotos(
      tx,
      Prisma.sql`status <> 'deleted' AND tag_id IN (SELECT id FROM tags WHERE expires_at <= now())`,
    )
    const expired = await tx.$queryRaw<{ id: string }[]>`
      SELECT photos.id::text FROM photos JOIN tags ON tags.id = photos.tag_id
      WHERE photos.id = ANY (${ids}::uuid[]) AND tags.expires_at <= now()
      FOR UPDATE OF tags`
    return expired.map((photo) => photo.id)
  }, 'expired')

/**
 * Hourly step 2 (§5.4): files no photo has. A deleted photo's go at once: a failed deletion left them (assumption 16).
 * A file with no row at all, a failed attach's, waits an hour, as its row may still be being written.
 */
export async function sweepOrphanFiles() {
  const files = await listFiles()
  const orphans = await db.$queryRaw<{ path: string }[]>`
    SELECT path FROM unnest(${files.map((file) => file.path)}::text[],
                            ${files.map((file) => file.uploadedAt)}::timestamptz[]) AS file (path, uploaded_at)
    WHERE NOT EXISTS (SELECT 1 FROM photos WHERE status <> 'deleted' AND path IN (blob_path, thumb_path))
      AND (uploaded_at < now() - interval '1 hour'
           OR EXISTS (SELECT 1 FROM photos WHERE status = 'deleted' AND path IN (blob_path, thumb_path)))`
  await deleteFiles(orphans.map((orphan) => orphan.path))
  return orphans.length
}
