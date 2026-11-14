import { ChevronRight, CreditCard, Home, LogOut, Navigation, Route } from 'lucide-react'
import type { ReactNode } from 'react'

import { LANDING_URL } from '../lib/api'
import { TIER_LABELS, useEntitlement } from '../lib/entitlement'
import { signOut } from '../lib/supabase'

type Props = {
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
export default function MenuBody({ onBuildItinerary, onDirections, navPad = false }: Props) {
  const { tier, hasAccess, credits } = useEntitlement()

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

function Group({ children }: { children: ReactNode }) {
  return (
    <div className="divide-y divide-white/6 overflow-hidden rounded-2xl bg-white/4">{children}</div>
  )
}

function Row({
  icon,
  label,
  onClick,
  href,
  danger = false,
}: {
  icon: ReactNode
  label: string
  onClick?: () => void
  href?: string
  danger?: boolean
}) {
  const cls = `flex h-12 w-full items-center gap-3 px-4 text-left text-[15px] transition-colors hover:bg-white/5 active:bg-white/8 ${
    danger ? 'text-red-400' : 'text-foreground'
  }`
  const body = (
    <>
      <span className={danger ? '' : 'text-muted-foreground'}>{icon}</span>
      <span className="flex-1">{label}</span>
      {!danger && <ChevronRight size={16} className="text-muted-foreground/60" />}
    </>
  )
  return href ? (
    <a href={href} className={cls}>
      {body}
    </a>
  ) : (
    <button onClick={onClick} className={cls}>
      {body}
    </button>
  )
}
