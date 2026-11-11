import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = { title: 'Page not found' }

export default function NotFound() {
  return (
    <main className="mx-auto w-full max-w-[70ch] px-4 py-8">
      <h1 className="text-2xl font-bold">Page not found</h1>
      <p className="mt-3">
        There&apos;s nothing at this address. Try the{' '}
        <Link href="/" className="underline">
          map
        </Link>{' '}
        or the{' '}
        <Link href="/list" className="underline">
          list of bikes
        </Link>
        .
      </p>
    </main>
  )
}
