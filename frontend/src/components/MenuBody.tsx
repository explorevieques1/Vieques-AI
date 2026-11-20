import { ChevronRight, CreditCard, GalleryVerticalEnd, Home, LogOut, Navigation, Route } from 'lucide-react'
import type { ReactNode } from 'react'

import { useCardsCatalog } from '../hooks/useCardsCatalog'
import { LANDING_URL } from '../lib/api'
import { TIER_LABELS, useEntitlement } from '../lib/entitlement'
import { signOut } from '../lib/supabase'

type Props = {
  /** Vieques Cards inventory (S-6, S-9). */
  onCollection: () => void
  /** Build Itinerary → Saved ▸ Trips. */
  onBuildItinerary: () => void
  onDirections: () => void
  /** Clear the floating bottom nav. */
  navPad?: boolean
}

/**
 * The phone's menu, as sheet content — what the ☰ dropdown on the map used to
 * hold. It opens from the Menu cell at the right end of the bottom nav, so the
 * map no longer carries a floating ☰ button at all.
 *
 * The items match MapTopBar's desktop dropdown minus Ask AI and Saved, which
 * are their own bottom-nav cells on a phone. If you add an item here, add it
 * to the desktop dropdown too.
 *
 * An inset grouped list (iOS Settings style) rather than a stack of buttons:
 * it is the same idiom as the landing FAQ, and a list of destinations reads as
 * one at a glance. Log Out sits in its own group so it is never a mis-tap away
 * from Buy Credits.
 */
export default function MenuBody({ onCollection, onBuildItinerary, onDirections, navPad = false }: Props) {
  const { tier, hasAccess, credits } = useEntitlement()
  // S-9: the Collection row carries "owned / total" on the right.
  const { catalog } = useCardsCatalog()

  return (
    <div
      className={`scroll-contain scrollbar-thin min-h-0 flex-1 space-y-4 overflow-y-auto px-4 pt-2 ${
        navPad ? 'pb-[calc(1rem+var(--nav-clear))]' : 'pb-4'
      }`}
    >
      <p className="px-1 text-xs text-muted-foreground">
        {hasAccess
          ? `${TIER_LABELS[tier] ?? tier} pass`
          : `${credits} Ask AI message${credits === 1 ? '' : 's'} left`}
      </p>

      <Group>
        {/* S-9 / L-6: first Row of the first Group. Mirrored in MapTopBar's dropdown. */}
        <Row
          icon={<GalleryVerticalEnd size={18} />}
          label="Collection"
          onClick={onCollection}
          detail={
            catalog && catalog.total > 0 ? (
              <span className="font-mono text-[11px] tracking-[0.08em] text-primary">
                {catalog.owned}/{catalog.total}
              </span>
            ) : undefined
          }
        />
        <Row icon={<Route size={18} />} label="Build Itinerary" onClick={onBuildItinerary} />
        <Row icon={<Navigation size={18} />} label="Directions" onClick={onDirections} />
        <Row icon={<CreditCard size={18} />} label="Buy Credits" href={`${LANDING_URL}/pricing`} />
        <Row icon={<Home size={18} />} label="Home" href={LANDING_URL} />
      </Group>

      <Group>
        <Row
          icon={<LogOut size={18} />}
          label="Log Out"
          danger
          onClick={async () => {
            await signOut()
            // Land on the marketing site rather than a dead app shell —
            // AccessGate would bounce them there anyway.
            window.location.href = LANDING_URL
          }}
        />
      </Group>
    </div>
  )
}

/** Inset grouped list (iOS Settings style). Also used by the Cards Collection (T-5). */
export function Group({ children }: { children: ReactNode }) {
  return (
    <div className="divide-y divide-white/6 overflow-hidden rounded-2xl bg-white/4">{children}</div>
  )
}

/**
 * One list row. With `onClick`/`href` it is a tappable destination (chevron);
 * with neither it is a static row — a value or a switch in `detail` (the
 * Collection's region tallies and settings).
 */
export function Row({
  icon,
  label,
  onClick,
  href,
  danger = false,
  detail,
}: {
  icon: ReactNode
  label: ReactNode
  onClick?: () => void
  href?: string
  danger?: boolean
  /** Right-hand value (a count, "1 of 4", a switch), before the chevron. */
  detail?: ReactNode
}) {
  const interactive = Boolean(onClick || href)
  const cls = `flex h-12 w-full items-center gap-3 px-4 text-left text-[15px] ${
    interactive ? 'transition-colors hover:bg-white/5 active:bg-white/8' : ''
  } ${danger ? 'text-red-400' : 'text-foreground'}`
  const body = (
    <>
      <span className={danger ? '' : 'text-muted-foreground'}>{icon}</span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {detail}
      {interactive && !danger && <ChevronRight size={16} className="text-muted-foreground/60" />}
    </>
  )
  if (href) {
    return (
      <a href={href} className={cls}>
        {body}
      </a>
    )
  }
  return onClick ? (
    <button onClick={onClick} className={cls}>
      {body}
    </button>
  ) : (
    <div className={cls}>{body}</div>
  )
}
