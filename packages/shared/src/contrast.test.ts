// WCAG 2.2 contrast (§10.2) for every colour pair the interface and the map art use. A regression fails CI.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { GREYS, LABEL, MAP_COLORS, PIN_HALO, PINS, SPRITE_INKS, WALL } from './palette'

const css = readFileSync(new URL('../theme.css', import.meta.url), 'utf8')
const ui = Object.fromEntries(
  [...css.matchAll(/--color-([a-z]+):\s*(#[0-9a-f]{6})/g)].map(([, name, hex]) => [name, hex]),
)
const token = (name: string) => ui[name] ?? expect.unreachable(`theme.css has no --color-${name}`)

function luminance(hex: string) {
  const [r = 0, g = 0, b = 0] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contrast(a: string, b: string) {
  const [hi = 0, lo = 0] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

describe('interface', () => {
  it.each([
    ['body text', 'ink', 'white', 4.5],
    ['secondary text', 'muted', 'white', 4.5],
    ['primary button text', 'white', 'brand', 4.5],
    ['header text', 'white', 'night', 4.5],
    ['button and chip border', 'edge', 'white', 3],
    ['focus ring', 'focus', 'white', 3],
    ['focus halo on the header', 'white', 'night', 3],
    ['timer bar', 'brand', 'meter', 3],
    ['error text, and the white "!" on its mark', 'error', 'white', 4.5],
  ])('%s: %s on %s reaches %s:1', (_, fg, bg, min) => {
    expect(contrast(token(fg), token(bg))).toBeGreaterThanOrEqual(min)
  })

  it('the header stands out against the map', () => {
    expect(contrast(token('night'), MAP_COLORS.land)).toBeGreaterThanOrEqual(3)
  })
})

describe('map art', () => {
  const backgrounds = [
    ...Object.entries(MAP_COLORS),
    ...GREYS.map((grey, i) => [`grey ${i}`, grey] as const),
    ...Object.entries(SPRITE_INKS).map(([letter, ink]) => [`sprite ink ${letter}`, ink] as const),
  ]

  describe.each(backgrounds)('on %s (%s)', (_, background) => {
    it.each(Object.entries(PINS))('the %s pin stands out through its fill, outline or halo', (_, pin) => {
      const best = Math.max(...[pin.fill, pin.line, PIN_HALO].map((colour) => contrast(colour, background)))
      expect(best).toBeGreaterThanOrEqual(3)
    })

    it('the council wall stands out through its gold or its casing', () => {
      expect(Math.max(contrast(WALL.gold, background), contrast(WALL.casing, background))).toBeGreaterThanOrEqual(3)
    })
  })

  it.each(Object.entries(PINS))('the %s pin letter is readable on its fill', (_, pin) => {
    expect(contrast(pin.letter, pin.fill)).toBeGreaterThanOrEqual(4.5)
  })

  it('labels are readable on their halo and in their box', () => {
    expect(contrast(LABEL.text, LABEL.halo)).toBeGreaterThanOrEqual(4.5)
    expect(contrast(LABEL.text, LABEL.box)).toBeGreaterThanOrEqual(4.5)
  })
})
