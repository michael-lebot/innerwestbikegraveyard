// Where a point is (§4.1): inside the area that accepts tags or not, its suburb and its nearest named street.
// Entry "@iwb/shared/geo": the browser loads it with import(), because its data is about 80 KB gzipped.
import booleanPointInPolygon from '@turf/boolean-point-in-polygon'
import type { MultiPolygon, Polygon, Position } from 'geojson'
import buffered from '../data/council-buffered.json'
import places from '../data/places.json'
import { PICKED_STREET_METERS } from './config'
import { METERS_PER_DEGREE } from './near'

type Suburb = { name: string; geometry: Polygon | MultiPolygon }
type Street = { name: string; lines: Position[][] }

const area = buffered as Polygon
const suburbs = places.suburbs as Suburb[]
const streets = places.streets as Street[]

/** The distance in metres from a point to the nearest of some lines, on a flat projection centred on the point. */
function distance([lng = 0, lat = 0]: Position, lines: Position[][]) {
  const kx = METERS_PER_DEGREE * Math.cos((lat * Math.PI) / 180)
  const local = ([x = 0, y = 0]: Position) => [(x - lng) * kx, (y - lat) * METERS_PER_DEGREE] as const
  let best = Infinity
  for (const line of lines) {
    for (let i = 1; i < line.length; i++) {
      const [ax, ay] = local(line[i - 1]!)
      const [bx, by] = local(line[i]!)
      // The point of segment AB closest to the origin, which is where the point is.
      const [dx, dy] = [bx - ax, by - ay]
      const t = Math.max(0, Math.min(1, -(ax * dx + ay * dy) / (dx * dx + dy * dy || 1)))
      best = Math.min(best, Math.hypot(ax + t * dx, ay + t * dy))
    }
  }
  return best
}

const nearest = <T>(items: T[], lines: (item: T) => Position[][], point: Position) =>
  items
    .map((item) => ({ item, meters: distance(point, lines(item)) }))
    .reduce((best, next) => (next.meters < best.meters ? next : best)).item

const rings = ({ geometry }: Suburb) =>
  geometry.type === 'Polygon' ? geometry.coordinates : geometry.coordinates.flat()

export function where(lat: number, lng: number) {
  const point = [lng, lat]
  return {
    inside: booleanPointInPolygon(point, area),
    // Suburbs simplified one by one leave slivers a metre or two wide between them; a point in one takes the nearest.
    suburb: (suburbs.find((suburb) => booleanPointInPolygon(point, suburb.geometry)) ?? nearest(suburbs, rings, point))
      .name,
    street: nearest(streets, (street) => street.lines, point).name,
  }
}

/** Whether a named street in the data, called `name`, runs within 60 m of a point: a street picked by name (§10.3). */
export function isStreetNear(name: string, lat: number, lng: number) {
  const street = streets.find((street) => street.name === name)
  return !!street && distance([lng, lat], street.lines) <= PICKED_STREET_METERS
}
