// Downloads the council boundary, suburbs, road segments and address points from NSW Spatial Services into data/raw/,
// which is git-ignored. Run `pnpm --filter @iwb/shared data:fetch`, then `data:build`.
import { mkdirSync, writeFileSync } from 'node:fs'
import * as turf from '@turf/turf'
import type { FeatureCollection } from 'geojson'

const SERVICES = 'https://portal.spatial.nsw.gov.au/server/rest/services'
const PAGE = 2000
const RAW = new URL('../data/raw/', import.meta.url)
/** The data reaches this far past the council's bounding box, so neighbouring streets and suburbs are included. */
const PAD_METERS = 2000
/** Address points only need to reach the 20 m strip where tags are accepted; build-data.ts keeps those inside it. */
const ADDRESS_PAD_METERS = 50
/** The address points' newer service: the older one is marked as retiring (§4.1). */
const ADDRESSES = 'NSW_Geocoded_Addressing_Theme_multiCRS'

type Box = [west: number, south: number, east: number, north: number]

async function getJson(url: string) {
  for (let attempt = 1; ; attempt++) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(90_000) })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const body = await response.json()
      if (body.error) throw new Error(JSON.stringify(body.error))
      return body
    } catch (error) {
      if (attempt === 3) throw error
      console.warn(`retrying after: ${error}`)
      await new Promise((resolve) => setTimeout(resolve, attempt * 2000))
    }
  }
}

/** Every feature of one ArcGIS layer matching `where` (and touching `box`), a page of 2,000 at a time. */
async function query(service: string, layer: number, where: string, outFields: string, box?: Box) {
  const features: FeatureCollection['features'] = []
  // ArcGIS only promises pages that neither overlap nor skip for an ordered query, so they go in the order of the
  // layer's id field, whatever the layer calls it.
  const { objectIdField } = await getJson(`${SERVICES}/${service}/FeatureServer/${layer}?f=json`)
  for (let offset = 0; ; offset += PAGE) {
    const params = new URLSearchParams({
      where,
      outFields,
      outSR: '4326',
      returnGeometry: 'true',
      orderByFields: objectIdField,
      resultOffset: String(offset),
      resultRecordCount: String(PAGE),
      f: 'geojson',
      ...(box && {
        geometry: box.join(','),
        geometryType: 'esriGeometryEnvelope',
        inSR: '4326',
        spatialRel: 'esriSpatialRelIntersects',
      }),
    })
    const page = await getJson(`${SERVICES}/${service}/FeatureServer/${layer}/query?${params}`)
    features.push(...page.features)
    console.info(`${service}/${layer}: ${features.length} features`)
    if (page.features.length < PAGE && !page.exceededTransferLimit) break
  }
  return { type: 'FeatureCollection', features } as FeatureCollection
}

function save(name: string, collection: FeatureCollection) {
  writeFileSync(new URL(`${name}.geojson`, RAW), JSON.stringify(collection))
}

mkdirSync(RAW, { recursive: true })

const council = await query('NSW_Administrative_Boundaries_Theme', 8, "lganame = 'INNER WEST'", 'lganame')
if (council.features.length !== 1) throw new Error(`expected one Inner West polygon, got ${council.features.length}`)
save('council', council)

const [west, south, east, north] = turf.bbox(council)
/** The council's bounding box, this many metres wider on every side. */
function around(meters: number): Box {
  const padLat = meters / 111_320
  const padLng = padLat / Math.cos(((south + north) / 2) * (Math.PI / 180))
  return [west - padLng, south - padLat, east + padLng, north + padLat]
}

save('suburbs', await query('NSW_Administrative_Boundaries_Theme', 2, '1=1', 'suburbname', around(PAD_METERS)))
save(
  'roads',
  await query(
    'NSW_Transport_Theme',
    5,
    '1=1',
    'roadnamebase,roadnametype,roadnamesuffix,functionhierarchy,roadontype,operationalstatus',
    around(PAD_METERS),
  ),
)

// The service's layer ids aren't documented, so the AddressPoint layer is found by name.
const { layers } = (await getJson(`${SERVICES}/${ADDRESSES}/FeatureServer?f=json`)) as {
  layers: { id: number; name: string }[]
}
const addressPoints = layers.find((layer) => layer.name === 'AddressPoint')
if (!addressPoints) throw new Error(`${ADDRESSES} has no AddressPoint layer`)
save('addresses', await query(ADDRESSES, addressPoints.id, '1=1', 'address,housenumber', around(ADDRESS_PAD_METERS)))
