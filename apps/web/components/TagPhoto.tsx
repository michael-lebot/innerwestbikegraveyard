'use client'
import { createContext, useContext, useState } from 'react'

/** The text in place of a tag's photo once it stops showing, or undefined while it shows; and how to put text there. */
type Gone = [gone: string | undefined, setGone: (text: string) => void]
const PhotoGone = createContext<Gone | null>(null)

/**
 * Around a tag's photo and its report link, on its card or its page, so the two agree once the photo stops showing:
 * because it failed to load, as when it was reported or its tag went since the page was drawn, or because this visitor
 * reported it. It lasts as long as the card or the page.
 */
export function PhotoState({ children }: { children: React.ReactNode }) {
  return <PhotoGone value={useState<string>()}>{children}</PhotoGone>
}

/** The PhotoState this photo or link is in; outside one, as in "Is it one of these?", a state of its own. */
export function usePhotoGone(): Gone {
  const own = useState<string>()
  return useContext(PhotoGone) ?? own
}

/**
 * A tag's photo (§4.3): the 320 px thumbnail in a fixed box, so nothing moves when it arrives, opening the full size in
 * a new tab. A photo that stops showing gives way to text in a box the same size, never a broken image (§10.4).
 */
export function TagPhoto({ id, alt }: { id: string; alt: string }) {
  const [gone, setGone] = usePhotoGone()

  if (gone)
    return (
      <p className="flex min-h-18 w-24 shrink-0 items-center rounded-lg border border-line px-1.5 py-1 text-sm text-muted">
        {gone}
      </p>
    )
  return (
    <a href={`/photo/${id}`} target="_blank" className="shrink-0 rounded-lg">
      {/* eslint-disable-next-line @next/next/no-img-element -- served as stored, so next/image would only add JavaScript */}
      <img
        src={`/photo/${id}/thumb`}
        alt={alt}
        width={96}
        height={72}
        onError={() => setGone('Photo no longer shown')}
        className="h-18 w-24 rounded-lg object-cover"
      />
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  )
}
