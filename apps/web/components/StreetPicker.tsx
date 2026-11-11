'use client'
import { type FormEvent, useEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { announce } from './Announcer'
import { FOCUS_RING_ON_HOVER, PRIMARY, SECONDARY, SMALL } from './buttons'
import { Dialog } from './Dialog'
import { ErrorText } from './ErrorText'
import type { Spot } from './Placement'

type Picker = typeof import('@iwb/shared/picker')
type Where = (typeof import('@iwb/shared/geo'))['where']
type Street = import('@iwb/shared/picker').Street
type Place = import('@iwb/shared/picker').Place

/** The most streets listed at once: typing more narrows them. */
const SHOWN = 8
const FIELD = 'min-h-12 min-w-0 rounded-[10px] border border-edge px-3'
const CHOICE = `flex min-h-11 w-full items-center rounded-[10px] border border-line px-3 py-2 text-left ${FOCUS_RING_ON_HOVER}`

/** "near Marrickville Rd", or "near Edwin St (1 of 2)" where the cross street meets this one twice. */
function cornerName(corners: Place[], corner: Place) {
  const same = corners.filter(([cross]) => cross === corner[0])
  return `near ${corner[0]}${same.length > 1 ? ` (${same.indexOf(corner) + 1} of ${same.length})` : ''}`
}

/** The line under the search box: what it has found, out of the streets once they have loaded. */
function searchStatus(query: string, found: number | undefined) {
  if (found === undefined) return 'Loading streets…'
  if (!query.trim()) return 'Type part of its name.'
  if (!found) return 'No street in the Inner West matches that.'
  if (found > SHOWN) return `${found} streets match. Type more to narrow them down.`
  return `${found} ${found === 1 ? 'street matches' : 'streets match'}.`
}

/**
 * Choose by street (§10.3), the way to place a tag without the map: a street, then the nearest house number or
 * corner, then the spot read back with Use this spot. What is typed never leaves the browser, and the house number
 * only finds the spot: `onUse` gets the point, in where()'s suburb, on the street picked from the list.
 */
export function StreetPicker({ onUse, onCancel }: { onUse: (spot: Spot) => void; onCancel: () => void }) {
  const [loaded, setLoaded] = useState<{ picker: Picker; where: Where }>()
  const [query, setQuery] = useState('')
  const [street, setStreet] = useState<Street>()
  const numbers = useRef<Promise<Place[]>>(null)
  const [number, setNumber] = useState('')
  const [chosen, setChosen] = useState<{ place: Place; readback: string }>()
  const [error, setError] = useState<string>()
  const search = useRef<HTMLInputElement>(null)
  const streetHeading = useRef<HTMLHeadingElement>(null)
  const readback = useRef<HTMLParagraphElement>(null)

  /** An error, shown and spoken (§10.4). */
  const fail = (message: string) => {
    setError(message)
    announce(message)
  }

  // The streets and where() load when the picker opens, so they are never in the first bundle (§11.1).
  useEffect(() => {
    Promise.all([import('@iwb/shared/picker'), import('@iwb/shared/geo')]).then(
      ([picker, { where }]) => setLoaded({ picker, where }),
      () => fail("Couldn't load the streets. Check your connection and try again."),
    )
  }, [])

  const found = loaded?.picker.searchStreets(query) ?? []
  const status = searchStatus(query, loaded && found.length)
  // A screen reader isn't told when the list under the box changes, so the count is spoken (4.1.3).
  useEffect(() => {
    if (query.trim()) announce(status)
  }, [query, status])

  /** Moves to another step, with the focus on its first line. */
  const show = (change: () => void, focus: { current: HTMLElement | null }) => {
    flushSync(() => {
      change()
      setError(undefined)
    })
    focus.current?.focus()
  }

  const chooseStreet = (choice: Street) => {
    // Its suburb's house numbers start loading now, while the visitor reads on (§11.1).
    if (choice.numbered) numbers.current = loaded!.picker.loadHouseNumbers(choice)
    show(() => {
      setStreet(choice)
      setNumber('')
    }, streetHeading)
  }

  const findNumber = async (event: FormEvent) => {
    event.preventDefault()
    const typed = number.trim()
    if (!street || !typed) return
    const numbered = await numbers.current!.catch(() => undefined)
    if (!numbered) {
      // Tried again with the next Find.
      numbers.current = loaded!.picker.loadHouseNumbers(street)
      return fail("Couldn't load the house numbers. Check your connection and try again.")
    }
    const house = loaded!.picker.matchHouseNumber(numbered, typed)
    if (house)
      show(() => setChosen({ place: house, readback: `${house[0]} ${street.street}, ${street.suburb}` }), readback)
    else
      fail(
        `We don't have number ${typed} on ${street.street}. Try another number` +
          (street.corners.length ? ', or pick the nearest corner.' : '.'),
      )
  }

  const use = () => {
    const [, lat, lng] = chosen!.place
    // The street picked, not where()'s nearest, which is often the lane behind the house; the server checks it.
    onUse({ lat, lng, ...loaded!.where(lat, lng), street: street!.street, picked: true })
  }

  return (
    <Dialog title="Choose by street" onCancel={onCancel}>
      {chosen ? (
        <>
          <p ref={readback} tabIndex={-1} className="text-lg font-bold">
            {chosen.readback}
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={`${SECONDARY} grow`}
              onClick={() => show(() => setChosen(undefined), streetHeading)}
            >
              Back
            </button>
            <button type="button" className={`${PRIMARY} grow`} onClick={use}>
              Use this spot
            </button>
          </div>
        </>
      ) : street ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 ref={streetHeading} tabIndex={-1} className="font-bold">
              {street.street}, {street.suburb}
            </h3>
            <button type="button" className={SMALL} onClick={() => show(() => setStreet(undefined), search)}>
              Change street
            </button>
          </div>
          {/* Each box sits at the top, with its answer right under it, clear of the on-screen keyboard (§12). */}
          {street.numbered && (
            <form noValidate onSubmit={findNumber} className="flex flex-col gap-2">
              <label htmlFor="house-number" className="font-bold">
                House number
              </label>
              <div className="flex gap-2">
                <input
                  id="house-number"
                  // The full keyboard, as a number can have a letter (12A), which a phone's number pad lacks.
                  inputMode="text"
                  autoCapitalize="characters"
                  autoComplete="off"
                  value={number}
                  onChange={(event) => setNumber(event.target.value)}
                  aria-describedby={error ? 'number-error' : undefined}
                  className={`${FIELD} flex-1`}
                />
                <button type="submit" className={SECONDARY}>
                  Find
                </button>
              </div>
              {error && <ErrorText id="number-error">{error}</ErrorText>}
            </form>
          )}
          {street.corners.length > 0 && (
            <>
              {/* A street with no house numbers has corners, or the build wouldn't list it. */}
              <p id="corner-label" className="font-bold">
                {street.numbered
                  ? 'Or the nearest corner'
                  : `We don't have house numbers on ${street.street}. Pick the nearest corner.`}
              </p>
              <ul aria-labelledby="corner-label" className="flex flex-col gap-2">
                {street.corners.map((corner, i) => (
                  <li key={i}>
                    <button
                      type="button"
                      className={CHOICE}
                      onClick={() =>
                        show(
                          () =>
                            setChosen({
                              place: corner,
                              readback: `Near the corner of ${street.street} and ${corner[0]}, ${street.suburb}`,
                            }),
                          readback,
                        )
                      }
                    >
                      {cornerName(street.corners, corner)}
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      ) : (
        <>
          <div className="flex flex-col gap-2">
            <label htmlFor="street-search" className="font-bold">
              Street
            </label>
            <input
              id="street-search"
              ref={search}
              type="search"
              autoComplete="off"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              aria-describedby="street-status"
              className={FIELD}
            />
            <p id="street-status" className="text-sm text-muted">
              {status}
            </p>
            {error && <ErrorText>{error}</ErrorText>}
          </div>
          {found.length > 0 && (
            <ul aria-label="Streets" className="flex flex-col gap-2">
              {found.slice(0, SHOWN).map((choice) => (
                <li key={`${choice.street}, ${choice.suburb}`}>
                  <button type="button" className={CHOICE} onClick={() => chooseStreet(choice)}>
                    <span>
                      <b>{choice.street}</b>, {choice.suburb}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </Dialog>
  )
}
