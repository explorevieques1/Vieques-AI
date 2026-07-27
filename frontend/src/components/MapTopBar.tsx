import { useEffect, useRef } from 'react'
import { Home, Menu, Navigation, Search, Sparkles, User, X } from 'lucide-react'

import { CATEGORIES, type CategorySlug } from '../lib/place'
import { LANDING_URL } from '../lib/api'
import { TIER_LABELS, useEntitlement } from '../lib/entitlement'
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
  onProfile: () => void
  profileOpen: boolean
  /** Quick search takes over the pill row rather than adding a third one. */
  onToggleSearch: () => void
  searchOpen: boolean
  /** The field itself, supplied by MapView — it owns the place data. */
  search: React.ReactNode
}

/**
 * The floating chrome across the top of the map: a compact left-hand control
 * cluster (menu, profile, search) and the category pills.
 *
 * The map is the product, so the chrome takes as little of it as possible. The
 * brand lockup that used to sit here is gone — the landing site already says
 * whose app this is, and on a phone it cost a third of the top row. Directions
 * / Ask AI / Home moved into the ☰ menu for the same reason; they are
 * destinations, not things you need one tap from at all times.
 *
 * Everything is left-aligned: on a phone the right edge is where the thumb
 * covers the map, and a single anchored cluster reads as one control rather
 * than two floating islands.
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
  onToggleSearch,
  searchOpen,
  search,
}: Props) {
  const { tier, hasAccess, credits } = useEntitlement()
  const pillsRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLDivElement>(null)

  /**
   * Let the quick-search field keep focus while the map sheet is open.
   *
   * vaul builds on Radix Dialog but never forwards its own `modal` prop to
   * `Dialog.Root` (see node_modules/vaul — `createElement(DialogPrimitive.Root,
   * { defaultOpen, onOpenChange, open })`), so our `modal={false}` sheet is
   * still a *modal* Radix dialog: it traps focus, and anything focused outside
   * the drawer is bounced straight back inside. That is why the old floating
   * search could not be typed into.
   *
   * The sheet's own search is inside the drawer and unaffected. This field is
   * not, so it opts itself out: a capture-phase listener stops focus events
   * involving this subtree before they reach the document-level trap.
   */
  useEffect(() => {
    if (!searchOpen) return
    const guard = (e: FocusEvent) => {
      const el = searchRef.current
      if (!el) return
      const inside = (n: EventTarget | null) => n instanceof Node && el.contains(n)
      if (inside(e.target) || inside(e.relatedTarget)) e.stopPropagation()
    }
    document.addEventListener('focusin', guard, true)
    document.addEventListener('focusout', guard, true)
    return () => {
      document.removeEventListener('focusin', guard, true)
      document.removeEventListener('focusout', guard, true)
    }
  }, [searchOpen])

  // The pill row scrolls horizontally on phones — eight categories will never
  // fit 390px. Keep the active one in view so tapping "Essentials" and coming
  // back doesn't leave the selection parked off screen.
  useEffect(() => {
    const row = pillsRef.current
    if (!row || !active) return
    const el = row.querySelector<HTMLElement>(`[data-slug="${active}"]`)
    el?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
  }, [active])

  const pill =
    'shrink-0 rounded-lg px-2.5 py-1.5 text-[13px] transition-colors whitespace-nowrap sm:rounded-xl sm:px-4 sm:py-2 sm:text-sm'
  const pillOn = `${pill} bg-primary text-primary-foreground font-semibold`
  const pillOff = `${pill} text-muted-foreground hover:bg-white/5 hover:text-foreground`

  const tabs = (
    <nav className="flex w-max gap-0.5 sm:gap-1">
      {CATEGORIES.map((c) => (
        <button
          key={c.slug}
          data-slug={c.slug}
          onClick={() => onSelect(c.slug)}
          className={active === c.slug ? pillOn : pillOff}
        >
          {c.label}
        </button>
      ))}
    </nav>
  )

  const menuItem = 'gap-2.5 rounded-lg px-2.5 py-2 text-sm'

  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-30 pad-safe-top pad-safe-x">
      <div className="flex items-start gap-2 p-3 sm:gap-3 sm:p-5">
        {/* Left cluster: menu + profile, one glass pill. */}
        <div className="glass pointer-events-auto flex shrink-0 items-center gap-1 rounded-2xl p-1">
          <DropdownMenu>
            <DropdownMenuTrigger
              aria-label="Menu"
              className="grid h-9 w-9 place-items-center rounded-xl text-foreground transition-colors hover:bg-white/8 data-[state=open]:bg-primary data-[state=open]:text-primary-foreground sm:h-10 sm:w-10"
            >
              <Menu size={18} />
            </DropdownMenuTrigger>
            {/* The frosted look by hand rather than `.glass`: this content
                already ships a `bg-popover`, and two rules setting
                background-color from the same layer is a coin flip. */}
            <DropdownMenuContent
              align="start"
              sideOffset={10}
              className="w-56 rounded-2xl border border-white/10 bg-popover/85 p-1.5 backdrop-blur-xl backdrop-saturate-150"
            >
              <DropdownMenuLabel className="px-2.5 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                {hasAccess
                  ? (TIER_LABELS[tier] ?? tier)
                  : `${credits} AI message${credits === 1 ? '' : 's'} left`}
              </DropdownMenuLabel>
              <DropdownMenuSeparator className="bg-white/8" />
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
                className={`${menuItem} data-active:bg-primary/15 data-active:text-primary`}
              >
                <Sparkles size={15} />
                Ask AI
              </DropdownMenuItem>
              <DropdownMenuItem asChild className={menuItem}>
                <a href={LANDING_URL}>
                  <Home size={15} />
                  Home
                </a>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Profile. Avatar-style so it reads as "you" rather than a nav item. */}
          <button
            onClick={onProfile}
            aria-label="Your profile"
            title="Your profile"
            className={`relative grid h-9 w-9 shrink-0 place-items-center rounded-xl transition-colors sm:h-10 sm:w-10 ${
              profileOpen ? 'bg-primary text-primary-foreground' : 'hover:bg-white/8'
            }`}
          >
            <User size={17} />
            {/* Quiet nudge when the free trial is spent. */}
            {!hasAccess && credits <= 0 && (
              <span className="absolute right-0.5 top-0.5 h-2.5 w-2.5 rounded-full bg-amber-400 ring-2 ring-background" />
            )}
          </button>

          {/* Quick search. Trades the pill row for a field rather than adding a
              third row — on a phone the chrome budget is the whole point. */}
          <button
            onClick={onToggleSearch}
            aria-label={searchOpen ? 'Close search' : 'Search'}
            aria-expanded={searchOpen}
            title="Search"
            className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl transition-colors sm:h-10 sm:w-10 ${
              searchOpen ? 'bg-primary text-primary-foreground' : 'hover:bg-white/8'
            }`}
          >
            {searchOpen ? <X size={17} /> : <Search size={17} />}
          </button>
        </div>

        {/* Category pills — same row as the cluster from lg up, own row below.
            min-w-0 + overflow lets this shrink and scroll rather than pushing
            past the viewport edge. */}
        {!searchOpen && (
          <div className="glass scrollbar-thin pointer-events-auto hidden min-w-0 overflow-x-auto rounded-2xl p-1.5 lg:block">
            {tabs}
          </div>
        )}
      </div>

      {/* Pills row for anything narrower than lg.

          Left-aligned and scrolled, not centred: inside overflow-x-auto,
          centring clips the START of a too-wide row and no amount of swiping
          gets it back. `fade-r` advertises that there is more to the right —
          on a phone the row is always wider than the screen. */}
      {/* Search, when open, is rendered here at every width — never in both
          this row and the lg one. Two copies would mean two mounted fields
          fighting over autofocus and the "/" shortcut. */}
      {searchOpen ? (
        <div className="px-3 pb-1 sm:px-5">
          {/* pointer-events-auto is load-bearing, not decoration: the modal
              Radix dialog behind the sheet puts `pointer-events: none` on the
              body, so anything over the map that doesn't opt back in is dead
              to touch. */}
          <div
            ref={searchRef}
            className="glass pointer-events-auto rounded-2xl p-1.5 lg:w-[26rem]"
          >
            {search}
          </div>
        </div>
      ) : (
        <div className="px-3 pb-1 sm:px-5 lg:hidden">
          <div className="glass pointer-events-auto w-max max-w-full rounded-2xl p-1">
            <div ref={pillsRef} className="no-scrollbar fade-r overflow-x-auto">
              {tabs}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default MapTopBar
