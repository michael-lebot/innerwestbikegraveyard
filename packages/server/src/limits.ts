// Rate limits (§6): a counter for each rule in LIMITS, counted inside the write's own transaction. Owns rate_counters.
import { AppError, COUNTER_RETENTION_HOURS, LIMITS } from '@iwb/shared'
import { db } from './client'
import type { Prisma } from './generated/prisma/client'
import type { Visitor } from './visitors'

export type Action = keyof typeof LIMITS

/** Each of the action's limits, with its counter's key but for the window's number, and its window in seconds. */
const rules = (action: Action, visitor: Visitor, tagId?: string) =>
  LIMITS[action].map(({ per, max, hours }) => {
    const subject = {
      visitor: visitor.visitorHash,
      ip: visitor.ipHash,
      visitor_and_tag: `${visitor.visitorHash}:${tagId}`,
    }
    // The key is action:scope:hash:window, the window being its length and its number since 1970.
    return { max, seconds: hours * 3600, prefix: `${action}:${per}:${subject[per]}:${hours}h:` }
  })

/**
 * Counts one action against each of its limits, and throws `rate_limited` once any is passed. It runs in the write's
 * transaction, so a refused or failed write takes its counts back, and the counter's row lock makes simultaneous
 * requests take turns: two can't pass a limit together. Windows are fixed UTC buckets (assumption 4).
 */
export async function countAction(tx: Prisma.TransactionClient, action: Action, visitor: Visitor, tagId?: string) {
  for (const { max, seconds, prefix } of rules(action, visitor, tagId)) {
    const [counter] = await tx.$queryRaw<{ count: number; retryAfter: number }[]>`
      WITH bucket AS (SELECT floor(extract(epoch FROM now()) / ${seconds})::bigint AS n)
      INSERT INTO rate_counters (key, count, window_start)
      SELECT ${prefix}::text || n, 1, to_timestamp(n * ${seconds}) FROM bucket
      ON CONFLICT (key) DO UPDATE SET count = rate_counters.count + 1
      RETURNING count, ceil(extract(epoch FROM window_start - now()) + ${seconds})::int AS "retryAfter"`
    if (counter!.count > max) throw new AppError('rate_limited', { retryAfter: counter!.retryAfter })
  }
}

/**
 * Throws `rate_limited` if the action would pass a limit now, counting nothing: a cheap look before costly work, such
 * as decoding a photo. `countAction`, in the write's transaction, stays the rule.
 */
export async function checkLimits(action: Action, visitor: Visitor, tagId?: string) {
  for (const { max, seconds, prefix } of rules(action, visitor, tagId)) {
    const [counter] = await db.$queryRaw<{ count: number; retryAfter: number }[]>`
      SELECT count, ceil(extract(epoch FROM window_start - now()) + ${seconds})::int AS "retryAfter"
      FROM rate_counters WHERE key = ${prefix}::text || floor(extract(epoch FROM now()) / ${seconds})::bigint`
    if (counter && counter.count >= max) throw new AppError('rate_limited', { retryAfter: counter.retryAfter })
  }
}

/** Hourly step 4 (§5.4): deletes each counter 48 hours after its window starts, with the hash in its key. */
export function deleteOldCounters() {
  return db.$executeRaw`
    DELETE FROM rate_counters WHERE window_start <= now() - ${COUNTER_RETENTION_HOURS} * interval '1 hour'`
}
