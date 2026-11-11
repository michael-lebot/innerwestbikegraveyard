'use client'
import { bikeCount, bikes, GREYS, type PublicTag, TAG_LIFETIME_HOURS } from '@iwb/shared'
import Link from 'next/link'
import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { useLiveTags } from '@/lib/use-live-tags'
import { announce } from './Announcer'
import { PRIMARY } from './buttons'
import { CrowdChooser } from './CrowdChooser'
import { Legend } from './Legend'
import type { Located } from './LocateButton'
import { MapLoading } from './MapLoading'
import { OUTSIDE, Placement, pinOn, type Spot } from './Placement'
import { TagCard } from './TagCard'
import { TagList } from './TagList'
import { ViewToggle } from './ViewToggle'

type MapModule = typeof import('@/map/MapView')

// The dialogs load when tagging starts, out of the JavaScript before the map (§11.1).
const TagFlow = lazy(() => import('./TagFlow').then((module) => ({ default: module.TagFlow })))
type Geo = typeof import('@iwb/shared/geo')
type Status = 'loading' | 'ready' | 'failed'

/** The map gives up if it isn't ready this long after it starts loading (§11.2). */
const READY_WITHIN_MS = 15_000

/**
 * The map screen. First paint is the static preview of the council; MapLibre loads after it, and replaces the
 * preview once the map is ready. If it can't load, the preview stays and the list is offered instead (§11.2).
 */
