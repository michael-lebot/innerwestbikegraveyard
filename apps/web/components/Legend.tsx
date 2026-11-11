import { OPERATORS, type Operator, type PublicTag } from '@iwb/shared'
import { PinIcon } from './PinIcon'

/** The operator key: each operator's pin and how many of its bikes are live, once the tags have arrived. */
export function Legend({ tags }: { tags?: PublicTag[] }) {
  return (
    <ul aria-label="Key" className="flex flex-wrap gap-x-3.5 gap-y-1 text-sm">
      {(Object.keys(OPERATORS) as Operator[]).map((operator) => (
        <li key={operator} className="flex items-center gap-1.5">
          <PinIcon operator={operator} scale={1} />
          {OPERATORS[operator].label}{' '}
          {/* As wide before the count arrives as after, so the key can't rewrap when it does. */}
          <span className="min-w-[2ch]">{tags?.filter((tag) => tag.operator === operator).length}</span>
        </li>
      ))}
    </ul>
  )
}
