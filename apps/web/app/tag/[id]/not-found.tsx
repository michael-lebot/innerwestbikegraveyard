import type { Metadata } from 'next'
import Link from 'next/link'

// The title in the server's HTML. The tag page's generateMetadata gives the same one once the page hydrates.
export const metadata: Metadata = { title: 'This tag has gone' }

export default function TagNotFound() {
  return (
    <main className="mx-auto w-full max-w-[70ch] flex-1 p-4">
      <h1 className="text-lg font-bold">This tag has gone</h1>
      <p className="mt-2">
        The bike was marked as removed, or nobody has seen it for 48 hours.{' '}
        <Link href="/list" className="underline">
          See the bikes still in the graveyard
        </Link>
        .
      </p>
    </main>
  )
}
