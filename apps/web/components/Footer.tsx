import { FEEDBACK_EMAIL, REPO_URL } from '@iwb/shared'
import { MotionToggle } from './MotionToggle'

const PAGES = [
  { href: '/why', label: 'Why this page exists' },
  { href: '/privacy', label: 'Privacy' },
  { href: '/accessibility', label: 'Accessibility' },
  { href: '/terms', label: 'Terms' },
]

const LINK = 'inline-flex min-h-[44px] min-w-[44px] items-center underline underline-offset-2'

/** What the footer holds, and on a phone the header's menu (§4.7): feedback, the pages about the site, the source
 * code and Reduce motion. */
export function SiteLinks() {
  return (
    <>
      <a href={`mailto:${FEEDBACK_EMAIL}`} aria-label={`Feedback: ${FEEDBACK_EMAIL}`} className={LINK}>
        Feedback<span className="hidden lg:inline">: {FEEDBACK_EMAIL}</span>
      </a>
      {/* In a new tab, so the map and a tag being added stay as they were. Feedback opens the email app, not a page. */}
      {PAGES.map(({ href, label }) => (
        <a key={href} href={href} target="_blank" rel="noopener" className={LINK}>
          {label}
          <span className="sr-only"> (opens in a new tab)</span>
        </a>
      ))}
      <a href={REPO_URL} target="_blank" rel="noopener" className={LINK}>
        Source code<span className="sr-only"> on GitHub (opens in a new tab)</span>
      </a>
      <MotionToggle />
    </>
  )
}

/**
 * Pinned to the bottom of every page in the wide layout (§4.7); a phone held upright has the header's menu instead.
 * One row, or two at 768 px; the address shows where there is room for it, and screen readers always hear it. At
 * large text it scrolls inside itself, and 5 px above and below keep the focus ring (theme.css) clear of that clipping.
 */
export function Footer() {
  return (
    <footer className="sticky bottom-0 z-20 mt-auto hidden max-h-[20dvh] flex-wrap items-center gap-x-3 gap-y-2 overflow-y-auto overscroll-contain border-t border-line bg-white pt-[5px] pr-[max(1rem,env(safe-area-inset-right))] pb-[max(5px,env(safe-area-inset-bottom))] pl-[max(1rem,env(safe-area-inset-left))] text-sm wide:flex">
      <SiteLinks />
    </footer>
  )
}
