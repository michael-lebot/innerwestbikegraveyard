import booleanPointInPolygon from '@turf/boolean-point-in-polygon'
import type { Polygon } from 'geojson'
import { describe, expect, it } from 'vitest'
import buffered from '../data/council-buffered.json'
import picker from '../data/picker.json'
import { where } from './geo'
import { loadHouseNumbers, matchHouseNumber, type Place, type Street, searchStreets } from './picker'

describe('matchHouseNumber', () => {
  const at = (number: string): Place => [number, -33.9, 151.17]

  it('§5.5 house numbers: 12 matches the same number', () => {
    expect(matchHouseNumber([at('10-14'), at('12'), at('12A')], '12')).toEqual(at('12'))
  })

  it('§5.5 house numbers: 12 matches a lettered one, 12A', () => {
    expect(matchHouseNumber([at('11'), at('12A')], '12')).toEqual(at('12A'))
  })

  it('§5.5 house numbers: 12 matches a range that contains it, 10-14', () => {
    expect(matchHouseNumber([at('8'), at('10-14'), at('16')], '12')).toEqual(at('10-14'))
  })

  it('§5.5 house numbers: an unknown number matches nothing', () => {
    expect(matchHouseNumber([at('10'), at('12A'), at('14-16')], '9999')).toBeNull()
    expect(matchHouseNumber([at('10')], 'ten')).toBeNull()
  })

  it('takes a typed letter as it is, in either case', () => {
    expect(matchHouseNumber([at('12'), at('12A'), at('12B')], ' 12b ')).toEqual(at('12B'))
  })

  it('matches a typed letter only to that letter, never to another house', () => {
    expect(matchHouseNumber([at('12'), at('12A'), at('10-14')], '12C')).toBeNull()
  })

  it('matches nothing for a number with anything else in it', () => {
    for (const typed of ['12xyz', '12.5', '12/3', '1 2'])
      expect(matchHouseNumber([at('12'), at('12A')], typed)).toBeNull()
  })

  it('takes a bare number to its lettered house before a range that holds it, ignoring leading zeros', () => {
    expect(matchHouseNumber([at('10-14'), at('12A')], '12')).toEqual(at('12A'))
    expect(matchHouseNumber([at('10-14'), at('12A'), at('12')], '012')).toEqual(at('12'))
    expect(matchHouseNumber([at('120'), at('10-14')], '12')).toEqual(at('10-14'))
  })
})

describe('searchStreets', () => {
  const found = (query: string) => searchStreets(query).map(({ street, suburb }) => `${street}, ${suburb}`)

  it('finds a street in each suburb it runs through, names that start with the word first', () => {
    expect(found('llew')).toEqual([
      'Llewellyn La, Marrickville',
      'Llewellyn St, Balmain',
      'Llewellyn St, Marrickville',
      'Llewellyn St, Newtown',
      'Little Llewellyn St, Balmain',
    ])
  })

  it('narrows by every word typed, the suburb included, in any case', () => {
    expect(found('LLEW st marr')).toEqual(['Llewellyn St, Marrickville'])
  })

  it('ignores apostrophes, and finds nothing for nothing', () => {
    expect(found('oconnor la')).toContain("O'Connor La, Marrickville")
    expect(found(' ')).toEqual([])
  })

  it("lists each street's corners in order along it", () => {
    const [llewellyn] = searchStreets('llewellyn st marrickville')
    expect(llewellyn?.corners.map(([cross]) => cross)).toEqual([
      'Enmore Rd',
      'Scouller La',
      'Black St',
      "O'Connor La",
      'Juliett St',
      'Shelleys La',
      'Lynch La',
    ])
  })
})

describe('loadHouseNumbers', () => {
  it("loads a street's numbers from its suburb's file, each where that house is", async () => {
    const [llewellyn] = searchStreets('llewellyn st marrickville')
    const twelve = matchHouseNumber(await loadHouseNumbers(llewellyn!), '12')
    expect(twelve?.[0]).toBe('12')
    expect(where(twelve![1], twelve![2])).toEqual({ inside: true, suburb: 'Marrickville', street: 'Llewellyn St' })
  })
})

it('offers only spots the server takes: every corner and house, as the picker reads it, is inside the 20 m strip', async () => {
  // where()'s own test, without its nearest street, which would take minutes for every house. The server rounds to
  // 1e-6 degrees first, which leaves a point on the data's 1e-5 grid as it is.
  const outside: string[] = []
  const check = (label: string, [name, lat, lng]: Place) =>
    booleanPointInPolygon([lng, lat], buffered as Polygon) || outside.push(`${name}, ${label}`)
  for (const street of picker as Street[]) {
    const at = `${street.street}, ${street.suburb}`
    for (const corner of street.corners) check(`corner of ${at}`, corner)
    for (const house of await loadHouseNumbers(street)) check(at, house)
  }
  expect(outside).toEqual([])
})
