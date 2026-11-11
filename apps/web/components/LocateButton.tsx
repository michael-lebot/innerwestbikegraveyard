'use client'
import { LOCATION_ACCURACY_METERS } from '@iwb/shared'
import { useState } from 'react'
import { announce } from './Announcer'
import { SECONDARY } from './buttons'
import type { Spot } from './Placement'

/** What a location gave: what to say, a spot to confirm when it is close enough, and where to centre the map. */
export type Located = { note: string; spot?: Spot; centre?: { lat: number; lng: number } }

/**
 * Use my location (§4.1), for someone standing beside the bike. The browser asks for permission only when it is
 * tapped; the position is read once and stays in the browser, and only a spot the visitor then uses is ever sent.
 * Nothing is placed unless it is inside the council and accurate to 50 m, and nothing is submitted.
 */
export function LocateButton({ withMap, onLocate }: { withMap: boolean; onLocate: (located: Located) => void }) {
  const [finding, setFinding] = useState(false)
  // The ways that are left: on the map, a tap or a street; on /list, a street.
  const instead = (onMap: string) => (withMap ? onMap : 'Choose a street instead.')

  const report = (located: Located) => {
    setFinding(false)
    onLocate(located)
    announce(located.note)
  }

  const locate = async () => {
    if (finding) return
    const failed = (why: string) => report({ note: `${why} ${instead('Tap the map or choose a street.')}` })
    setFinding(true)
    try {
      const [{ where }, { coords }] = await Promise.all([
        import('@iwb/shared/geo'),
        new Promise<GeolocationPosition>((resolve, reject) =>
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: true,
            timeout: 10_000,
            maximumAge: 0,
          }),
        ),
      ])
      const { latitude: lat, longitude: lng, accuracy } = coords
      const { inside, street, suburb } = where(lat, lng)
      const meters = Math.round(accuracy)
      if (!inside) failed("You're outside the Inner West.")
      else if (accuracy > LOCATION_ACCURACY_METERS)
        report({
          note: `Your location is only accurate to about ${meters} m. ${instead('Tap where the bike is, or choose a street.')}`,
          centre: { lat, lng },
        })
      else
        report({
          note: `Near ${street}, ${suburb}, accurate to about ${meters} metres`,
          spot: { lat, lng, street, suburb },
          centre: { lat, lng },
        })
    } catch (error) {
      // Refused (code 1), or no position within 10 seconds, or none at all.
      failed(
        (error as GeolocationPositionError).code === 1
          ? "Your browser didn't share your location."
          : "We couldn't find your location.",
      )
    }
  }

  return (
    <button type="button" className={SECONDARY} onClick={locate}>
      {finding ? 'Finding you…' : 'Use my location'}
    </button>
  )
}
