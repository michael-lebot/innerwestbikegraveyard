import booleanPointInPolygon from '@turf/boolean-point-in-polygon'
import type { Polygon } from 'geojson'
import { describe, expect, it } from 'vitest'
import council from '../data/council.json'
import places from '../data/places.json'
import { where } from './geo'

// §4.1's suburbs, wholly and partly inside the council.
const WHOLLY_INSIDE =
  'Ashfield, Balmain, Balmain East, Birchgrove, Dulwich Hill, Enmore, Haberfield, Leichhardt, Lewisham, Lilyfield, Marrickville, Petersham, Rozelle, Stanmore, Summer Hill, Sydenham, Tempe'
const PARTLY_INSIDE =
  'Annandale, St Peters, Newtown, Croydon, Camperdown, Hurlstone Park, Croydon Park, Ashbury, Mascot'

describe('where', () => {
  it('finds a point on Llewellyn St, Marrickville', () => {
    expect(where(-33.904497, 151.171932)).toEqual({ inside: true, suburb: 'Marrickville', street: 'Llewellyn St' })
  })

  it("counts the far footpath of King St, across the boundary in the City of Sydney's half of Newtown", () => {
    expect(where(-33.896734, 151.179755)).toEqual({ inside: true, suburb: 'Newtown', street: 'King St' })
  })

  it('counts the midline of Parramatta Rd, 7 m outside the boundary', () => {
    expect(where(-33.871321, 151.122567)).toMatchObject({ inside: true, street: 'Parramatta Rd' })
  })

  it('refuses a point 30 m beyond the 20 m strip', () => {
    expect(where(-33.896976, 151.180046)).toMatchObject({ inside: false })
  })
})

describe('places.json', () => {
  it('has every suburb wholly or partly inside the council, and the neighbours that touch the strip', () => {
    const names = places.suburbs.map((suburb) => suburb.name)
    expect(names).toEqual(expect.arrayContaining(`${WHOLLY_INSIDE}, ${PARTLY_INSIDE}`.split(', ')))
  })
})

describe('council.json', () => {
  it('names every suburb wholly inside the council on the map, at a point inside the council', () => {
    expect(council.labels.map((label) => label.name)).toEqual(expect.arrayContaining(WHOLLY_INSIDE.split(', ')))
    for (const { name, at } of council.labels)
      expect(booleanPointInPolygon(at, council.boundary as Polygon), name).toBe(true)
  })
})
