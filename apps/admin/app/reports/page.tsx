import { getTag, listReportedPhotos, listTagEvents, uploadsSwitch } from '@iwb/server'
import { dateTime, photoAlt, REPORT_REASONS, type ReportReason } from '@iwb/shared'
import type { Metadata } from 'next'
import Link from 'next/link'
import { SECONDARY } from '@/components/buttons'
import { Confirm } from '@/components/Confirm'
import { EventTable } from '@/components/EventTable'
import { Notice } from '@/components/Notice'
import { STATUS } from '@/components/TagTable'
import { UploadsSwitch } from '@/components/UploadsSwitch'

export const metadata: Metadata = { title: 'Reported photos' }

const REASONS = Object.keys(REPORT_REASONS) as ReportReason[]

/**
 * The queue (§4.6): each photo with an open report, the latest reported first, with its reasons and its tag's events.
 * Restore keeps the photo and Delete removes it, and either takes it off the queue. The uploads switch is at the top.
 */
export default async function ReportsPage({ searchParams }: PageProps<'/reports'>) {
  const [{ notice, confirm }, photos, uploads] = await Promise.all([
    searchParams,
    listReportedPhotos(),
    uploadsSwitch(),
  ])
  const queue = await Promise.all(
    photos.map(async (photo) => ({
      photo,
      // A photo always has its tag.
      tag: (await getTag(photo.tagId))!,
      events: await listTagEvents(photo.tagId),
    })),
  )

  return (
    <>
      <h1 className="text-2xl font-bold">Reported photos</h1>
      <Notice code={notice} />
      <UploadsSwitch {...uploads} page="/reports" />
      {!queue.length && <p className="mt-6">No reported photos.</p>}
      {queue.map(({ photo, tag, events }) => (
        <section key={photo.id} aria-labelledby={`photo-${photo.id}`} className="mt-8 border-t border-line pt-6">
          <h2 id={`photo-${photo.id}`} className="text-xl font-bold">
            {tag.street}, {tag.suburb}
          </h2>
          <div className="mt-4 flex flex-wrap items-start gap-6">
            <a href={`/photo/${photo.id}`} className="block">
              {/* eslint-disable-next-line @next/next/no-img-element -- a private photo, streamed by this app's own route */}
              <img
                src={`/photo/${photo.id}`}
                alt={photoAlt(tag)}
                width={320}
                height={240}
                className="h-60 w-80 rounded-[10px] bg-tint object-contain"
              />
            </a>
            <dl className="grid grid-cols-[auto_1fr] items-baseline gap-x-4 gap-y-1 [&_dt]:font-bold">
              <dt>Photo</dt>
              <dd>
                {photo.status === 'hidden'
                  ? 'Hidden since it was reported'
                  : 'Shown: you restored it before, so reports no longer hide it'}
              </dd>
              <dt>Reports</dt>
              <dd>{photo.reports}</dd>
              <dt>Reasons</dt>
              <dd>
                <ul>
                  {REASONS.filter((reason) => photo.reasons[reason]).map((reason) => (
                    <li key={reason}>
                      {REPORT_REASONS[reason]}: {photo.reasons[reason]}
                    </li>
                  ))}
                </ul>
              </dd>
              <dt>Latest report</dt>
              <dd>{dateTime(photo.reportedAt)}</dd>
              <dt>Tag</dt>
              <dd>
                <Link
                  href={`/tags/${tag.id}`}
                  className="inline-flex min-h-11 items-center underline underline-offset-2"
                >
                  {STATUS[tag.status]}, {tag.live ? 'live' : 'not live'}
                </Link>
              </dd>
            </dl>
          </div>
          <div className="mt-4 flex flex-col gap-4">
            <form method="post" action={`/api/photos/${photo.id}/restore`}>
              <button type="submit" className={SECONDARY}>
                Restore
              </button>
            </form>
            {/* Final, so it asks first (§4.3). */}
            <Confirm
              id={`delete-${photo.id}`}
              label="Delete"
              question="Delete this photo? It and its files go for good, and nobody can bring them back."
              action={`/api/photos/${photo.id}/delete`}
              page="/reports"
              asking={confirm === `delete-${photo.id}`}
            />
          </div>
          <h3 className="mt-6 text-lg font-bold">The tag&apos;s events</h3>
          <EventTable label={`Events of the tag on ${tag.street}`} events={events} />
        </section>
      ))}
    </>
  )
}
