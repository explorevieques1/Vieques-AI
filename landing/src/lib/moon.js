// Moon phase for the homepage Bio Bay card.
//
// Mosquito Bay's bioluminescence is only visible in real darkness, so the
// moon is the main thing a visitor needs to plan around. This is a plain
// synodic-month approximation (accurate to within about a day), which is
// fine for "is this a good week" — not for astronomy.

const SYNODIC_DAYS = 29.530588853
// A known new moon: 2000-01-06 18:14 UTC.
const KNOWN_NEW_MOON_MS = Date.UTC(2000, 0, 6, 18, 14)
const DAY_MS = 86400000

/** Returns { age, illumination, name } for the given date. */
export function moonPhase(date = new Date()) {
  const days = (date.getTime() - KNOWN_NEW_MOON_MS) / DAY_MS
  const age = ((days % SYNODIC_DAYS) + SYNODIC_DAYS) % SYNODIC_DAYS // 0..29.53
  const fraction = age / SYNODIC_DAYS // 0 = new, 0.5 = full
  const illumination = (1 - Math.cos(2 * Math.PI * fraction)) / 2 // 0..1

  const names = [
    'New moon', 'Waxing crescent', 'First quarter', 'Waxing gibbous',
    'Full moon', 'Waning gibbous', 'Last quarter', 'Waning crescent',
  ]
  const name = names[Math.round(fraction * 8) % 8]

  return { age, fraction, illumination, name }
}

/**
 * The homepage Bio Bay card's one-line advice for tonight.
 * Returns { good: boolean, label: string } — `good` turns the pill turquoise.
 * Returning null hides the pill entirely (the card still shows the phase).
 *
 * Available: moonPhase(date) → { age (days 0–29.5), fraction (0 new → 0.5 full),
 * illumination (0–1), name }, and daysToNewMoon(date).
 */
export function bioBayVerdict(date = new Date()) {
  // TODO(human): decide what counts as a good bio bay night, and what to tell
  // people on the nights that aren't.
  return null
}

/** Days until the next new moon (0 if it is one today). */
export function daysToNewMoon(date = new Date()) {
  const { age } = moonPhase(date)
  return Math.round(SYNODIC_DAYS - age) % Math.round(SYNODIC_DAYS)
}
