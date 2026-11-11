'use client'
import { type Operator, OPERATORS, type Problem, PROBLEMS, type TagJson } from '@iwb/shared'
import { type FormEvent, useEffect, useRef, useState } from 'react'
import { canRetry, send, type SendError } from '@/lib/send'
import { announce } from './Announcer'
import { PRIMARY, SECONDARY, SMALL } from './buttons'
import { Chips } from './Chips'
import { Dialog } from './Dialog'
import { ErrorText } from './ErrorText'
import { PhotoInput } from './PhotoInput'
import { pinOn, type Spot } from './Placement'

/** What the visitor has said so far, kept across Change location. The id is the tag's until it is added (§5.3). */
export type Draft = { id: string; operator?: Operator; problem?: Problem; photo?: Blob }

const OPERATOR_CHOICES = (Object.keys(OPERATORS) as Operator[])
  .filter((key) => OPERATORS[key].active)
  .map((key) => [key, OPERATORS[key].label] as const)
const PROBLEM_CHOICES = (Object.keys(PROBLEMS) as Problem[]).map((key) => [key, PROBLEMS[key]] as const)
const MISSING = { operator: 'Choose whose bike it is.', problem: "Choose what's wrong." }
const PHOTO_FAILED = "Tag added, but the photo didn't upload."

/**
 * The tag form (§3): the spot, whose bike, what's wrong and an optional photo, then Add to the map. No free text (§6).
 * The tag is sent first and its photo after it, so a photo that fails leaves the tag added, and Try again sends the
 * photo alone (§4.3).
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
  const [failure, setFailure] = useState<string>()
  // Why the photo of a tag already added didn't upload.
  const [photoFailure, setPhotoFailure] = useState<SendError>()
  const [sending, setSending] = useState(false)
  const status = useRef<HTMLParagraphElement>(null)
  const missing = (['operator', 'problem'] as const).filter((field) => !draft[field])

  // The form has made way for the line saying the photo failed, which takes the focus.
  useEffect(() => status.current?.focus(), [photoFailure])

  const done = (message: string) => {
    announce(message)
    onClose()
  }

  /** Sends the photo to the tag. Sent again, it can't add a second: a tag has one photo (§5.3). */
  const attach = async () => {
    if (sending) return
    setSending(true)
    const body = new FormData()
    body.append('photo', draft.photo!, 'photo.jpg')
    const sent = await send<{ tag: TagJson | null }>(`/api/tags/${draft.id}/photo`, body)
    setSending(false)
    if (sent.ok) {
      apply(draft.id, sent.data.tag)
      done(photoFailure ? 'Photo added' : 'Tag added')
    } else {
      setPhotoFailure(sent.error)
      announce(`${PHOTO_FAILED} ${sent.error.message}`)
    }
  }

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (sending) return
    if (missing.length) {
      setChecked(true)
      announce(missing.map((field) => MISSING[field]).join(' '))
      event.currentTarget.querySelector<HTMLInputElement>(`[name="${missing[0]}"]`)?.focus()
      return
    }
    setSending(true)
    setFailure(undefined)
    const { id, operator, problem } = draft
    const sent = await send<{ tag: TagJson | null }>('/api/tags', {
      id,
      lat: spot.lat,
      lng: spot.lng,
      operator,
      problem,
      ...(spot.picked && { street: spot.street }),
    })
    setSending(false)
    if (!sent.ok) {
      // The answers stay, and so does the id, so sending again can't add the tag twice.
      setFailure(sent.error.message)
      announce(sent.error.message)
    } else {
      apply(id, sent.data.tag)
      if (draft.photo) await attach()
      else done('Tag added')
    }
  }

  if (photoFailure)
    return (
      <Dialog title="Tag a dumped bike" onCancel={onClose}>
        <p ref={status} tabIndex={-1} className="font-bold">
          {PHOTO_FAILED}
        </p>
        <ErrorText>{photoFailure.message}</ErrorText>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={`${SECONDARY} grow`} onClick={onClose}>
            Skip
          </button>
          {/* A refusal, such as a paused upload or a file that isn't a photo, would only be refused again. */}
          {canRetry(photoFailure) && (
            <button type="button" className={`${PRIMARY} grow`} onClick={attach}>
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
        <Chips
          legend="Whose bike?"
          name="operator"
          choices={OPERATOR_CHOICES}
          value={draft.operator}
          error={checked && !draft.operator ? MISSING.operator : undefined}
          onChange={(operator) => onDraft({ ...draft, operator })}
        />
        <Chips
          legend="What's wrong?"
          name="problem"
          choices={PROBLEM_CHOICES}
          value={draft.problem}
          error={checked && !draft.problem ? MISSING.problem : undefined}
          onChange={(problem) => onDraft({ ...draft, problem })}
        />
        {uploadsPaused ? (
          <p>Photos are switched off for now.</p>
        ) : (
          <PhotoInput photo={draft.photo} onPhoto={(photo) => onDraft({ ...draft, photo })} />
        )}
        {failure && <ErrorText>{failure}</ErrorText>}
        {/* Side by side where both fit; at large text sizes, one above the other, each the full width. */}
        <div className="flex flex-wrap gap-2">
          <button type="button" className={`${SECONDARY} grow`} onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className={`${PRIMARY} grow`}>
            {sending ? 'Adding…' : 'Add to the map'}
          </button>
        </div>
      </form>
    </Dialog>
  )
}
