// ============================================================================
//  moonCalendar.js — new/full moon dates for the /bio-bay calendar ("bio bay calendar",
//  "best time to see the bio bay" are among the island's top searches, and no
//  page answers them with actual dates).
// ============================================================================
//  Jean Meeus, Astronomical Algorithms (2nd ed.), ch. 49 — the periodic terms
//  down to 0.00017 days, which puts each phase within a few minutes. Plenty:
//  the page only ever shows a calendar DATE in Puerto Rico time.
//
//  Deterministic on purpose: the page passes a fixed start date (the build
//  date, see __BUILD_DATE__ in vite.config.js), so the pre-rendered HTML and
//  the browser's hydration compute the identical calendar. Calling new Date()
//  here would make them disagree for anyone reading after the build day.
// ============================================================================

const RAD = Math.PI / 180
const PR_OFFSET_H = -4 // Atlantic Standard Time, no daylight saving

function phaseJDE(k, full) {
  const T = k / 1236.85
  const jde = 2451550.09766 + 29.530588861 * k + 0.00015437 * T ** 2 - 0.00000015 * T ** 3 + 0.00000000073 * T ** 4
  const E = 1 - 0.002516 * T - 0.0000074 * T ** 2
  const M = (2.5534 + 29.1053567 * k - 0.0000014 * T ** 2 - 0.00000011 * T ** 3) * RAD
  const Mp = (201.5643 + 385.81693528 * k + 0.0107582 * T ** 2 + 0.00001238 * T ** 3 - 0.000000058 * T ** 4) * RAD
  const F = (160.7108 + 390.67050284 * k - 0.0016118 * T ** 2 - 0.00000227 * T ** 3 + 0.000000011 * T ** 4) * RAD
  const Om = (124.7746 - 1.56375588 * k + 0.0020672 * T ** 2 + 0.00000215 * T ** 3) * RAD
  const s = Math.sin
  const c = full
    ? [-0.40614, 0.17302, 0.01614, 0.01043, 0.00734, -0.00515, 0.00209]
    : [-0.4072, 0.17241, 0.01608, 0.01039, 0.00739, -0.00514, 0.00208]
  return jde
    + c[0] * s(Mp) + c[1] * E * s(M) + c[2] * s(2 * Mp) + c[3] * s(2 * F)
    + c[4] * E * s(Mp - M) + c[5] * E * s(Mp + M) + c[6] * E * E * s(2 * M)
    - 0.00111 * s(Mp - 2 * F) - 0.00057 * s(Mp + 2 * F) + 0.00056 * E * s(2 * Mp + M)
    - 0.00042 * s(3 * Mp) + 0.00042 * E * s(M + 2 * F) + 0.00038 * E * s(M - 2 * F)
    - 0.00024 * E * s(2 * Mp - M) - 0.00017 * s(Om)
}

// Julian ephemeris day → 'YYYY-MM-DD' in Puerto Rico.
const jdToPRDate = (jd) => new Date((jd - 2440587.5) * 864e5 + PR_OFFSET_H * 36e5).toISOString().slice(0, 10)

const addDays = (iso, n) => {
  const d = new Date(iso + 'T12:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/**
 * Lunar months from the month containing `startIso`, for `months` months.
 * Each entry: { month: 'YYYY-MM', newMoon, darkFrom, darkTo, fullMoon, closedFrom, closedTo }
 *  - dark window   = new moon ±3 nights: no moon in the sky during evening tours.
 *  - closed window = full moon ±1 night: most Mosquito Bay operators don't run.
 * Rows are keyed by the month the NEW moon falls in (a few months have two
 * full moons; the second shows up in the next row's fullMoon).
 */
export function bioBayCalendar(startIso, months = 13) {
  const [y, m] = startIso.split('-').map(Number)
  let k = Math.floor((y + (m - 1) / 12 - 2000) * 12.3685) - 1
  const out = []
  const first = `${startIso.slice(0, 7)}`
  while (out.length < months) {
    const newMoon = jdToPRDate(phaseJDE(k, false))
    const fullMoon = jdToPRDate(phaseJDE(k + 0.5, true))
    k += 1
    if (newMoon.slice(0, 7) < first) continue
    out.push({
      month: newMoon.slice(0, 7),
      newMoon, darkFrom: addDays(newMoon, -3), darkTo: addDays(newMoon, 3),
      fullMoon, closedFrom: addDays(fullMoon, -1), closedTo: addDays(fullMoon, 1),
    })
  }
  return out
}

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const MONTH = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

/** 'YYYY-MM-DD' → 'Nov 9' */
export const shortDate = (iso) => `${MON[+iso.slice(5, 7) - 1]} ${+iso.slice(8, 10)}`
/** 'YYYY-MM' → 'November 2026' */
export const monthName = (ym) => `${MONTH[+ym.slice(5, 7) - 1]} ${ym.slice(0, 4)}`
/** Two dates → 'Nov 6–12' or 'Nov 29 – Dec 1' */
export function dateRange(a, b) {
  return a.slice(0, 7) === b.slice(0, 7) ? `${shortDate(a)}–${+b.slice(8, 10)}` : `${shortDate(a)} – ${shortDate(b)}`
}
