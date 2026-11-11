import { PRIMARY, SECONDARY } from './buttons'

/**
 * A final action that asks first: its link reloads the page with `?confirm=<id>`, which shows `question`, and only
 * the question's form posts to `action`. Cancel goes back to `page`.
 */
export function Confirm({
  id,
  label,
  question,
  action,
  page,
  asking,
}: {
  id: string
  label: string
  question: string
  action: string
  page: string
  asking: boolean
}) {
  if (!asking)
    return (
      <a href={`?confirm=${id}#${id}`} className={`${SECONDARY} self-start`}>
        {label}…
      </a>
    )
  return (
    <div id={id} tabIndex={-1} className="flex flex-col gap-2">
      <p className="font-bold">{question}</p>
      <div className="flex flex-wrap gap-2">
        <form method="post" action={action}>
          <button type="submit" className={PRIMARY}>
            {label}
          </button>
        </form>
        <a href={page} className={SECONDARY}>
          Cancel
        </a>
      </div>
    </div>
  )
}
