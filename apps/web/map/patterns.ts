// The map's pixel art (§4.1, §9): the mockup's stamps as ASCII sprites, one letter per pixel, inked from palette.ts's
// SPRITE_INKS (which contrast.test.ts checks). Each becomes an RGBA image at twice the CSS resolution (pixelRatio 2),
// so an art pixel is one CSS pixel and stays sharp on a phone.
import { MAP_COLORS, SPRITE_INKS } from '@iwb/shared'
import type { StyleImageMetadata } from 'maplibre-gl'

const TUFT = ['gg..gg', 'gg..gg', '..gg..', '..gg..']
const FLOWER = ['ff', 'ff']
const TREE = ['..tt..', '..tt..', 'tttttt', 'tttttt', '..bb..', '..bb..']
// Ordered dithering with a 4 × 4 Bayer matrix.
const DITHER = ['dldl', 'ldll', 'dldl', 'llll']
// A white label box with a grey edge, stretched around each street name.
const BOX = ['eeeeee', 'ewwwwe', 'ewwwwe', 'ewwwwe', 'ewwwwe', 'eeeeee']

/** A 32 × 32 tile of `.` with sprites stamped at [x, y]. Fill patterns repeat seamlessly only at powers of two. */
function tile(stamps: [sprite: string[], x: number, y: number][]) {
  const rows = Array.from({ length: 32 }, () => Array<string>(32).fill('.'))
  for (const [sprite, x, y] of stamps)
    sprite.forEach((row, j) => [...row].forEach((ink, i) => ink !== '.' && (rows[y + j]![x + i] = ink)))
  return rows.map((row) => row.join(''))
}

/** Each letter as a 2 × 2 block of its colour; `.` is the ground colour. */
function pixels(sprite: string[], ground = '#000000') {
  const width = sprite[0]!.length * 2
  const height = sprite.length * 2
  const data = new Uint8Array(width * height * 4)
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const hex = SPRITE_INKS[sprite[y >> 1]![x >> 1]!] ?? ground
      data.set([1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).concat(255), (y * width + x) * 4)
    }
  return { width, height, data }
}

/** Every image the style names, by id, for map.addImage when MapLibre asks for it. */
export const IMAGES: Record<string, [ReturnType<typeof pixels>, Partial<StyleImageMetadata>]> = {
  grass: [
    pixels(
      tile([
        [TUFT, 3, 4],
        [TUFT, 19, 10],
        [TUFT, 8, 21],
        [FLOWER, 26, 26],
      ]),
      MAP_COLORS.land,
    ),
    { pixelRatio: 2 },
  ],
  trees: [
    pixels(
      tile([
        [TREE, 1, 1],
        [TREE, 17, 1],
        [TREE, 9, 9],
        [TREE, 25, 9],
        [TREE, 1, 17],
        [TREE, 17, 17],
        [TREE, 9, 25],
        [TREE, 25, 25],
      ]),
      MAP_COLORS.park,
    ),
    { pixelRatio: 2 },
  ],
  dither: [pixels(DITHER), { pixelRatio: 2 }],
  // The edge stays put and the white middle stretches; the name sits in the middle.
  'label-box': [pixels(BOX), { pixelRatio: 2, stretchX: [[2, 10]], stretchY: [[2, 10]], content: [2, 2, 10, 10] }],
}
