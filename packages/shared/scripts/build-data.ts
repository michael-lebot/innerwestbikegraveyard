// Turns the NSW downloads in data/raw/ (from fetch-nsw.ts) into the files the site ships, in data/:
// - council.json: the boundary, its bounding box, the camera's and the tiles' bounds, and where the map names each
//   suburb;
// - council-buffered.json: the boundary pushed out 20 m, where tags are accepted (§4.1);
// - places.json: the suburbs and named streets that reach into the buffered boundary, for where();
// - picker.json and addresses/: every street in each suburb, its corners and its house numbers, for the street picker.
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { gzipSync } from 'node:zlib'
import * as turf from '@turf/turf'
import type { BBox, FeatureCollection, LineString, MultiPolygon, Point, Polygon, Position } from 'geojson'
import { BOUNDARY_BUFFER_METERS, STREET_TYPES } from '../src/config.ts'
import type { EncodedPlace, Place, Street } from '../src/picker.ts'

/** The tiles cover this much past the council's bounding box: twice as far east and west, for wide screens. */
const PAD_NS_METERS = 2000
const PAD_EW_METERS = 4000
/**
 * MapLibre keeps the whole view inside maxBounds, so they must hold the view that fits the council in the tallest and
 * the widest maps the layouts make, in CSS px: the side panel's narrowest (768 − 380 wide) on an upright iPad mini,
 * and a Pixel 7 held sideways, each less the header (56) and the footer's one row (55). Past the tiles, the mask's
 * grey carries on.
 * shortcut: a 21:9 screen's map is wider still and crops the council's top and bottom, widen WIDEST if one matters.
 */
const TALLEST = { width: 388, height: 913 }
const WIDEST = { width: 483, height: 249 }
/** Douglas–Peucker tolerance in degrees: about 2 m, far below anything a tap can tell apart. */
const SIMPLIFY = 0.00002

const raw = <T>(name: string) =>
  JSON.parse(readFileSync(new URL(`../data/raw/${name}.geojson`, import.meta.url), 'utf8')) as T

function write(name: string, value: unknown) {
  const json = JSON.stringify(value)
  writeFileSync(new URL(`../data/${name}.json`, import.meta.url), json)
  console.info(`${name}.json: ${json.length} B, ${gzipSync(json).length} B gzipped`)
}

/** Simplified, and rounded to 5 decimal places (about 1 m): any finer is noise after the 2 m simplification. */
const tidy = <T extends Polygon | MultiPolygon | LineString>(geometry: T) =>
  turf.truncate(turf.simplify(geometry, { tolerance: SIMPLIFY }), { precision: 5 })

const round = (box: number[]) => box.map((n) => +n.toFixed(5)) as BBox

// The council, as gazetted, and the 20 m wider area where tags are accepted.
const [council] = raw<FeatureCollection<Polygon>>('council').features
if (!council) throw new Error('data/raw/council.geojson has no polygon')
const boundary = tidy(council.geometry)
const buffered = tidy(turf.buffer(council, BOUNDARY_BUFFER_METERS, { units: 'meters' })!.geometry as Polygon)

const bbox = round(turf.bbox(council))
const [west, south, east, north] = bbox
const metresPerLng = 111_320 * Math.cos((((south + north) / 2) * Math.PI) / 180)
const [wide, tall] = [(east - west) * metresPerLng, (north - south) * 111_320]
const pad = (lng: number, lat: number) => round([west - lng, south - lat, east + lng, north + lat])
const tileBounds = pad(PAD_EW_METERS / metresPerLng, PAD_NS_METERS / 111_320)
/** Metres per px once fitBounds has fitted the council in a map this size, 8 px inside each side. */
const fit = ({ width, height }: typeof TALLEST) => Math.max(wide / (width - 16), tall / (height - 16))
const maxBounds = pad(
  (WIDEST.width * fit(WIDEST) - wide) / 2 / metresPerLng,
  (TALLEST.height * fit(TALLEST) - tall) / 2 / 111_320,
)

write('council-buffered', buffered)

