import { useEffect, useState } from 'react'

import { fetchWeather, type Weather } from '../lib/api'

/**
 * Vieques' current conditions for the greeting card.
 *
 * Failure resolves to `null`, not an error string. The weather is decoration on
 * a card whose job is the greeting and the suggestion — rendering "Weather
 * failed: 503" in the app's chrome would be worse than rendering nothing, so
 * the card simply omits the slot. The backend already serves a stale reading in
 * preference to failing (see /api/weather), so reaching null means the API is
 * properly down.
 *
 * Refreshes on an interval rather than on focus: the backend caches for 10
 * minutes anyway, so a tighter loop only costs requests that return the same
 * bytes.
 */
const REFRESH_MS = 10 * 60_000

export function useWeather(): Weather | null {
  const [weather, setWeather] = useState<Weather | null>(null)

  useEffect(() => {
    let live = true
    const load = () => {
      fetchWeather()
        .then((w) => live && setWeather(w))
        .catch(() => {
          /* decoration — see above */
        })
    }
    load()
    const timer = setInterval(load, REFRESH_MS)
    return () => {
      live = false
      clearInterval(timer)
    }
  }, [])

  return weather
}
