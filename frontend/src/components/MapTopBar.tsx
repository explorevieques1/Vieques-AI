import {
  CreditCard,
  Heart,
  Home,
  LogOut,
  Menu,
  Navigation,
  Route,
  Sparkles,
} from 'lucide-react'


import { LANDING_URL } from '../lib/api'
import { useIsMobile } from '../hooks/useIsMobile'
import type { CategorySlug } from '../lib/place'
import { signOut } from '../lib/supabase'
import { TIER_LABELS, useEntitlement } from '../lib/entitlement'
import CategoryRow from './CategoryRow'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui/dropdown-menu'

type Props = {
  active: CategorySlug | null
  onSelect: (slug: CategorySlug) => void
  onAskAi: () => void
  aiOpen: boolean
  onDirections: () => void
  dirOpen: boolean
  onSaved: () => void
  savedOpen: boolean
  onBuildItinerary: () => void
  /** Mobile hides the pills here — they get their own floating row. */
  showCategories: boolean
}

/**
 * The floating chrome across the top of the map.
 *
 * Desktop keeps a real banner row: the category pills inline, then the ☰ menu at
 * the right. The phone has no banner at all — see the mobile branch below.
 *
 * The row itself is transparent — no `.glass`, no border. The fill lives on the
 * individual controls, which is what keeps them legible over satellite tiles
 * while leaving the map visible between them. A full-width bar over a map reads
 * as a website header; a pair of floating controls reads as a map app.
 *
 * THE PHONE HAS NO BANNER
 * -----------------------
 * There is no brand mark and no top row on mobile: the greeting card is flush to
 * the safe-area top, and the ☰ trigger renders *below* the category row,
 * left-aligned to the same gutter, as a sibling in MapView's chrome stack. So on
 * mobile this component renders only the menu, and MapView positions it. The
 * logo was the only thing the banner carried that had no home elsewhere, and the
 * landing site already says whose app this is.
 *
 * WHAT IS NOT HERE ANY MORE, AND WHERE IT WENT
 * --------------------------------------------
 *  - Profile and Search moved to the bottom nav and into the sheet respectively.
 *    That also let the capture-phase focus guard go: it existed solely because
 *    the quick-search field sat OUTSIDE the vaul drawer, and vaul never forwards
 *    its `modal` prop to Radix's Dialog.Root (see node_modules/vaul —
 *    `createElement(DialogPrimitive.Root, { defaultOpen, onOpenChange, open })`),
 *    so our `modal={false}` sheet is still a *modal* dialog: it traps focus and
 *    bounces anything focused outside straight back inside. The search bar now
 *    lives inside the drawer, where the trap does not apply.
 *  - The category pills moved to CategoryRow, which is also the only copy now.
 *    They used to be rendered twice — inline for `lg` and as a second row below
 *    it — with both kept in step by hand.
 *
 * `pointer-events-auto` on each control is still load-bearing for the same
 * modal-dialog reason: the body gets `pointer-events: none` while the sheet is
 * mounted, and the sheet is now always mounted on mobile.
 */