// Suburbs that reach into the buffered council, including neighbours that only touch the 20 m strip.
/** "MARRICKVILLE" → "Marrickville", "O'NEILL" → "O'Neill", "MCDONALD" → "McDonald". */
const title = (words: string) =>
  words
    .toLowerCase()
    .replace(/(^|[^a-z])([a-z])/g, (_, before: string, letter: string) => before + letter.toUpperCase())
    .replace(/\bMc([a-z])/g, (_, letter: string) => `Mc${letter.toUpperCase()}`)

const suburbs = raw<FeatureCollection<Polygon | MultiPolygon, { suburbname: string }>>('suburbs')
  .features.filter((suburb) => turf.booleanIntersects(suburb, buffered))
  .map((suburb) => ({ name: title(suburb.properties.suburbname), geometry: tidy(suburb.geometry) }))
  .sort((a, b) => a.name.localeCompare(b.name))

// The map names a suburb when at least a quarter of it is inside the council, at the middle of that part. The tiles
// can't do it: they carry suburbs only from zoom 12, and the whole council fits a phone at about 11.7.
const LABELLED_SHARE = 0.25
const labels = suburbs.flatMap(({ name, geometry }) => {
  const inside = turf.intersect(turf.featureCollection([turf.feature(geometry), turf.feature(boundary)]))
  if (!inside || turf.area(inside) < LABELLED_SHARE * turf.area(geometry)) return []
  const middle = turf.centerOfMass(inside)
  const at = turf.booleanPointInPolygon(middle, inside) ? middle : turf.pointOnFeature(inside)
  return [{ name, at: at.geometry.coordinates.map((n) => +n.toFixed(5)) }]
})

write('council', { boundary, bbox, maxBounds, tileBounds, labels })

// Named, open road segments that reach into the buffered council, grouped by name. Tunnels are left out: a bike on
// the street above one belongs to that street.
type Road = {
  roadnamebase: string | null
  roadnametype: string | null
  roadnamesuffix: string | null
  roadontype: number
  operationalstatus: number
}
const IN_TUNNEL = 3
const OPERATIONAL = 1

/** "LLEWELLYN", "STREET" → "Llewellyn St"; "O'NEILL", "LANE", "WEST" → "O'Neill La West". */
function streetName({ roadnamebase, roadnametype, roadnamesuffix }: Road) {
  const type = roadnametype && title(roadnametype)
  return [title(roadnamebase ?? ''), type && (STREET_TYPES[type] ?? type), roadnamesuffix && title(roadnamesuffix)]
    .filter(Boolean)
    .join(' ')
}

const roads = raw<FeatureCollection<LineString, Road>>('roads').features
const segments = new Map<string, Position[][]>()
for (const road of roads) {
  const { roadnamebase, roadontype, operationalstatus } = road.properties
  if (!roadnamebase || roadontype === IN_TUNNEL || operationalstatus !== OPERATIONAL) continue
  if (!turf.booleanIntersects(road, buffered)) continue
  const name = streetName(road.properties)
  segments.set(name, [...(segments.get(name) ?? []), road.geometry.coordinates])
}

const same = (a?: Position, b?: Position) => a?.[0] === b?.[0] && a?.[1] === b?.[1]

/** a and b as one line, if they share an end point. */
function join(a: Position[], b: Position[]) {
  if (same(a.at(-1), b[0])) return [...a, ...b.slice(1)]
  if (same(a.at(-1), b.at(-1))) return [...a, ...b.toReversed().slice(1)]
  if (same(a[0], b.at(-1))) return [...b, ...a.slice(1)]
  if (same(a[0], b[0])) return [...b.toReversed(), ...a.slice(1)]
}

/** A street's segments joined end to end, so each point where two meet is stored once: about a third smaller. */
function joinAll(lines: Position[][]) {
  const joined: Position[][] = []
  for (let line of lines) {
    for (let i = joined.length - 1; i >= 0; i--) {
      const longer = join(line, joined[i]!)
      if (!longer) continue
      line = longer
      joined.splice(i, 1)
      i = joined.length
    }
    joined.push(line)
  }
  return joined
}

const streets = [...segments]
  .map(([name, lines]) => ({
    name,
    lines: joinAll(lines).map((line) => tidy({ type: 'LineString', coordinates: line }).coordinates),
  }))
  .sort((a, b) => a.name.localeCompare(b.name))