export function MapScreen() {
  const [status, setStatus] = useState<Status>('loading')
  const [MapView, setMapView] = useState<MapModule['MapView']>()
  const { tags, now, apply, uploadsPaused } = useLiveTags()
  const [selected, setSelected] = useState<string>()
  const [crowd, setCrowd] = useState<string[]>()
  // The pin that opened the chooser, which gets focus back when it closes.
  const opener = useRef<HTMLElement>(null)
  const count = useRef<HTMLHeadingElement>(null)
  // Tagging a bike (§3): placing the pin, then describing the bike.
  const [tagging, setTagging] = useState<'place' | 'describe'>()
  const [spot, setSpot] = useState<Spot>()
  // Why the last try placed no pin, or where Use my location put it, said in place of the spot.
  const [note, setNote] = useState<string>()
  // Where Use my location centres the map.
  const [centre, setCentre] = useState<Located['centre']>()
  const tagButton = useRef<HTMLButtonElement>(null)
  const geo = useRef<Promise<Geo>>(null)

  // The card and the chooser show the tags as they are now. A refresh that takes away the open tag, or every tag in
  // the chooser, closes it.
  const card = tags?.find((tag) => tag.id === selected)
  const crowded = tags?.filter((tag) => crowd?.includes(tag.id))
  if (tags && selected && !card) setSelected(undefined)
  if (tags && crowd && !crowded?.length) setCrowd(undefined)

  // Closed that way, it takes the focus with it: keep the focus in the sheet, on the count.
  const open = !!card || !!crowded?.length
  const wasOpen = useRef(false)
  useEffect(() => {
    if (wasOpen.current && !open && document.activeElement === document.body) count.current?.focus()
    wasOpen.current = open
  }, [open])

  const select = (tag: PublicTag) => {
    setCrowd(undefined)
    setSelected(tag.id)
  }

  const closeChooser = () => {
    setCrowd(undefined)
    opener.current?.focus()
  }

  // where() and its 80 KB of streets load when tagging starts (plan §1.6); a failed load is tried again next time.
  const loadGeo = () =>
    (geo.current ??= import('@iwb/shared/geo').catch((error) => {
      geo.current = null
      throw error
    }))

  const startTagging = () => {
    void loadGeo()
    setTagging('place')
  }

  /** A tap or an arrow key: the pin moves there if it is inside the council or its 20 m strip (§4.1). */
  const place = async (lat: number, lng: number) => {
    const { inside, street, suburb } = (await loadGeo()).where(lat, lng)
    setNote(inside ? undefined : OUTSIDE)
    if (inside) setSpot({ lat, lng, street, suburb })
    announce(inside ? pinOn({ lat, lng, street, suburb }) : OUTSIDE)
  }

  /** Use my location proposes a pin only when it is close enough, and centres the map on any position (§4.1). */
  const locate = (located: Located) => {
    setNote(located.note)
    setSpot(located.spot)
    setCentre(located.centre)
  }

  /** Chosen by street, the spot goes straight to the form, with the map behind it centred there (§10.3). */
  const choose = (chosen: Spot) => {
    setSpot(chosen)
    setNote(undefined)
    setTagging('describe')
  }

  const endTagging = () => {
    // Rendered now, so the button that started it is there to take the focus back.
    flushSync(() => {
      setTagging(undefined)
      setSpot(undefined)
      setNote(undefined)
      setCentre(undefined)
    })
    tagButton.current?.focus()
  }

  const changeLocation = () => {
    // The dialog has to close first: until then the bar is inert and can't take the focus.
    flushSync(() => setTagging('place'))
    document.getElementById('placement-heading')?.focus()
  }

  const closeCard = () => {
    setSelected(undefined)
    // Back to the card's pin (§10.4), or to the sheet when there is no map.
    const pin = document.querySelector<HTMLElement>(`[data-tag="${selected}"] button`)
    if (pin) pin.focus()
    else document.getElementById('sheet')?.focus()
  }

  // Esc closes the chooser or the card, or cancels placing, wherever focus is: none of them is a dialog (§10.4). Esc in
  // a dialog, as in the street picker over the placement bar, is the dialog's own.
  const close = crowded?.length ? closeChooser : card ? closeCard : tagging === 'place' ? endTagging : undefined
  useEffect(() => {
    if (!close) return
    const closeOnEscape = (event: KeyboardEvent) =>
      event.key === 'Escape' && !(event.target as Element).closest('dialog') && close()
    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [close])

  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout>
    // Hydration can run before the first paint, so wait for a frame and then a task: the shell and the preview are on
    // screen before the map's 300 KB starts loading. A tab opened in the background starts when it is first shown.
    const frame = requestAnimationFrame(() => {
      timeout = setTimeout(() => setStatus((current) => (current === 'loading' ? 'failed' : current)), READY_WITHIN_MS)
      setTimeout(() =>
        import('@/map/MapView').then(
          (module) => setMapView(() => module.MapView),
          () => setStatus('failed'),
        ),
      )
    })
    return () => {
      cancelAnimationFrame(frame)
      clearTimeout(timeout)
    }
  }, [])

  return (
    <>
      {/* As tall as its controls at least: four 44 px buttons, three stacked and the "i" below, and the five 0.5rem
          spaces around them. The sheet scrolls for the rest. */}
      <section
        aria-label="Map"
        aria-describedby="map-summary"
        className="relative min-h-[calc(176px+2.5rem)] flex-1 overflow-clip"
      >
        <a
          href="#sheet"
          className="absolute top-2 left-2 z-10 rounded-[10px] bg-white px-3 py-2.5 font-bold not-focus:sr-only"
        >
          Skip to the list
        </a>
        <p id="map-summary" className="sr-only">
          Map of the Inner West{tags && ` with ${bikes(tags.length)} tagged`}. A list view is available.
        </p>
        {MapView && status !== 'failed' && (
          <MapView
            tags={tags}
            now={now}
            selected={selected}
            onPick={(picked, pin) => {
              // While tagging, a tap on a pin places the new one there instead.
              if (tagging) return
              opener.current = pin
              if (picked.length > 1) setCrowd(picked.map((tag) => tag.id))
              else if (picked[0]) select(picked[0])
            }}
            onStatus={setStatus}
            spot={spot}
            centre={centre}
            onPlace={tagging === 'place' ? place : undefined}
            onUse={() => setTagging('describe')}
          />
        )}
        {status !== 'ready' && (
          <>
            {/* Around the preview, the grey the map draws outside the council, opaque over the map loading under it. */}
            {/* eslint-disable-next-line @next/next/no-img-element -- a static file sized by CSS: next/image would only add JavaScript */}
            <img
              src="/preview.webp"
              alt=""
              fetchPriority="high"
              className="absolute inset-0 h-full w-full object-contain p-2"
              style={{ backgroundColor: GREYS[2] }}
            />
            {/* One live region for both, so a map that stops loading is announced. */}
            <div
              role="status"
              className={
                status === 'failed'
                  ? 'absolute inset-x-2 top-2 w-fit rounded-[10px] bg-white px-3 py-2'
                  : 'absolute inset-2 m-auto flex size-fit flex-col items-center gap-2'
              }
            >
              {status === 'failed' ? (
                <>
                  The map couldn&apos;t load.{' '}
                  <Link href="/list" className="inline-flex min-h-11 items-center underline underline-offset-2">
                    Use the list instead.
                  </Link>
                </>
              ) : (
                <MapLoading />
              )}
            </div>
          </>
        )}
      </section>
      {/* Below the map on a phone, as tall as what it shows; beside it in the side-panel layout (§12, §13). */}
      <div
        id="sheet"
        tabIndex={-1}
        className="z-10 flex max-h-[60dvh] flex-col gap-3 overflow-y-auto overscroll-contain border-t border-line bg-white p-4 shadow-[0_-4px_12px_rgb(0_0_0/0.08)] wide:max-h-none wide:w-95 wide:shrink-0 wide:border-t-0 wide:border-r wide:shadow-[4px_0_12px_rgb(0_0_0/0.08)]"
      >
        {crowded?.length ? (
          <CrowdChooser tags={crowded} now={now} onSelect={select} onClose={closeChooser} />
        ) : card ? (
          <TagCard key={card.id} tag={card} now={now} onDone={(tag) => apply(card.id, tag)} onClose={closeCard} />
        ) : tagging ? (
          <>
            <Placement
              spot={spot}
              note={note}
              onLocate={locate}
              onChoose={choose}
              onUse={() => setTagging('describe')}
              onCancel={endTagging}
            />
            <Suspense>
              <TagFlow
                spot={tagging === 'describe' ? spot : undefined}
                tags={tags ?? []}
                now={now}
                uploadsPaused={uploadsPaused}
                apply={apply}
                onChangeLocation={changeLocation}
                onClose={endTagging}
              />
            </Suspense>
          </>
        ) : (
          <>
            {/* Each line keeps its height while the tags load, so nothing moves when they arrive. */}
            <div>
              <h2 ref={count} tabIndex={-1} className="min-h-7 text-lg font-bold">
                {tags && (tags.length ? bikeCount(tags.length) : 'No bikes in the graveyard right now.')}
              </h2>
              <p className="text-sm text-muted">Tags disappear {TAG_LIFETIME_HOURS} hours after the last sighting.</p>
            </div>
            <Legend tags={tags} />
            {/* One row where both fit, so the map keeps its height on a phone; they wrap at 320 px or large text. */}
            <div className="flex flex-wrap gap-2">
              <button ref={tagButton} type="button" className={`${PRIMARY} grow-2 basis-44`} onClick={startTagging}>
                Tag a dumped bike
              </button>
              {/* The panel has room for the list itself, so it needs no List toggle (§13). */}
              <div className="grow basis-36 wide:hidden">
                <ViewToggle current="/" />
              </div>
            </div>
            {tags && (
              <div className="hidden wide:block">
                <TagList tags={tags} now={now} onSelect={select} />
              </div>
            )}
          </>
        )}
      </div>
    </>
  )
}
