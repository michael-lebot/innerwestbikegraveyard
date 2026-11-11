// "Notify the service provider?" (§4.2): an email to a tag's operator that the visitor's own email app sends.
import { OPERATORS, type Problem, PROBLEMS } from './config'
import { bikeName, withArticle } from './format'
import type { PublicTag } from './schemas'

/** What's wrong, in the words that follow "there is a Lime e-bike". */
const SAYS: Record<Problem, string> = {
  blocking_footpath: 'blocking the footpath',
  knocked_over: 'knocked over',
  blocking_ramp: 'blocking a ramp or driveway',
  in_waterway: 'in a waterway',
  in_park: 'left in a park or reserve',
  damaged: 'that is damaged',
}

/**
 * The email about a tag to its operator, with its `mailto:` link, or null for a "Not sure" tag, which has no one to
 * write to. `origin` is the site's, as the visitor reached it, for the link to the tag's page.
 */
export function operatorEmail(tag: PublicTag, origin: string) {
  const to = OPERATORS[tag.operator].email
  if (!to) return null
  const bike = bikeName(tag.operator)
  const place = [tag.street, tag.suburb].filter(Boolean).join(', ')
  const subject = `${bike}, ${PROBLEMS[tag.problem].toLowerCase()}, ${place}`
  const message =
    `I am reporting that there is ${withArticle(bike)} ${SAYS[tag.problem]} near ${place}.\n\n` +
    `Coordinates: ${tag.lat}, ${tag.lng}\n` +
    `Tagged on The Inner West E-bike Graveyard: ${origin}/tag/${tag.id}`
  // A mailto body breaks its lines with CRLF (RFC 6068).
  const body = encodeURIComponent(message.replaceAll('\n', '\r\n'))
  return { to, subject, message, href: `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${body}` }
}
