import { type AdminTagEvent, dateTime } from '@iwb/shared'
import { CELL, Table } from './Table'

const EVENTS = {
  created: 'Created',
  still_there: 'Still there',
  removed: 'Removed',
  restored: 'Undone by admin',
  taken_down: 'Taken down by admin',
}

const COLUMNS = ['Event', 'Time', 'Visitor', 'Their actions that day', 'IP', 'Its actions that day']

/** Enough of a hash to tell visitors apart on one screen. Admin actions have none, and others lose theirs at 30 days. */
const short = (hash: string | null) => hash?.slice(0, 8) ?? 'None'

/** A tag's events, each with how many actions its hashed visitor and IP made that day (§4.6). */
export function EventTable({ label, events }: { label: string; events: AdminTagEvent[] }) {
  return (
    <>
      <p className="mt-1 text-sm text-muted">
        Hashes are shortened. Actions are counted on any tag, over the UTC day of the event.
      </p>
      <Table label={label} columns={COLUMNS}>
        {events.map((event, i) => (
          <tr key={i} className="border-b border-line">
            <td className={CELL}>{EVENTS[event.type]}</td>
            <td className={CELL}>{dateTime(event.at)}</td>
            <td className={`${CELL} font-mono`}>{short(event.visitorHash)}</td>
            <td className={CELL}>{event.visitorHash && event.visitorActions}</td>
            <td className={`${CELL} font-mono`}>{short(event.ipHash)}</td>
            <td className={CELL}>{event.ipHash && event.ipActions}</td>
          </tr>
        ))}
      </Table>
    </>
  )
}
