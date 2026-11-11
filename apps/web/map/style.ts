// The Overworld map style (§4.1, §9), written against the Protomaps v4 tile schema: a dozen layers, grass and trees
// inside the council, dithered grey outside it, the gold council wall, and Atkinson Hyperlegible labels. Suburb names
// come from council.json, so they match the cards and show at every zoom.
import { GREYS, LABEL, MAP_COLORS, STREET_TYPES, WALL } from '@iwb/shared'
import council from '@iwb/shared/data/council.json'
import buffered from '@iwb/shared/data/council-buffered.json'
import type { Polygon } from 'geojson'
import type { ExpressionSpecification, StyleSpecification } from 'maplibre-gl'
import { TILES_URL } from '@/lib/public-env'

const REGULAR = ['AtkinsonHyperlegible-Regular']
const BOLD = ['AtkinsonHyperlegible-Bold']

// JSON imports type "Polygon" as any string.
const BOUNDARY = council.boundary as Polygon
/** Wholly inside the council plus its 20 m strip, so streets along the boundary keep their names (assumption 11). */
const INSIDE: ExpressionSpecification = ['within', buffered as Polygon]
const [west, south, east, north] = council.maxBounds as [number, number, number, number]
/** The map's box with the council cut out, to grey out everything else. geojson-vt winds the rings itself. */
const MASK: Polygon = {
  type: 'Polygon',
  coordinates: [
    [
      [west, south],
      [east, south],
      [east, north],
      [west, north],
      [west, south],
    ],
    ...BOUNDARY.coordinates,
  ],
}
/** Wholly outside the council, where the mask greys everything out. */
const OUTSIDE: ExpressionSpecification = ['within', MASK]

const ROADS: ExpressionSpecification = [
  'all',
  ['match', ['get', 'kind'], ['highway', 'major_road', 'minor_road'], true, false],
  ['!=', ['get', 'is_tunnel'], true],
]
const MINOR: ExpressionSpecification = ['==', ['get', 'kind'], 'minor_road']

/** A width in CSS px at zooms 11 (the whole council on a phone), 13, 16 (street level) and 18, for major and minor roads. */
const width = (major: number[], minor: number[]): ExpressionSpecification => [
  'interpolate',
  ['exponential', 1.5],
  ['zoom'],
  ...[11, 13, 16, 18].flatMap((zoom, i): (number | ExpressionSpecification)[] => [
    zoom,
    ['case', MINOR, minor[i]!, major[i]!],
  ]),
]
const FILL_WIDTH = width([1.5, 3, 11, 26], [0.4, 1, 7, 18])
const CASING_WIDTH = width([2.5, 4.5, 15, 32], [0, 0, 10, 22])

/** "Llewellyn Street" → "Llewellyn St", as the card writes it. */
const streetName: ExpressionSpecification = [
  'let',
  'name',
  ['get', 'name'],
  [
    'case',
    ...Object.entries(STREET_TYPES).flatMap(([long, short]): ExpressionSpecification[] => {
      const cut: ExpressionSpecification = ['-', ['length', ['var', 'name']], long.length + 1]
      return [
        ['==', ['slice', ['var', 'name'], ['max', 0, cut]], ` ${long}`],
        ['concat', ['slice', ['var', 'name'], 0, cut], ` ${short}`],
      ]
    }),
    ['var', 'name'],
  ] as ExpressionSpecification,
]

