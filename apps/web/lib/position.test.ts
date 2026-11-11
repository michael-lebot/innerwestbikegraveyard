import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { LISTEN_MS, readPosition } from './position'

// The phone's readings: each one is handed to the page as watchPosition would, a moment after the last.
let send: (accuracy: number) => void
let fail: (code: number) => void
const clearWatch = vi.fn()
beforeEach(() => {
  vi.useFakeTimers()
  vi.stubGlobal('navigator', {
    geolocation: {
      watchPosition: (success: PositionCallback, error: PositionErrorCallback) => {
        send = (accuracy) => success({ coords: { accuracy } } as GeolocationPosition)
        fail = (code) => error({ code, PERMISSION_DENIED: 1 } as GeolocationPositionError)
        return 7
      },
      clearWatch,
    },
  })
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  clearWatch.mockClear()
})

const accuracy = (position: Promise<GeolocationPosition>) => position.then((p) => p.coords.accuracy)

it('waits past a rough reading for an accurate one, and stops listening', async () => {
  const position = accuracy(readPosition())
  send(900)
  send(30)
  await expect(position).resolves.toBe(30)
  expect(clearWatch).toHaveBeenCalledWith(7)
})

it('takes the most accurate rough reading after 10 seconds', async () => {
  const position = accuracy(readPosition())
  send(300)
  send(80)
  send(120)
  fail(2)
  await vi.advanceTimersByTimeAsync(LISTEN_MS - 1)
  send(200)
  await vi.advanceTimersByTimeAsync(1)
  await expect(position).resolves.toBe(80)
  expect(clearWatch).toHaveBeenCalledWith(7)
})

it('fails at once when refused, and after 10 seconds with no reading', async () => {
  const refused = readPosition()
  fail(1)
  await expect(refused).rejects.toMatchObject({ code: 1 })
  expect(clearWatch).toHaveBeenCalledTimes(1)

  const nothing = readPosition()
  const failed = expect(nothing).rejects.toThrow('No position')
  await vi.advanceTimersByTimeAsync(LISTEN_MS)
  await failed
  expect(clearWatch).toHaveBeenCalledTimes(2)
})
