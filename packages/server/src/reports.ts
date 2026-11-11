// Reports (§4.3, §4.6): anyone may report a photo, which hides it until Michael restores or deletes it, and Michael
// is emailed. Owns photo_reports. photos.ts changes the photo itself, and closes its reports when it is restored or
// deleted. An email is a side effect after commit (plan §1.4): its reports are claimed by setting claimed_at in a
// transaction, it is sent once that commits, and notified_at is set once Resend accepts it. A failed send releases
// the claim for the hourly digest, which also takes a claim 10 minutes old, as a server that stopped mid-send leaves.
import { createHash } from 'node:crypto'
import {
  AppError,
  CIRCUIT_BREAKER_REPORTS_PER_HOUR,
  REPORT_EMAILS_PER_DAY,
  type PhotoStatus,
  REPORT_REASONS,
  type ReportReason,
} from '@iwb/shared'
import { db } from './client'
import { sendEmail } from './email'
import { Prisma } from './generated/prisma/client'
import { countAction } from './limits'
import { hidePhoto, pauseUploads, uploadsPaused } from './photos'
import type { Visitor } from './visitors'

type Report = { photoId: string; requestId: string; reason: ReportReason; visitor: Visitor }

/**
 * Records a report under its browser-made request id (§5.3), and gives its id; null when the same visitor sent that
 * id before for the same photo: a repeat, which does nothing new. The id stored for another photo or visitor is a
 * conflict, and a photo that is deleted, or never was, has gone (assumption 14).
 */
async function claimReport(tx: Prisma.TransactionClient, { photoId, requestId, reason, visitor }: Report) {
  // The photo's row stays locked until the report commits, so a Restore, Delete or expiry waits, then closes it too.
  const [report] = await tx.$queryRaw<{ id: string }[]>`
    INSERT INTO photo_reports (photo_id, reason, request_id, visitor_hash, ip_hash)
    SELECT id, ${reason}::report_reason, ${requestId}::uuid, ${visitor.visitorHash}, ${visitor.ipHash}
    FROM photos WHERE id = ${photoId}::uuid AND status <> 'deleted'
    FOR UPDATE
    ON CONFLICT (request_id) DO NOTHING
    RETURNING id::text`
  if (report) return report.id
  const [first] = await tx.$queryRaw<{ photoId: string; visitorHash: string | null }[]>`
    SELECT photo_id::text AS "photoId", visitor_hash AS "visitorHash" FROM photo_reports
    WHERE request_id = ${requestId}::uuid`
  if (!first) throw new AppError('photo_gone')
  if (first.photoId !== photoId || first.visitorHash !== visitor.visitorHash) throw new AppError('conflict')
  return null
}

/** Not emailed yet, and not claimed by a sender in the last 10 minutes, far longer than a send can take. */
const UNSENT = Prisma.sql`notified_at IS NULL AND (claimed_at IS NULL OR claimed_at < now() - interval '10 minutes')`

/**
 * Sends the email for the reports claimed for it, under `key`, and marks them emailed. If the send fails, releases
 * them for the next digest and throws.
 */
async function emailReports(ids: string[], subject: string, text: string, key: string) {
  try {
    await sendEmail(subject, text, key)
  } catch (error) {
    // shortcut: a send that Resend took but never answered, twice, comes again in the digest, under its own key; keep
    // each email to send again under its key (an outbox table) if Michael ever sees one twice.
    await db.$executeRaw`UPDATE photo_reports SET claimed_at = NULL WHERE id = ANY (${ids}::uuid[])`
    throw error
  }
  await db.$executeRaw`UPDATE photo_reports SET notified_at = now() WHERE id = ANY (${ids}::uuid[])`
}

/**
 * Claims a new report, inside its transaction, for the email it goes out with, and writes that email (§4.6). The
 * report that makes more than 15 in an hour site-wide pauses photo uploads, and goes with that alert; any other among
 * the first 10 of the UTC day (assumption 5) gets an email of its own. The rest wait for the hourly digest.
 */
