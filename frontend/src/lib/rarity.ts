/**
 * Vieques Cards — the one rarity map (docs/CARD_UI_SPEC.md T-1, X-2).
 *
 * Every Cards surface (card faces, pins, labels, the reveal, the grid) reads
 * rarity colour, label, foil and sound from here, so a rarity never looks
 * different in two places. Colours are CSS tokens only (`--color-rarity-*` in
 * index.css `@theme`); nothing here is a raw colour.
 */

export type Rarity = 'common' | 'basic' | 'rare' | 'legendary'

/** Display order, commonest first (filters, tallies, the preview). */
export const RARITIES: readonly Rarity[] = ['common', 'basic', 'rare', 'legendary']

/** HoloCard foil presets used by Cards (a subset of the component's PRESETS). */
export type HoloPreset = 'glitter' | 'shards' | 'cosmos' | 'gold'

/** Which vendored React Bits sound plays when this rarity is collected (S-5). */
export type CollectSound = 'coin' | 'treasure'

export type RarityStyle = {
  /** Word shown with the colour, never colour alone ("RARE"). */
  label: string
  /** Tailwind theme token, for `var(...)` in inline styles. */
  token: `--color-rarity-${Rarity}`
  /** The raw custom property on `.dark` that the token points at; canvas
   *  drawing (lib/cardFace.ts) resolves this off the document. */
  cssVar: `--rarity-${Rarity}`
  /** Literal class names so Tailwind generates them. */
  textClass: string
  borderClass: string
  bgClass: string
  /** HoloCard `preset` + `intensity` (Card UI Mapping p.13). */
  holo: { preset: HoloPreset; intensity: number }
  /** Legendary also gets ElectricBorder on the opened card (S-5). */
  electricBorder: boolean
  sound: CollectSound
  /** Leaderboard points — mirrors RARITY_POINTS in backend/cards.js. */
  points: number
}

export const RARITY: Record<Rarity, RarityStyle> = {
  common: {
    label: 'Common',
    token: '--color-rarity-common',
    cssVar: '--rarity-common',
    textClass: 'text-rarity-common',
    borderClass: 'border-rarity-common',
    bgClass: 'bg-rarity-common',
    holo: { preset: 'glitter', intensity: 0.25 },
    electricBorder: false,
    sound: 'coin',
    points: 1,
  },
  basic: {
    label: 'Basic',
    token: '--color-rarity-basic',
    cssVar: '--rarity-basic',
    textClass: 'text-rarity-basic',
    borderClass: 'border-rarity-basic',
    bgClass: 'bg-rarity-basic',
    holo: { preset: 'shards', intensity: 0.45 },
    electricBorder: false,
    sound: 'coin',
    points: 2,
  },
  rare: {
    label: 'Rare',
    token: '--color-rarity-rare',
    cssVar: '--rarity-rare',
    textClass: 'text-rarity-rare',
    borderClass: 'border-rarity-rare',
    bgClass: 'bg-rarity-rare',
    holo: { preset: 'cosmos', intensity: 0.75 },
    electricBorder: false,
    sound: 'coin',
    points: 5,
  },
  legendary: {
    label: 'Legendary',
    token: '--color-rarity-legendary',
    cssVar: '--rarity-legendary',
    textClass: 'text-rarity-legendary',
    borderClass: 'border-rarity-legendary',
    bgClass: 'bg-rarity-legendary',
    holo: { preset: 'gold', intensity: 0.95 },
    electricBorder: true,
    sound: 'treasure',
    points: 10,
  },
}

/** Unknown strings from the API fall back to common rather than crashing. */
export function rarityOf(value: string | null | undefined): Rarity {
  return value && value in RARITY ? (value as Rarity) : 'common'
}

/** `var(--color-rarity-rare)` — for inline styles. */
export function rarityColor(r: Rarity): string {
  return `var(${RARITY[r].token})`
}

// --- Geometry (X-2) ----------------------------------------------------------

/** Card map pin (S-3): a tiny card, trading-card proportions. */
export const CARD_PIN_W = 26
export const CARD_PIN_H = 36
/** Selected pin, lifted (`marker-lift`). */
export const CARD_PIN_SELECTED_W = 34
export const CARD_PIN_SELECTED_H = 47
export const CARD_PIN_RADIUS = 5
export const CARD_PIN_RIM = 1.5
