'use client'
import { bikeName, PROBLEMS, type PublicTag, type TagJson } from '@iwb/shared'
import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { SMALL } from './buttons'
import { PinIcon } from './PinIcon'
import { ReportLink } from './ReportLink'
import { TagActions } from './TagActions'
import { TagDetails } from './TagDetails'
import { PhotoState } from './TagPhoto'

// Its code loads when a card opens, never with the map screen, whose LCP has no room for it (§11.1).
const NotifyOperator = lazy(() => import('./NotifyOperator').then((module) => ({ default: module.NotifyOperator })))

/** A vertical swipe at least this long on the handle shrinks or expands the card (§12). */
const FLICK_PX = 30

/**
 * A live tag's card (§3, §10.4). Not a dialog: the map stays usable beside it. On a phone its handle shrinks it to
 * one line and back, by tap or by flick; in the side panel there is nothing to uncover, so there is no handle (§13).
 */
export function TagCard({
  tag,
  now,
  onDone,
  onClose,
}: {
  tag: PublicTag
  now: Date
  onDone: (tag: TagJson | null) => void
  onClose: () => void
}) {
  const [shrunk, setShrunk] = useState(false)
  const heading = useRef<HTMLHeadingElement>(null)
  // shortcut: flick on release, upgrade to a card that follows the finger if this feels stiff on phones at M1.
  const flick = useRef({ from: 0, flicked: false })

  useEffect(() => heading.current?.focus(), [])

  return (
    <section
      aria-labelledby="card-heading"
      className={`flex flex-col gap-3 ${shrunk ? '' : 'min-h-[calc(50dvh-2rem)]'} wide:min-h-0`}
    >
      <button
        type="button"
        aria-label={shrunk ? 'Expand card' : 'Shrink card'}
        aria-expanded={!shrunk}
        // Only the handle takes the flick, so it never fights the card's own scrolling. It keeps its 44 px when the
        // card scrolls, as it does at large text sizes.
        className="-mx-4 -mt-4 flex h-11 shrink-0 touch-none items-center justify-center wide:hidden"
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId)
          flick.current = { from: event.clientY, flicked: false }
        }}
        onPointerUp={(event) => {
          const dy = event.clientY - flick.current.from
          if (Math.abs(dy) < FLICK_PX) return
          flick.current.flicked = true
          setShrunk(dy > 0)
        }}
        // The click that follows a flick has done its work already.
        onClick={() => {
          if (flick.current.flicked) flick.current.flicked = false
          else setShrunk(!shrunk)
        }}
      >
        <span className="h-1 w-9 rounded-full bg-edge" />
      </button>
      <div className="flex items-start justify-between gap-3">
        <h2 id="card-heading" ref={heading} tabIndex={-1} className="flex min-w-0 items-center gap-2 text-lg font-bold">
          <PinIcon operator={tag.operator} />
          {/* Only the shrunk card's one line is cut short; expanded, a long name wraps (1.4.4). */}
          <span className={shrunk ? 'truncate' : ''}>
            {bikeName(tag.operator)}
            {shrunk && (
              <span className="wide:hidden">
                {' '}
                · {PROBLEMS[tag.problem]} · {tag.street}
              </span>
            )}
          </span>
        </h2>
        <button type="button" className={SMALL} onClick={onClose}>
          Close
        </button>
      </div>
      {/* Shrunk, the rest is out of reach of pointer and keyboard; the panel never shrinks it. */}
      <div className={`flex flex-col gap-4 ${shrunk ? 'hidden wide:flex' : ''}`}>
        <PhotoState>
          <TagDetails tag={tag} now={now} />
          <TagActions id={tag.id} onDone={onDone} />
          {/* The card opens only in the browser, never in the server's HTML, so location is there. */}
          <Suspense>
            <NotifyOperator tag={tag} origin={location.origin} />
          </Suspense>
          {tag.photoId && <ReportLink photoId={tag.photoId} heading="card-heading" />}
        </PhotoState>
      </div>
    </section>
  )
}
