'use client'
import { LOCATION_ACCURACY_METERS } from '@iwb/shared'
import { useState } from 'react'
import { readPosition } from '@/lib/position'
import { announce } from './Announcer'
import { SECONDARY } from './buttons'
import type { Spot } from './Placement'

/** What a location gave: what to say, a spot to confirm when it is close enough, and where to centre the map. */
export type Located = { note: string; spot?: Spot; centre?: { lat: number; lng: number } }

/**
 * Where the visitor is (§4.1), for Use my location and for Take a photo of a bike (§4.3). The position stays in the
 * browser, and only a spot the visitor then uses is ever sent. A spot is given only inside the council and accurate to
 * 50 m. `withMap` says whether tapping the map is one of the ways left.
 */
export async function locate(withMap: boolean): Promise<Located> {
  // The ways that are left: on the map, a tap or a street; on /list, a street.
  const instead = (onMap: string) => (withMap ? onMap : 'Choose a street instead.')
  const failed = (why: string) => ({ note: `${why} ${instead('Tap the map or choose a street.')}` })
  try {
    const [{ where }, { coords }] = await Promise.all([import('@iwb/shared/geo'), readPosition()])
    const { latitude: lat, longitude: lng, accuracy } = coords
    const { inside, street, suburb } = where(lat, lng)
    const meters = Math.round(accuracy)
    if (!inside) return failed("You're outside the Inner West.")
    if (accuracy > LOCATION_ACCURACY_METERS)
      return {
        note: `Your location is only accurate to about ${meters} m. ${instead('Tap where the bike is, or choose a street.')}`,
        centre: { lat, lng },
      }
    return {
      note: `Near ${street}, ${suburb}, accurate to about ${meters} metres`,
      spot: { lat, lng, street, suburb },
      centre: { lat, lng },
    }
  } catch (error) {
    // Refused (code 1), or no position within 10 seconds, or none at all.
    return failed(
      (error as GeolocationPositionError).code === 1
        ? "Your browser didn't share your location."
        : "We couldn't find your location.",
    )
  }
}

/**
 * Use my location (§4.1), for someone standing beside the bike. The browser asks for permission only when it is
 * tapped. Nothing is submitted.
 */
export function LocateButton({ withMap, onLocate }: { withMap: boolean; onLocate: (located: Located) => void }) {
  const [finding, setFinding] = useState(false)

  const find = async () => {
    if (finding) return
    setFinding(true)
    const located = await locate(withMap)
    setFinding(false)
    onLocate(located)
    announce(located.note)
  }

  return (
    <button type="button" className={SECONDARY} onClick={find}>
      {finding ? 'Finding you…' : 'Use my location'}
    </button>
  )
}
