import Link from 'next/link'

const VIEWS = [
  { href: '/', label: 'Map' },
  { href: '/list', label: 'List' },
] as const

/** Map | List as plain links, so it works while the map loads, if it fails, and without JavaScript. */
export function ViewToggle({ current }: { current: (typeof VIEWS)[number]['href'] }) {
  return (
    <nav aria-label="View" className="grid grid-cols-2 gap-2">
      {VIEWS.map(({ href, label }) => (
        <Link
          key={href}
          href={href}
          aria-current={href === current ? 'page' : undefined}
          className="flex min-h-11 items-center justify-center rounded-[10px] border border-edge font-bold aria-[current=page]:border-2 aria-[current=page]:border-brand aria-[current=page]:bg-tint"
        >
          {label}
        </Link>
      ))}
    </nav>
  )
}
