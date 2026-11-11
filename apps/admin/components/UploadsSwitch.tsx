import { CIRCUIT_BREAKER_REPORTS_PER_HOUR, dateTime, type PauseReason } from '@iwb/shared'
import { SECONDARY } from './buttons'

const PAUSED_BY: Record<PauseReason, string> = {
  circuit_breaker: `by the circuit breaker, after more than ${CIRCUIT_BREAKER_REPORTS_PER_HOUR} reports in an hour`,
  by_hand: 'by hand',
}

/**
 * The photo uploads switch (§4.6), at the top of both screens: whether visitors can add photos, with Pause or Resume.
 * Nothing else resumes them. Its post comes back to `page`, the screen it is on.
 */
export function UploadsSwitch({
  pausedAt,
  reason,
  page,
}: {
  pausedAt: Date | null
  reason: PauseReason | null
  page: '/reports' | '/tags'
}) {
  return (
    <section
      aria-labelledby="uploads-heading"
      className="mt-4 flex max-w-xl flex-col gap-2 rounded-[10px] border border-line p-3"
    >
      <h2 id="uploads-heading" className="font-bold">
        Photo uploads
      </h2>
      <p>
        {pausedAt
          ? `Paused ${PAUSED_BY[reason!]}, on ${dateTime(pausedAt)}. Tags without photos can still be added.`
          : 'On: visitors can add a photo to a tag.'}
      </p>
      <form method="post" action={`/api/uploads/${pausedAt ? 'resume' : 'pause'}?back=${page}`}>
        <button type="submit" className={SECONDARY}>
          {pausedAt ? 'Resume uploads' : 'Pause uploads'}
        </button>
      </form>
    </section>
  )
}
