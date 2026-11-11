import { describe, expect, it } from 'vitest'
import {
  bikeCount,
  bikeName,
  byPlace,
  clockTime,
  dateTime,
  duration,
  isExpired,
  parseTag,
  photoAlt,
  pinLabel,
} from './format'
import type { PublicTag } from './schemas'

describe('bikeCount', () => {
  it('uses the singular for one bike', () => {
    expect(bikeCount(1)).toBe('1 bike in the graveyard')
  })

  it('uses the plural for any other number', () => {
    expect(bikeCount(0)).toBe('0 bikes in the graveyard')
    expect(bikeCount(14)).toBe('14 bikes in the graveyard')
  })
})

describe('bikeName', () => {
  it("names the operator's e-bike", () => {
    expect(bikeName('lime')).toBe('Lime e-bike')
  })

  it('calls it a share e-bike when the operator is not known', () => {
    expect(bikeName('not_sure')).toBe('Share e-bike')
  })
})

describe('duration', () => {
  const start = new Date('2026-11-09T00:00:00Z')
  const after = (minutes: number) => new Date(start.getTime() + minutes * 60_000)

  it('gives whole hours, rounded down', () => {
    expect(duration(start, after(31 * 60 + 59))).toBe('31 h')
  })

  it('gives minutes under an hour, and never less than one', () => {
    expect(duration(start, after(40))).toBe('40 min')
    expect(duration(start, after(0))).toBe('1 min')
  })

  it('spells the units out for screen readers', () => {
    expect(duration(start, after(31 * 60), true)).toBe('31 hours')
    expect(duration(start, after(60), true)).toBe('1 hour')
    expect(duration(start, after(40), true)).toBe('40 minutes')
    expect(duration(start, after(1), true)).toBe('1 minute')
  })
})

describe('clockTime', () => {
  it('reads the time in Sydney during daylight saving (UTC+11)', () => {
    expect(clockTime(new Date('2026-11-10T04:40:00Z'))).toBe('3:40 pm Tuesday')
  })

  it('reads the time in Sydney outside daylight saving (UTC+10)', () => {
    expect(clockTime(new Date('2026-07-07T05:40:00Z'))).toBe('3:40 pm Tuesday')
  })
})

describe('dateTime', () => {
  it('gives the day, date and time in Sydney', () => {
    expect(dateTime(new Date('2026-11-10T04:40:00Z'))).toBe('Tue, 10 Nov, 3:40 pm')
  })
})

describe('isExpired', () => {
  const now = new Date('2026-11-09T12:00:00Z')

  it('is false until expiresAt', () => {
    expect(isExpired({ expiresAt: new Date('2026-11-09T12:00:01Z') }, now)).toBe(false)
  })

  it('is true from expiresAt on', () => {
    expect(isExpired({ expiresAt: now }, now)).toBe(true)
  })
})

describe('byPlace', () => {
  it('orders by suburb, then street', () => {
    const tags = [
      { suburb: 'Newtown', street: 'King St' },
      { suburb: 'Marrickville', street: 'Llewellyn St' },
      { suburb: 'Newtown', street: 'Denison St' },
    ]
    expect(tags.toSorted(byPlace).map((tag) => tag.street)).toEqual(['Llewellyn St', 'Denison St', 'King St'])
  })
})

describe('pinLabel', () => {
  it('names the bike, the problem, the place and when it disappears', () => {
    const expiresAt = new Date('2026-11-10T04:40:00Z')
    const tag = {
      id: '5eed0000-0000-4000-8000-000000000006',
      lat: -33.895472,
      lng: 151.177079,
      suburb: 'Newtown',
      street: 'Denison St',
      operator: 'lime',
      problem: 'blocking_footpath',
      lastConfirmedAt: new Date('2026-11-08T13:40:00Z'),
      expiresAt,
      photoId: null,
    } as const
    expect(pinLabel(tag, new Date(expiresAt.getTime() - (31 * 60 + 20) * 60_000))).toBe(
      'Lime e-bike, blocking footpath, Denison St, Newtown, disappears in 31 hours, at 3:40 pm Tuesday',
    )
  })
})

describe('parseTag', () => {
  it('turns the times that JSON made strings back into dates', () => {
    const tag: PublicTag = {
      id: '5eed0000-0000-4000-8000-000000000003',
      lat: -33.904497,
      lng: 151.171932,
      suburb: 'Marrickville',
      street: 'Llewellyn St',
      operator: 'lime',
      problem: 'blocking_footpath',
      lastConfirmedAt: new Date('2026-11-09T01:00:00Z'),
      expiresAt: new Date('2026-11-11T01:00:00Z'),
      photoId: '0f0f0000-0000-4000-8000-000000000001',
    }
    expect(parseTag(JSON.parse(JSON.stringify(tag)))).toEqual(tag)
  })
})

describe('photoAlt', () => {
  it("describes a tag's photo by the bike and its problem", () => {
    expect(photoAlt({ operator: 'lime', problem: 'blocking_footpath' })).toBe(
      'Photo of a Lime e-bike reported as blocking footpath',
    )
    expect(photoAlt({ operator: 'ario', problem: 'knocked_over' })).toBe(
      'Photo of an Ario e-bike reported as knocked over',
    )
    expect(photoAlt({ operator: 'not_sure', problem: 'in_waterway' })).toBe(
      'Photo of a share e-bike reported as in waterway',
    )
  })
})
