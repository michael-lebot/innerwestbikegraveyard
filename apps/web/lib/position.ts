import { LOCATION_ACCURACY_METERS } from '@iwb/shared'

/** How long the page waits for a first reading, and then for a better one (§4.1). */
export const LISTEN_MS = 10_000

/**
 * The visitor's position, read for this one try (§4.1). A phone's first reading is often a rough one from Wi-Fi, so
 * after it the page listens up to 10 seconds more for one accurate to 50 m, and then takes the most accurate it got.
 * The first reading has 10 seconds of its own, which the browser counts from after the permission prompt. A refusal,
 * or no first reading, fails. Aborting `signal` stops it and drops its result. It always stops listening.
 */
export function readPosition(signal: AbortSignal) {
  return new Promise<GeolocationPosition>((resolve, reject) => {
    let best: GeolocationPosition | undefined
    let timer: ReturnType<typeof setTimeout> | undefined
    const end = () => {
      clearTimeout(timer)
      navigator.geolocation.clearWatch(watch)
      signal.removeEventListener('abort', abort)
    }
    const abort = () => {
      end()
      reject(signal.reason)
    }
    const watch = navigator.geolocation.watchPosition(
      (position) => {
        if (position.coords.accuracy <= LOCATION_ACCURACY_METERS) {
          end()
          return resolve(position)
        }
        timer ??= setTimeout(() => {
          end()
          resolve(best!)
        }, LISTEN_MS)
        if (!best || position.coords.accuracy < best.coords.accuracy) best = position
      },
      (error) => {
        // Once there is a reading, the window above decides.
        if (best) return
        end()
        reject(error)
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: LISTEN_MS },
    )
    if (signal.aborted) abort()
    else signal.addEventListener('abort', abort)
  })
}
