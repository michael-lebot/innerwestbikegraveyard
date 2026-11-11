import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { chooseReduceMotion, reducesMotion, RESTORE_CHOICE } from './motion'

let html: { dataset: Record<string, string> }
let stored: Record<string, string>
beforeEach(() => {
  html = { dataset: {} }
  stored = {}
  vi.stubGlobal('document', { documentElement: html })
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => stored[key] ?? null,
    setItem: (key: string, value: string) => (stored[key] = value),
  })
})
afterEach(() => vi.unstubAllGlobals())

const osReduces = (matches: boolean) => vi.stubGlobal('matchMedia', () => ({ matches }))

it.each([
  [undefined, false, false],
  [undefined, true, true],
  ['true', false, true],
  ['false', true, false],
  // Anything else in storage counts as no choice.
  ['yes', true, true],
])('with the choice %s and the OS reducing motion %s, reduces it: %s', (choice, os, reduced) => {
  if (choice) html.dataset.reduceMotion = choice
  osReduces(os)
  expect(reducesMotion()).toBe(reduced)
})

it('keeps a choice in localStorage, and the <head> script puts it back on the next visit', () => {
  osReduces(false)
  chooseReduceMotion(true)
  expect(stored).toEqual({ 'reduce-motion': 'true' })
  html.dataset = {}
  new Function(RESTORE_CHOICE)()
  expect(reducesMotion()).toBe(true)
})

it('still applies a choice when storage is switched off, for this page only', () => {
  vi.stubGlobal('localStorage', {
    getItem: () => {
      throw new Error('SecurityError')
    },
    setItem: () => {
      throw new Error('SecurityError')
    },
  })
  osReduces(false)
  chooseReduceMotion(true)
  expect(reducesMotion()).toBe(true)
  expect(() => new Function(RESTORE_CHOICE)()).not.toThrow()
})
