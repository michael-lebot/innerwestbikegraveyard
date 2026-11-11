'use client'
import { lazy, Suspense, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { announce } from './Announcer'
import { usePhotoGone } from './TagPhoto'

// The form and its code load when the link is used, never with the page (§11.1).
const ReportDialog = lazy(() => import('./ReportDialog').then((module) => ({ default: module.ReportDialog })))

/**
 * "Report this photo" (§3), low-key under a tag while its photo shows. A report that hides the photo puts text in its
 * place and takes this link away, so the focus goes to the heading `heading` names; otherwise it comes back here.
 */
export function ReportLink({ photoId, heading }: { photoId: string; heading: string }) {
  const [open, setOpen] = useState(false)
  const link = useRef<HTMLButtonElement>(null)
  const [gone, setGone] = usePhotoGone()

  const close = () => {
    flushSync(() => setOpen(false))
    link.current?.focus()
  }

  const reported = (hidden: boolean) => {
    if (!hidden) {
      close()
      return announce('Photo reported. It was checked before, so it stays up.')
    }
    flushSync(() => {
      setOpen(false)
      setGone('Photo hidden while we check it')
    })
    document.getElementById(heading)?.focus()
    announce('Photo reported and hidden')
  }

  if (gone) return null
  return (
    <>
      {/* Reporting needs JavaScript; without it the button would do nothing, so it makes way for a line saying so. */}
      <p className="hidden text-sm text-muted noscript:block">Turn on JavaScript to report this photo.</p>
      <button
        ref={link}
        type="button"
        onClick={() => setOpen(true)}
        className="min-h-11 self-start text-sm text-muted underline underline-offset-2 noscript:hidden"
      >
        Report this photo
      </button>
      {open && (
        <Suspense>
          <ReportDialog photoId={photoId} onCancel={close} onReported={reported} />
        </Suspense>
      )}
    </>
  )
}
