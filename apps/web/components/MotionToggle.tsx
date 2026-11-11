'use client'
import { useSyncExternalStore } from 'react'
import { chooseReduceMotion, onMotionChange, reducesMotion } from '@/lib/motion'

/**
 * The Reduce motion switch (§10.5). Its look follows the motion-reduce variant, which is right from the first paint;
 * its pressed state, which needs JavaScript to read, is added once the page is running. Without JavaScript it can't
 * work, so it isn't shown.
 */
export function MotionToggle() {
  const reduced = useSyncExternalStore(onMotionChange, reducesMotion, () => undefined)

  return (
    <button
      type="button"
      aria-pressed={reduced}
      onClick={() => chooseReduceMotion(!reduced)}
      className="inline-flex min-h-[44px] items-center gap-2 noscript:hidden"
    >
      Reduce motion
      <span
        aria-hidden="true"
        className="flex h-5 w-9 shrink-0 items-center rounded-full border border-edge p-0.5 motion-reduce:justify-end motion-reduce:border-brand motion-reduce:bg-brand"
      >
        <span className="size-3.5 rounded-full bg-muted motion-reduce:bg-white" />
      </span>
    </button>
  )
}
