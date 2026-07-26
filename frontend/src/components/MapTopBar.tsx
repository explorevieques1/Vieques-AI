import { Sparkles, User } from 'lucide-react'

import { CATEGORIES, type CategorySlug } from '../lib/place'
import { LANDING_URL } from '../lib/api'
import { TIER_LABELS, useEntitlement } from '../lib/entitlement'

type Props = {
  active: CategorySlug | null
  onSelect: (slug: CategorySlug) => void
  onAskAi: () => void
  aiOpen: boolean
  onDirections: () => void
  dirOpen: boolean
  onProfile: () => void
  profileOpen: boolean
}

/**
 * The floating chrome across the top of the map: brand lockup, category pills,
 * and the AI / profile actions.
 *
 * This used to be a solid `<header>` above the map in App.tsx. Floating it lets
 * the map run full-bleed behind — the map is the product, so it gets the whole
 * viewport and the controls hover over it.
 *
 * Below `lg` the pills drop to their own scrollable row. `w-max mx-auto` rather
 * than `justify-center`: inside an overflow-x-auto parent, justify-center clips
 * the START of content wider than the container and no scrolling gets it back.
 */
function MapTopBar({
  active,
  onSelect,
  onAskAi,
  aiOpen,
  onDirections,
  dirOpen,
  onProfile,
  profileOpen,
}: Props) {
  const { tier, hasAccess, credits } = useEntitlement()

  const pill = 'shrink-0 rounded-xl px-4 py-2 text-sm transition-colors whitespace-nowrap'
  const pillOn = `${pill} bg-primary text-primary-foreground font-semibold`
  const pillOff = `${pill} text-muted-foreground hover:bg-white/5 hover:text-foreground`

  const action = 'rounded-xl px-3 py-2 text-sm transition-colors whitespace-nowrap'
  const actionOn = `${action} bg-primary text-primary-foreground font-semibold`
  const actionOff = `${action} text-muted-foreground hover:bg-white/5 hover:text-foreground`

  const tabs = (
    <nav className="flex w-max gap-1">
      {CATEGORIES.map((c) => (
        <button
          key={c.slug}
          onClick={() => onSelect(c.slug)}
          className={active === c.slug ? pillOn : pillOff}
        >
          {c.label}
        </button>
      ))}
    </nav>
  )

  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-30 pad-safe-top pad-safe-x">
      <div className="flex items-start justify-between gap-3 p-4 sm:p-5">
        {/* Brand */}
        <div className="glass pointer-events-auto flex shrink-0 items-center gap-3 rounded-2xl py-2 pl-2.5 pr-4">
          <img src="/logo.svg" alt="" className="h-9 w-9 shrink-0 rounded-xl" />
          <div className="leading-none">
            <div className="font-display text-lg tracking-tight sm:text-xl">
              Explore <span className="italic text-primary">Vieques</span>
            </div>
            <div className="mt-1 font-mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground">
              {hasAccess ? (TIER_LABELS[tier] ?? tier) : 'Island guide · Puerto Rico'}
            </div>
          </div>
        </div>

        {/* Category pills — centre column from lg up, own row below */}
        <div className="glass pointer-events-auto hidden rounded-2xl p-1.5 lg:block">{tabs}</div>

        {/* Actions */}
        <div className="pointer-events-auto flex shrink-0 items-center gap-2">
          <div className="glass hidden items-center gap-1 rounded-2xl p-1.5 sm:flex">
            <button onClick={onDirections} className={dirOpen ? actionOn : actionOff}>
              Directions
            </button>
            <button
              onClick={onAskAi}
              className={`${aiOpen ? actionOn : actionOff} flex items-center gap-1.5`}
            >
              <Sparkles size={14} />
              Ask AI
            </button>
            <a href={LANDING_URL} className={actionOff}>
              Home
            </a>
          </div>

          {/* Profile. Avatar-style so it reads as "you" rather than a nav item. */}
          <button
            onClick={onProfile}
            aria-label="Your profile"
            title="Your profile"
            className={`glass relative grid h-11 w-11 shrink-0 place-items-center rounded-2xl transition-colors ${
              profileOpen ? 'bg-primary text-primary-foreground' : 'hover:bg-white/5'
            }`}
          >
            <User size={17} />
            {/* Quiet nudge when the free trial is spent. */}
            {!hasAccess && credits <= 0 && (
              <span className="absolute right-1 top-1 h-2.5 w-2.5 rounded-full bg-amber-400 ring-2 ring-background" />
            )}
          </button>
        </div>
      </div>

      {/* Pills row for anything narrower than lg. */}
      <div className="no-scrollbar overflow-x-auto px-4 pb-1 sm:px-5 lg:hidden">
        <div className="glass pointer-events-auto mx-auto w-max rounded-2xl p-1.5">{tabs}</div>
      </div>
    </div>
  )
}

export default MapTopBar
