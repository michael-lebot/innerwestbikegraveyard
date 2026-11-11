import { LOCATION_ACCURACY_METERS } from '@iwb/shared'

/** How long the page listens for a reading accurate enough (§4.1). */
export const LISTEN_MS = 10_000

/**
 * The visitor's position, read for this one try (§4.1). A phone's first reading is often a rough one from Wi-Fi, so it
 * listens until one is accurate to 50 m, or for 10 seconds and then takes the most accurate it got. A refusal fails at
 * once, and so does 10 seconds with no reading at all. It always stops listening.
 */
export function readPosition() {
  return new Promise<GeolocationPosition>((resolve, reject) => {
    let best: GeolocationPosition | undefined
    const end = () => {
      clearTimeout(timer)
      navigator.geolocation.clearWatch(watch)
    }
    const watch = navigator.geolocation.watchPosition(
      (position) => {
        if (!best || position.coords.accuracy < best.coords.accuracy) best = position
        if (position.coords.accuracy > LOCATION_ACCURACY_METERS) return
        end()
        resolve(position)
      },
      (error) => {
        // Other errors can pass while the phone keeps trying.
        if (error.code !== error.PERMISSION_DENIED) return
        end()
        reject(error)
      },
      { enableHighAccuracy: true, maximumAge: 0 },
    )
    const timer = setTimeout(() => {
      end()
      if (best) resolve(best)
      else reject(new Error('No position'))
    }, LISTEN_MS)
  })
}
