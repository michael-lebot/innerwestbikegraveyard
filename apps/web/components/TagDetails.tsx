import { clockTime, duration, photoAlt, PROBLEMS, TAG_LIFETIME_HOURS, type PublicTag } from '@iwb/shared'
import { TagPhoto } from './TagPhoto'

/** Its photo, what is wrong, where, and how long the tag has left. The page or card gives it a heading. */
export function TagDetails({ tag, now }: { tag: PublicTag; now: Date }) {
  const left = (tag.expiresAt.getTime() - now.getTime()) / (TAG_LIFETIME_HOURS * 3_600_000)

  return (
    <div className="flex flex-col gap-3">
      {/* Beside the photo where both fit; at large text sizes, under it, so nothing scrolls sideways. */}
      <div className="flex flex-wrap items-start gap-3">
        {tag.photoId && <TagPhoto id={tag.photoId} alt={photoAlt(tag)} />}
        <div className="grow basis-40">
          <p>{PROBLEMS[tag.problem]}</p>
          <p className="text-sm text-muted">
            {tag.street}, {tag.suburb}
          </p>
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <p className="flex flex-wrap justify-between gap-x-3 text-sm text-muted">
          <span>Last seen {duration(tag.lastConfirmedAt, now)} ago</span>
          <span>
            Disappears in <b className="text-ink">{duration(now, tag.expiresAt)}</b>
            <span className="sr-only">, at {clockTime(tag.expiresAt)}</span>
          </span>
        </p>
        <div aria-hidden="true" className="h-2 overflow-hidden rounded bg-meter">
          <div className="h-full bg-brand" style={{ width: `${Math.round(left * 100)}%` }} />
        </div>
      </div>
    </div>
  )
}
