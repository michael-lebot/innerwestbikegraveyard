'use client'
import { bikeName, bikes, type PublicTag, type TagJson } from '@iwb/shared'
import { useState } from 'react'
import { SECONDARY } from './buttons'
import { Dialog } from './Dialog'
import { ErrorText } from './ErrorText'
import { PinIcon } from './PinIcon'
import { tagAction } from './TagActions'
import { TagDetails } from './TagDetails'

/**
 * "Is it one of these?" (§4.2): the live tags within 25 m of the new spot. Only a suggestion: "Yes, this bike" marks
 * that one still there, and "No, it's another bike" carries on to the form.
 */
export function MatchDialog({
  tags,
  now,
  apply,
  onNo,
  onClose,
}: {
  tags: PublicTag[]
  now: Date
  apply: (id: string, tag: TagJson | null) => void
  onNo: () => void
  onClose: () => void
}) {
  const [error, setError] = useState<string>()

  const yes = async (tag: PublicTag) => {
    const { tag: updated, message } = await tagAction(tag.id, 'still-there')
    if (updated === undefined) return setError(message)
    // A tag that has gone leaves the list, and the form follows once none is left.
    apply(tag.id, updated)
    if (updated) onClose()
  }

  return (
    <Dialog title="Is it one of these?" onCancel={onClose}>
      <p>{tags.length === 1 ? 'A bike is' : `${bikes(tags.length)} are`} already tagged within 25 m of your pin.</p>
      <ul className="flex flex-col gap-3">
        {tags.map((tag) => (
          <li key={tag.id} className="flex flex-col gap-3 rounded-[10px] border border-line p-3">
            <h3 id={`match-${tag.id}`} className="flex items-center gap-2 font-bold">
              <PinIcon operator={tag.operator} />
              {bikeName(tag.operator)}
            </h3>
            <TagDetails tag={tag} now={now} />
            <button type="button" aria-describedby={`match-${tag.id}`} className={SECONDARY} onClick={() => yes(tag)}>
              Yes, this bike
            </button>
          </li>
        ))}
      </ul>
      {error && <ErrorText>{error}</ErrorText>}
      <button type="button" className={SECONDARY} onClick={onNo}>
        No, it&apos;s another bike
      </button>
    </Dialog>
  )
}
