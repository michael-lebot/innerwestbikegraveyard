import { FOCUS_RING_WITHIN } from './buttons'
import { ErrorText } from './ErrorText'

/** One question as native radios in a fieldset, drawn as 44 px chips with a tick and a tint when chosen (§10.4). */
export function Chips<K extends string>({
  legend,
  name,
  choices,
  value,
  error,
  onChange,
}: {
  legend: string
  name: string
  choices: readonly (readonly [K, string])[]
  value?: K
  error?: string
  onChange: (value: K) => void
}) {
  return (
    <fieldset aria-describedby={error ? `${name}-error` : undefined} className="flex flex-col gap-2">
      <legend className="mb-2 text-sm font-bold">{legend}</legend>
      {error && <ErrorText id={`${name}-error`}>{error}</ErrorText>}
      <div className="flex flex-wrap gap-2">
        {choices.map(([key, label]) => (
          <label
            key={key}
            className={`flex min-h-11 cursor-pointer items-center gap-1.5 rounded-[10px] border border-edge px-3 has-checked:border-2 has-checked:border-brand has-checked:bg-tint has-checked:font-bold ${FOCUS_RING_WITHIN}`}
          >
            <input
              type="radio"
              name={name}
              value={key}
              checked={value === key}
              onChange={() => onChange(key)}
              className="peer sr-only"
            />
            <span aria-hidden="true" className="hidden text-brand peer-checked:inline">
              ✓
            </span>
            {label}
          </label>
        ))}
      </div>
    </fieldset>
  )
}