write('places', { suburbs, streets })

// The street picker (§10.3), which needs no map: each street in each suburb with its corners, and one file per suburb
// with the house numbers on its streets.
/**
 * A junction's points this close together are one corner: where a divided road, a roundabout or two offset arms meet
 * a street. At 15 m, 146 corners kept a twin 16 to 45 m away under the same name.
 */
const CORNER_METERS = 50

const metres = ([x1 = 0, y1 = 0]: Position, [x2 = 0, y2 = 0]: Position) =>
  Math.hypot((x2 - x1) * metresPerLng, (y2 - y1) * 111_320)
const place = (name: string, [lng = 0, lat = 0]: Position): Place => [name, +lat.toFixed(5), +lng.toFixed(5)]

/** Corners and houses that rounding alone would have put outside the strip: moved inside it, or left out. */
let [moved, dropped] = [0, 0]
/**
 * The point on the picker's 1e-5 degree grid (about a metre) nearest to `point` that is inside the buffered council,
 * where createTag() takes it, or null. Rounding alone put 7 houses just outside.
 */
function onGrid(point: Position) {
  const [x = 0, y = 0] = point.map((degrees) => degrees * 1e5)
  const around = [Math.floor, Math.ceil]
    .flatMap((lat) => [Math.floor, Math.ceil].map((lng) => [lng(x) / 1e5, lat(y) / 1e5]))
    .sort((a, b) => metres(a, point) - metres(b, point))
  const inside = around.findIndex((at) => turf.booleanPointInPolygon(at, buffered))
  if (inside < 0) dropped++
  else if (inside > 0) moved++
  return around[inside] ?? null
}

const picker = new Map<string, Street>()
function entry(street: string, suburb: string) {
  const key = `${street}, ${suburb}`
  if (!picker.has(key)) picker.set(key, { street, suburb, corners: [] })
  return picker.get(key)!
}

// A corner is where two differently named streets share a point.
const namesAt = new Map<string, Set<string>>()
for (const [name, lines] of segments)
  for (const point of lines.flat()) namesAt.set(point.join(), (namesAt.get(point.join()) ?? new Set()).add(name))
const corners = new Map<string, Position[]>()
for (const [key, names] of namesAt) {
  const point = key.split(',').map(Number)
  if (names.size < 2 || !turf.booleanPointInPolygon(point, buffered)) continue
  for (const street of names)
    for (const cross of names) {
      const pair = `${street}\n${cross}`
      const points = corners.get(pair) ?? []
      if (street !== cross && points.every((other) => metres(other, point) >= CORNER_METERS))
        corners.set(pair, [...points, point])
    }
}
// The suburbs as gazetted, not simplified, so that a corner on the line between two is in one of them.
const gazetted = raw<FeatureCollection<Polygon | MultiPolygon, { suburbname: string }>>('suburbs').features
for (const [pair, points] of corners) {
  const [street = '', cross = ''] = pair.split('\n')
  for (const point of points) {
    const suburb = gazetted.find((suburb) => turf.booleanPointInPolygon(point, suburb))
    const at = suburb && onGrid(point)
    if (at) entry(street, title(suburb.properties.suburbname)).corners.push(place(cross, at))
  }
}
// In order along the street: west to east, or north to south, whichever way it runs further.
for (const { street, corners } of picker.values()) {
  const [w, s, e, n] = turf.bbox(turf.multiLineString(segments.get(street)!))
  const eastWest = (e - w) * metresPerLng > (n - s) * 111_320
  corners.sort((a, b) => (eastWest ? a[2] - b[2] : b[1] - a[1]))
}

