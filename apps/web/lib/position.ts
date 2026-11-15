import { LOCATION_ACCURACY_METERS } from '@iwb/shared'

/** How long the page waits for a first reading, which the browser counts from after the permission prompt (§4.1). */
export const FIRST_MS = 10_000
/** After a rough first reading, how much longer it listens for an accurate one (§4.1). */
export const BETTER_MS = 5_000

/**
 * The visitor's position, read for this one try (§4.1). A phone's first reading is often a rough one from Wi-Fi, so
 * after it the page listens up to 5 seconds more for one accurate to 50 m, then takes the most accurate it got.
 * `onRough` hears each better rough reading meanwhile, so the page can say how it is going. A refusal, or no first
 * reading, fails. Aborting `signal` stops it and drops its result.
 * It always stops listening.
 */
export function readPosition(signal: AbortSignal, onRough?: (position: GeolocationPosition) => void) {
  return new Promise<GeolocationPosition>((resolve, reject) => {
    let best: GeolocationPosition | undefined
    let timer: ReturnType<typeof setTimeout> | undefined
    // A callback the browser had already queued can still run after the watch is cleared: it must change nothing.
    let settled = false
    const end = () => {
      settled = true
      clearTimeout(timer)
      navigator.geolocation.clearWatch(watch)
      signal.removeEventListener('abort', abort)
    }
    const abort = () => {
      end()
      reject(signal.reason)
    }
    const take = (position: GeolocationPosition) => {
      end()
      resolve(position)
    }
    const watch = navigator.geolocation.watchPosition(
      (position) => {
        if (settled) return
        const { accuracy } = position.coords
        if (accuracy <= LOCATION_ACCURACY_METERS) return take(position)
        if (best && accuracy >= best.coords.accuracy) return
        best = position
        timer ??= setTimeout(() => take(best!), BETTER_MS)
        onRough?.(position)
      },
      (error) => {
        // Once there is a reading, the window above decides.
        if (settled || best) return
        end()
        reject(error)
      },
      // Always a fresh fix: a second tap is a request to try again, not to hear the last answer.
      { enableHighAccuracy: true, maximumAge: 0, timeout: FIRST_MS },
    )
    if (signal.aborted) abort()
    else signal.addEventListener('abort', abort)
  })
}
