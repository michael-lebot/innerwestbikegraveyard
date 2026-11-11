// Renders public/preview.webp (git-ignored): the council as the map first frames it, painted before MapLibre loads
// and kept if it can't (§11.2). Land, grey outside, the wall and dashed suburb lines, from the map's own data and
// colours. `dev` and `build` run it first.
import { fileURLToPath } from 'node:url'
import council from '@iwb/shared/data/council.json' with { type: 'json' }
import places from '@iwb/shared/data/places.json' with { type: 'json' }
import { GREYS, MAP_COLORS, WALL } from '@iwb/shared/palette'
import sharp from 'sharp'

const WIDTH = 640
const [west, south, east, north] = council.bbox as [number, number, number, number]

// Web Mercator, as MapLibre draws it, so the map lands exactly on the preview when it replaces it.
const mercator = (lat: number) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360))
const scale = WIDTH / (((east - west) * Math.PI) / 180)
const HEIGHT = Math.round((mercator(north) - mercator(south)) * scale)

const point = ([lng = 0, lat = 0]: number[]) =>
  `${(((lng - west) * Math.PI) / 180) * scale},${(mercator(north) - mercator(lat)) * scale}`
const path = (rings: number[][][]) => rings.map((ring) => `M${ring.map(point).join('L')}Z`).join('')

const boundary = path(council.boundary.coordinates)
// A suburb's geometry is one polygon or several, each a list of rings.
const suburbs = places.suburbs
  .flatMap(
    ({ geometry }) => (geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates) as number[][][][],
  )
  .map(path)
  .join('')

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}">
  <clipPath id="council"><path d="${boundary}"/></clipPath>
  <rect width="100%" height="100%" fill="${GREYS[2]}"/>
  <path d="${boundary}" fill="${MAP_COLORS.land}"/>
  <path d="${suburbs}" clip-path="url(#council)" fill="none" stroke="${MAP_COLORS.suburbLine}" stroke-width="1.5" stroke-dasharray="4 4"/>
  <path d="${boundary}" fill="none" stroke="${WALL.casing}" stroke-width="5" stroke-linejoin="round"/>
  <path d="${boundary}" fill="none" stroke="${WALL.gold}" stroke-width="2.5" stroke-linejoin="round"/>
</svg>`

const { size } = await sharp(Buffer.from(svg))
  .webp({ quality: 50, effort: 6 })
  .toFile(fileURLToPath(new URL('../public/preview.webp', import.meta.url)))
console.info(`preview.webp: ${WIDTH} × ${HEIGHT}, ${size} B`)
