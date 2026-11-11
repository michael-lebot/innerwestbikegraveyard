'use client'
import 'maplibre-gl/dist/maplibre-gl.css'
import { byPlace, CROWDED_PIN_PX, DIALOG_TOP_REM, pinLabel, PLACEMENT_ZOOM, type PublicTag } from '@iwb/shared'
import council from '@iwb/shared/data/council.json'
import maplibregl, { type LngLatBoundsLike, type MapMouseEvent } from 'maplibre-gl'
import { Protocol } from 'pmtiles'
import { useEffect, useEffectEvent, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { PinIcon } from '@/components/PinIcon'
import { FOCUS_RING_ON_HOVER } from '@/components/buttons'
import { reducesMotion } from '@/lib/motion'
import { MapControls } from './MapControls'
import { IMAGES } from './patterns'
import { overworldStyle } from './style'

maplibregl.addProtocol('pmtiles', new Protocol().tile)

/** shortcut: HTML markers, switch to a clustered symbol layer plus the list if live tags pass 200 (§11.3). */
const MAX_PINS = 200
/** A pin's button: 44 px square, with the middle of the headstone's base at the middle of its bottom edge. */
const PIN_PX = 44
/** The picked pin: outlined like keyboard focus, and bobbing twice (§10.5, §13). */
const SELECTED = 'outline-3 outline-offset-2 outline-focus shadow-[0_0_0_2px_white] motion-safe:animate-bob'
/** The keyboard crosshair's steps in metres, and with Shift (§10.3). */
const STEP_M = 10
const SHIFT_STEP_M = 50
const ARROWS: Record<string, [number, number]> = {
  ArrowUp: [0, 1],
  ArrowDown: [0, -1],
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
}
/** The side-panel layout, as globals.css's `wide` variant has it. */
const WIDE = '(width >= 48rem), (orientation: landscape)'
/** Only while the map has keyboard focus. */
const ON_KEYBOARD_FOCUS = 'hidden group-has-[canvas:focus-visible]:block'

/** Whether the whole button of a pin at this point is inside the map. */
function isInView(map: maplibregl.Map, lng: number, lat: number) {
  const { x, y } = map.project([lng, lat])
  const { clientWidth, clientHeight } = map.getContainer()
  return x >= PIN_PX / 2 && x <= clientWidth - PIN_PX / 2 && y >= PIN_PX && y <= clientHeight
}

type Props = {
  /** The live tags, or undefined until they arrive. */
  tags?: PublicTag[]
  now: Date
  selected?: string
  /** A pin was picked: just that tag, or by tap where pins overlap, every tag within 44 px of it. */
  onPick: (tags: PublicTag[], pin: HTMLElement) => void
  onStatus: (status: 'ready' | 'failed') => void
  /** The new tag's pin, with the middle of its base on this spot. */
  spot?: { lat: number; lng: number }
  /** Use my location's position: the map centres there, at street level (§4.1). */
  centre?: { lat: number; lng: number }
  /** Placing (§10.3): a tap, or the crosshair's arrow keys, put the pin here. */
  onPlace?: (lat: number, lng: number) => void
  /** Enter on the map while placing. */
  onUse?: () => void
}

/** The one map (§11.3). MapScreen loads this module with import() after first paint, so no other page carries it. */
export function MapView({ tags, now, selected, onPick, onStatus, spot, centre, onPlace, onUse }: Props) {
  const container = useRef<HTMLDivElement>(null)
  const [map, setMap] = useState<maplibregl.Map>()
  const [drawn, setDrawn] = useState(false)

  useEffect(() => {
    let created: maplibregl.Map
    try {
      created = new maplibregl.Map({
        container: container.current!,
        style: overworldStyle(),
        // The same framing as the preview it replaces, whose image sits 8 px (p-2) inside the map.
        bounds: council.bbox as LngLatBoundsLike,
        fitBoundsOptions: { padding: 8 },
        // Also how far it zooms out: MapLibre keeps the whole view inside them.
        maxBounds: council.maxBounds as LngLatBoundsLike,
        maxZoom: 18,
        dragRotate: false,
        pitchWithRotate: false,
        touchPitch: false,
        fadeDuration: 0,
        maxTileCacheSize: 64,
        attributionControl: false,
        // The canvas is a region inside the map screen's own "Map" region, so it needs a name of its own.
        locale: { 'Map.Title': 'Map: arrow keys move it' },
        // Off, so MapLibre's own reading of the OS setting never overrides the visitor's: easeTo below applies Reduce
        // motion on every move (§10.5).
        reduceMotion: false,
      })
    } catch {
      // No WebGL.
      onStatus('failed')
      return
    }
    created.touchZoomRotate.disableRotation()
    created.keyboard.disableRotation()
    // Every animated camera move, a gesture's or ours, comes through easeTo, and Reduce motion can change while the
    // map is open, so each move asks. Reduced, a move jumps.
    const easeTo = created.easeTo.bind(created)
    created.easeTo = (options, eventData) => {
      if (!reducesMotion()) return easeTo(options, eventData)
      // A drag's glide, MapLibre's one easeTo with noMoveStart, ends where the finger let go.
      return easeTo(
        options.noMoveStart ? { noMoveStart: true, animate: false } : { ...options, animate: false },
        eventData,
      )
    }
    // When the sheet below grows or shrinks, keep the map still under the header, as if the sheet slid over it.
    let height = container.current!.clientHeight
    created.on('resize', () => {
      // Not the ref: React has cleared it by the time a resize reports the map leaving the page.
      const next = created.getContainer().clientHeight
      // Not during a camera move, which this would stop: the zoom to street level as tagging starts resizes the sheet.
      if (!created.isEasing()) created.panBy([0, (next - height) / 2], { animate: false })
      height = next
    })

    let shown = false
    const fail = () => !shown && onStatus('failed')
    created.on('styleimagemissing', ({ id }) => IMAGES[id] && created.addImage(id, ...IMAGES[id]))
    // Before the map shows, a failed style or tile request means it can't show the council. Glyph and later tile
    // errors only cost a label or a tile, so they don't take the map away.
    created.on('error', (event) => ('sourceId' in event || !created.isStyleLoaded()) && fail())
    created.once('load', () => {
      setMap(created)
      created.once('idle', () => {
        shown = true
        onStatus('ready')
        setDrawn(true)
      })
    })
    return () => created.remove()
  }, [onStatus])

  // The new tag's pin or the picked one comes into view: from a row in the panel, after an arrow key, or whenever the
  // sheet has made the map shorter. Only when it moves or the map resizes, so the map doesn't jump back to it each time
  // the tags refresh.
  const picked = tags?.find(({ id }) => id === selected)
  const [lng, lat] = spot ? [spot.lng, spot.lat] : picked ? [picked.lng, picked.lat] : []
  useEffect(() => {
    if (!map || lng === undefined || lat === undefined) return
    const reveal = () => !isInView(map, lng, lat) && map.panTo([lng, lat])
    reveal()
    map.on('resize', reveal)
    return () => void map.off('resize', reveal)
  }, [map, selected, lng, lat])

  useEffect(() => {
    if (map && centre) map.easeTo({ center: [centre.lng, centre.lat], zoom: Math.max(map.getZoom(), PLACEMENT_ZOOM) })
  }, [map, centre])

  // Placing (§10.3, §12): taps and the crosshair place the pin, and MapLibre's own arrow keys stand aside.
  const placing = !!onPlace
  const place = useEffectEvent((lat: number, lng: number) => onPlace?.(lat, lng))
  const keydown = useEffectEvent((event: KeyboardEvent) => {
    if (!map) return
    if (event.key === 'Enter') {
      if (spot) onUse?.()
      else place(map.getCenter().lat, map.getCenter().lng)
      return
    }
    const arrow = ARROWS[event.key]
    if (!arrow) return
    event.preventDefault()
    // The first arrow moves the pin from the crosshair at the middle of the map.
    const from = spot ? new maplibregl.LngLat(spot.lng, spot.lat) : map.getCenter()
    const box = maplibregl.LngLatBounds.fromLngLat(from, event.shiftKey ? SHIFT_STEP_M : STEP_M)
    place(from.lat + arrow[1] * (box.getNorth() - from.lat), from.lng + arrow[0] * (box.getEast() - from.lng))
  })
  useEffect(() => {
    if (!map || !placing) return
    if (map.getZoom() < PLACEMENT_ZOOM) map.easeTo({ zoom: PLACEMENT_ZOOM })
    // Zoomed out past street level, a tap zooms in there and waits for a second tap (assumption 20).
    const click = ({ lngLat }: MapMouseEvent) =>
      map.getZoom() < PLACEMENT_ZOOM
        ? map.easeTo({ center: lngLat, zoom: PLACEMENT_ZOOM })
        : place(lngLat.lat, lngLat.lng)
    const canvas = map.getCanvas()
    const name = canvas.getAttribute('aria-label') ?? ''
    canvas.setAttribute(
      'aria-label',
      'Map: arrow keys move the pin, Shift and an arrow moves it further, Enter uses it',
    )
    map.keyboard.disable()
    map.on('click', click)
    canvas.addEventListener('keydown', keydown)
    return () => {
      canvas.setAttribute('aria-label', name)
      map.keyboard.enable()
      map.off('click', click)
      canvas.removeEventListener('keydown', keydown)
    }
  }, [map, placing])

  // On a phone the dialogs that follow placing cover all but a strip of the map under the header (Dialog.tsx): the new
  // pin moves into that strip, its base 8 px above the dialog.
  const describing = !!spot && !placing
  useEffect(() => {
    if (!map || !spot || !describing || matchMedia(WIDE).matches) return
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize)
    const canvas = map.getCanvas().getBoundingClientRect()
    const baseY = DIALOG_TOP_REM * rem - canvas.top - 8
    map.panTo([spot.lng, spot.lat], { offset: [0, baseY - canvas.height / 2], animate: false })
  }, [map, spot, describing])

  // Map ready (§11.1): the first tiles drawn, and the pins on them.
  useEffect(() => {
    if (!drawn || !tags || container.current?.hasAttribute('data-map-ready')) return
    performance.mark('map-ready')
    container.current?.setAttribute('data-map-ready', '')
  }, [drawn, tags])

  return (
    <div className="group absolute inset-0">
      {/* overflow: clip, not MapLibre's hidden, so focusing a pin off the edge can't scroll the map out of place. */}
      <div ref={container} className="h-full w-full" style={{ overflow: 'clip' }} />
      {map && tags && <Pins map={map} tags={tags} now={now} selected={selected} placing={placing} onPick={onPick} />}
      {map && spot && <SpotPin map={map} spot={spot} />}
      {map && <MapControls map={map} />}
      {placing && (
        <>
          {/* The keyboard crosshair: where the first arrow key, or Enter, puts the pin. */}
          {!spot && (
            <svg
              width={32}
              height={32}
              viewBox="0 0 32 32"
              aria-hidden="true"
              className={`pointer-events-none absolute top-1/2 left-1/2 -translate-1/2 ${ON_KEYBOARD_FOCUS}`}
            >
              <path d="M16 2v28M2 16h28" stroke="white" strokeWidth={6} />
              <path d="M16 2v28M2 16h28" stroke="currentColor" strokeWidth={2} />
            </svg>
          )}
          <p
            className={`pointer-events-none absolute bottom-2 left-2 max-w-[calc(100%-4rem-44px)] rounded-[10px] bg-white px-3 py-2 text-sm ${ON_KEYBOARD_FOCUS}`}
          >
            Arrow keys move the pin 10 m, with Shift 50 m. Enter uses the spot; Esc cancels.
          </p>
        </>
      )}
    </div>
  )
}

