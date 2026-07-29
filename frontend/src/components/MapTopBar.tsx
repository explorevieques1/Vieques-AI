import {
  CreditCard,
  Heart,
  Home,
  Layers,
  LogOut,
  Map,
  Menu,
  Navigation,
  Route,
  Sparkles,
} from 'lucide-react'

import { LANDING_URL } from '../lib/api'
import { MAP_STYLES } from '../lib/mapStyles'
import type { CategorySlug } from '../lib/place'
import { signOut } from '../lib/supabase'
import { TIER_LABELS, useEntitlement } from '../lib/entitlement'
import CategoryRow from './CategoryRow'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
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
  styleId: string
  onStyleChange: (id: string) => void
  /** Mobile hides the pills here — they get their own floating row. */
  showCategories: boolean
}

/**
 * The floating chrome across the top of the map: brand at the left, Build
 * Itinerary and the ☰ menu at the right.
 *
 * The row itself is transparent — no `.glass`, no border. The fill lives on the
 * individual controls, which is what keeps them legible over satellite tiles
 * while leaving the map visible between them. A full-width bar over a map reads
 * as a website header; a pair of floating controls reads as a map app.
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
  styleId,
  onStyleChange,
  showCategories,
}: Props) {
  const { tier, hasAccess, credits } = useEntitlement()
  const menuItem = 'gap-2.5 rounded-lg px-2.5 py-2 text-sm'

  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-30 pad-safe-top pad-safe-x">
      <div className="flex items-center gap-2 px-3 py-2 sm:gap-3 sm:px-5 sm:py-3">
        {/* Brand. The landing site already says whose app this is, so this is a
            mark and a wordmark, not a lockup with a tagline. */}
        <a
          href={LANDING_URL}
          className="pointer-events-auto flex shrink-0 items-center gap-2"
          aria-label="Explore Vieques — home"
        >
          <img src="/logo.svg" alt="" className="h-8 w-8 rounded-[10px]" />
          <span className="text-[13px] font-semibold tracking-tight text-foreground">Vieques</span>
        </a>

        {showCategories && (
          <CategoryRow active={active} onSelect={onSelect} variant="inline" />
        )}

        <div className="flex-1" />

        {/* Build Itinerary — UI only for now. Deliberately NOT wired to
            useFeature('itinerary'): that slug exists but nothing behind it does,
            so gating it would render a locked button on every tier, which reads
            as broken software rather than an upsell. */}
        <button
          onClick={onBuildItinerary}
          className="glass pointer-events-auto flex h-9 shrink-0 items-center gap-1.5 rounded-2xl px-3 text-[12px] font-medium text-foreground transition-colors hover:bg-white/8"
        >
          <Route size={14} />
          Build Itinerary
        </button>

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
            align="end"
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

            {/* View — the basemap switcher. It also lives in the sheet's search
                stack as a Layers chip; this is the same setter, so the two can
                never disagree. */}
            <DropdownMenuSub>
              <DropdownMenuSubTrigger className={menuItem}>
                <Layers size={15} />
                View
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="w-44 rounded-2xl border border-white/10 bg-popover/85 p-1.5 backdrop-blur-xl backdrop-saturate-150">
                <DropdownMenuRadioGroup value={styleId} onValueChange={onStyleChange}>
                  {MAP_STYLES.map((s) => (
                    <DropdownMenuRadioItem key={s.id} value={s.id} className={menuItem}>
                      <Map size={14} />
                      {s.label}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuSubContent>
            </DropdownMenuSub>

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
      </div>
    </div>
  )
}

export default MapTopBar
