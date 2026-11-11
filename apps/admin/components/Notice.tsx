/** What each admin action's ?notice= says (lib/action.ts). */
const NOTICES: Record<string, string> = {
  undone: 'Undone: the tag is live again, with the time it had left.',
  expired: "Expired, can't undo: its time ran out.",
  not_removed: "Nothing to undo: the tag isn't removed.",
  taken_down: 'Taken down. It is off the map for good.',
  already_down: 'It was already taken down.',
  restored: "Restored: the photo shows while its tag is live, and later reports won't hide it.",
  not_restored: "Can't restore it: the photo has been deleted.",
  deleted: 'Deleted: the photo and its files are gone for good.',
}

/** The line saying how the action just posted went, from the page's ?notice=. */
export function Notice({ code }: { code: string | string[] | undefined }) {
  const notice = typeof code === 'string' && NOTICES[code]
  return notice ? <p className="mt-2 rounded-[10px] bg-tint p-3 font-bold">{notice}</p> : null
}
