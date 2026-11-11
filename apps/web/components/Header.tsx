import Link from 'next/link'

export function Header() {
  return (
    <header className="flex min-h-14 shrink-0 items-center gap-2.5 bg-night px-3 py-1.5 text-white">
      <svg
        width="24"
        height="28"
        viewBox="0 0 12 14"
        shapeRendering="crispEdges"
        aria-hidden="true"
        className="shrink-0"
      >
        <path fill="#9aa5b1" d="M3 1h6v1h1v1h1v10H1V3h1V2h1z" />
        <path fill="#c4ccd4" d="M3 2h5v1h1v1h1v8H2V4h1z" />
        <path fill="#1f2a36" d="M5 4h2v1h1v1H7v2H5V6H4V5h1z" />
        <path fill="#3c9a3a" d="M0 13h12v1H0z" />
      </svg>
      <Link href="/" className="flex min-h-11 flex-1 items-center leading-tight font-bold">
        <span>
          The Inner West <span className="whitespace-nowrap">E-bike</span> Graveyard
        </span>
      </Link>
    </header>
  )
}
