// Visitors without accounts (§6): a keyed hash of the visitor cookie, and a hash of the IP with a salt that changes
// every day. Owns daily_salts, and how long the hashes are kept wherever they are stored. The raw cookie and IP are
// never stored or logged.
import { createHmac, randomBytes } from 'node:crypto'
import { COUNTER_RETENTION_HOURS, HASH_RETENTION_DAYS } from '@iwb/shared'
import { db } from './client'
import { env } from './env'

/** Who made a write, as it is counted and recorded. */
export type Visitor = { visitorHash: string; ipHash: string }

const hmac = (key: string, value: string) => createHmac('sha256', key).update(value).digest('hex')

/** The part of an address that names one subscriber: an IPv4 address, or an IPv6 address's /64 (§6). */
function subscriber(ip: string) {
  const v4 = ip.match(/^(?:::ffff:)?(\d+\.\d+\.\d+\.\d+)$/i)
  if (v4) return v4[1]!
  // Write out the groups "::" leaves out, so every spelling of one /64 is the same string.
  const [head = '', tail = ''] = ip.split('::')
  const [left, right] = [head ? head.split(':') : [], tail ? tail.split(':') : []]
  const groups = [...left, ...Array<string>(Math.max(0, 8 - left.length - right.length)).fill('0'), ...right]
  return groups
    .slice(0, 4)
    .map((group) => parseInt(group, 16).toString(16))
    .join(':')
}

/** Today's IP salt (UTC), made by the first request that needs it. deleteOldSalts deletes it after 48 hours. */
async function dailySalt() {
  // The no-op update makes RETURNING give the stored salt when another request made it first.
  const [row] = await db.$queryRaw<{ salt: string }[]>`
    INSERT INTO daily_salts (day, salt) VALUES ((now() AT TIME ZONE 'utc')::date, ${randomBytes(32).toString('hex')})
    ON CONFLICT (day) DO UPDATE SET salt = daily_salts.salt
    RETURNING salt`
  return row!.salt
}

export async function visitorFrom(cookie: string, ip: string): Promise<Visitor> {
  if (!env.HASH_SECRET) throw new Error('HASH_SECRET is not set')
  return { visitorHash: hmac(env.HASH_SECRET, cookie), ipHash: hmac(await dailySalt(), subscriber(ip)) }
}

/**
 * Hourly step 3 (§5.4): clears the visitor and IP hashes stored 30 days ago or more, keeping the anonymous event or
 * report. Rows already cleared are left alone, so a second run changes nothing. Returns how many rows it cleared.
 */
export async function clearOldHashes() {
  const [events, reports] = await Promise.all([
    db.$executeRaw`
      UPDATE tag_events SET visitor_hash = NULL, ip_hash = NULL
      WHERE at <= now() - ${HASH_RETENTION_DAYS} * interval '1 day'
        AND (visitor_hash IS NOT NULL OR ip_hash IS NOT NULL)`,
    db.$executeRaw`
      UPDATE photo_reports SET visitor_hash = NULL, ip_hash = NULL
      WHERE created_at <= now() - ${HASH_RETENTION_DAYS} * interval '1 day'
        AND (visitor_hash IS NOT NULL OR ip_hash IS NOT NULL)`,
  ])
  return events + reports
}

/** Hourly step 4 (§5.4): deletes each IP salt 48 hours after its UTC day starts, so its hashes can't be tied to IPs. */
export function deleteOldSalts() {
  return db.$executeRaw`
    DELETE FROM daily_salts
    WHERE day <= ((now() - ${COUNTER_RETENTION_HOURS} * interval '1 hour') AT TIME ZONE 'utc')::date`
}