// House numbers: an address names its street in full ("HAWTHORNE PARADE"), as the road data does in its three parts.
type Address = { address: string; housenumber: string | null }
const roadNames = new Map(
  roads.map(({ properties: road }) => [
    [road.roadnamebase, road.roadnametype, road.roadnamesuffix].filter(Boolean).join(' '),
    streetName(road),
  ]),
)
/** Longest first, so that an address in Balmain East isn't taken for one in Balmain. */
const suburbNames = suburbs.map(({ name }) => name).sort((a, b) => b.length - a.length)
/** "707/16" is unit 707 at number 16: the picker wants the 16. A number is digits, perhaps a letter, perhaps a range. */
const NUMBER = /^\d+[A-Z]*(-\d+[A-Z]*)?$/
const numbers = new Map<string, Map<string, Map<string, Position>>>()
let unmatched = 0
// A whole property's point comes before its units', so the number lands on the property.
const addresses = raw<FeatureCollection<Point, Address>>('addresses').features.sort(
  (a, b) => Number(!!a.properties.housenumber?.includes('/')) - Number(!!b.properties.housenumber?.includes('/')),
)
for (const point of addresses) {
  const { address, housenumber } = point.properties
  const number = housenumber?.split('/').at(-1)
  if (!housenumber || !number || !NUMBER.test(number) || !turf.booleanPointInPolygon(point, buffered)) continue
  const rest = address.slice(housenumber.length + 1)
  const suburb = suburbNames.find((name) => rest.endsWith(` ${name.toUpperCase()}`))
  const street = suburb && roadNames.get(rest.slice(0, -suburb.length - 1))
  if (!suburb || !street) {
    unmatched++
    continue
  }
  const streets = numbers.get(suburb) ?? numbers.set(suburb, new Map()).get(suburb)!
  const byNumber = streets.get(street) ?? streets.set(street, new Map()).get(street)!
  const at = !byNumber.has(number) && onGrid(point.geometry.coordinates)
  if (at) {
    byNumber.set(number, at)
    entry(street, suburb).numbered = true
  }
}

/**
 * A street's house numbers as [number, lat, lng] in 1e-5 degrees, about a metre: the first point as it is, and each
 * after it as the step from the one before, going up one side of the street and then the other, so each step is
 * short. It takes Marrickville from 52 KB gzipped to 30 KB, inside §11.1's 40 KB.
 */
function steps(byNumber: Map<string, Position>) {
  let [lat, lng] = [0, 0]
  return [...byNumber]
    .sort(([a], [b]) => (parseInt(a) % 2) - (parseInt(b) % 2) || parseInt(a) - parseInt(b) || a.localeCompare(b))
    .map(([number, [x = 0, y = 0]]): EncodedPlace => {
      const [dLat, dLng] = [Math.round(y * 1e5) - lat, Math.round(x * 1e5) - lng]
      lat += dLat
      lng += dLng
      return [number, dLat, dLng]
    })
}

const slug = (suburb: string) => suburb.toLowerCase().replaceAll(' ', '-')
const ADDRESS_DIR = new URL('../data/addresses/', import.meta.url)
rmSync(ADDRESS_DIR, { recursive: true, force: true })
mkdirSync(ADDRESS_DIR)
for (const [suburb, streets] of [...numbers].sort(([a], [b]) => a.localeCompare(b)))
  write(
    `addresses/${slug(suburb)}`,
    Object.fromEntries(
      [...streets].sort(([a], [b]) => a.localeCompare(b)).map(([street, byNumber]) => [street, steps(byNumber)]),
    ),
  )
writeFileSync(
  new URL('index.ts', ADDRESS_DIR),
  `// Written by scripts/build-data.ts. Each suburb's house numbers load on their own, when a street in it is chosen.
export const ADDRESSES: Record<string, () => Promise<{ default: unknown }>> = {
${[...numbers.keys()]
  .sort()
  .map((suburb) => `  '${suburb}': () => import('./${slug(suburb)}.json'),`)
  .join('\n')}
}
`,
)
const numbered = [...numbers.values()].flatMap((streets) => [...streets])
console.info(
  `${numbered.reduce((total, [, byNumber]) => total + byNumber.size, 0)} house numbers on ${numbered.length} streets ` +
    `in their suburbs (${new Set(numbered.map(([street]) => street)).size} names); ${unmatched} address points left ` +
    `out, on streets the road data doesn't name; ${moved} corners and houses moved onto the grid inside the strip, ` +
    `${dropped} left out`,
)

write(
  'picker',
  [...picker.values()].sort((a, b) => a.street.localeCompare(b.street) || a.suburb.localeCompare(b.suburb)),
)
