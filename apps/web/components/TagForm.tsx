'use client'
import { LIMITS, type Operator, OPERATORS, type Problem, PROBLEMS, type TagJson } from '@iwb/shared'
import { type FormEvent, Fragment, useEffect, useRef, useState } from 'react'
import { canRetry, send, type SendError } from '@/lib/send'
import { announce } from './Announcer'
import { PRIMARY, SECONDARY, SMALL } from './buttons'
import { Chips } from './Chips'
import { Dialog } from './Dialog'
import { ErrorText } from './ErrorText'
import { PhotoInput } from './PhotoInput'
import { pinOn, type Spot } from './Placement'

/** One bike at the spot. Its id, made when it joins the form, is its tag's from then on (§5.3). */
export type Bike = { id: string; operator?: Operator; problem?: Problem }
/** What the visitor has said so far, kept across Change location: the bikes at the spot and one photo of them (§4.2). */
export type Draft = { bikes: Bike[]; photo?: Blob }

const OPERATOR_CHOICES = (Object.keys(OPERATORS) as Operator[])
  .filter((key) => OPERATORS[key].active)
  .map((key) => [key, OPERATORS[key].label] as const)
const PROBLEM_CHOICES = (Object.keys(PROBLEMS) as Problem[]).map((key) => [key, PROBLEMS[key]] as const)
const MISSING = { operator: 'Choose whose bike it is.', problem: "Choose what's wrong." }
const PHOTO_FAILED = "Tag added, but the photo didn't upload."
/** As many bikes as one visitor may tag in an hour (§4.2, §6). */
const MOST_BIKES = LIMITS.create.find(({ per, hours }) => per === 'visitor' && hours === 1)!.max
/** Bike 1's radios keep the names the form has always had; each other bike's are its own. */
const nameOf = (field: 'operator' | 'problem', index: number) => (index ? `${field}-${index + 1}` : field)
const added = (count: number) => (count > 1 ? `${count} bikes added` : 'Tag added')

/**
 * The tag form (§3): the spot, whose bike, what's wrong and an optional photo, then Add to the map. No free text (§6).
 * Up to five bikes at the spot are each their own tag (§4.2). The tags are sent first, one after another, and the
 * photo to each after them, so a photo that fails leaves the tags added, and Try again sends only the missing copies
 * (§4.3).
 */
