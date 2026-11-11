// Every error a visitor can cause, with its HTTP status and the message they see (plan §1.6).

export const ERRORS = {
  invalid: { status: 400, message: 'Something was wrong with that request.' },
  bot: { status: 403, message: "We couldn't check your browser. Reload the page and try again." },
  not_allowed: { status: 403, message: 'Only the person who tagged this bike can add its photo.' },
  not_found: { status: 404, message: 'Not found.' },
  conflict: { status: 409, message: 'That request clashed with another. Reload and try again.' },
  uploads_paused: { status: 409, message: 'Photos are switched off for now. Your tag can still be added.' },
  tag_gone: { status: 410, message: 'This tag has already gone.' },
  photo_gone: { status: 410, message: 'This photo has already gone.' },
  too_large: { status: 413, message: 'That photo is too big. Try a smaller one.' },
  outside_area: { status: 422, message: 'That spot is outside the Inner West.' },
  bad_image: { status: 422, message: "That file isn't a photo we can use." },
  rate_limited: { status: 429, message: "You've reached the limit for now. Try again later." },
} as const
export type ErrorCode = keyof typeof ERRORS

/** What the browser shows for anything else: a 500, a dropped connection or a timeout. */
export const SEND_FAILED = "Couldn't send. Check your connection and try again."

export class AppError extends Error {
  readonly code: ErrorCode
  /** For `rate_limited`: the seconds until the limit's window ends, sent as `Retry-After`. */
  readonly retryAfter?: number

  constructor(code: ErrorCode, options?: { retryAfter: number }) {
    super(ERRORS[code].message)
    this.name = 'AppError'
    this.code = code
    this.retryAfter = options?.retryAfter
  }
}
