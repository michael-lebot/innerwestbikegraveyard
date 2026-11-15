'use client'
import { LOCATION_ACCURACY_METERS } from '@iwb/shared'
import { useRef, useState } from 'react'
import { readPosition } from '@/lib/position'
import { announce } from './Announcer'
import { SECONDARY } from './buttons'
import type { Spot } from './Placement'

/**
 * Still this rough after the wait, it is an approximate location, as iOS gives with Precise Location off. A first fix
 * from cell towers can be as rough, but improves within the wait.
 */
const APPROXIMATE_METERS = 1_000

/** The note, unless it says the page is still finding the visitor, which stopping the read must take back. */
export const unlessFinding = (note?: string) => (note?.includes('Finding ') ? undefined : note)

/** What a location gave: what to say, a spot to confirm when it is close enough, and where to centre the map. */
export type Located = { note: string; spot?: Spot; centre?: { lat: number; lng: number } }

/** A screen's one location read (§4.1, §4.3): starting another, or any newer choice of spot, stops the last. */
export type Reading = { start: () => AbortSignal; stop: () => void }

/** `onStop` runs when a read is stopped before it ends. */
export function useReading(onStop: () => void): Reading {
  const controller = useRef<AbortController>(null)
  const stop = () => {
    if (controller.current && !controller.current.signal.aborted) onStop()
    controller.current?.abort()
  }
  return {
    start: () => {
      stop()
      return (controller.current = new AbortController()).signal
    },
    stop,
  }
}

/**
 * Where the visitor is (§4.1), for Use my location and for Take a photo of a bike (§4.3). The position stays in the
 * browser, and only a spot the visitor then uses is ever sent. A spot is given only inside the council and accurate to
 * 50 m. `withMap` says whether tapping the map is one of the ways left. `onProgress` hears where a rough reading puts
 * the visitor while a better one is awaited. Once `signal` is aborted, `onProgress` hears no more, and what it gives is
 * meant to be dropped.
 */
export async function locate(
  withMap: boolean,
  signal: AbortSignal,
  onProgress?: (located: Located) => void,
): Promise<Located> {
  // The ways that are left: on the map, a tap or a street; on /list, a street.
  const instead = (onMap: string) => (withMap ? onMap : 'Choose a street instead.')
  const failed = (why: string) => ({ note: `${why} ${instead('Tap the map or choose a street.')}` })
  // The streets load first, usually from cache: a failed load is said as such, before the phone is asked anything.
  const geo = await import('@iwb/shared/geo').catch(() => undefined)
  if (!geo) return failed("The street data didn't load. Check your connection and try again.")
  try {
    const { coords } = await readPosition(signal, ({ coords: { latitude: lat, longitude: lng, accuracy } }) =>
      onProgress?.({
        note: `Finding you… accurate to about ${Math.round(accuracy)} m so far.`,
        // An approximate centre could be kilometres out, so the map stays put (§4.1).
        centre: accuracy > APPROXIMATE_METERS ? undefined : { lat, lng },
      }),
    )
    const { latitude: lat, longitude: lng, accuracy } = coords
    const meters = Math.round(accuracy)
    // As iOS gives with Precise Location off, though a phone still settling can be as rough: so it says "helps".
    if (accuracy > APPROXIMATE_METERS)
      return {
        note: `Your phone is only giving an approximate location, about ${meters} m. Turning on Precise Location for your browser helps, or ${withMap ? 'tap the map or choose a street.' : 'choose a street.'}`,
      }
    const { inside, street, suburb } = geo.where(lat, lng)
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
    // Refused (1), location services off or no signal (2), nothing within 10 seconds (3), or no geolocation at all.
    const code = (error as GeolocationPositionError | undefined)?.code
    if (code === 1) return failed("Your browser didn't share your location. You can allow it in your phone's settings.")
    if (code === 3) return failed("We couldn't find your location in time. It's quicker outdoors.")
    return failed("We couldn't find your location. Check that location is turned on.")
  }
}

/**
 * Use my location (§4.1), for someone standing beside the bike. The browser asks for permission only when it is
 * tapped. Nothing is submitted.
 */
export function LocateButton({
  withMap,
  reading,
  onLocate,
}: {
  withMap: boolean
  reading: Reading
  onLocate: (located: Located) => void
}) {
  const [finding, setFinding] = useState(false)

  const find = async () => {
    if (finding) return
    setFinding(true)
    const signal = reading.start()
    // Each rough reading on the way is shown and centred, but not announced: the result is.
    const located = await locate(withMap, signal, onLocate)
    setFinding(false)
    if (signal.aborted) return
    onLocate(located)
    announce(located.note)
  }

  return (
    <button type="button" className={SECONDARY} onClick={find}>
      {finding ? 'Finding you…' : 'Use my location'}
    </button>
  )
}