export function overworldStyle(): StyleSpecification {
  return {
    version: 8,
    glyphs: `${location.origin}/glyphs/{fontstack}/{range}.pbf`,
    sources: {
      // 256 px tiles: each view loads the next zoom's tiles, so the whole-council view has suburb names and side streets.
      osm: { type: 'vector', url: `pmtiles://${new URL(TILES_URL, location.href)}` },
      council: { type: 'geojson', data: BOUNDARY },
      mask: { type: 'geojson', data: MASK },
      suburbs: {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: council.labels.map(({ name, at }) => ({
            type: 'Feature',
            properties: { name },
            geometry: { type: 'Point', coordinates: at },
          })),
        },
      },
    },
    layers: [
      { id: 'water', type: 'background', paint: { 'background-color': MAP_COLORS.water } },
      { id: 'land', type: 'fill', source: 'osm', 'source-layer': 'earth', paint: { 'fill-pattern': 'grass' } },
      {
        id: 'parks',
        type: 'fill',
        source: 'osm',
        'source-layer': 'landuse',
        filter: [
          'match',
          ['get', 'kind'],
          ['park', 'garden', 'nature_reserve', 'wood', 'forest', 'golf_course', 'recreation_ground', 'cemetery'],
          true,
          false,
        ],
        paint: { 'fill-pattern': 'trees' },
      },
      {
        id: 'water-areas',
        type: 'fill',
        source: 'osm',
        'source-layer': 'water',
        paint: { 'fill-color': MAP_COLORS.water },
      },
      {
        id: 'rail',
        type: 'line',
        source: 'osm',
        'source-layer': 'roads',
        filter: ['all', ['==', ['get', 'kind'], 'rail'], ['!=', ['get', 'is_tunnel'], true]],
        paint: {
          'line-color': MAP_COLORS.rail,
          'line-width': ['interpolate', ['linear'], ['zoom'], 11, 1, 16, 2.5],
          'line-dasharray': [3, 2],
        },
      },
      {
        id: 'road-casings',
        type: 'line',
        source: 'osm',
        'source-layer': 'roads',
        filter: ROADS,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': MAP_COLORS.roadCasing, 'line-width': CASING_WIDTH },
      },
      {
        id: 'roads',
        type: 'line',
        source: 'osm',
        'source-layer': 'roads',
        filter: ROADS,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': [
            'match',
            ['get', 'kind_detail'],
            'service',
            MAP_COLORS.lane,
            ['case', MINOR, MAP_COLORS.road, MAP_COLORS.majorRoad],
          ],
          'line-width': FILL_WIDTH,
        },
      },
      // Everything outside the council: one dithered grey, with its roads in a lighter grey on top.
      { id: 'mask', type: 'fill', source: 'mask', paint: { 'fill-pattern': 'dither' } },
      {
        id: 'roads-outside',
        type: 'line',
        source: 'osm',
        'source-layer': 'roads',
        filter: ['all', ROADS, OUTSIDE],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': GREYS[3], 'line-width': FILL_WIDTH },
      },
      // The council wall: gold on a dark casing, which keeps it at 3:1 on grass and grey alike (assumption 12).
      {
        id: 'wall-casing',
        type: 'line',
        source: 'council',
        layout: { 'line-join': 'round' },
        paint: { 'line-color': WALL.casing, 'line-width': ['interpolate', ['linear'], ['zoom'], 11, 5, 16, 9] },
      },
      {
        id: 'wall',
        type: 'line',
        source: 'council',
        layout: { 'line-join': 'round' },
        paint: { 'line-color': WALL.gold, 'line-width': ['interpolate', ['linear'], ['zoom'], 11, 2.5, 16, 5] },
      },
      {
        id: 'street-names',
        type: 'symbol',
        source: 'osm',
        'source-layer': 'roads',
        minzoom: 14,
        filter: ['all', ROADS, ['has', 'name'], INSIDE],
        layout: {
          'symbol-placement': 'line',
          'symbol-spacing': 300,
          'text-rotation-alignment': 'viewport',
          'icon-rotation-alignment': 'viewport',
          'text-field': streetName,
          'text-font': ['case', MINOR, ['literal', REGULAR], ['literal', BOLD]],
          'text-size': 13,
          'icon-image': 'label-box',
          'icon-text-fit': 'both',
          'icon-text-fit-padding': [1, 3, 1, 3],
        },
        paint: { 'text-color': LABEL.text },
      },
      {
        id: 'suburb-names',
        type: 'symbol',
        source: 'suburbs',
        layout: {
          'text-field': ['get', 'name'],
          'text-font': BOLD,
          'text-size': ['interpolate', ['linear'], ['zoom'], 11, 14, 16, 16],
        },
        paint: { 'text-color': LABEL.text, 'text-halo-color': LABEL.halo, 'text-halo-width': 2 },
      },
    ],
  }
}