/** The new tag's pin. Taps go through it to the map, so tapping beside it moves it. */
function SpotPin({ map, spot }: { map: maplibregl.Map; spot: { lat: number; lng: number } }) {
  const [element] = useState(() => {
    const div = document.createElement('div')
    // A flex box, so the pin's bottom edge is the box's: the middle of its base sits on the spot.
    div.className = 'pointer-events-none flex'
    return div
  })

  useEffect(() => {
    const marker = new maplibregl.Marker({ element, anchor: 'bottom' }).setLngLat([spot.lng, spot.lat]).addTo(map)
    // MapLibre makes the marker a button named "Map marker"; this pin only shows the spot the bar reads back.
    element.removeAttribute('role')
    element.removeAttribute('aria-label')
    return () => void marker.remove()
  }, [map, element, spot.lng, spot.lat])

  return createPortal(<PinIcon operator="not_sure" />, element)
}

function Pins({
  map,
  tags,
  now,
  selected,
  placing,
  onPick,
}: Omit<Props, 'onStatus'> & { map: maplibregl.Map; tags: PublicTag[]; placing: boolean }) {
  const shown = useMemo(() => tags.toSorted(byPlace).slice(0, MAX_PINS), [tags])

  // Pins that arrive with a refresh are added last: move each after the one before it, so Tab follows the list.
  useEffect(() => {
    let previous: Element | null = null
    for (const { id } of shown) {
      const pin = map.getCanvasContainer().querySelector(`[data-tag="${id}"]`)
      if (pin && previous && previous.nextElementSibling !== pin) previous.after(pin)
      previous = pin ?? previous
    }
  }, [map, shown])

  const pick = (tag: PublicTag, pin: HTMLElement, byKeyboard: boolean) => {
    // From the keyboard each pin is its own stop, so only a tap can mean several.
    if (byKeyboard) return onPick([tag], pin)
    const at = map.project([tag.lng, tag.lat])
    onPick(
      shown.filter((other) => map.project([other.lng, other.lat]).dist(at) < CROWDED_PIN_PX),
      pin,
    )
  }

  return shown.map((tag) => (
    <Pin
      key={tag.id}
      map={map}
      tag={tag}
      label={pinLabel(tag, now)}
      selected={tag.id === selected}
      placing={placing}
      onPick={pick}
    />
  ))
}

