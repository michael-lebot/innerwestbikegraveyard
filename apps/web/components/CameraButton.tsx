'use client'
import { ERRORS } from '@iwb/shared'
import { type ChangeEvent, useState } from 'react'
import { announce } from './Announcer'
import { FOCUS_RING_WITHIN, PRIMARY } from './buttons'
import { ErrorText } from './ErrorText'
import { locate, type Located } from './LocateButton'

/** The photos a visitor can choose. iOS turns a HEIC photo into a JPEG for this list (§4.3). */
export const PHOTO_TYPES = 'image/jpeg,image/png,image/webp'

export const FINDING_YOU = 'Got your photo. Finding where you are…'

/**
 * After Take a photo of a bike, where the visitor is (§4.3): said first, then found as Use my location does. When it
 * places no spot, the note says why after "Got your photo."
 */
export async function locateAfterPhoto(withMap: boolean): Promise<Located> {
  announce(FINDING_YOU)
  const located = await locate(withMap)
  return located.spot ? located : { ...located, note: `Got your photo. ${located.note}` }
}

/**
 * Take a photo of a bike (§4.3): a file input that opens the phone's own camera, shown only where the main pointer is
 * touch, and only with JavaScript. The photo is shrunk here and handed on; a file that isn't a photo is said here.
 */
export function CameraButton({ className, onPhoto }: { className?: string; onPhoto: (photo: Blob) => void }) {
  const [error, setError] = useState<string>()

  const choose = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    // Emptied, so the same photo chosen again still counts as a choice.
    event.target.value = ''
    if (!file) return
    try {
      // Loaded here, out of the JavaScript before the map (§11.1).
      const { shrinkPhoto } = await import('@/lib/photo')
      const photo = await shrinkPhoto(file)
      setError(undefined)
      onPhoto(photo)
    } catch {
      setError(ERRORS.bad_image.message)
      announce(ERRORS.bad_image.message)
    }
  }

  return (
    <div className={`hidden flex-col gap-2 pointer-coarse:flex noscript:hidden ${className ?? ''}`}>
      <label className={`${PRIMARY} cursor-pointer gap-2 ${FOCUS_RING_WITHIN}`}>
        <input type="file" accept={PHOTO_TYPES} capture="environment" onChange={choose} className="sr-only" />
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className="size-5 shrink-0"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinejoin="round"
        >
          <path d="M3 8h4l2-3h6l2 3h4v11H3z" />
          <circle cx="12" cy="13" r="3.5" />
        </svg>
        Take a photo of a bike
      </label>
      {error && <ErrorText>{error}</ErrorText>}
    </div>
  )
}
