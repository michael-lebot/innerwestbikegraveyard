import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Why this page exists' }

export default function WhyPage() {
  return (
    <>
      <h1>Why this page exists</h1>
      <p>Bikes are a healthy, climate-friendly way to get around.</p>
      <p>
        The problem is that shared e-bike providers have flooded the streets of the Inner West and don&apos;t have an
        adequate plan for keeping our neighbourhoods safe and clean.
      </p>
      <p>
        Navigating these bikes is an accessibility issue for people using wheelchairs or mobility scooters and for
        parents with prams. Personal opinion, but the bikes themselves are also an eyesore.
      </p>
      <p>
        This site exists to illustrate to our council the scale of the problem and to make it easy to report nuisance
        e-bikes to the relevant business.
      </p>
    </>
  )
}
