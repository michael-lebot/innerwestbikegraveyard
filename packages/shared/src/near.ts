// Live tags near a new spot (§4.2): "Is it one of these?" asks about them. They never block a new tag.
import { NEARBY_METERS } from './config'
import type { PublicTag } from './schemas'

/** Metres in a degree of latitude, and in a degree of longitude at the equator. */
export const METERS_PER_DEGREE = 111_320

type Point = { lat: number; lng: number }

/** Metres between two points on a flat projection, which is plenty at a few hundred metres. */
export function distanceMeters(a: Point, b: Point) {
  const kx = METERS_PER_DEGREE * Math.cos((a.lat * Math.PI) / 180)
  return Math.hypot((b.lng - a.lng) * kx, (b.lat - a.lat) * METERS_PER_DEGREE)
}

/** The tags within 25 m of a spot, nearest first. */
export const nearbyTags = (spot: Point, tags: PublicTag[]) =>
  tags
    .map((tag) => ({ tag, meters: distanceMeters(spot, tag) }))
    .filter(({ meters }) => meters <= NEARBY_METERS)
    .toSorted((a, b) => a.meters - b.meters)
    .map(({ tag }) => tag)

/**
 * Stacks of pins on screen (§4.1): pins closer than `px` apart, and pins chained that way, draw as one blob. Gives the
 * top pin of each stack of two or more, the one nearest the top of the screen, the stack's size.
 */
export function stacks(pins: { id: string; x: number; y: number }[], px: number) {
  const group = pins.map((_, i) => i)
  const root = (i: number): number => (group[i] === i ? i : (group[i] = root(group[i]!)))
  for (let i = 0; i < pins.length; i++)
    for (let j = i + 1; j < pins.length; j++)
      if (Math.hypot(pins[i]!.x - pins[j]!.x, pins[i]!.y - pins[j]!.y) < px) group[root(j)] = root(i)
  const found = new Map<number, { top: (typeof pins)[number]; size: number }>()
  pins.forEach((pin, i) => {
    const stack = found.get(root(i))
    if (!stack) return found.set(root(i), { top: pin, size: 1 })
    stack.size++
    if (pin.y < stack.top.y) stack.top = pin
  })
  return new Map([...found.values()].filter(({ size }) => size > 1).map(({ top, size }) => [top.id, size]))
}
