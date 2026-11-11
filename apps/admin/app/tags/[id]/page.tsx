import { getTag, listTagEvents } from '@iwb/server'
import { dateTime, isExpired, OPERATORS, type PhotoStatus, photoAlt, PROBLEMS, TagParams } from '@iwb/shared'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Fragment } from 'react'
import { PRIMARY } from '@/components/buttons'
import { Confirm } from '@/components/Confirm'
import { EventTable } from '@/components/EventTable'
import { Notice } from '@/components/Notice'
import { STATUS } from '@/components/TagTable'

export const metadata: Metadata = { title: 'Tag' }

const PHOTO: Record<PhotoStatus, string> = {
  visible: 'Shown while the tag is live',
  hidden: 'Hidden after a report',
  deleted: 'Deleted',
}

/** One tag in any state: its details, Undo removal and Take down, and its events with each hash's actions that day. */
export default async function TagPage({ params, searchParams }: PageProps<'/tags/[id]'>) {
  const parsed = TagParams.safeParse(await params)
  const tag = parsed.success && (await getTag(parsed.data.id))
  if (!tag) notFound()
  const [{ notice, confirm }, events] = await Promise.all([searchParams, listTagEvents(tag.id)])
  const details = [
    ['Status', STATUS[tag.status]],
    ['Live', tag.live ? 'Yes' : 'No'],
    ['Operator', OPERATORS[tag.operator].label],
    ['Problem', PROBLEMS[tag.problem]],
    ['Created', dateTime(tag.createdAt)],
    ['Last seen', dateTime(tag.lastConfirmedAt)],
    ['Still there', `${tag.confirmCount} times`],
    ['Removed', tag.removedAt ? dateTime(tag.removedAt) : 'No'],
    ['Expires', dateTime(tag.expiresAt)],
    ['Position', `${tag.lat.toFixed(6)}, ${tag.lng.toFixed(6)}`],
    ['Photo', tag.photo ? PHOTO[tag.photo.status] : 'None'],
    ['Id', tag.id],
  ]

  return (
    <>
      <h1 className="text-2xl font-bold">
        {tag.street}, {tag.suburb}
      </h1>
      <Notice code={notice} />
      <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
        {details.map(([term, value]) => (
          <Fragment key={term}>
            <dt className="font-bold">{term}</dt>
            <dd className="min-w-0 break-words">{value}</dd>
          </Fragment>
        ))}
      </dl>
      {tag.photo && tag.photo.status !== 'deleted' && (
        <a href={`/photo/${tag.photo.id}`} className="mt-4 block w-fit">
          {/* eslint-disable-next-line @next/next/no-img-element -- a private photo, streamed by this app's own route */}
          <img
            src={`/photo/${tag.photo.id}`}
            alt={photoAlt(tag)}
            width={320}
            height={240}
            className="h-60 w-80 rounded-[10px] bg-tint object-contain"
          />
        </a>
      )}

      <h2 className="mt-8 text-xl font-bold">Actions</h2>
      <div className="mt-2 flex flex-col gap-4">
        {tag.status === 'removed' &&
          (isExpired(tag) ? (
            <p>Expired, can&apos;t undo.</p>
          ) : (
            <form method="post" action={`/api/tags/${tag.id}/undo`}>
              <button type="submit" className={PRIMARY}>
                Undo removal
              </button>
            </form>
          ))}
        {tag.status === 'taken_down' ? (
          <p>Taken down. That is final.</p>
        ) : (
          // Final, so it asks first (§4.2).
          <Confirm
            id="take-down"
            label="Take down"
            question="Take this tag down? It goes off the map for good, and nobody can undo it."
            action={`/api/tags/${tag.id}/take-down`}
            page={`/tags/${tag.id}`}
            asking={confirm === 'take-down'}
          />
        )}
      </div>

      <h2 className="mt-8 text-xl font-bold">Events</h2>
      <EventTable label="Events" events={events} />
    </>
  )
}
