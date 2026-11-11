import { FEEDBACK_EMAIL } from '@iwb/shared'
import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = { title: 'Accessibility' }

export default function AccessibilityPage() {
  return (
    <>
      <h1>Accessibility</h1>
      <p>We aim for every page of this site to meet the Web Content Accessibility Guidelines (WCAG) 2.2 at level AA.</p>

      <h2>You don&apos;t need the map</h2>
      <ul>
        <li>
          The <Link href="/list">list of bikes</Link> shows every tagged bike, grouped by suburb. It works with a screen
          reader, a keyboard, and without JavaScript.
        </li>
        <li>Each bike has its own page, linked from the list.</li>
        <li>
          You can tag a bike without the map by choosing a street, then a house number or the nearest corner, or by
          using your location.
        </li>
      </ul>

      <h2>Known limits</h2>
      <ul>
        <li>The map artwork is visual only. The list and choosing by street are its equivalents.</li>
      </ul>

      <h2>Contact</h2>
      <p>
        If something on this site doesn&apos;t work for you, please tell us at{' '}
        <a href={`mailto:${FEEDBACK_EMAIL}`}>{FEEDBACK_EMAIL}</a>.
      </p>
    </>
  )
}