function Pin({
  map,
  tag,
  label,
  selected,
  placing,
  onPick,
}: {
  map: maplibregl.Map
  tag: PublicTag
  label: string
  selected: boolean
  /** While a new pin is placed, Tab skips the pins: past each one it would pan the map, between the bar and the map. */
  placing: boolean
  onPick: (tag: PublicTag, pin: HTMLElement, byKeyboard: boolean) => void
}) {
  const [element] = useState(() => {
    const div = document.createElement('div')
    div.dataset.tag = tag.id
    return div
  })

  useEffect(() => {
    const marker = new maplibregl.Marker({ element, anchor: 'bottom' }).setLngLat([tag.lng, tag.lat]).addTo(map)
    // MapLibre makes the marker itself a button named "Map marker"; the real button is inside it.
    element.removeAttribute('role')
    element.removeAttribute('aria-label')
    return () => void marker.remove()
  }, [map, element, tag.lng, tag.lat])

  return createPortal(
    <button
      type="button"
      aria-label={label}
      aria-expanded={selected}
      tabIndex={placing ? -1 : undefined}
      className={`flex size-11 cursor-pointer items-end justify-center ${FOCUS_RING_ON_HOVER} ${selected ? SELECTED : ''}`}
      // A click from Enter or Space has no pointer position, so detail is 0.
      onClick={(event) => onPick(tag, event.currentTarget, event.detail === 0)}
      // Focusing a pin off the edge of the map, as Tab does, brings it into view (§4.1).
      onFocus={() => !isInView(map, tag.lng, tag.lat) && map.panTo([tag.lng, tag.lat])}
    >
      <PinIcon operator={tag.operator} />
    </button>,
    element,
  )
}
