'use client'
import { DIALOG_TOP_REM } from '@iwb/shared'
import { type CSSProperties, useEffect, useRef } from 'react'
import { SMALL } from './buttons'

/**
 * A modal dialog (§10.4) on the native <dialog>: showModal() keeps Tab inside it and makes the rest of the page inert.
 * Focus starts on its heading, and Esc or Cancel calls `onCancel`; whoever opened it then gives focus back. On a phone
 * it is the full-height sheet over a short strip of the map, which can't be touched; in the side-panel layout it
 * fills the panel and dims the map (§12, §13). While an on-screen keyboard is open, which shrinks only the visual
 * viewport (`100dvh` and fixed positions don't follow it), the dialog fills what is left of that viewport, so the
 * keyboard covers none of it (§12).
 */
export function Dialog({
  title,
  onCancel,
  children,
}: {
  title: string
  onCancel: () => void
  children: React.ReactNode
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const heading = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    const element = dialog.current!
    element.showModal()
    heading.current?.focus()
    const viewport = visualViewport
    const fit = () => {
      if (viewport && viewport.height < innerHeight - 1) {
        element.style.setProperty('--fit-top', `${viewport.offsetTop}px`)
        element.style.setProperty('--fit-bottom', `${innerHeight - viewport.offsetTop - viewport.height}px`)
      } else {
        element.style.removeProperty('--fit-top')
        element.style.removeProperty('--fit-bottom')
      }
    }
    fit()
    viewport?.addEventListener('resize', fit)
    viewport?.addEventListener('scroll', fit)
    return () => {
      viewport?.removeEventListener('resize', fit)
      viewport?.removeEventListener('scroll', fit)
      element.close()
    }
  }, [])

  return (
    <dialog
      ref={dialog}
      aria-labelledby="dialog-heading"
      // Esc: the page decides what closing means, and unmounts the dialog.
      onCancel={(event) => {
        event.preventDefault()
        onCancel()
      }}
      style={{ '--top': `${DIALOG_TOP_REM}rem` } as CSSProperties}
      className="top-(--fit-top,var(--top)) bottom-(--fit-bottom,0) m-0 h-auto max-h-none w-full max-w-none overflow-y-auto overscroll-contain border-t border-line bg-white p-4 pb-[max(1rem,env(safe-area-inset-bottom))] text-ink shadow-[0_-4px_12px_rgb(0_0_0/0.08)] backdrop:bg-transparent wide:top-(--fit-top,3.5rem) wide:w-95 wide:border-t-0 wide:border-r wide:backdrop:bg-[rgb(0_0_0/0.4)]"
    >
      <div className="flex flex-col gap-4">
        <div className="flex items-start justify-between gap-3">
          <h2 id="dialog-heading" ref={heading} tabIndex={-1} className="text-lg font-bold">
            {title}
          </h2>
          <button type="button" className={SMALL} onClick={onCancel}>
            Cancel
          </button>
        </div>
        {children}
      </div>
    </dialog>
  )
}
