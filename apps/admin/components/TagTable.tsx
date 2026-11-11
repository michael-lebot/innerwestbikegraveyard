import { type AdminTag, dateTime, OPERATORS, PROBLEMS, type TagStatus } from '@iwb/shared'
import Link from 'next/link'
import { CELL, Table } from './Table'

/** A tag's status in words, here and on its own screen. */
export const STATUS: Record<TagStatus, string> = { active: 'Active', removed: 'Removed', taken_down: 'Taken down' }

const COLUMNS = ['Street', 'Suburb', 'Status', 'Live', 'Operator', 'Problem', 'Created', 'Removed', 'Expires']

/** Tags in a table, each street a link to that tag's own screen. */
export function TagTable({ label, tags }: { label: string; tags: AdminTag[] }) {
  return (
    <Table label={label} columns={COLUMNS}>
      {tags.map((tag) => (
        <tr key={tag.id} className="border-b border-line">
          <td className={CELL}>
            <Link href={`/tags/${tag.id}`} className="inline-flex min-h-11 items-center underline underline-offset-2">
              {tag.street}
            </Link>
          </td>
          <td className={CELL}>{tag.suburb}</td>
          <td className={CELL}>{STATUS[tag.status]}</td>
          <td className={CELL}>{tag.live ? 'Yes' : 'No'}</td>
          <td className={CELL}>{OPERATORS[tag.operator].label}</td>
          <td className={CELL}>{PROBLEMS[tag.problem]}</td>
          <td className={CELL}>{dateTime(tag.createdAt)}</td>
          <td className={CELL}>{tag.removedAt && dateTime(tag.removedAt)}</td>
          <td className={CELL}>{dateTime(tag.expiresAt)}</td>
        </tr>
      ))}
    </Table>
  )
}
