// Choose by street (§10.3): every street in each suburb with the corners along it, and its house numbers, which load
// one suburb at a time. Entry "@iwb/shared/picker": the browser loads it with import() when the street picker opens,
// and a suburb's numbers when a street in it is chosen (§11.1).
import { ADDRESSES } from '../data/addresses'
import picker from '../data/picker.json'

/** A corner's cross street or a house number, and where it is. */
export type Place = [name: string, lat: number, lng: number]
/**
 * A house number as its suburb's file stores it: the step in 1e-5 degrees from the street's house before it, or from
 * 0, 0 for the first, so it is a place only once `loadHouseNumbers` has added the steps up.
 */
export type EncodedPlace = [number: string, dLat: number, dLng: number]
/**
 * A street in one suburb, its corners in order along it, and whether its suburb's file has house numbers for it: a
 * quarter of the streets, lanes mostly, have none, only corners.
 */
export type Street = { street: string; suburb: string; corners: Place[]; numbered?: true }

const STREETS = picker as Street[]

/** In lower case and words, without apostrophes: "O'Connor La" is "oconnor", "la". */
const words = (text: string) =>
  text
    .toLowerCase()
    .replaceAll("'", '')
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
const WORDS = STREETS.map(({ street, suburb }) => words(`${street} ${suburb}`))

/**
 * The streets with a word that starts with each word typed: "llew marr" finds Llewellyn St, Marrickville. Names that
 * start with the first word come first, so "llew" lists Llewellyn St before Little Llewellyn St.
 */
export function searchStreets(query: string) {
  const typed = words(query)
  if (!typed.length) return []
  const found = STREETS.filter((_, i) => typed.every((word) => WORDS[i]!.some((name) => name.startsWith(word))))
  const leads = ({ street }: Street) => words(street)[0]!.startsWith(typed[0]!)
  return [...found.filter(leads), ...found.filter((street) => !leads(street))]
}

/** A street's house numbers, from its suburb's file. */
export async function loadHouseNumbers({ street, suburb }: Street) {
  const steps = ((await ADDRESSES[suburb]?.())?.default as Record<string, EncodedPlace[]> | undefined)?.[street] ?? []
  let [lat, lng] = [0, 0]
  return steps.map(([number, dLat, dLng]): Place => {
    lat += dLat
    lng += dLng
    return [number, lat / 1e5, lng / 1e5]
  })
}

/**
 * The house a typed number names (§10.3): the same number, letter and all. A bare number with no house of its own
 * takes its lettered house (12A), or else a range that holds it (10-14). Anything else, such as a letter no house
 * has, finds nothing rather than another house.
 */
export function matchHouseNumber(numbers: Place[], typed: string) {
  const wanted = typed.trim().toUpperCase()
  const [, digits, letters] = wanted.match(/^(\d+)([A-Z]*)$/) ?? []
  if (!digits) return null
  const n = Number(digits)
  const exact = numbers.find(([number]) => number === `${n}${letters}`)
  if (exact) return exact
  if (letters) return null
  const lettered = numbers.find(([number]) => /^\d+[A-Z]+$/.test(number) && parseInt(number) === n)
  const holds = (number: string) => {
    const [from, to] = number.split('-').map((end) => parseInt(end))
    return to !== undefined && from! <= n && n <= to
  }
  return lettered ?? numbers.find(([number]) => holds(number)) ?? null
}