export function TagForm({
  spot,
  draft,
  onDraft,
  uploadsPaused,
  apply,
  onChangeLocation,
  onClose,
}: {
  spot: Spot
  draft: Draft
  onDraft: (draft: Draft) => void
  uploadsPaused: boolean
  apply: (id: string, tag: TagJson | null) => void
  onChangeLocation: () => void
  onClose: () => void
}) {
  const [checked, setChecked] = useState(false)
  // Why a tag wasn't added, and how many before it were.
  const [failure, setFailure] = useState<{ message: string; count: number }>()
  // Why the photo didn't upload, and the tags, already added, still without it.
  const [photoFailure, setPhotoFailure] = useState<{ error: SendError; ids: string[] }>()
  const [sending, setSending] = useState(false)
  const status = useRef<HTMLParagraphElement>(null)
  // The element to focus once a bike has been added to or taken out of the form.
  const focusNext = useRef<string>(null)
  const { bikes } = draft
  const several = bikes.length > 1

  // The form has made way for the line saying the photo failed, which takes the focus.
  useEffect(() => status.current?.focus(), [photoFailure])
  useEffect(() => {
    if (focusNext.current) document.getElementById(focusNext.current)?.focus()
    focusNext.current = null
  }, [bikes.length])

  const update = (index: number, answer: Partial<Bike>) =>
    onDraft({ ...draft, bikes: bikes.map((bike, i) => (i === index ? { ...bike, ...answer } : bike)) })

  /** A new bike, answered as the one above it, since a pile usually shares both answers (§4.2). */
  const addBike = () => {
    const id = crypto.randomUUID()
    focusNext.current = `bike-${id}`
    onDraft({ ...draft, bikes: [...bikes, { ...bikes.at(-1), id }] })
    announce(`Bike ${bikes.length + 1} added, the same as bike ${bikes.length}`)
  }

  const removeBike = (index: number) => {
    focusNext.current = 'add-bike'
    onDraft({ ...draft, bikes: bikes.filter((_, i) => i !== index) })
    announce(`Bike ${index + 1} removed`)
  }

  const done = (message: string) => {
    announce(message)
    onClose()
  }

  /** Sends the photo to each tag, one copy each. Sent again, it can't add a second: a tag has one photo (§5.3). */
  const attach = async (ids: string[]) => {
    if (sending) return
    setSending(true)
    const failed: string[] = []
    let error: SendError | undefined
    for (const id of ids) {
      const body = new FormData()
      body.append('photo', draft.photo!, 'photo.jpg')
      const sent = await send<{ tag: TagJson | null }>(`/api/tags/${id}/photo`, body)
      if (sent.ok) apply(id, sent.data.tag)
      else {
        failed.push(id)
        error = sent.error
      }
    }
    setSending(false)
    if (error) {
      setPhotoFailure({ error, ids: failed })
      announce(`${photoFailed(failed.length)} ${error.message}`)
    } else done(photoFailure ? 'Photo added' : added(bikes.length))
  }

  const photoFailed = (count: number) =>
    several ? `Bikes added, but the photo didn't upload for ${count} of them.` : PHOTO_FAILED

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (sending) return
    // The first bike with a question unanswered, and its unanswered questions.
    const index = bikes.findIndex((bike) => !bike.operator || !bike.problem)
    if (index >= 0) {
      const missing = (['operator', 'problem'] as const).filter((field) => !bikes[index]![field])
      setChecked(true)
      announce(missing.map((field) => MISSING[field]).join(' '))
      event.currentTarget.querySelector<HTMLInputElement>(`[name="${nameOf(missing[0]!, index)}"]`)?.focus()
      return
    }
    setSending(true)
    setFailure(undefined)
    for (const [count, { id, operator, problem }] of bikes.entries()) {
      // Each is on the map as soon as it is added. A bike added before is a repeat: the server answers it with the tag
      // as it is and counts nothing (§5.3), so sending every bike again adds only the rest.
      const sent = await send<{ tag: TagJson | null }>('/api/tags', {
        id,
        lat: spot.lat,
        lng: spot.lng,
        operator,
        problem,
        ...(spot.picked && { street: spot.street }),
      })
      if (!sent.ok) {
        // The answers stay, and so do the ids, so sending again can't add a tag twice.
        setSending(false)
        setFailure({ message: sent.error.message, count })
        announce(several ? `${count} of ${bikes.length} bikes added. ${sent.error.message}` : sent.error.message)
        return
      }
      apply(id, sent.data.tag)
    }
    setSending(false)
    if (draft.photo) await attach(bikes.map(({ id }) => id))
    else done(added(bikes.length))
  }

  if (photoFailure)
    return (
      <Dialog title="Tag a dumped bike" onCancel={onClose}>
        <p ref={status} tabIndex={-1} className="font-bold">
          {photoFailed(photoFailure.ids.length)}
        </p>
        <ErrorText>{photoFailure.error.message}</ErrorText>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={`${SECONDARY} grow`} onClick={onClose}>
            Skip
          </button>
          {/* A refusal, such as a paused upload or a file that isn't a photo, would only be refused again. */}
          {canRetry(photoFailure.error) && (
            <button type="button" className={`${PRIMARY} grow`} onClick={() => attach(photoFailure.ids)}>
              {sending ? 'Sending…' : 'Try again'}
            </button>
          )}
        </div>
      </Dialog>
    )
  return (
    <Dialog title="Tag a dumped bike" onCancel={onClose}>
      <form noValidate onSubmit={submit} className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-bold">{pinOn(spot)}</p>
          <button type="button" className={SMALL} onClick={onChangeLocation}>
            Change location
          </button>
        </div>
        {bikes.map((bike, index) => {
          const questions = (
            <>
              <Chips
                legend="Whose bike?"
                name={nameOf('operator', index)}
                choices={OPERATOR_CHOICES}
                value={bike.operator}
                error={checked && !bike.operator ? MISSING.operator : undefined}
                onChange={(operator) => update(index, { operator })}
              />
              <Chips
                legend="What's wrong?"
                name={nameOf('problem', index)}
                choices={PROBLEM_CHOICES}
                value={bike.problem}
                error={checked && !bike.problem ? MISSING.problem : undefined}
                onChange={(problem) => update(index, { problem })}
              />
            </>
          )
          // One bike is the form as it always was; with several, each is a named group (§10.4).
          return several ? (
            <fieldset
              key={bike.id}
              id={`bike-${bike.id}`}
              tabIndex={-1}
              className="flex flex-col gap-4 rounded-[10px] border border-edge p-3"
            >
              <legend className="px-1 font-bold">Bike {index + 1}</legend>
              {index > 0 && (
                <button type="button" className={`${SMALL} self-start`} onClick={() => removeBike(index)}>
                  Remove bike {index + 1}
                </button>
              )}
              {questions}
            </fieldset>
          ) : (
            <Fragment key={bike.id}>{questions}</Fragment>
          )
        })}
        {bikes.length < MOST_BIKES ? (
          <button id="add-bike" type="button" className={SECONDARY} onClick={addBike}>
            Add another bike here
          </button>
        ) : (
          <p>That&apos;s the most in one go.</p>
        )}
        {uploadsPaused ? (
          <p>Photos are switched off for now.</p>
        ) : (
          <PhotoInput photo={draft.photo} onPhoto={(photo) => onDraft({ ...draft, photo })} />
        )}
        {failure && several && (
          <p className="font-bold">
            {failure.count} of {bikes.length} bikes added.
          </p>
        )}
        {failure && <ErrorText>{failure.message}</ErrorText>}
        {/* Side by side where both fit; at large text sizes, one above the other, each the full width. */}
        <div className="flex flex-wrap gap-2">
          <button type="button" className={`${SECONDARY} grow`} onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className={`${PRIMARY} grow`}>
            {sending ? 'Adding…' : several ? `Add ${bikes.length} bikes to the map` : 'Add to the map'}
          </button>
        </div>
      </form>
    </Dialog>
  )
}
