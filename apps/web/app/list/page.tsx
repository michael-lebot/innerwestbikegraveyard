import { listLiveTags, uploadsPaused } from '@iwb/server'
import { bikeCount, TAG_LIFETIME_HOURS } from '@iwb/shared'
import type { Metadata } from 'next'
import { ListTagButton } from '@/components/ListTagButton'
import { TagList } from '@/components/TagList'
import { ViewToggle } from '@/components/ViewToggle'

export const metadata: Metadata = { title: 'List of bikes' }

/**
 * Every live tag, rendered on the server: reading it needs neither the map nor JavaScript. Tagging from here needs no
 * map either (§10.3).
 */
export default async function ListPage() {
  const [tags, paused] = await Promise.all([listLiveTags(), uploadsPaused()])
  const now = new Date()

  return (
    <main className="mx-auto flex w-full max-w-[70ch] flex-1 flex-col gap-3 p-4">
      <div>
        <h1 className="text-lg font-bold">
          {tags.length ? bikeCount(tags.length) : 'No bikes in the graveyard right now.'}
        </h1>
        <p className="text-sm text-muted">Tags disappear {TAG_LIFETIME_HOURS} hours after the last sighting.</p>
      </div>
      {/* One row where both fit, as on the map screen; tagging takes the whole row. */}
      <div className="flex flex-wrap gap-2">
        <ListTagButton tags={tags} now={now} uploadsPaused={paused} />
        <div className="grow basis-36">
          <ViewToggle current="/list" />
        </div>
      </div>
      <TagList tags={tags} now={now} />
    </main>
  )
}
