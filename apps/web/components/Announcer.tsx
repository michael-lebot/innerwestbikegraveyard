/** The page's one polite live region, for results and errors (§10.4). */
export function Announcer() {
  return <div id="announcer" role="status" className="sr-only" />
}

/** Says `text` through the live region. */
export function announce(text: string) {
  const region = document.getElementById('announcer')
  if (!region) return
  // Emptied first and filled a moment later, so the same words twice are read out twice.
  region.textContent = ''
  setTimeout(() => (region.textContent = text), 100)
}
