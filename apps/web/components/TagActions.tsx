'use client'
import type { TagJson } from '@iwb/shared'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { send } from '@/lib/send'
import { announce } from './Announcer'
import { PRIMARY, SECONDARY } from './buttons'
import { ErrorText } from './ErrorText'

const DONE = { 'still-there': 'Marked still there', removed: 'Removed.' }

/**
 * Sends Still there or Removed for one tag and announces how it went. `tag` is the tag as it now is, null once it
 * has gone (removed, or already gone), or undefined when nothing changed and `message` says why.
 */
export async function tagAction(id: string, action: keyof typeof DONE) {
  const sent = await send<{ tag: TagJson | null }>(`/api/tags/${id}/${action}`, { requestId: crypto.randomUUID() })
  const result: { tag?: TagJson | null; message: string } = sent.ok
    ? { tag: sent.data.tag, message: DONE[action] }
    : { tag: sent.error.code === 'tag_gone' ? null : undefined, message: sent.error.message }
  announce(result.message)
  return result
}

/**
 * "Is it still there?" (§3) on the card, a /list row or a tag's page. `onDone` gets the tag as it now is, or null
 * once it has gone. Without it, Still there refreshes the page from the server, and a tag that has gone keeps its
 * place until the next load, so the next row's buttons don't slide under a finger. `outlined` is for a list of them,
 * where no row's Still there is the screen's one green button (§9).
 */
export function TagActions({
  id,
  outlined = false,
  onDone,
}: {
  id: string
  outlined?: boolean
  onDone?: (tag: TagJson | null) => void
}) {
  const router = useRouter()
  const [error, setError] = useState<string>()
  const [gone, setGone] = useState<string>()
  const sending = useRef(false)
  const status = useRef<HTMLParagraphElement>(null)

  // The buttons have gone, so the line that replaced them takes the focus.
  useEffect(() => status.current?.focus(), [gone])

  const act = async (action: keyof typeof DONE) => {
    if (sending.current) return
    sending.current = true
    const { tag, message } = await tagAction(id, action)
    sending.current = false
    if (tag === undefined) return setError(message)
    setError(undefined)
    if (onDone) onDone(tag)
    else if (tag) router.refresh()
    else setGone(message)
  }

  if (gone)
    return (
      <p ref={status} tabIndex={-1} className="font-bold">
        {gone}
      </p>
    )
  return (
    <>
      {/* The buttons need JavaScript; without it they'd do nothing, so they make way for a line saying so. */}
      <p className="hidden noscript:block">Turn on JavaScript to mark it Still there or Removed.</p>
      <div role="group" aria-labelledby={`ask-${id}`} className="flex flex-col gap-2 noscript:hidden">
        <p id={`ask-${id}`} className="font-bold">
          Is it still there?
        </p>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" className={outlined ? SECONDARY : PRIMARY} onClick={() => act('still-there')}>
            Still there
          </button>
          <button type="button" className={SECONDARY} onClick={() => act('removed')}>
            Removed
          </button>
        </div>
        {error && <ErrorText>{error}</ErrorText>}
      </div>
    </>
  )
}
