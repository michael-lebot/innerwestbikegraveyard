import { GREYS, PIN_HALO, WALL } from '@iwb/shared'
import { pixels } from './pixels'

// A 24 × 14 pixel share bike, drawn like the pins: X is the outline, F the gold frame, R the rims, B the basket.
// It turns on the hub of its rear wheel, the X at [4, 9].
const BIKE = [
  '............XXXXX.......',
  '..............XFXXXXXXX.',
  '......XXXXX...XFXXBBBBX.',
  '.......XFX....XFXXBBBBX.',
  '.......XFX....XFXXXXXXX.',
  '..XXXXX.XFX...XFFXXXXX..',
  '.XXRRRXXXFX..XFFXFRRRXX.',
  'XXR...RXXXFX.XFFXRF..RXX',
  'XR.....RXXFXXFFXR.F...RX',
  'XR..XFFFXXXFFFXXR..X..RX',
  'XR.....RFFFFFX.XR.....RX',
  'XXR...RXXXXXX..XXR...RXX',
  '.XXRRRXX........XXRRRXX.',
  '..XXXXX..........XXXXX..',
]

const SHAPE = pixels(BIKE, 'XFRB')
const FRAME = pixels(BIKE, 'F')
const RIMS = pixels(BIKE, 'R')
const BASKET = pixels(BIKE, 'B')
/** Half the square the bike turns in: its farthest corner, the basket's, is 20.4 pixels from the hub, plus the halo. */
const REACH = 22
const SCALE = 3

/**
 * What the map shows over its preview until it is drawn (MapScreen.tsx): the bike turning on its rear wheel, and
 * "Map loading" with its dots drawn one by one. Still for reduced motion. Without JavaScript the map never loads, so
 * it says so instead.
 */
export function MapLoading() {
  return (
    <>
      <svg
        width={2 * REACH * SCALE}
        height={2 * REACH * SCALE}
        viewBox={`${-REACH} ${-REACH} ${2 * REACH} ${2 * REACH}`}
        shapeRendering="crispEdges"
        aria-hidden="true"
        className="noscript:hidden"
      >
        {/* Turns on the origin, where the rear hub sits. Held still, the bike moves to the middle of the square. */}
        <g className="motion-safe:animate-wheelie motion-reduce:-translate-x-[7.5px] motion-reduce:translate-y-[2.5px]">
          <g transform="translate(-4.5 -9.5)">
            {/* As on the pins, the stroke under the fill leaves a 1 px white halo, so it shows on the grass and greys. */}
            <path d={SHAPE} fill={WALL.casing} stroke={PIN_HALO} strokeWidth={2} paintOrder="stroke" />
            <path d={FRAME} fill={WALL.gold} />
            <path d={RIMS} fill={GREYS[2]} />
            <path d={BASKET} fill={GREYS[3]} />
          </g>
        </g>
      </svg>
      <p className="rounded-[10px] bg-white px-3 py-2">
        <span className="noscript:hidden">
          Map loading
          {/* Three cells, uncovered one at a time. Screen readers hear only "Map loading". */}
          <span aria-hidden="true" className="inline-flex w-[0.9em] motion-safe:animate-ellipsis">
            <span className="flex-1">.</span>
            <span className="flex-1">.</span>
            <span className="flex-1">.</span>
          </span>
        </span>
        <span className="hidden noscript:inline">Turn on JavaScript to see the map.</span>
      </p>
    </>
  )
}