function MapTopBar({
  active,
  onSelect,
  onAskAi,
  aiOpen,
  onDirections,
  dirOpen,
  onSaved,
  savedOpen,
  onBuildItinerary,
  showCategories,
}: Props) {
  const { tier, hasAccess, credits } = useEntitlement()
  const isMobile = useIsMobile()
  const menuItem = 'gap-2.5 rounded-lg px-2.5 py-2 text-sm'

  const menu = (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Menu"
        className="glass pointer-events-auto grid h-9 w-9 shrink-0 place-items-center rounded-2xl text-foreground transition-colors hover:bg-white/8 data-[state=open]:bg-primary data-[state=open]:text-primary-foreground"
      >
        <Menu size={18} />
      </DropdownMenuTrigger>
      {/* The frosted look by hand rather than `.glass`: this content already
          ships a `bg-popover`, and two rules setting background-color from
          the same layer is a coin flip. */}
      <DropdownMenuContent
        // Phone: the trigger is at the LEFT gutter, so the panel hangs from its
        // left edge. Desktop: still the right-hand end of the banner.
        align={isMobile ? 'start' : 'end'}
        sideOffset={10}
        className="w-56 rounded-2xl border border-white/10 bg-popover/85 p-1.5 backdrop-blur-xl backdrop-saturate-150"
      >
        <DropdownMenuLabel className="px-2.5 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
          {hasAccess
            ? (TIER_LABELS[tier] ?? tier)
            : `${credits} AI message${credits === 1 ? '' : 's'} left`}
        </DropdownMenuLabel>
        <DropdownMenuSeparator className="bg-white/8" />

        <DropdownMenuItem asChild className={menuItem}>
          <a href={LANDING_URL}>
            <Home size={15} />
            Home
          </a>
        </DropdownMenuItem>

        {/* Build Itinerary. It used to be a button in the banner; the banner is
            gone on mobile and this is a once-a-trip action, not a per-tap one,
            so the menu is where it belongs. Still UI only — deliberately NOT
            wired to useFeature('itinerary'): that slug exists but nothing behind
            it does, so gating it would render a locked row on every tier, which
            reads as broken software rather than an upsell. */}
        <DropdownMenuItem onSelect={onBuildItinerary} className={menuItem}>
          <Route size={15} />
          Build Itinerary
        </DropdownMenuItem>

        {/* No View submenu here any more. The basemap switcher is a map
            control, not an account action, so it lives on the map — the globe
            button above the zoom stack in MapView. One home for it, next to the
            thing it changes. */}

        <DropdownMenuItem asChild className={menuItem}>
          <a href={`${LANDING_URL}/pricing`}>
            <CreditCard size={15} />
            Buy Credits
          </a>
        </DropdownMenuItem>

        {/* Desktop-only destinations. On a phone all three are bottom-nav
            cells, so repeating them here would be two controls for one
            thing. `lg:` rather than `sm:` because that is where the desktop
            two-panel layout actually starts being usable. */}
        <DropdownMenuSeparator className="bg-white/8 lg:hidden" />
        <DropdownMenuItem
          onSelect={onDirections}
          data-active={dirOpen || undefined}
          className={`${menuItem} data-active:bg-primary/15 data-active:text-primary`}
        >
          <Navigation size={15} />
          Directions
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={onAskAi}
          data-active={aiOpen || undefined}
          className={`${menuItem} hidden data-active:bg-primary/15 data-active:text-primary sm:flex`}
        >
          <Sparkles size={15} />
          Ask AI
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={onSaved}
          data-active={savedOpen || undefined}
          className={`${menuItem} hidden data-active:bg-primary/15 data-active:text-primary sm:flex`}
        >
          <Heart size={15} />
          Saved
        </DropdownMenuItem>

        <DropdownMenuSeparator className="bg-white/8" />
        <DropdownMenuItem
          onSelect={async () => {
            await signOut()
            // Land on the marketing site rather than a dead app shell —
            // AccessGate would bounce them there anyway.
            window.location.href = LANDING_URL
          }}
          className={menuItem}
        >
          <LogOut size={15} />
          Log Out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )

  // Phone: no banner. MapView renders <MapTopBar> inside its own chrome stack,
  // below the category row, and owns the positioning — all this contributes is
  // the trigger, at the right gutter opposite the map controls.
  if (isMobile) return <div className="flex w-full justify-end px-3">{menu}</div>

  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-30 pad-safe-top pad-safe-x">
      <div className="flex items-center gap-2 px-3 py-2 sm:gap-3 sm:px-5 sm:py-3">
        {showCategories && <CategoryRow active={active} onSelect={onSelect} variant="inline" />}
        <div className="flex-1" />
        {menu}
      </div>
    </div>
  )
}

export default MapTopBar
