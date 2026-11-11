// Map art colours, from docs/mockups/graveyard-v3.html. contrast.test.ts checks pins, labels and the council wall
// against every colour they can be drawn over.
import type { Operator } from './config'

/** Fills, lines and pattern pixels inside the council. */
export const MAP_COLORS = {
  water: '#2f6fd6',
  land: '#5cbf4a',
  park: '#3c9a3a',
  road: '#ecd794',
  majorRoad: '#f7e7ad',
  lane: '#d9c27a',
  roadCasing: '#8a5a2b',
  rail: '#6b3f22',
  suburbLine: '#2f7f2f',
  tuft: '#3c9a3a',
  tree: '#1d6b2a',
  trunk: '#6b3f22',
  flower: '#ffd23f',
}

/** Outside the council: greyscale steps, darkest first. */
export const GREYS = ['#2b2b33', '#4a4a55', '#6e6e7a', '#9a9aa5', '#c4c4cc'] as const

/** The council wall. Gold alone is 1.6:1 on the grass, so it has a dark casing (plan assumption 12). */
export const WALL = { gold: '#ffd23f', casing: '#1f2328' }

/** Map labels: dark text with a white halo, or in a white box with a grey edge. */
export const LABEL = { text: '#1f2328', halo: '#ffffff', box: '#ffffff', boxEdge: '#8c959f' }

/** The inks of the map's pixel-art sprites (apps/web/map/patterns.ts), by the letter each sprite is drawn with. */
export const SPRITE_INKS: Record<string, string> = {
  g: MAP_COLORS.tuft,
  f: MAP_COLORS.flower,
  t: MAP_COLORS.tree,
  b: MAP_COLORS.trunk,
  // The 4 × 4 dither outside the council, between the two greys the grass maps to in the mockup.
  d: GREYS[1],
  l: GREYS[2],
  e: LABEL.boxEdge,
  w: LABEL.box,
}

/**
 * Pixel pins. Hello is darker than the mockup's #2f7bff so its white letter reaches 4.5:1, and every pin has a 1 px
 * white outer halo so it stands out on the dark greys (plan assumption 13).
 */
export const PINS = {
  lime: { fill: '#c6ff3d', line: '#1a1a1a', shine: '#ffffff', letter: '#1a1a1a' },
  hello: { fill: '#2566e6', line: '#1a1a1a', shine: '#bcd6ff', letter: '#ffffff' },
  ario: { fill: '#f5f5f5', line: '#1a1a1a', shine: '#ffffff', letter: '#1a1a1a' },
  not_sure: { fill: '#d9d9d9', line: '#1a1a1a', shine: '#ffffff', letter: '#1a1a1a' },
} satisfies Record<Operator, { fill: string; line: string; shine: string; letter: string }>
export const PIN_HALO = '#ffffff'
