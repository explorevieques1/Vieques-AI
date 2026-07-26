import { useState } from 'react'
import MapView from './components/MapView'
import CategoryTabs, { type CategorySlug } from './components/CategoryTabs'
import AiChatPane from './components/AiChatPane'
import DirectionsPanel from './components/DirectionsPanel'
import ProfilePanel from './components/ProfilePanel'
import { LANDING_URL, type AiPin, type DirectionsResult } from './lib/api'
import { useEntitlement, TIER_LABELS } from './lib/entitlement'

// This app is the PRODUCT. Plan advertising, pricing and Stripe checkout all
// live on the landing site (landing/src/pages/Pricing.jsx) — the in-app pricing
// screen was removed so there is exactly one place that sells, and one price to
// keep correct. Anything that needs to upsell links out to `${LANDING_URL}/pricing`.
function App() {
  const [activeCategory, setActiveCategory] = useState<CategorySlug | null>(null)
  const [aiOpen, setAiOpen] = useState(false)
  const [aiPins, setAiPins] = useState<AiPin[]>([])
  const [dirOpen, setDirOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [route, setRoute] = useState<DirectionsResult | null>(null)

  const { tier, hasAccess, credits } = useEntitlement()

  const action =
    'px-3 py-1.5 text-sm rounded-full transition-colors whitespace-nowrap'
  const actionOff = `${action} text-slate-300 hover:bg-slate-700/70 hover:text-white`
  const actionOn = `${action} bg-cyan-500 text-slate-900 font-semibold`

  return (
    <div className="h-app w-screen flex flex-col bg-slate-900 text-slate-100">
      {/*
        One banner, three zones. The grid is `1fr auto 1fr` rather than a
        flex justify-between so the category tabs sit at the TRUE centre of the
        header — with flex they would drift as the brand and action widths
        change. The outer columns absorb the imbalance instead.

        Below xl there isn't room for all three across, so the tabs drop to
        their own scrollable row.
      */}
      <header className="bg-slate-800/95 backdrop-blur border-b border-slate-700 shrink-0 pad-safe-top pad-safe-x">
        <div className="px-4 sm:px-6 py-2.5 xl:grid xl:grid-cols-[1fr_auto_1fr] xl:items-center xl:gap-6
                        flex items-center justify-between gap-4">
          {/* Brand */}
          <div className="flex items-center gap-2.5 min-w-0">
            <img src="/logo.svg" alt="" className="h-7 w-7 sm:h-8 sm:w-8 rounded-md shrink-0" />
            <h1 className="text-base sm:text-lg font-bold tracking-tight whitespace-nowrap">
              Explore <span className="text-cyan-400">Vieques</span>
            </h1>
            <span
              className={`hidden sm:inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                hasAccess ? 'bg-cyan-500/15 text-cyan-400' : 'bg-slate-700 text-slate-300'
              }`}
            >
              {TIER_LABELS[tier] ?? tier}
            </span>
          </div>

          {/* Category tabs — centre column on xl, own row below */}
          <div className="hidden xl:block">
            <CategoryTabs active={activeCategory} onSelect={setActiveCategory} />
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1 xl:justify-end shrink-0">
            <button
              onClick={() => { setAiOpen(false); setDirOpen(true) }}
              className={dirOpen ? actionOn : actionOff}
            >
              Directions
            </button>
            <button
              onClick={() => { setDirOpen(false); setAiOpen(true) }}
              className={aiOpen ? actionOn : actionOff}
            >
              Ask AI
            </button>
            <a href={LANDING_URL} className={actionOff}>Home</a>

            <span className="mx-1 h-5 w-px bg-slate-700" aria-hidden="true" />

            {/* Profile. Avatar-style so it reads as "you" rather than a nav item. */}
            <button
              onClick={() => setProfileOpen(true)}
              aria-label="Your profile"
              title="Your profile"
              className={`relative grid h-8 w-8 shrink-0 place-items-center rounded-full text-sm font-bold transition-colors ${
                profileOpen
                  ? 'bg-cyan-500 text-slate-900'
                  : 'bg-slate-700 text-slate-200 hover:bg-slate-600'
              }`}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="8" r="3.5" />
                <path d="M5 20a7 7 0 0 1 14 0" />
              </svg>
              {/* Quiet nudge when the free trial is spent. */}
              {!hasAccess && credits <= 0 && (
                <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-amber-400 ring-2 ring-slate-800" />
              )}
            </button>
          </div>
        </div>

        {/* Tabs row for anything narrower than xl — centred where it fits,
            scrollable when it doesn't.

            `w-max mx-auto` rather than `justify-center`: inside an
            overflow-x-auto parent, justify-center clips the START of content
            that is wider than the container, and no amount of scrolling gets
            it back. Auto margins collapse to 0 when there's no free space, so
            this centres when it fits and scrolls cleanly when it doesn't. */}
        <div className="xl:hidden px-4 sm:px-6 pb-2 overflow-x-auto">
          <div className="w-max mx-auto">
            <CategoryTabs active={activeCategory} onSelect={setActiveCategory} />
          </div>
        </div>
      </header>

      <main className="flex-1 min-h-0 relative">
        <MapView
          activeCategory={activeCategory}
          aiPins={aiPins}
          route={route}
          onRoute={setRoute}
          onCloseCategory={() => setActiveCategory(null)}
        />
        {aiOpen && <AiChatPane onClose={() => setAiOpen(false)} onPins={setAiPins} />}
        {dirOpen && (
          <DirectionsPanel
            onClose={() => { setDirOpen(false); setRoute(null) }}
            onRoute={setRoute}
          />
        )}
        {profileOpen && <ProfilePanel onClose={() => setProfileOpen(false)} />}
      </main>
    </div>
  )
}

export default App
