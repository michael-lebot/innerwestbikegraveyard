// Every list and tunable number the spec defines, in one place (plan §1.5).

/**
 * Share-bike operators (§4.2). Retire one with `active: false`, never by deleting it: old tags still show it. `email`
 * is where the operator's own website asks for reports in Australia (SPEC Appendix B).
 */
export const OPERATORS = {
  lime: { label: 'Lime', letter: 'L', active: true, email: 'support-au@li.me' },
  hello: { label: 'Hello', letter: 'H', active: true, email: 'support.au@hellobike.com' },
  ario: { label: 'Ario', letter: 'A', active: true, email: 'feedback@ario.com' },
  not_sure: { label: 'Not sure', letter: '?', active: true, email: null },
} as const
export type Operator = keyof typeof OPERATORS

/** The problem pick-list (§4.2). The keys are the database enum `problem`. */
export const PROBLEMS = {
  blocking_footpath: 'Blocking footpath',
  knocked_over: 'Knocked over',
  blocking_ramp: 'Blocking ramp / driveway',
  in_waterway: 'In waterway',
  in_park: 'In park or reserve',
  damaged: 'Damaged',
} as const
export type Problem = keyof typeof PROBLEMS

/** Why a photo was reported (§4.3). The keys are the database enum `report_reason`. */
export const REPORT_REASONS = {
  not_share_bike: 'Not a share bike',
  privacy: 'Shows a person, face or number plate',
  offensive: 'Offensive or inappropriate',
  other: 'Other',
} as const
export type ReportReason = keyof typeof REPORT_REASONS

type Limit = { per: 'visitor' | 'ip' | 'visitor_and_tag'; max: number; hours: number }

/**
 * Starting rate limits (§6): the most one visitor, one IP, or one visitor on one tag may do in a window.
 * One photo per tag is not a counter: `photos.tag_id` is unique.
 */
export const LIMITS = {
  create: [
    { per: 'visitor', max: 5, hours: 1 },
    { per: 'visitor', max: 15, hours: 24 },
    { per: 'ip', max: 40, hours: 24 },
  ],
  photo: [
    { per: 'visitor', max: 10, hours: 24 },
    { per: 'ip', max: 25, hours: 24 },
  ],
  still_there: [
    { per: 'visitor_and_tag', max: 1, hours: 12 },
    { per: 'visitor', max: 30, hours: 24 },
    { per: 'ip', max: 60, hours: 24 },
  ],
  removed: [
    { per: 'visitor', max: 3, hours: 24 },
    { per: 'ip', max: 8, hours: 24 },
  ],
  report: [
    { per: 'visitor', max: 5, hours: 24 },
    { per: 'ip', max: 10, hours: 24 },
  ],
} as const satisfies Record<string, readonly Limit[]>

/** Street types written short, as the card and the map labels write them: "Llewellyn St" (§9). */
export const STREET_TYPES: Record<string, string> = {
  Road: 'Rd',
  Street: 'St',
  Avenue: 'Ave',
  Lane: 'La',
  Parade: 'Pde',
  Place: 'Pl',
  Crescent: 'Cres',
  Highway: 'Hwy',
  Terrace: 'Tce',
  Close: 'Cl',
}

/** Where visitors send feedback, from the footer on every page and the privacy page (§4.7). */
export const FEEDBACK_EMAIL = 'hello@innerwestbikegraveyard.com'
/** A photo upload over this size is refused (§4.3). The browser's re-encoded photos are about 1 MB. */
export const PHOTO_MAX_BYTES = 4 * 1024 * 1024
/** A tag disappears this long after it was last confirmed (§1). */
export const TAG_LIFETIME_HOURS = 48
/** Visitor and IP hashes on events and reports are cleared this long after they were stored (§6). */
export const HASH_RETENTION_DAYS = 30
/** Rate counters and IP salts are deleted this long after their window or their day starts (§6). */
export const COUNTER_RETENTION_HOURS = 48
/** Live tags this close to a new spot are offered as "Is it one of these?" (§4.2). */
export const NEARBY_METERS = 25
/** Tags are accepted this far outside the council boundary (§4.1). */
export const BOUNDARY_BUFFER_METERS = 20
/** A street picked by name (§10.3) is kept for a tag only this close to its spot; past it, the nearest one is. */
export const PICKED_STREET_METERS = 60
/** Use my location proposes a pin only when the position is at least this accurate (§4.1). */
export const LOCATION_ACCURACY_METERS = 50
/** Tapping a pin this close to another opens the "N bikes here" chooser (§4.1). */
export const CROWDED_PIN_PX = 44
/**
 * Placing a tag needs this zoom or closer (§12). It is §12's "zoom 16, about 2 m per screen pixel": §12 counts zoom
 * in 256 px tiles, and MapLibre counts it in 512 px tiles, where 2 m per pixel at Sydney's latitude is zoom 15.
 */
export const PLACEMENT_ZOOM = 15
/** On a phone, a dialog's top edge: below the header and a strip of the map, where the map shows the new pin. */
export const DIALOG_TOP_REM = 8
/** A visible page refreshes its tags this often (§11.3). */
export const REFRESH_MINUTES = 5
/** Reports emailed one by one each day, before the hourly digest takes over (§4.6). */
export const REPORT_EMAILS_PER_DAY = 10
/** More reports than this in an hour, site-wide, pause photo uploads (§4.6). */
export const CIRCUIT_BREAKER_REPORTS_PER_HOUR = 15
