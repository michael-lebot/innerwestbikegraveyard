// The visitor's Reduce motion choice (§10.5). The footer's switch keeps it in localStorage, never in a cookie, so it
// never reaches the server, and on <html> as data-reduce-motion, where globals.css's motion variants and the map read
// it. With no choice, the OS setting decides.

const KEY = 'reduce-motion'
const OS_REDUCES = '(prefers-reduced-motion: reduce)'

/** Run in <head> before the first paint (layout.tsx), so a stored choice never shows a frame of motion. */
export const RESTORE_CHOICE = `try{const c=localStorage.getItem('${KEY}');if(c)document.documentElement.dataset.reduceMotion=c}catch{}`

/** Whether motion is reduced: by the visitor's choice, or else by the OS. */
export function reducesMotion() {
  const choice = document.documentElement.dataset.reduceMotion
  return choice === 'true' || (choice !== 'false' && matchMedia(OS_REDUCES).matches)
}

/** The visitor's choice: it applies at once, and on every later visit in this browser. */
export function chooseReduceMotion(reduce: boolean) {
  document.documentElement.dataset.reduceMotion = String(reduce)
  try {
    localStorage.setItem(KEY, String(reduce))
  } catch {
    // Storage switched off: the choice lasts until the page is left.
  }
}

/** Calls back whenever either the choice or the OS setting changes. */
export function onMotionChange(callback: () => void) {
  const os = matchMedia(OS_REDUCES)
  const choice = new MutationObserver(callback)
  os.addEventListener('change', callback)
  choice.observe(document.documentElement, { attributeFilter: ['data-reduce-motion'] })
  return () => {
    os.removeEventListener('change', callback)
    choice.disconnect()
  }
}
