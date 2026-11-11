import { COUNTER_RETENTION_HOURS, FEEDBACK_EMAIL, HASH_RETENTION_DAYS, TAG_LIFETIME_HOURS } from '@iwb/shared'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Privacy' }

/** Michael's TLDR, checked against the code (§7), then the details. */
export default function PrivacyPage() {
  return (
    <>
      <h1>Privacy</h1>
      <p>
        <strong>TLDR;</strong> I used AI to create this app. The app itself doesn&apos;t use any AI. The app accesses
        your location (if you allow it), but it only leaves your device if you use it to add a tag, and then it&apos;s
        shown publicly on the map. The app doesn&apos;t collect your name or email address. Like any website, it sees
        your IP address: when you add, mark or report something, it keeps a scrambled version of it, and of a random ID
        stored in your browser, for up to {HASH_RETENTION_DAYS} days to stop abuse. Tags, photos and the database are
        hosted in Sydney, Australia.
      </p>

      <h2>What the app keeps</h2>
      <ul>
        <li>
          <strong>Tags:</strong> the spot, whose bike it is and what is wrong. There is no free text. A tag is public
          for up to {TAG_LIFETIME_HOURS} hours after the last sighting, less if it is marked removed or I take it down.
          After that it stays in the database as a record of its spot, street, operator, problem and times.
        </li>
        <li>
          <strong>Photos:</strong> public while their tag is. A photo&apos;s first report hides it until I restore or
          delete it. Each one is re-encoded when it arrives, which removes its location and other hidden details, and
          deleted when its tag&apos;s {TAG_LIFETIME_HOURS} hours run out, or sooner if I delete it. Please leave out
          people, faces and number plates.
        </li>
        <li>
          <strong>Reports:</strong> which photo, the reason you chose, and when. I keep that record, and what I decided.
        </li>
        <li>
          <strong>A random ID</strong> in a cookie, which your browser keeps for a year. It holds no details about you
          or your device, but it lets the app recognise the same browser. Only a keyed hash of it is stored, with what
          you add, mark or report, so I can limit how often one visitor acts and undo abuse.
        </li>
        <li>
          <strong>Your IP address:</strong> only a hash of it is stored, made with a key that changes every day. Each
          day&apos;s key is deleted after {COUNTER_RETENTION_HOURS} hours, and after that its hashes can&apos;t be
          linked to an address. The app never stores or logs the address itself.
        </li>
        <li>
          Both hashes are cleared after {HASH_RETENTION_DAYS} days, and the rate-limit counters that hold them after{' '}
          {COUNTER_RETENTION_HOURS} hours. The database keeps a day of history for recovery, so anything deleted lingers
          there for a day.
        </li>
        <li>
          <strong>Your location,</strong> only if you tap Use my location, and your browser asks you first. It is read
          once and stays in your browser, which uses it to suggest a pin. Only if you use that pin is the spot sent, and
          then it is stored as the bike&apos;s public spot: where you were standing.
        </li>
        <li>
          <strong>Reduce motion:</strong> your choice stays in your browser&apos;s local storage. It is never sent.
        </li>
      </ul>

      <h2>Who helps run the site</h2>
      <ul>
        <li>
          Vercel runs the site&apos;s server in Sydney and stores the photos there. Like any host, it sees your IP
          address and browser type with every request: they are in the site&apos;s request logs, which I can see for a
          day, and Vercel&apos;s firewall uses the address to limit how many changes one address can send a minute.
        </li>
        <li>
          Vercel BotID runs a check in your browser that reads signals from it, to keep bots from adding, marking or
          reporting things. It runs in its basic mode, which doesn&apos;t use machine learning.
        </li>
        <li>Neon runs the database, in Sydney.</li>
        <li>Resend emails me alerts about reported photos. They contain no visitor details.</li>
      </ul>

      <h2>Contact</h2>
      <p>
        Email <a href={`mailto:${FEEDBACK_EMAIL}`}>{FEEDBACK_EMAIL}</a>. It is forwarded to my own inbox, so I will see
        your email address and whatever you write.
      </p>
    </>
  )
}
