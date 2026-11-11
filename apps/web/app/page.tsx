import { MapScreen } from '@/components/MapScreen'

/** The map screen. Its shell never waits for data, so first paint is fast (§11.2). */
export default function Home() {
  return (
    // Size containment: the map screen is exactly the viewport under the header, however long the panel's list.
    <main className="relative flex min-h-0 flex-1 flex-col overflow-clip contain-size wide:flex-row-reverse">
      <h1 className="sr-only">Map of dumped share bikes in the Inner West</h1>
      <MapScreen />
    </main>
  )
}
