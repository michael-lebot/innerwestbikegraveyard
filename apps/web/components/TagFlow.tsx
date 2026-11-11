'use client'
import { nearbyTags, type PublicTag, type TagJson } from '@iwb/shared'
import { useState } from 'react'
import { MatchDialog } from './MatchDialog'
import type { Spot } from './Placement'
import { type Draft, TagForm } from './TagForm'

/**
 * The steps after a spot is chosen (§3): "Is it one of these?" when live tags are within 25 m, then the form. It stays
 * mounted from the start of tagging to the end, so the answers, the photo and the tag's id outlive Change location.
 */
export function TagFlow({
  spot,
  tags,
  now,
  uploadsPaused,
  apply,
  onChangeLocation,
  onClose,
}: {
  /** The chosen spot, or undefined while the pin is being placed. */
  spot?: Spot
  tags: PublicTag[]
  now: Date
  uploadsPaused: boolean
  apply: (id: string, tag: TagJson | null) => void
  onChangeLocation: () => void
  onClose: () => void
}) {
  const [draft, setDraft] = useState<Draft>(() => ({ id: crypto.randomUUID() }))
  // The spot the visitor said "No, it's another bike" for.
  const [another, setAnother] = useState<Spot>()

  if (!spot) return null
  // Once added, the tag is among the live tags while its photo is sent: it is never one of these.
  const others = tags.filter((tag) => tag.id !== draft.id)
  const nearby = another === spot ? [] : nearbyTags(spot, others)
  return nearby.length ? (
    <MatchDialog tags={nearby} now={now} apply={apply} onNo={() => setAnother(spot)} onClose={onClose} />
  ) : (
    <TagForm
      spot={spot}
      draft={draft}
      onDraft={setDraft}
      uploadsPaused={uploadsPaused}
      apply={apply}
      onChangeLocation={onChangeLocation}
      onClose={onClose}
    />
  )
}
