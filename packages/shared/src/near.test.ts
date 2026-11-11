import { describe, expect, it } from 'vitest'
import { distanceMeters, nearbyTags, stacks } from './near'
import type { PublicTag } from './schemas'

const LLEWELLYN_ST = { lat: -33.904497, lng: 151.171932 }
/** A point this many metres east and north of Llewellyn St. */
const off = (east: number, north: number) => ({
  lat: LLEWELLYN_ST.lat + north / 111_320,
  lng: LLEWELLYN_ST.lng + east / (111_320 * Math.cos((LLEWELLYN_ST.lat * Math.PI) / 180)),
})
const tag = (id: string, at: { lat: number; lng: number }) => ({ id, ...at }) as PublicTag

describe('distanceMeters', () => {
  it('measures metres east-west and north-south alike', () => {
    expect(distanceMeters(LLEWELLYN_ST, off(30, 0))).toBeCloseTo(30, 6)
    expect(distanceMeters(LLEWELLYN_ST, off(0, -30))).toBeCloseTo(30, 6)
    expect(distanceMeters(LLEWELLYN_ST, off(3, 4))).toBeCloseTo(5, 6)
  })
})

describe('nearbyTags', () => {
  it('finds the tags within 25 m, nearest first, and none further', () => {
    const tags = [tag('far', off(26, 0)), tag('edge', off(0, 24.9)), tag('close', off(-3, 4))]
    expect(nearbyTags(LLEWELLYN_ST, tags).map((near) => near.id)).toEqual(['close', 'edge'])
  })
})

describe('stacks', () => {
  it('counts each stack of overlapping pins once, on its top pin, and leaves lone pins out', () => {
    const pins = [
      { id: 'a', x: 0, y: 10 },
      { id: 'b', x: 20, y: 0 },
      // Overlaps b but not a: still in their stack.
      { id: 'c', x: 40, y: 5 },
      { id: 'lone', x: 100, y: 0 },
      { id: 'd', x: 200, y: 200 },
      { id: 'e', x: 200, y: 200 },
    ]
    expect(stacks(pins, 28)).toEqual(
      new Map([
        ['b', 3],
        ['d', 2],
      ]),
    )
  })
})
