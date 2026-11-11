'use client'
import { OPERATORS, operatorEmail, type PublicTag } from '@iwb/shared'
import { useState } from 'react'
import { announce } from './Announcer'
import { SECONDARY, SMALL } from './buttons'

/**
 * "Notify the service provider?" (§4.2): a disclosure, so it opens without JavaScript, holding a link that opens the
 * visitor's own email app with the email to the tag's operator written, and the message to copy. The site sends
 * nothing. A "Not sure" tag has no one to write to, so it shows nothing.
 */
export function NotifyOperator({ tag, origin }: { tag: PublicTag; origin: string }) {
  const [status, setStatus] = useState('')
  const email = operatorEmail(tag, origin)
  if (!email) return null

  const copy = async () => {
    let said = 'Copied'
    try {
      await navigator.clipboard.writeText(email.message)
    } catch {
      said = "Couldn't copy. Select the message and copy it."
    }
    setStatus(said)
    announce(said)
  }

  return (
    <details>
      <summary className="cursor-pointer py-2.5 font-bold">Notify the service provider?</summary>
      <div className="flex flex-col gap-2 pt-1">
        <a href={email.href} className={SECONDARY}>
          Email {OPERATORS[tag.operator].label}
        </a>
        <p className="text-sm text-muted">
          {/* The address never breaks at its hyphen, which would leave half of it on each line. */}
          Opens your own email app, addressed to <span className="whitespace-nowrap">{email.to}</span>. This site sends
          nothing.
        </p>
        <label htmlFor={`message-${tag.id}`} className="mt-2 font-bold">
          Message
        </label>
        <textarea
          id={`message-${tag.id}`}
          readOnly
          // Tall enough for the whole message on a phone, where it can't size itself to fit (field-sizing).
          rows={8}
          value={email.message}
          className="field-sizing-content rounded-[10px] border border-edge px-3 py-2"
        />
        {/* Copying needs JavaScript; without it the message can still be selected and copied. */}
        <p className="flex flex-wrap items-center gap-x-3 noscript:hidden">
          <button type="button" className={SMALL} onClick={copy}>
            Copy message
          </button>
          <span className="text-sm text-muted">{status}</span>
        </p>
      </div>
    </details>
  )
}
