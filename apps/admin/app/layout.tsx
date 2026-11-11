import type { Metadata } from 'next'
import Link from 'next/link'
import { connection } from 'next/server'
import './globals.css'

export const metadata: Metadata = {
  title: { default: 'Admin', template: '%s · Admin · E-bike Graveyard' },
}

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // Every admin page shows the database as it is now, so none is prerendered.
  await connection()

  return (
    <html lang="en-AU">
      <body className="bg-white text-ink">
        {/* py-1.5 leaves room for the 5 px focus ring above and below the links. */}
        <header className="bg-night px-4 py-1.5 text-white">
          <nav aria-label="Admin" className="flex gap-6">
            <Link href="/reports" className="flex min-h-11 items-center underline underline-offset-2">
              Reported photos
            </Link>
            <Link
              href="/tags"
              className="flex min-h-11 min-w-11 items-center justify-center underline underline-offset-2"
            >
              Tags
            </Link>
          </nav>
        </header>
        <main className="p-4">{children}</main>
      </body>
    </html>
  )
}
