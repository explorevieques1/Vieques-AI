import type { Card, CardFace, CardPosition } from './api'
import { milesBetween } from './geo'

/**
 * Vieques Cards "in collect range" — the client's hint, mirroring the
 * server's own test in backend/cards.js (radius + min(accuracy, 25 m)). The
 * server decides; this only drives the UI (S-4 ②/③, "Choosing a card", S-7).
 * Kept out of the lazy Cards chunks: MapView needs it to choose the banner card.
 */

/** Mirrors backend/cards.js — a fix coarser than this can't claim. */
export const CLAIM_MAX_ACCURACY_M = 50
/** Mirrors backend/cards.js — GPS slack added to the card's radius. */
export const CLAIM_ACCURACY_SLACK_M = 25

const METRES_PER_MILE = 1609.344

/** Metres from your fix to a located card's centre. */
export function metresTo(fix: CardPosition, center: [number, number]): number {
  return milesBetween([fix.lng, fix.lat], center) * METRES_PER_MILE
}

/** Inside the card's collect radius (plus the server's accuracy slack). */
export function inCollectRange(card: Card, fix: CardPosition | null): boolean {
  if (!fix || !card.location) return false
  return (
    metresTo(fix, card.location.center) <=
    card.location.radiusM + Math.min(fix.accuracy, CLAIM_ACCURACY_SLACK_M)
  )
}

/** A card you could collect right now if you were in range: revealed, not
 *  owned, not above your pass, not sold out. */
export function isCollectable(card: Card): boolean {
  return card.location != null && !card.owned && !card.lockedByTier && !card.soldOut
}

/** P-6: the catalog withholds a card's face until it's collected; the claim
 *  response carries it. Merge it in (catalog values stay where it has none). */
export function withFace(card: Card, face: CardFace | undefined): Card {
  if (!face) return card
  return {
    ...card,
    name: face.name ?? card.name,
    lore: face.lore ?? card.lore,
    image: face.image ?? card.image,
  }
}
