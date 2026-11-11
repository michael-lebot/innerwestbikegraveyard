import { getLiveTag } from '@iwb/server'
import { bikeName, TagParams } from '@iwb/shared'
import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { cache } from 'react'
import { NotifyOperator } from '@/components/NotifyOperator'
import { PinIcon } from '@/components/PinIcon'
import { ReportLink } from '@/components/ReportLink'
import { TagActions } from '@/components/TagActions'
import { TagDetails } from '@/components/TagDetails'
import { PhotoState } from '@/components/TagPhoto'

/** The live tag the URL names, or null. Cached for the request, so the title and the page read the database once. */
const findTag = cache(async (id: string) => {
  const parsed = TagParams.safeParse({ id })
  return parsed.success ? getLiveTag(parsed.data.id) : null
})

// not-found.tsx titles the server's 404 HTML, but once the page hydrates Next shows this title instead.
export async function generateMetadata({ params }: PageProps<'/tag/[id]'>): Promise<Metadata> {
  return { title: (await findTag((await params).id)) ? 'Tagged bike' : 'This tag has gone' }
}

/** One live tag, shareable by URL. Anything else, including an id that isn't a UUID, is a 404. */
export default async function TagPage({ params }: PageProps<'/tag/[id]'>) {
  const tag = await findTag((await params).id)
  if (!tag) notFound()
  // The site as the visitor reached it (a preview, *.vercel.app or the domain), for the link in the operator email.
  const request = await headers()
  const origin = `${request.get('x-forwarded-proto')}://${request.get('host')}`

  return (
    <main className="mx-auto flex w-full max-w-[70ch] flex-1 flex-col gap-3 p-4">
      <h1 id="tag-heading" tabIndex={-1} className="flex items-center gap-2 text-lg font-bold">
        <PinIcon operator={tag.operator} />
        {bikeName(tag.operator)}
      </h1>
      <PhotoState>
        <TagDetails tag={tag} now={new Date()} />
        <TagActions id={tag.id} />
        <NotifyOperator tag={tag} origin={origin} />
        {tag.photoId && <ReportLink photoId={tag.photoId} heading="tag-heading" />}
      </PhotoState>
    </main>
  )
}
