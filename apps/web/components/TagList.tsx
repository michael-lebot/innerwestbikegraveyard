import { bikes, byPlace, type PublicTag } from '@iwb/shared'
import { TagActions } from './TagActions'
import { TagRow } from './TagRow'

/**
 * Live tags grouped by suburb: suburbs, then the streets in each, in alphabetical order. `onSelect` as on TagRow.
 * Without it, this is /list, where each row has Still there and Removed (§10.3); on the map they are on the card.
 */
export function TagList({
  tags,
  now,
  onSelect,
}: {
  tags: PublicTag[]
  now: Date
  onSelect?: (tag: PublicTag) => void
}) {
  const bySuburb = new Map<string, PublicTag[]>()
  for (const tag of tags.toSorted(byPlace)) {
    const group = bySuburb.get(tag.suburb)
    if (group) group.push(tag)
    else bySuburb.set(tag.suburb, [tag])
  }

  return (
    <div className="flex flex-col gap-2">
      {[...bySuburb].map(([suburb, group]) => (
        <section key={suburb} className="flex flex-col gap-2">
          <h2 aria-label={`${suburb}, ${bikes(group.length)}`} className="mt-2 text-sm font-bold text-muted">
            {suburb} · {group.length}
          </h2>
          {/* On /list, wider gaps keep each row's buttons with its row. */}
          <ul className={`flex flex-col ${onSelect ? 'gap-2' : 'gap-6'}`}>
            {group.map((tag) => (
              <li key={tag.id} className="flex flex-col gap-2">
                <TagRow tag={tag} now={now} onSelect={onSelect} />
                {!onSelect && <TagActions id={tag.id} outlined />}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
