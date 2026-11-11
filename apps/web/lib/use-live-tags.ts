'use client'
import { isExpired, parseTag, type PublicTag, REFRESH_MINUTES, type TagJson } from '@iwb/shared'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

const MINUTE = 60_000

/**
 * The live tags (§11.3), and whether photo uploads are paused (§4.6): fetched on mount, when the tab comes back or
 * regains focus, every 5 minutes while it is visible, and after each of the page's own writes, which `apply` shows at
 * once. Between fetches, tags drop out as their time runs out. `tags` is undefined until the first fetch succeeds.
 */
export function useLiveTags() {
  const [tags, setTags] = useState<PublicTag[]>()
  const [uploadsPaused, setUploadsPaused] = useState(false)
  const [now, setNow] = useState(() => new Date())
  // Focus and visibility often fire together: only the latest request may set the tags, whichever answers last.
  const latest = useRef(0)

  // A promise chain rather than async/await, so the lint rule can see the state is set later, not in the effect.
  const refresh = useCallback(() => {
    const request = ++latest.current
    return (
      fetch('/api/tags')
        .then((response) => {
          if (!response.ok) throw new Error(`GET /api/tags: ${response.status}`)
          return response.json()
        })
        .then((body) => {
          if (request !== latest.current) return
          setTags(body.tags.map(parseTag))
          setUploadsPaused(body.uploadsPaused)
          setNow(new Date())
        })
        // Offline, or a body without tags: keep what is showing, and try again at the next refresh.
        .catch(() => {})
    )
  }, [])

  useEffect(() => {
    const whenVisible = () => document.visibilityState === 'visible' && refresh()
    refresh()
    document.addEventListener('visibilitychange', whenVisible)
    window.addEventListener('focus', refresh)
    const refreshing = setInterval(whenVisible, REFRESH_MINUTES * MINUTE)
    const ticking = setInterval(() => setNow(new Date()), MINUTE)
    return () => {
      document.removeEventListener('visibilitychange', whenVisible)
      window.removeEventListener('focus', refresh)
      clearInterval(refreshing)
      clearInterval(ticking)
    }
  }, [refresh])

  /** A write's answer: the tag as the server has it now, or null when it is no longer live. The refresh reconciles. */
  const apply = useCallback(
    (id: string, tag: TagJson | null) => {
      setTags((current) => current?.filter((other) => other.id !== id).concat(tag ? [parseTag(tag)] : []))
      refresh()
    },
    [refresh],
  )

  const live = useMemo(() => tags?.filter((tag) => !isExpired(tag, now)), [tags, now])
  return { tags: live, now, apply, uploadsPaused }
}
