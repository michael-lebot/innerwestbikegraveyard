'use client'
import { OPERATORS, operatorEmail, type PublicTag } from '@iwb/shared'
import { useState } from 'react'
import { announce } from './Announcer'
import { SECONDARY, SMALL } from './buttons'

/**
 * "Notify the service provider?" (§4.2): a disclosure, so it opens without JavaScript, holding a link that opens the
 * visitor's own email app with the email to the tag's operator written, and the message to copy. The site sends
 * nothing. A "Not sure" tag has no one to write to, so it shows nothing. A device with no email app does nothing
 * with the link, and the browser can't tell, so Gmail and Outlook.com sit right under it, and every click also says
 * so and shows the address to copy.
 */
export function NotifyOperator({ tag, origin }: { tag: PublicTag; origin: string }) {
  const [clicked, setClicked] = useState(false)
  const email = operatorEmail(tag, origin)
  if (!email) return null

  const opening = () => {
    setClicked(true)
    announce(OPENING)
  }

  return (
    <details>
      <summary className="cursor-pointer py-2.5 font-bold">Notify the service provider?</summary>
      <div className="flex flex-col gap-2 pt-1">
        <a href={email.href} className={SECONDARY} onClick={opening}>
          Email {OPERATORS[tag.operator].label}
        </a>
        <ComposeLink href={email.gmail}>Write it in Gmail</ComposeLink>
        <ComposeLink href={email.outlook}>Write it in Outlook.com</ComposeLink>
        {clicked ? (
          <div className="flex flex-col gap-1 text-sm">
            <p>{OPENING}</p>
            <p className="flex flex-wrap items-center gap-x-3">
              {/* The address never breaks at its hyphen, which would leave half of it on each line. */}
              <span className="whitespace-nowrap font-bold">{email.to}</span>
              <CopyButton text={email.to} what="address" />
            </p>
          </div>
        ) : (
          <p className="text-sm text-muted">
            {/* The address never breaks at its hyphen, which would leave half of it on each line. */}
            Email opens your own email app, addressed to <span className="whitespace-nowrap">{email.to}</span>. This
            site sends nothing.
          </p>
        )}
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
          <CopyButton text={email.message} what="message" />
        </p>
      </div>
    </details>
  )
}

const OPENING =
  'Opening your email app. If nothing opens, write it in Gmail or Outlook.com, or copy the address and the message ' +
  'below.'

/** A button that copies `text`, the `what`, and says whether it did, beside it and aloud. */
function CopyButton({ text, what }: { text: string; what: string }) {
  const [status, setStatus] = useState('')
  const copy = async () => {
    let said = 'Copied'
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      said = `Couldn't copy. Select the ${what} and copy it.`
    }
    setStatus(said)
    announce(said)
  }
  return (
    <>
      <button type="button" className={SMALL} onClick={copy}>
        Copy {what}
      </button>
      <span className="text-sm text-muted">{status}</span>
    </>
  )
}

/** A web email's compose page, filled in, in a new tab so this page keeps its place. */
function ComposeLink({ href, children }: { href: string; children: string }) {
  return (
    <a href={href} target="_blank" rel="noopener" className={SECONDARY}>
      {children}
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  )
}
