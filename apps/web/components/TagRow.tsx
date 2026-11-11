import { clockTime, duration, OPERATORS, PROBLEMS, type PublicTag } from '@iwb/shared'
import Link from 'next/link'
import { FOCUS_RING_ON_HOVER } from './buttons'
import { PinIcon } from './PinIcon'

/** A tag's row, linking to its page. With `onSelect`, a click picks the tag instead, as the map's lists do. */
export function TagRow({ tag, now, onSelect }: { tag: PublicTag; now: Date; onSelect?: (tag: PublicTag) => void }) {
  return (
    <Link
      href={`/tag/${tag.id}`}
      onClick={
        onSelect &&
        ((event) => {
          event.preventDefault()
          onSelect(tag)
        })
      }
      className={`flex min-h-14 items-center gap-3 rounded-[10px] border border-line px-3 py-2 ${FOCUS_RING_ON_HOVER}`}
    >
      <PinIcon operator={tag.operator} />
      <span className="flex min-w-0 flex-1 flex-col leading-snug">
        <b>{tag.street}</b>
        <span className="text-sm text-muted">
          {OPERATORS[tag.operator].label} · {PROBLEMS[tag.problem]}
        </span>
      </span>
      <span className="text-sm whitespace-nowrap text-muted">
        {duration(now, tag.expiresAt)} left
        <span className="sr-only"> (disappears at {clockTime(tag.expiresAt)})</span>
      </span>
    </Link>
  )
}
