'use client'
import type { PublicTag } from '@iwb/shared'
import { useRouter } from 'next/navigation'
import { lazy, Suspense, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { announce } from './Announcer'
import { PRIMARY, PRIMARY_UNLESS_CAMERA } from './buttons'
import { CameraButton, FINDING_YOU, locateAfterPhoto } from './CameraButton'
import { Placement, type Spot } from './Placement'

// The dialogs load when tagging starts (§11.1).
const TagFlow = lazy(() => import('./TagFlow').then((module) => ({ default: module.TagFlow })))

/**
 * "Tag a dumped bike" on /list (§10.3): the placement step without the map, then the usual dialogs. The page never
 * loads MapLibre. A new tag shows once the page refreshes from the server.
 */
export function ListTagButton({ tags, now, uploadsPaused }: { tags: PublicTag[]; now: Date; uploadsPaused: boolean }) {
  const router = useRouter()
  const [tagging, setTagging] = useState<'place' | 'describe'>()
  const [spot, setSpot] = useState<Spot>()
  const [note, setNote] = useState<string>()
  const button = useRef<HTMLButtonElement>(null)
  // The photo from Take a photo of a bike, and its search for the spot, which a street chosen first ends.
  const [photo, setPhoto] = useState<Blob>()
  const photoSearch = useRef<object>(null)

  const end = () => {
    photoSearch.current = null
    // Rendered now, so the button that started it is there to take the focus back.
    flushSync(() => {
      setTagging(undefined)
      setSpot(undefined)
      setNote(undefined)
      setPhoto(undefined)
    })
    button.current?.focus()
  }

  /** Take a photo of a bike: placing starts with the photo kept, and goes on to the form if the spot is found (§4.3). */
  const startWithPhoto = async (taken: Blob) => {
    const search = (photoSearch.current = {})
    setPhoto(taken)
    setNote(FINDING_YOU)
    setTagging('place')
    const located = await locateAfterPhoto(false)
    if (photoSearch.current !== search) return
    setNote(located.note)
    setSpot(located.spot)
    announce(located.note)
    if (located.spot) setTagging('describe')
  }

  if (!tagging)
    return (
      <>
        {/* Tagging needs JavaScript; without it the button would do nothing, so it makes way for a line saying so. */}
        <p className="hidden noscript:block">Turn on JavaScript to tag a bike.</p>
        {!uploadsPaused && <CameraButton className="grow-2 basis-44" onPhoto={startWithPhoto} />}
        <button
          ref={button}
          type="button"
          className={`${uploadsPaused ? PRIMARY : PRIMARY_UNLESS_CAMERA} grow-2 basis-44 noscript:hidden`}
          onClick={() => setTagging('place')}
        >
          Tag a dumped bike
        </button>
      </>
    )
  return (
    <div className="basis-full">
      <Placement
        spot={spot}
        note={note}
        withMap={false}
        onLocate={(located) => {
          setNote(located.note)
          setSpot(located.spot)
        }}
        onChoose={(chosen) => {
          photoSearch.current = null
          setSpot(chosen)
          setNote(undefined)
          setTagging('describe')
        }}
        onUse={() => setTagging('describe')}
        onCancel={end}
      />
      <Suspense>
        <TagFlow
          spot={tagging === 'describe' ? spot : undefined}
          photo={photo}
          tags={tags}
          now={now}
          uploadsPaused={uploadsPaused}
          apply={() => router.refresh()}
          onChangeLocation={() => {
            // The dialog has to close first: until then the bar is inert and can't take the focus.
            flushSync(() => setTagging('place'))
            document.getElementById('placement-heading')?.focus()
          }}
          onClose={end}
        />
      </Suspense>
    </div>
  )
}
