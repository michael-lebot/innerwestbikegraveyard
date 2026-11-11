import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Terms' }

export default function TermsPage() {
  return (
    <>
      <h1>Terms</h1>
      <p>By adding a tag or a photo, you agree to these terms.</p>

      <h2>Photos</h2>
      <ul>
        <li>Photos must show a share bike. People and number plates must not be the subject.</li>
        <li>
          That is a request to you, not consent from anyone who appears in a photo. A reported photo is hidden straight
          away, until we have checked it. Once we have checked a photo and kept it, later reports still reach us but no
          longer hide it.
        </li>
        <li>You give us permission to show the photos you add on this site.</li>
      </ul>

      <h2>Removal</h2>
      <p>We may remove any tag or photo at any time.</p>

      <h2>No affiliation</h2>
      <p>This site isn&apos;t affiliated with Lime, Hello, Ario, Inner West Council or Transport for NSW.</p>

      {/* The map's "i" panel says the same; /list, which has no map, uses this data to choose a street (§7). */}
      <h2>Map and address data</h2>
      <p>© OpenStreetMap contributors.</p>
      <p>© State of New South Wales (Spatial Services, DCS NSW), CC BY 4.0.</p>
    </>
  )
}
