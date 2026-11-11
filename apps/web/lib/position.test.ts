import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { LISTEN_MS, readPosition } from './position'

// The phone's readings, handed to the page as watchPosition would.
let send: (accuracy: number) => void
let fail: (code: number) => void
let options: PositionOptions | undefined
const clearWatch = vi.fn()
beforeEach(() => {
  vi.useFakeTimers()
  vi.stubGlobal('navigator', {
    geolocation: {
      watchPosition: (success: PositionCallback, error: PositionErrorCallback, given: PositionOptions) => {
        send = (accuracy) => success({ coords: { accuracy } } as GeolocationPosition)
        fail = (code) => error({ code } as GeolocationPositionError)
        options = given
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

const read = () => readPosition(new AbortController().signal).then((p) => p.coords.accuracy)

it('waits past a rough reading for an accurate one, and stops listening', async () => {
  const position = read()
  send(900)
  send(30)
  await expect(position).resolves.toBe(30)
  expect(clearWatch).toHaveBeenCalledWith(7)
})

it('takes the most accurate rough reading 10 seconds after the first, however late that came', async () => {
  const position = read()
  // The browser times the first reading itself, leaving out the permission prompt.
  expect(options).toMatchObject({ timeout: LISTEN_MS })
  await vi.advanceTimersByTimeAsync(LISTEN_MS * 3)
  send(300)
  send(80)
  send(120)
  fail(3)
  await vi.advanceTimersByTimeAsync(LISTEN_MS - 1)
  send(200)
  await vi.advanceTimersByTimeAsync(1)
  await expect(position).resolves.toBe(80)
  expect(clearWatch).toHaveBeenCalledWith(7)
})

it('fails when refused, or with no first reading', async () => {
  for (const code of [1, 3]) {
    const position = read()
    fail(code)
    await expect(position).rejects.toMatchObject({ code })
  }
  expect(clearWatch).toHaveBeenCalledTimes(2)
})

it('stops listening when aborted, before or after it starts', async () => {
  const controller = new AbortController()
  const position = readPosition(controller.signal)
  send(300)
  controller.abort()
  await expect(position).rejects.toThrow()
  expect(clearWatch).toHaveBeenCalledTimes(1)
  await expect(readPosition(controller.signal)).rejects.toThrow()
  expect(clearWatch).toHaveBeenCalledTimes(2)
})
