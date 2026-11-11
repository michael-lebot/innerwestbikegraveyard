import { describe, expect, it } from 'vitest'
import { type Problem, PROBLEMS } from './config'
import { operatorEmail } from './notify'
import type { PublicTag } from './schemas'

const ORIGIN = 'https://example.org'
const tag: PublicTag = {
  id: '5eed0000-0000-4000-8000-000000000003',
  lat: -33.904497,
  lng: 151.171932,
  suburb: 'Marrickville',
  street: 'Llewellyn St',
  operator: 'lime',
  problem: 'blocking_footpath',
  lastConfirmedAt: new Date('2026-11-09T00:00:00Z'),
  expiresAt: new Date('2026-11-11T00:00:00Z'),
  photoId: null,
}

describe('operatorEmail', () => {
  it("writes to the operator's support address, saying what, where, and the tag's page", () => {
    expect(operatorEmail(tag, ORIGIN)).toEqual({
      to: 'support-au@li.me',
      subject: 'Lime e-bike, blocking footpath, Llewellyn St, Marrickville',
      message:
        'I am reporting that there is a Lime e-bike blocking the footpath near Llewellyn St, Marrickville.\n\n' +
        'Coordinates: -33.904497, 151.171932\n' +
        'Tagged on The Inner West E-bike Graveyard: https://example.org/tag/5eed0000-0000-4000-8000-000000000003',
      href:
        'mailto:support-au@li.me' +
        '?subject=Lime%20e-bike%2C%20blocking%20footpath%2C%20Llewellyn%20St%2C%20Marrickville' +
        '&body=I%20am%20reporting%20that%20there%20is%20a%20Lime%20e-bike%20blocking%20the%20footpath%20near%20' +
        'Llewellyn%20St%2C%20Marrickville.%0D%0A%0D%0ACoordinates%3A%20-33.904497%2C%20151.171932%0D%0A' +
        'Tagged%20on%20The%20Inner%20West%20E-bike%20Graveyard%3A%20https%3A%2F%2Fexample.org%2Ftag%2F' +
        '5eed0000-0000-4000-8000-000000000003',
    })
  })

  it.each([
    ['blocking_footpath', 'a Lime e-bike blocking the footpath near'],
    ['knocked_over', 'a Lime e-bike knocked over near'],
    ['blocking_ramp', 'a Lime e-bike blocking a ramp or driveway near'],
    ['in_waterway', 'a Lime e-bike in a waterway near'],
    ['in_park', 'a Lime e-bike left in a park or reserve near'],
    ['damaged', 'a Lime e-bike that is damaged near'],
  ] satisfies [Problem, string][])('says %s in words of its own', (problem, words) => {
    const email = operatorEmail({ ...tag, problem }, ORIGIN)!
    expect(email.message).toContain(`there is ${words} Llewellyn St, Marrickville.`)
    expect(email.subject).toBe(`Lime e-bike, ${PROBLEMS[problem].toLowerCase()}, Llewellyn St, Marrickville`)
  })

  it('writes to Hello and Ario at their own addresses', () => {
    expect(operatorEmail({ ...tag, operator: 'hello' }, ORIGIN)).toMatchObject({
      to: 'support.au@hellobike.com',
      subject: 'Hello e-bike, blocking footpath, Llewellyn St, Marrickville',
    })
    expect(operatorEmail({ ...tag, operator: 'ario' }, ORIGIN)).toMatchObject({
      to: 'feedback@ario.com',
      message: expect.stringMatching(/^I am reporting that there is an Ario e-bike blocking the footpath near /),
    })
  })

  it('has no one to write to when the visitor was not sure whose bike it is', () => {
    expect(operatorEmail({ ...tag, operator: 'not_sure' }, ORIGIN)).toBeNull()
  })

  it('names the suburb alone when the tag has no street', () => {
    const email = operatorEmail({ ...tag, street: '' }, ORIGIN)!
    expect(email.subject).toBe('Lime e-bike, blocking footpath, Marrickville')
    expect(email.message).toContain('blocking the footpath near Marrickville.')
  })

  it('keeps every character of a street name through the link, ampersands and all', () => {
    const email = operatorEmail({ ...tag, street: "O'Connell St & Lane #2?" }, ORIGIN)!
    const url = new URL(email.href)
    expect(`${url.protocol}${url.pathname}`).toBe('mailto:support-au@li.me')
    expect(url.searchParams.get('subject')).toBe(email.subject)
    // A mailto body breaks its lines with CRLF (RFC 6068).
    expect(url.searchParams.get('body')).toBe(email.message.replaceAll('\n', '\r\n'))
    expect([...url.searchParams.keys()]).toEqual(['subject', 'body'])
  })
})
