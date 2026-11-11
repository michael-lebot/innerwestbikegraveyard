// The interface's buttons (§9): the one green primary action on a screen, and outlined secondary ones, 48 px tall.
export const PRIMARY = 'flex min-h-12 items-center justify-center rounded-[10px] bg-brand px-4 font-bold text-white'
export const SECONDARY = 'flex min-h-12 items-center justify-center rounded-[10px] border border-edge px-4 font-bold'
/** A smaller outlined one, 44 px tall, beside a heading or a line: Close, Cancel and Change location. */
export const SMALL = 'min-h-11 rounded-[10px] border border-edge px-4 font-bold'
/** Hover draws the keyboard focus ring, and nothing else (§13): on list rows, the street picker's choices and pins. */
export const FOCUS_RING_ON_HOVER =
  'hover:outline-3 hover:outline-offset-2 hover:outline-focus hover:shadow-[0_0_0_2px_white]'
/** On a label around a visually hidden input, the focus ring the input would have: on the chips and the photo button. */
export const FOCUS_RING_WITHIN =
  'has-focus-visible:outline-3 has-focus-visible:outline-offset-2 has-focus-visible:outline-focus has-focus-visible:shadow-[0_0_0_2px_white]'
