'use client'
import { useRef, useState } from 'react'

/**
 * The phone's menu (§4.7): a native popover, so it opens, closes on Esc or a tap outside, and gives focus back to its
 * button, even without JavaScript. Its links come from the server (Header.tsx); script only reports its state and
 * moves the focus to its first link.
 */
export function Menu({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  const button = useRef<HTMLButtonElement>(null)

  return (
    <>
      <button
        ref={button}
        type="button"
        popoverTarget="menu"
        aria-expanded={open}
        aria-controls="menu"
        aria-label="Menu"
        className="-mr-1.5 flex size-11 shrink-0 items-center justify-center wide:hidden"
      >
        <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
          <path stroke="currentColor" strokeWidth="2" d="M3 6h18M3 12h18M3 18h18" />
        </svg>
      </button>
      <nav
        id="menu"
        popover="auto"
        aria-label="About this site"
        // The header outlives a page change, so a link picked here closes the menu itself.
        onClick={(event) => (event.target as Element).closest('a') && event.currentTarget.hidePopover()}
        onToggle={(event) => {
          const opened = (event.nativeEvent as ToggleEvent).newState === 'open'
          setOpen(opened)
          if (opened) event.currentTarget.querySelector('a')?.focus()
          // Safari doesn't focus a tapped button, so closing would leave the focus nowhere.
          else if (document.activeElement === document.body) button.current?.focus()
        }}
        className="inset-x-0 top-14 bottom-auto m-0 max-h-[calc(100dvh-3.5rem)] w-full max-w-none flex-col items-start overflow-y-auto overscroll-contain border-b border-line bg-white px-[max(1rem,env(safe-area-inset-left))] py-2 text-ink shadow-[0_4px_12px_rgb(0_0_0/0.08)] open:flex wide:hidden"
      >
        {children}
      </nav>
    </>
  )
}