async function claimEmail(tx: Prisma.TransactionClient, id: string, reason: ReportReason, hidden: boolean) {
  const [{ today, lastHour }] = await tx.$queryRaw<[{ today: number; lastHour: number }]>`
    SELECT count(*) FILTER (WHERE created_at >= date_trunc('day', now(), 'UTC'))::int AS today,
           count(*) FILTER (WHERE created_at > now() - interval '1 hour')::int AS "lastHour"
    FROM photo_reports WHERE created_at >= least(date_trunc('day', now(), 'UTC'), now() - interval '1 hour')`
  let email: { subject: string; text: string } | undefined
  // False while uploads are paused already, by hand or by an earlier report: the breaker alerts once.
  if (lastHour > CIRCUIT_BREAKER_REPORTS_PER_HOUR && (await pauseUploads('circuit_breaker', tx)))
    email = {
      subject: 'Photo uploads paused',
      text:
        `More than ${CIRCUIT_BREAKER_REPORTS_PER_HOUR} reports arrived in the last hour, so photo uploads are ` +
        `paused until you resume them. Tags without photos can still be added.\n` +
        `The latest reason: ${REPORT_REASONS[reason]}.`,
    }
  else if (today <= REPORT_EMAILS_PER_DAY)
    email = {
      subject: 'A photo was reported',
      text:
        `Reason: ${REPORT_REASONS[reason]}.\n` +
        (hidden ? 'The photo is hidden until you restore or delete it.' : 'You restored it before, so it stays up.'),
    }
  if (!email) return
  await tx.$executeRaw`UPDATE photo_reports SET claimed_at = now() WHERE id = ${id}::uuid`
  return { id, ...email }
}

/**
 * Report (§4.3): the photo stops loading from the next request, unless Michael restored it before, and the report
 * waits for him either way, with an email or in the digest. Answers whether the public can no longer see the photo,
 * as a repeat does too.
 */
export async function reportPhoto(report: Report) {
  const { hidden, email } = await db.$transaction(async (tx) => {
    // Reports take turns on the one site_state row, so each counts every report before it, and a flood at once can't
    // pass the first 10 or the 16th together (plan §1.4).
    await tx.$queryRaw`SELECT 1 FROM site_state FOR UPDATE`
    const id = await claimReport(tx, report)
    if (id) {
      // Rolling back takes the report back too.
      await countAction(tx, 'report', report.visitor)
      await hidePhoto(tx, report.photoId)
    }
    const [{ hidden }] = await tx.$queryRaw<[{ hidden: boolean }]>`
      SELECT status <> 'visible' AS hidden FROM photos WHERE id = ${report.photoId}::uuid`
    return { hidden, email: id ? await claimEmail(tx, id, report.reason, hidden) : undefined }
  })
  if (email)
    await emailReports([email.id], email.subject, email.text, `report-${email.id}`).catch((error) =>
      console.error('A report email failed; the hourly digest sends it', error),
    )
  return { hidden }
}

const reports = (n: number) => `${n} ${n === 1 ? 'report' : 'reports'}`

/**
 * Hourly step 5 (§5.4): one email for every report not yet emailed, with how many there are for each reason. They are
 * claimed in one statement, so of two runs at once the second finds none. Returns how many it covered.
 */
export async function sendDigest() {
  const claimed = await db.$queryRaw<{ reason: ReportReason; ids: string[] }[]>`
    WITH claimed AS (UPDATE photo_reports SET claimed_at = now() WHERE ${UNSENT} RETURNING id, reason)
    SELECT reason, array_agg(id::text) AS ids FROM claimed GROUP BY reason ORDER BY reason`
  const ids = claimed.flatMap((group) => group.ids)
  if (!ids.length) return 0
  const lines = [
    `${reports(ids.length)} arrived since the last email.`,
    ...claimed.map((group) => `${REPORT_REASONS[group.reason]}: ${group.ids.length}`),
  ]
  // Said again here, in case the alert that paused them failed.
  if (await uploadsPaused()) lines.push('Photo uploads are paused until you resume them.')
  const text = lines.join('\n')
  // The same reports and words make the same key, so a digest sent again after a lost reply goes out once.
  const key = createHash('sha256').update(`${ids.toSorted().join()}\n${text}`).digest('hex')
  await emailReports(ids, `${reports(ids.length)} to review`, text, `digest-${key}`)
  return ids.length
}

/**
 * For the admin queue (§4.6): every photo with an open report, the latest reported first, with how many open reports
 * it has for each reason. Restoring or deleting the photo closes them, which takes it off the queue.
 */
export function listReportedPhotos() {
  return db.$queryRaw<
    {
      id: string
      tagId: string
      status: PhotoStatus
      reports: number
      reasons: Partial<Record<ReportReason, number>>
      reportedAt: Date
    }[]
  >`
    SELECT photos.id::text, photos.tag_id::text AS "tagId", photos.status, sum(open.count)::int AS reports,
           json_object_agg(open.reason, open.count) AS reasons, max(open.latest) AS "reportedAt"
    FROM (SELECT photo_id, reason, count(*)::int AS count, max(created_at) AS latest FROM photo_reports
          WHERE resolved_at IS NULL GROUP BY photo_id, reason) open
    -- A report made while its photo was being deleted can stay open, with nothing left to review.
    JOIN photos ON photos.id = open.photo_id AND photos.status <> 'deleted'
    GROUP BY photos.id ORDER BY "reportedAt" DESC`
}
