import { useCallback, useEffect, useState } from 'react'

import {
  createTrip, deleteTrip, fetchTrip, fetchTrips, mutateTripItem, updateTrip,
  ApiError, type Trip, type TripDetail, type TripInput,
} from '../lib/api'
import { placeSnapshot, type Place } from '../lib/place'

/**
 * The user's trips.
 *
 * Optimistic in the same places useFavorites is and for the same reason: on one
 * bar of LTE a planner that waits for a round trip before showing a change
 * reads as broken. Failure rolls back and surfaces a sentence rather than
 * leaving a lie on screen.
 *
 * Item mutations are the exception — they are NOT optimistic. The server
 * returns the whole refreshed TripDetail, which is what the map needs to redraw
 * pins; reconstructing that locally would duplicate the sort_order logic in the
 * route for no gain on an action that happens once per place.
 *
 * A failed load resolves to an empty list, not an error screen. The planner is
 * additive: a user who cannot reach it still has the whole map.
 */
export type Itineraries = {
  trips: Trip[]
  loading: boolean
  activeTrip: TripDetail | null
  activeLoading: boolean
  error: string | null
  open: (id: string) => Promise<void>
  close: () => void
  create: (input: TripInput) => Promise<Trip | null>
  rename: (id: string, input: Partial<TripInput>) => Promise<boolean>
  remove: (id: string) => Promise<boolean>
  addPlace: (tripId: string, place: Place, dayIndex: number | null) => Promise<boolean>
  movePlace: (placeId: string, dayIndex: number | null) => Promise<boolean>
  removePlace: (placeId: string) => Promise<boolean>
  clearError: () => void
}

/** Pull a readable sentence out of whatever the API threw. */
function messageOf(e: unknown, fallback: string): string {
  if (e instanceof ApiError && e.message) return e.message
  return fallback
}

export function useItineraries(): Itineraries {
  const [trips, setTrips] = useState<Trip[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTrip, setActiveTrip] = useState<TripDetail | null>(null)
  const [activeLoading, setActiveLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    fetchTrips()
      .then((t) => live && setTrips(t))
      .catch(() => {
        /* empty list is the right fallback — see the note above */
      })
      .finally(() => live && setLoading(false))
    return () => {
      live = false
    }
  }, [])

  const clearError = useCallback(() => setError(null), [])

  const open = useCallback(async (id: string) => {
    setActiveLoading(true)
    setError(null)
    try {
      setActiveTrip(await fetchTrip(id))
    } catch (e) {
      setError(messageOf(e, 'Could not open that trip.'))
      setActiveTrip(null)
    } finally {
      setActiveLoading(false)
    }
  }, [])

  const close = useCallback(() => {
    setActiveTrip(null)
    setError(null)
  }, [])

  const create = useCallback(async (input: TripInput) => {
    setError(null)
    try {
      const t = await createTrip(input)
      setTrips((prev) => [t, ...prev])
      return t
    } catch (e) {
      setError(messageOf(e, 'Could not create the trip.'))
      return null
    }
  }, [])

  const rename = useCallback(async (id: string, input: Partial<TripInput>) => {
    const before = trips
    // Both trips and activeTrip get the optimistic edit, so both must roll
    // back together on failure — otherwise the detail header (which renders
    // from activeTrip) keeps showing the new name after the list has already
    // reverted to the old one, which is exactly the "lie on screen" this
    // hook's optimistic updates are meant to avoid.
    const beforeActive = activeTrip
    // Optimistic: the header should show the new name as the sheet closes.
    setTrips((prev) => prev.map((t) => (t.id === id ? { ...t, ...input } as Trip : t)))
    setActiveTrip((a) => (a && a.id === id ? { ...a, ...input } as TripDetail : a))
    try {
      const t = await updateTrip(id, input)
      setTrips((prev) => prev.map((p) => (p.id === id ? t : p)))
      setActiveTrip((a) => (a && a.id === id ? { ...a, ...t } : a))
      return true
    } catch (e) {
      setTrips(before)
      setActiveTrip(beforeActive)
      setError(messageOf(e, 'Could not save the trip.'))
      return false
    }
  }, [trips, activeTrip])

  const remove = useCallback(async (id: string) => {
    const before = trips
    // Same reasoning as rename: activeTrip is optimistically cleared below,
    // so it must be restored alongside trips on failure, or a failed delete
    // silently closes the trip the user was looking at even though it
    // still exists on the server.
    const beforeActive = activeTrip
    setTrips((prev) => prev.filter((t) => t.id !== id))
    setActiveTrip((a) => (a && a.id === id ? null : a))
    try {
      await deleteTrip(id)
      return true
    } catch (e) {
      setTrips(before)
      setActiveTrip(beforeActive)
      setError(messageOf(e, 'Could not delete the trip.'))
      return false
    }
  }, [trips, activeTrip])

  /** Apply a server-returned detail to both the active trip and the list count. */
  const applyDetail = useCallback((detail: TripDetail) => {
    setActiveTrip((a) => (a && a.id === detail.id ? detail : a))
    setTrips((prev) =>
      prev.map((t) =>
        t.id === detail.id
          ? { ...t, itemCount: detail.items.length, updatedAt: detail.updatedAt }
          : t,
      ),
    )
  }, [])

  const addPlace = useCallback(
    async (tripId: string, place: Place, dayIndex: number | null) => {
      setError(null)
      try {
        applyDetail(
          await mutateTripItem(tripId, {
            action: 'add',
            placeId: place.id,
            dayIndex,
            snapshot: placeSnapshot(place),
          }),
        )
        return true
      } catch (e) {
        setError(messageOf(e, 'Could not add that place.'))
        return false
      }
    },
    [applyDetail],
  )

  const movePlace = useCallback(
    async (placeId: string, dayIndex: number | null) => {
      if (!activeTrip) return false
      setError(null)
      try {
        applyDetail(
          await mutateTripItem(activeTrip.id, { action: 'move', placeId, dayIndex }),
        )
        return true
      } catch (e) {
        setError(messageOf(e, 'Could not move that place.'))
        return false
      }
    },
    [activeTrip, applyDetail],
  )

  const removePlace = useCallback(
    async (placeId: string) => {
      if (!activeTrip) return false
      setError(null)
      try {
        applyDetail(
          await mutateTripItem(activeTrip.id, { action: 'remove', placeId }),
        )
        return true
      } catch (e) {
        setError(messageOf(e, 'Could not remove that place.'))
        return false
      }
    },
    [activeTrip, applyDetail],
  )

  return {
    trips, loading, activeTrip, activeLoading, error,
    open, close, create, rename, remove,
    addPlace, movePlace, removePlace, clearError,
  }
}
