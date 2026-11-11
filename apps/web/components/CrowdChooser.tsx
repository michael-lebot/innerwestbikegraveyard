import { bikes, byPlace, type PublicTag } from '@iwb/shared'
import { useEffect, useRef } from 'react'
import { SMALL } from './buttons'
import { TagRow } from './TagRow'

/** "N bikes here": the tags under a tap where pins overlap, to choose one (§4.1). Not a dialog: the map stays live. */
export function CrowdChooser({
  tags,
  now,
  onSelect,
  onClose,
}: {
  tags: PublicTag[]
  now: Date
  onSelect: (tag: PublicTag) => void
  onClose: () => void
}) {
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => heading.current?.focus(), [])

  return (
    <section aria-labelledby="crowd-heading" className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h2 id="crowd-heading" ref={heading} tabIndex={-1} className="text-lg font-bold">
          {bikes(tags.length)} here
        </h2>
        <button type="button" className={SMALL} onClick={onClose}>
          Close
        </button>
      </div>
      <ul className="flex flex-col gap-2">
        {tags.toSorted(byPlace).map((tag) => (
          <li key={tag.id}>
            <TagRow tag={tag} now={now} onSelect={onSelect} />
          </li>
        ))}
      </ul>
    </section>
  )
}
