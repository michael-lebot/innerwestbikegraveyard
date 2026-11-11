/** Padding for each cell of a Table. */
export const CELL = 'py-2 pr-4'

/**
 * A table that scrolls sideways inside its own region on a phone, not the page, with each row on one line. tabIndex
 * lets the keyboard scroll it.
 */
export function Table({ label, columns, children }: { label: string; columns: string[]; children: React.ReactNode }) {
  return (
    <div role="region" aria-label={label} tabIndex={0} className="mt-2 overflow-x-auto">
      <table className="text-left text-sm whitespace-nowrap">
        <thead>
          <tr className="border-b border-edge">
            {columns.map((column) => (
              <th key={column} scope="col" className={CELL}>
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  )
}
