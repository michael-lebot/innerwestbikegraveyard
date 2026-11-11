/**
 * An error, always in words (§10.2): bold red text after a "!" mark, so even without colour it can't pass for a
 * question's label.
 */
export function ErrorText({ id, children }: { id?: string; children: string }) {
  return (
    <p id={id} className="flex items-start gap-2 font-bold text-error">
      <span
        aria-hidden="true"
        className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-error text-sm text-white"
      >
        !
      </span>
      {children}
    </p>
  )
}
