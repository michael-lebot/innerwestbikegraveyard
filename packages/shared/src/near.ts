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
