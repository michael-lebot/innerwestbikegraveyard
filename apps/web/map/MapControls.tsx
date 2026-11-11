'use client'
import type { Map } from 'maplibre-gl'
import { useState } from 'react'

// 44 px at any text size, like the icons in them, so a short map at a large text size still has room for them all.
const BUTTON = 'flex size-[44px] items-center justify-center rounded-[10px] border border-edge bg-white text-ink'

/** A 24 × 24 line icon. */
const Icon = ({ d }: { d: string }) => (
  <svg width={24} height={24} viewBox="0 0 24 24" aria-hidden="true">
    <path d={d} fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

// Each arrow moves the map half of what is visible: [label, x, y, where it sits, icon]. The right arrow sits beside
// the zoom column, not in it: on a short map, halfway down is where Move map is.
const ARROWS = [
  ['Move up', 0, -1, 'top-2 left-1/2 -translate-x-1/2', 'M6 15l6-6 6 6'],
  ['Move left', -1, 0, 'top-1/2 left-2 -translate-y-1/2', 'M15 6l-6 6 6 6'],
  ['Move right', 1, 0, 'top-1/2 right-[calc(1rem+44px)] -translate-y-1/2', 'M9 6l6 6-6 6'],
  ['Move down', 0, 1, 'bottom-2 left-1/2 -translate-x-1/2', 'M6 9l6 6 6-6'],
] as const

/** Buttons for everything a gesture does (§10.5): zoom, and Move map's four arrows. Plus the map's credits. */
export function MapControls({ map }: { map: Map }) {
  const [moving, setMoving] = useState(false)
  const [about, setAbout] = useState(false)

  const pan = (x: number, y: number) => {
    const { clientWidth, clientHeight } = map.getContainer()
    map.panBy([(x * clientWidth) / 2, (y * clientHeight) / 2])
  }

  return (
    <>
      <div className="absolute top-2 right-2 flex flex-col gap-2">
        <button type="button" aria-label="Zoom in" className={BUTTON} onClick={() => map.zoomIn()}>
          <Icon d="M12 5v14M5 12h14" />
        </button>
        <button type="button" aria-label="Zoom out" className={BUTTON} onClick={() => map.zoomOut()}>
          <Icon d="M5 12h14" />
        </button>
        <button
          type="button"
          aria-label="Move map"
          aria-expanded={moving}
          aria-controls="move-map"
          className={`${BUTTON} aria-expanded:border-2 aria-expanded:border-brand aria-expanded:bg-tint`}
          onClick={() => setMoving(!moving)}
        >
          <Icon d="M12 3v18M3 12h18M9 6l3-3 3 3M9 18l3 3 3-3M6 9l-3 3 3 3M18 9l3 3-3 3" />
        </button>
      </div>

      <div id="move-map" role="group" aria-label="Move map" hidden={!moving}>
        {ARROWS.map(([label, x, y, place, d]) => (
          <button
            key={label}
            type="button"
            aria-label={label}
            className={`absolute ${place} ${BUTTON}`}
            onClick={() => pan(x, y)}
          >
            <Icon d={d} />
          </button>
        ))}
      </div>

      <div className="absolute right-2 bottom-2 flex flex-col items-end gap-2">
        <div
          id="map-about"
          hidden={!about}
          className="max-w-72 rounded-[10px] border border-edge bg-white px-3 py-2 text-sm"
        >
          <p>© OpenStreetMap contributors</p>
          <p>© State of New South Wales (Spatial Services, DCS NSW), CC BY 4.0</p>
        </div>
        <button
          type="button"
          aria-label="About this map"
          aria-expanded={about}
          aria-controls="map-about"
          className={`${BUTTON} text-lg font-bold`}
          onClick={() => setAbout(!about)}
        >
          i
        </button>
      </div>
    </>
  )
}
