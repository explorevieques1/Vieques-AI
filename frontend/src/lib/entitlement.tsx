// ============================================================================
//  entitlement.tsx — who the current user is, and what their plan unlocks
// ============================================================================
//
//  AccessGate used to fetch the entitlement, read one boolean off it, and throw
//  the rest away. With a tier ladder, every gated surface needs the answer, so
//  it lives in context instead.
//
//  IMPORTANT — this is a UX layer, not a security boundary. Everything here is
//  advisory: a determined user can flip these booleans in DevTools. Real
//  enforcement is server-side (requireTier / requireCredits in
//  backend/middleware.js) and in Postgres RLS (0022_tier_rls.sql). The job of
//  this file is to avoid pointless 402s and to show the right upsell — never to
//  be the thing that stops someone.
//
//  Usage:
//      const { tier, credits, refresh } = useEntitlement()
//      const canSnorkel = useFeature('snorkel_zones')
// ============================================================================

import {
  createContext, useCallback, useContext, useEffect, useMemo, useState,
  type ReactNode,
} from 'react'
import { fetchEntitlement, FREE_ENTITLEMENT, type Entitlement } from './api'

type EntitlementContextValue = Entitlement & {
  /** Re-read entitlement from the server (after spending a credit, say). */
  refresh: () => Promise<void>
  /** True while the first fetch is still in flight. */
  loading: boolean
}

const EntitlementContext = createContext<EntitlementContextValue | null>(null)

export function EntitlementProvider({
  children,
  initial,
}: {
  children: ReactNode
  /** Seed from AccessGate's fetch so we don't request entitlement twice on boot. */
  initial?: Entitlement
}) {
  const [ent, setEnt] = useState<Entitlement>(initial ?? FREE_ENTITLEMENT)
  const [loading, setLoading] = useState(!initial)

  const refresh = useCallback(async () => {
    try {
      setEnt(await fetchEntitlement())
    } catch {
      // Fail closed: on a network blip keep whatever we already had rather than
      // upgrading the user to something they didn't buy.
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!initial) void refresh()
  }, [initial, refresh])

  const value = useMemo(() => ({ ...ent, refresh, loading }), [ent, refresh, loading])

  return <EntitlementContext.Provider value={value}>{children}</EntitlementContext.Provider>
}

export function useEntitlement(): EntitlementContextValue {
  const ctx = useContext(EntitlementContext)
  if (!ctx) throw new Error('useEntitlement must be used inside <EntitlementProvider>')
  return ctx
}

/**
 * Does the current plan include a feature?
 *
 * Slugs must match FEATURES in backend/payments.js — e.g. 'snorkel_zones',
 * 'beach_profiles', 'directions', 'itinerary'.
 */
export function useFeature(slug: string): boolean {
  const { features } = useEntitlement()
  return features.includes(slug)
}

/** Human-facing plan names, for upsell copy. Mirrors PLAN_LABELS on the landing. */
export const TIER_LABELS: Record<string, string> = {
  free: 'Free',
  day_trip: 'Day Trip',
  vacation: 'Vacation',
  exploration: 'Exploration',
}

/** Feature slugs in the order the profile page lists them, with plain labels. */
export const FEATURE_LABELS: [string, string][] = [
  ['beach_profiles', 'Full beach profiles'],
  ['restaurants', 'All restaurant listings'],
  ['essentials', 'Essentials — pharmacy, gas, ATM'],
  ['transport', 'Ferry, taxi & rentals'],
  ['activities', 'Activities & tour operators'],
  ['filters', 'Smart filters'],
  ['directions', 'Turn-by-turn directions'],
  ['road_conditions', 'Road-condition warnings'],
  ['snorkel_zones', 'Snorkeling zone maps'],
  ['snorkel_detail', 'Snorkel spot detail'],
  ['biobay_guide', 'Bio Bay moon-phase guide'],
  ['ai_chat', 'Ask AI'],
  ['ai_history', 'Saved conversations'],
  ['favorites', 'Save favorites'],
  ['itinerary', 'Multi-day itinerary builder'],
  ['itinerary_export', 'Export itinerary'],
  ['offline_maps', 'Offline map pack'],
]

/**
 * The cheapest plan that unlocks a feature — so an upsell can say "Vacation"
 * instead of a vague "upgrade". Mirrors the FEATURES table in payments.js;
 * keep in sync when a feature moves between tiers.
 */
export const FEATURE_MIN_TIER: Record<string, string> = {
  beach_profiles: 'day_trip',
  restaurants: 'day_trip',
  essentials: 'day_trip',
  transport: 'day_trip',
  activities: 'day_trip',
  filters: 'day_trip',
  directions: 'day_trip',
  road_conditions: 'day_trip',
  favorites: 'day_trip',
  snorkel_zones: 'vacation',
  snorkel_detail: 'vacation',
  biobay_guide: 'vacation',
  ai_chat: 'vacation',
  ai_history: 'vacation',
  itinerary: 'exploration',
  itinerary_export: 'exploration',
  offline_maps: 'exploration',
}
